// Importaciones de Angular para servicios, inyección de dependencias y signals reactivos
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AuditAction, AuditEntry, AuditModule } from '../models/audit.models';
import { BackupStatus } from '../models/backup.models';
import { Report, REPORT_CATEGORIES, REPORT_STATUS_LABELS } from '../models/report.models';

// Clave en localStorage para persistir el historial de auditoría y sincronizarlo con el backend
const AUDIT_STORAGE_KEY = 'radar_audit_history_v1';

// Servicio global de Auditoría: registra cada cambio hecho en la plataforma y genera el historial para el panel Admin
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = `${environment.apiUrl}/admin/auditoria`;

  // Signal con los eventos registrados localmente o recibidos desde el backend
  private readonly recordedEntries = signal<AuditEntry[]>(this.readLocalEntries());
  // Signal con los eventos base reconstruidos a partir de los reportes y backups existentes en PostgreSQL
  private readonly derivedEntries = signal<AuditEntry[]>([]);

  // Signal computado que unifica todos los eventos sin duplicados y los ordena del más reciente al más antiguo
  readonly entries = computed<AuditEntry[]>(() => {
    const merged = new Map<string, AuditEntry>();
    for (const item of this.recordedEntries()) {
      merged.set(item.id, item);
    }
    for (const item of this.derivedEntries()) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item);
      }
    }
    return Array.from(merged.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  });

  // Carga inicial de los registros de auditoría persistidos
  loadFromBackend(): void {
    this.recordedEntries.set(this.readLocalEntries());
  }

  // Registra un nuevo cambio en la auditoría (cambio de estado, edición, borrado, backup, exportación, nuevo admin)
  record(params: {
    modulo: AuditModule;
    accion: AuditAction;
    entidad: string;
    valorAnterior?: string;
    valorNuevo?: string;
    detalle: string;
  }): void {
    const user = this.authService.currentUser();
    const usuario = user ? `${user.nombre} (${user.email})` : 'Administrador';
    const rol = user?.role ?? 'ADMIN';

    const entry: AuditEntry = {
      id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      usuario,
      rol,
      modulo: params.modulo,
      accion: params.accion,
      entidad: params.entidad,
      valorAnterior: params.valorAnterior ?? '-',
      valorNuevo: params.valorNuevo ?? '-',
      detalle: params.detalle,
    };

    // Actualizamos el estado reactivo inmediatamente para que la tabla de Auditoría se refresque al instante
    const updated = [entry, ...this.recordedEntries()].slice(0, 300);
    this.recordedEntries.set(updated);
    this.saveLocalEntries(updated);
  }

  // Sincroniza los reportes existentes en la base de datos y el último backup para poblar la línea de tiempo histórica
  syncWithSystemState(reports: Report[], backupStatus: BackupStatus | null): void {
    const historical: AuditEntry[] = [];

    // 1. Por cada reporte en PostgreSQL generamos su evento histórico de creación y, si ya cambió de estado, su avance
    for (const report of reports) {
      const catLabel =
        REPORT_CATEGORIES.find((c) => c.value === report.categoria)?.label ?? report.categoria;
      const statusLabel = REPORT_STATUS_LABELS[report.estado] ?? report.estado;

      historical.push({
        id: `rep-create-${report.id}`,
        createdAt: report.createdAt,
        usuario: report.autorNombre,
        rol: 'CIUDADANO',
        modulo: 'REPORTES',
        accion: 'CREACION',
        entidad: `Reporte #${report.id}`,
        valorAnterior: 'Sin registro',
        valorNuevo: `${catLabel} · Pendiente`,
        detalle: `Reporte ciudadano registrado en categoría ${catLabel}: "${report.descripcion}"`,
      });

      // Si el reporte ya no está PENDIENTE, reflejamos también su estado actual en el historial si no había registro local
      if (report.estado !== 'PENDIENTE') {
        const createdTime = new Date(report.createdAt).getTime();
        const statusTime = new Date(createdTime + 60_000).toISOString();
        historical.push({
          id: `rep-status-${report.id}-${report.estado}`,
          createdAt: statusTime,
          usuario: 'Panel Administrador',
          rol: 'ADMIN',
          modulo: 'REPORTES',
          accion: 'CAMBIO_ESTADO',
          entidad: `Reporte #${report.id}`,
          valorAnterior: 'Pendiente',
          valorNuevo: statusLabel,
          detalle: `Actualización de seguimiento del reporte #${report.id} (${catLabel}) al estado "${statusLabel}"`,
        });
      }
    }

    // 2. Si existe un backup en el servidor, lo incluimos como hito de respaldo en la auditoría
    if (backupStatus?.latestBackupAt && backupStatus.latestBackupName) {
      historical.push({
        id: `bkp-${backupStatus.latestBackupName}`,
        createdAt: backupStatus.latestBackupAt,
        usuario: 'Sistema / Admin',
        rol: 'ADMIN',
        modulo: 'BACKUPS',
        accion: 'BACKUP',
        entidad: 'PostgreSQL Backup',
        valorAnterior: 'Estado previo BD',
        valorNuevo: backupStatus.latestBackupName,
        detalle: `Copia de seguridad almacenada en ${backupStatus.storageType}: ${backupStatus.latestBackupName}`,
      });
    }

    this.derivedEntries.set(historical);
  }

  private readLocalEntries(): AuditEntry[] {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
    } catch {
      return [];
    }
  }

  private saveLocalEntries(entries: AuditEntry[]): void {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Ignorar si localStorage no está disponible
    }
  }
}
