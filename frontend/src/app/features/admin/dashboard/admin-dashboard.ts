// Importaciones de Angular para componentes, valores computados, inyección y signals reactivos
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
// Servicios para autenticación, respaldos (backups), auditoría, reportes e internacionalización (idioma)
import { AuditService } from '../../../core/services/audit.service';
import { AuthService } from '../../../core/services/auth.service';
import { BackupService } from '../../../core/services/backup.service';
import { LanguageService } from '../../../core/services/language.service';
import { ReportService } from '../../../core/services/report.service';
import {
  AUDIT_ACTION_META,
  AuditAction,
  AuditEntry,
  AuditModule,
} from '../../../core/models/audit.models';
import { BackupInfo, BackupStatus } from '../../../core/models/backup.models';
// Botones de cambio de tema (claro/oscuro) y cambio de idioma (ES/EN)
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';
import {
  Report,
  ReportCategory,
  ReportStatus,
  REPORT_CATEGORIES,
  REPORT_STATUS_COLORS,
  REPORT_STATUS_LABELS,
} from '../../../core/models/report.models';

// Panel de administración: KPIs, gráficas, gestión CRUD de reportes, sección de Auditoría, exportación PDF/Excel y backups de BD
@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, FormsModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard implements OnInit {
  // Inyección de dependencias de servicios y router
  protected readonly auditService = inject(AuditService);
  private readonly authService = inject(AuthService);
  private readonly backupService = inject(BackupService);
  private readonly reportService = inject(ReportService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(LanguageService);

  // Catálogos de categorías, estados, colores de estado y metadatos de auditoría
  protected readonly categories = REPORT_CATEGORIES;
  protected readonly statuses: ReportStatus[] = ['PENDIENTE', 'EN_PROGRESO', 'RESUELTO'];
  protected readonly statusLabels = REPORT_STATUS_LABELS;
  protected readonly statusColors = REPORT_STATUS_COLORS;
  protected readonly auditActionMeta = AUDIT_ACTION_META;
  protected readonly auditModules: AuditModule[] = [
    'REPORTES',
    'BACKUPS',
    'ADMINISTRADORES',
    'EXPORTACIONES',
    'SEGURIDAD',
  ];
  protected readonly auditActions: AuditAction[] = [
    'CREACION',
    'CAMBIO_ESTADO',
    'EDICION',
    'ELIMINACION',
    'BACKUP',
    'RESTAURACION',
    'EXPORTACION',
  ];

  protected readonly reports = signal<Report[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly exporting = signal<'pdf' | 'excel' | null>(null);
  protected readonly auditExporting = signal<'pdf' | 'excel' | null>(null);
  protected readonly backupStatus = signal<BackupStatus | null>(null);
  protected readonly backupIntervalHours = signal(24);
  protected readonly backupScheduleEnabled = signal(false);
  protected readonly backupLoading = signal(false);
  protected readonly backupSaving = signal(false);
  protected readonly backupBusy = signal(false);
  protected readonly backupError = signal<string | null>(null);
  protected readonly backupMessage = signal<string | null>(null);
  protected readonly restoreDialogOpen = signal(false);
  protected readonly restoreConfirmation = signal('');

  // Filtros de la tabla de reportes
  protected readonly filterStatus = signal<ReportStatus | ''>('');
  protected readonly filterCategory = signal<ReportCategory | ''>('');
  protected readonly search = signal('');

  // Filtros de la sección de Auditoría (historial de cambios)
  protected readonly auditFilterModule = signal<AuditModule | ''>('');
  protected readonly auditFilterAction = signal<AuditAction | ''>('');
  protected readonly auditSearch = signal('');

  // Edición (modal) y borrado (confirmación)
  protected readonly editing = signal<Report | null>(null);
  protected readonly editCategory = signal<ReportCategory>('OTRO');
  protected readonly editDescripcion = signal('');
  protected readonly editError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly deleting = signal<Report | null>(null);
  protected readonly deleteBusy = signal(false);

  // --- Dashboard: todo se deriva de la lista de reportes ---
  protected readonly total = computed(() => this.reports().length);

  protected readonly countByStatus = computed(() => {
    const counts: Record<ReportStatus, number> = { PENDIENTE: 0, EN_PROGRESO: 0, RESUELTO: 0 };
    for (const report of this.reports()) {
      counts[report.estado]++;
    }
    return counts;
  });

  protected readonly resolvedPercent = computed(() => {
    const total = this.total();
    return total === 0 ? 0 : Math.round((this.countByStatus().RESUELTO / total) * 100);
  });

  // Ordenado de mayor a menor; "width" es relativo a la categoría con más reportes
  protected readonly byCategory = computed(() => {
    const counts = new Map<ReportCategory, number>();
    for (const report of this.reports()) {
      counts.set(report.categoria, (counts.get(report.categoria) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return this.categories
      .map((cat) => ({ ...cat, count: counts.get(cat.value) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .map((row) => ({ ...row, width: (row.count / max) * 100 }));
  });

  protected readonly filtered = computed(() => {
    const status = this.filterStatus();
    const category = this.filterCategory();
    const term = this.search().trim().toLowerCase();
    return this.reports().filter(
      (r) =>
        (!status || r.estado === status) &&
        (!category || r.categoria === category) &&
        (!term || r.descripcion.toLowerCase().includes(term) || r.autorNombre.toLowerCase().includes(term)),
    );
  });

  // --- Auditoría: lista filtrada e indicadores (KPIs) del historial de cambios ---
  protected readonly auditEntries = this.auditService.entries;

  protected readonly filteredAuditEntries = computed<AuditEntry[]>(() => {
    const mod = this.auditFilterModule();
    const act = this.auditFilterAction();
    const term = this.auditSearch().trim().toLowerCase();
    return this.auditEntries().filter(
      (item) =>
        (!mod || item.modulo === mod) &&
        (!act || item.accion === act) &&
        (!term ||
          item.usuario.toLowerCase().includes(term) ||
          item.entidad.toLowerCase().includes(term) ||
          item.detalle.toLowerCase().includes(term) ||
          item.valorAnterior.toLowerCase().includes(term) ||
          item.valorNuevo.toLowerCase().includes(term)),
    );
  });

  protected readonly auditStats = computed(() => {
    const all = this.auditEntries();
    return {
      total: all.length,
      statusChanges: all.filter((e) => e.accion === 'CAMBIO_ESTADO').length,
      editsAndDeletes: all.filter((e) => e.accion === 'EDICION' || e.accion === 'ELIMINACION').length,
      backupsAndExports: all.filter(
        (e) => e.accion === 'BACKUP' || e.accion === 'RESTAURACION' || e.accion === 'EXPORTACION',
      ).length,
    };
  });

  ngOnInit(): void {
    this.auditService.loadFromBackend();
    this.loadReports();
    this.loadBackupStatus();
  }

  protected loadBackupStatus(): void {
    this.backupLoading.set(true);
    this.backupError.set(null);
    this.backupService.getStatus().subscribe({
      next: (status) => {
        this.backupStatus.set(status);
        this.backupIntervalHours.set(status.intervalHours);
        this.backupScheduleEnabled.set(status.scheduleEnabled);
        this.backupLoading.set(false);
        this.auditService.syncWithSystemState(this.reports(), status);
      },
      error: (error: unknown) => {
        this.backupError.set(this.backupErrorText(error, 'No se pudo cargar el estado de los backups.'));
        this.backupLoading.set(false);
      },
    });
  }

  protected saveBackupSchedule(): void {
    if (this.backupSaving()) {
      return;
    }
    this.backupSaving.set(true);
    this.backupError.set(null);
    this.backupMessage.set(null);
    const enabled = this.backupScheduleEnabled();
    const hours = this.backupIntervalHours();
    this.backupService.updateSchedule(enabled, hours).subscribe({
      next: (status) => {
        this.backupStatus.set(status);
        this.backupSaving.set(false);
        this.backupMessage.set('La programación de backups quedó guardada.');
        this.auditService.record({
          modulo: 'BACKUPS',
          accion: 'EDICION',
          entidad: 'Programación Backup',
          valorAnterior: 'Configuración previa',
          valorNuevo: enabled ? `Activo cada ${hours} h` : `Desactivado (${hours} h)`,
          detalle: `Actualización de la frecuencia automática de backups (${enabled ? 'Activado' : 'Desactivado'}, intervalo: ${hours} horas)`,
        });
      },
      error: (error: unknown) => {
        this.backupError.set(this.backupErrorText(error, 'No se pudo guardar la programación.'));
        this.backupSaving.set(false);
      },
    });
  }

  protected createBackup(): void {
    if (this.backupBusy()) {
      return;
    }
    this.backupBusy.set(true);
    this.backupError.set(null);
    this.backupMessage.set(null);
    this.backupService.createBackup().subscribe({
      next: (backup) => {
        this.onBackupCompleted(backup, 'Backup creado');
        this.auditService.record({
          modulo: 'BACKUPS',
          accion: 'BACKUP',
          entidad: 'PostgreSQL Backup',
          valorAnterior: 'Estado actual BD',
          valorNuevo: backup.name,
          detalle: `Creación manual de copia de seguridad de PostgreSQL: ${backup.name}`,
        });
      },
      error: (error: unknown) => {
        this.backupError.set(this.backupErrorText(error, 'No se pudo crear el backup.'));
        this.backupBusy.set(false);
      },
    });
  }

  protected openRestoreDialog(): void {
    this.restoreConfirmation.set('');
    this.restoreDialogOpen.set(true);
  }

  protected closeRestoreDialog(): void {
    if (!this.backupBusy()) {
      this.restoreDialogOpen.set(false);
      this.restoreConfirmation.set('');
    }
  }

  protected restoreLatestBackup(): void {
    if (this.backupBusy() || this.restoreConfirmation() !== 'RESTAURAR') {
      return;
    }
    this.backupBusy.set(true);
    this.backupError.set(null);
    this.backupMessage.set(null);
    this.backupService.restoreLatest(this.restoreConfirmation()).subscribe({
      next: (backup) => {
        this.restoreDialogOpen.set(false);
        this.restoreConfirmation.set('');
        this.onBackupCompleted(backup, 'Backup restaurado');
        this.auditService.record({
          modulo: 'BACKUPS',
          accion: 'RESTAURACION',
          entidad: 'PostgreSQL Restore',
          valorAnterior: 'Datos previos en BD',
          valorNuevo: backup.name,
          detalle: `Restauración completa de la base de datos a partir del respaldo: ${backup.name}`,
        });
        this.loadReports();
      },
      error: (error: unknown) => {
        this.backupError.set(this.backupErrorText(error, 'No se pudo restaurar el backup.'));
        this.backupBusy.set(false);
      },
    });
  }

  protected loadReports(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.reportService.getAll().subscribe({
      next: (reports) => {
        this.reports.set(reports);
        this.loading.set(false);
        this.auditService.syncWithSystemState(reports, this.backupStatus());
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar los reportes.');
        this.loading.set(false);
      },
    });
  }

  protected categoryMeta(categoria: ReportCategory) {
    return this.categories.find((c) => c.value === categoria) ?? this.categories[this.categories.length - 1];
  }

  protected percentOf(count: number): number {
    const total = this.total();
    return total === 0 ? 0 : (count / total) * 100;
  }

  protected clearFilters(): void {
    this.filterStatus.set('');
    this.filterCategory.set('');
    this.search.set('');
  }

  protected clearAuditFilters(): void {
    this.auditFilterModule.set('');
    this.auditFilterAction.set('');
    this.auditSearch.set('');
  }

  protected scrollToAudit(): void {
    if (typeof document !== 'undefined') {
      document.getElementById('auditoria-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  protected async exportPdf(): Promise<void> {
    const reports = this.filtered();
    if (reports.length === 0 || this.exporting()) {
      return;
    }

    this.exporting.set('pdf');
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const document = new jsPDF({ orientation: 'landscape' });
      const generatedAt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

      document.setFontSize(16);
      document.text('RADAR · Reportes urbanos', 14, 16);
      document.setFontSize(9);
      document.text(`Generado: ${generatedAt} · Reportes: ${reports.length}`, 14, 23);
      document.text(`Filtros: ${this.activeFiltersLabel()}`, 14, 29);

      autoTable(document, {
        startY: 35,
        head: [['ID', 'Categoría', 'Descripción', 'Autor', 'Fecha', 'Estado', 'Latitud', 'Longitud']],
        body: reports.map((report) => [
          report.id,
          this.categoryMeta(report.categoria).label,
          report.descripcion,
          report.autorNombre,
          new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(report.createdAt)),
          this.statusLabels[report.estado],
          report.latitud,
          report.longitud,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [232, 112, 42] },
        margin: { left: 14, right: 14 },
      });

      const fileName = `radar-reportes-${this.exportDateStamp()}.pdf`;
      document.save(fileName);
      this.auditService.record({
        modulo: 'EXPORTACIONES',
        accion: 'EXPORTACION',
        entidad: fileName,
        valorAnterior: `${reports.length} reportes filtrados`,
        valorNuevo: 'Documento PDF descargado',
        detalle: `Exportación de reporte general en formato PDF (${reports.length} registros, filtros: ${this.activeFiltersLabel()})`,
      });
    } catch {
      this.errorMessage.set('No se pudo generar el PDF. Intenta nuevamente.');
    } finally {
      this.exporting.set(null);
    }
  }

  protected async exportExcel(): Promise<void> {
    const reports = this.filtered();
    if (reports.length === 0 || this.exporting()) {
      return;
    }

    this.exporting.set('excel');
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RADAR';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Reportes');
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 12 },
        { header: 'Categoría', key: 'categoria', width: 20 },
        { header: 'Descripción', key: 'descripcion', width: 42 },
        { header: 'Autor', key: 'autor', width: 28 },
        { header: 'Fecha', key: 'fecha', width: 22 },
        { header: 'Estado', key: 'estado', width: 18 },
        { header: 'Latitud', key: 'latitud', width: 14 },
        { header: 'Longitud', key: 'longitud', width: 14 },
      ];
      worksheet.addRows(reports.map((report) => ({
        id: report.id,
        categoria: this.categoryMeta(report.categoria).label,
        descripcion: report.descripcion,
        autor: report.autorNombre,
        fecha: new Date(report.createdAt),
        estado: this.statusLabels[report.estado],
        latitud: report.latitud,
        longitud: report.longitud,
      })));
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = 'A1:H1';
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8702A' } };
      worksheet.getColumn('fecha').numFmt = 'dd/mm/yyyy hh:mm';

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `radar-reportes-${this.exportDateStamp()}.xlsx`;
      this.downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        fileName,
      );
      this.auditService.record({
        modulo: 'EXPORTACIONES',
        accion: 'EXPORTACION',
        entidad: fileName,
        valorAnterior: `${reports.length} reportes filtrados`,
        valorNuevo: 'Hoja de cálculo Excel (.xlsx)',
        detalle: `Exportación de reporte general en formato Excel (${reports.length} registros, filtros: ${this.activeFiltersLabel()})`,
      });
    } catch {
      this.errorMessage.set('No se pudo generar el archivo Excel. Intenta nuevamente.');
    } finally {
      this.exporting.set(null);
    }
  }

  // --- Exportación del Reporte de Auditoría (PDF y Excel) ---
  protected async exportAuditPdf(): Promise<void> {
    const entries = this.filteredAuditEntries();
    if (entries.length === 0 || this.auditExporting()) {
      return;
    }

    this.auditExporting.set('pdf');
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const document = new jsPDF({ orientation: 'landscape' });
      const generatedAt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

      document.setFontSize(16);
      document.text('RADAR · Reporte Oficial de Auditoría e Historial de Cambios', 14, 16);
      document.setFontSize(9);
      document.text(`Generado: ${generatedAt} · Eventos auditados: ${entries.length}`, 14, 23);

      autoTable(document, {
        startY: 30,
        head: [['Fecha / Hora', 'Usuario / Actor', 'Rol', 'Módulo', 'Acción', 'Recurso', 'Antes → Después', 'Detalle del cambio']],
        body: entries.map((item) => [
          new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt)),
          item.usuario,
          item.rol,
          item.modulo,
          this.auditActionMeta[item.accion]?.label ?? item.accion,
          item.entidad,
          `${item.valorAnterior} -> ${item.valorNuevo}`,
          item.detalle,
        ]),
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [232, 112, 42] },
        margin: { left: 14, right: 14 },
      });

      document.save(`radar-auditoria-${this.exportDateStamp()}.pdf`);
    } catch {
      this.errorMessage.set('No se pudo generar el reporte de auditoría en PDF.');
    } finally {
      this.auditExporting.set(null);
    }
  }

  protected async exportAuditExcel(): Promise<void> {
    const entries = this.filteredAuditEntries();
    if (entries.length === 0 || this.auditExporting()) {
      return;
    }

    this.auditExporting.set('excel');
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RADAR Auditoría';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Auditoría');
      worksheet.columns = [
        { header: 'Fecha / Hora', key: 'fecha', width: 22 },
        { header: 'Usuario', key: 'usuario', width: 28 },
        { header: 'Rol', key: 'rol', width: 14 },
        { header: 'Módulo', key: 'modulo', width: 18 },
        { header: 'Acción', key: 'accion', width: 20 },
        { header: 'Recurso', key: 'entidad', width: 18 },
        { header: 'Valor Anterior', key: 'antes', width: 26 },
        { header: 'Valor Nuevo', key: 'despues', width: 26 },
        { header: 'Detalle del Cambio', key: 'detalle', width: 52 },
      ];
      worksheet.addRows(entries.map((item) => ({
        fecha: new Date(item.createdAt),
        usuario: item.usuario,
        rol: item.rol,
        modulo: item.modulo,
        accion: this.auditActionMeta[item.accion]?.label ?? item.accion,
        entidad: item.entidad,
        antes: item.valorAnterior,
        despues: item.valorNuevo,
        detalle: item.detalle,
      })));
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = 'A1:I1';
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8702A' } };
      worksheet.getColumn('fecha').numFmt = 'dd/mm/yyyy hh:mm';

      const buffer = await workbook.xlsx.writeBuffer();
      this.downloadBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `radar-auditoria-${this.exportDateStamp()}.xlsx`,
      );
    } catch {
      this.errorMessage.set('No se pudo generar el reporte de auditoría en Excel.');
    } finally {
      this.auditExporting.set(null);
    }
  }

  // --- Update: estado (inline) ---
  protected onEstadoChange(report: Report, estado: ReportStatus): void {
    if (estado === report.estado) {
      return;
    }
    const estadoPrevio = this.statusLabels[report.estado];
    const estadoNuevo = this.statusLabels[estado];
    const catLabel = this.categoryMeta(report.categoria).label;
    this.reportService.updateEstado(report.id, estado).subscribe({
      next: (updated) => {
        this.replaceReport(updated);
        this.auditService.record({
          modulo: 'REPORTES',
          accion: 'CAMBIO_ESTADO',
          entidad: `Reporte #${report.id}`,
          valorAnterior: estadoPrevio,
          valorNuevo: estadoNuevo,
          detalle: `Cambio de estado en reporte #${report.id} (${catLabel} de ${report.autorNombre}): pasó de "${estadoPrevio}" a "${estadoNuevo}"`,
        });
      },
      error: () => this.errorMessage.set('No se pudo actualizar el estado del reporte.'),
    });
  }

  // --- Update: categoría y descripción (modal) ---
  protected openEdit(report: Report): void {
    this.editing.set(report);
    this.editCategory.set(report.categoria);
    this.editDescripcion.set(report.descripcion);
    this.editError.set(null);
  }

  protected closeEdit(): void {
    this.editing.set(null);
  }

  protected saveEdit(): void {
    const report = this.editing();
    const descripcion = this.editDescripcion().trim();
    if (!report || this.saving()) {
      return;
    }
    if (!descripcion) {
      this.editError.set('La descripción es obligatoria.');
      return;
    }
    const catAnterior = this.categoryMeta(report.categoria).label;
    const descAnterior = report.descripcion;
    const catNueva = this.categoryMeta(this.editCategory()).label;

    this.saving.set(true);
    this.editError.set(null);
    this.reportService.update(report.id, { categoria: this.editCategory(), descripcion }).subscribe({
      next: (updated) => {
        this.replaceReport(updated);
        this.auditService.record({
          modulo: 'REPORTES',
          accion: 'EDICION',
          entidad: `Reporte #${report.id}`,
          valorAnterior: `${catAnterior}: "${descAnterior}"`,
          valorNuevo: `${catNueva}: "${descripcion}"`,
          detalle: `Edición administrativa del reporte #${report.id} (autor original: ${report.autorNombre})`,
        });
        this.saving.set(false);
        this.closeEdit();
      },
      error: () => {
        this.editError.set('No se pudo guardar el reporte. Intenta nuevamente.');
        this.saving.set(false);
      },
    });
  }

  // --- Delete ---
  protected askDelete(report: Report): void {
    this.deleting.set(report);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected confirmDelete(): void {
    const report = this.deleting();
    if (!report || this.deleteBusy()) {
      return;
    }
    const catLabel = this.categoryMeta(report.categoria).label;
    this.deleteBusy.set(true);
    this.reportService.delete(report.id).subscribe({
      next: () => {
        this.reports.update((current) => current.filter((r) => r.id !== report.id));
        this.auditService.record({
          modulo: 'REPORTES',
          accion: 'ELIMINACION',
          entidad: `Reporte #${report.id}`,
          valorAnterior: `${catLabel} · "${report.descripcion}"`,
          valorNuevo: 'Eliminado permanentemente',
          detalle: `Eliminación definitiva del reporte #${report.id} publicado por ${report.autorNombre}`,
        });
        this.deleteBusy.set(false);
        this.deleting.set(null);
      },
      error: () => {
        this.errorMessage.set('No se pudo eliminar el reporte.');
        this.deleteBusy.set(false);
        this.deleting.set(null);
      },
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  private replaceReport(updated: Report): void {
    this.reports.update((current) => current.map((r) => (r.id === updated.id ? updated : r)));
  }

  private activeFiltersLabel(): string {
    const category = this.filterCategory();
    const status = this.filterStatus();
    const filters = [
      category ? `Categoría: ${this.categoryMeta(category).label}` : '',
      status ? `Estado: ${this.statusLabels[status]}` : '',
      this.search().trim() ? `Búsqueda: ${this.search().trim()}` : '',
    ].filter(Boolean);
    return filters.length > 0 ? filters.join(' · ') : 'Ninguno';
  }

  private exportDateStamp(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private onBackupCompleted(backup: BackupInfo, label: string): void {
    this.backupMessage.set(`${label}: ${backup.name}`);
    this.backupBusy.set(false);
    this.loadBackupStatus();
  }

  private backupErrorText(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const response = error.error;
      if (typeof response === 'object' && response !== null && 'message' in response
          && typeof response.message === 'string') {
        return response.message;
      }
    }
    return fallback;
  }
}
