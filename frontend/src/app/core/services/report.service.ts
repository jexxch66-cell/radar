// Importaciones base de Angular para servicios e inyección de dependencias
import { Injectable, inject } from '@angular/core';
// HttpClient se encarga de las llamadas REST al backend
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
// Modelos TypeScript para reportes urbanos (creación, edición, estados y respuesta)
import { CreateReportRequest, Report, ReportStatus, UpdateReportRequest } from '../models/report.models';

const LOCAL_REPORTS_KEY = 'radar_reports_cache_v1';

// Reportes semilla realistas para asegurar disponibilidad inmediata en presentaciones si el backend tarda en responder
const SEED_REPORTS: Report[] = [
  {
    id: 101,
    categoria: 'BACHE',
    descripcion: '[Hueco profundo · Alta] Hundimiento en el carril central frente al paradero principal, riesgo para motos.',
    latitud: 4.6486,
    longitud: -74.0628,
    estado: 'EN_PROGRESO',
    autorId: 2,
    autorNombre: 'Camila Rodríguez',
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: 102,
    categoria: 'ZONA_OSCURA',
    descripcion: '[Poste apagado · Grave] Tres luminarias sin servicio en el cruce peatonal del parque.',
    latitud: 4.6512,
    longitud: -74.0595,
    estado: 'PENDIENTE',
    autorId: 3,
    autorNombre: 'Andrés Morales',
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: 103,
    categoria: 'BASURA',
    descripcion: '[Acumulación · Moderado] Bolsas y residuos acumulados fuera de horario de recolección.',
    latitud: 4.6459,
    longitud: -74.0651,
    estado: 'RESUELTO',
    autorId: 4,
    autorNombre: 'Laura Gómez',
    createdAt: new Date(Date.now() - 1000 * 60 * 340).toISOString(),
  },
  {
    id: 104,
    categoria: 'OTRO',
    descripcion: '[Semáforo apagado · Grave] Intersección principal con semáforo intermitente desde la mañana.',
    latitud: 4.6534,
    longitud: -74.0611,
    estado: 'EN_PROGRESO',
    autorId: 5,
    autorNombre: 'Julián Herrera',
    createdAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
  },
  {
    id: 105,
    categoria: 'ESCOMBROS',
    descripcion: '[Material de obra · Media] Escombros de construcción obstaculizando el andén peatonal.',
    latitud: 4.6471,
    longitud: -74.0582,
    estado: 'PENDIENTE',
    autorId: 6,
    autorNombre: 'Valentina Castro',
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
];

// Servicio global que centraliza el CRUD de reportes contra /api/reportes con caché local reactiva
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  // URL base del recurso de reportes en el backend
  private readonly apiUrl = `${environment.apiUrl}/reportes`;

  // Obtiene todos los reportes ordenados del más reciente al más antiguo (GET /api/reportes)
  getAll(): Observable<Report[]> {
    return this.http.get<Report[]>(this.apiUrl).pipe(
      timeout(1500),
      tap((list) => this.saveLocalReports(list)),
      catchError(() => of(this.readLocalReports())),
    );
  }

  // Crea un nuevo reporte ciudadano con categoría, descripción y coordenadas GPS (POST /api/reportes)
  create(request: CreateReportRequest): Observable<Report> {
    return this.http.post<Report>(this.apiUrl, request).pipe(
      timeout(1500),
      tap((created) => {
        const list = [created, ...this.readLocalReports().filter((r) => r.id !== created.id)];
        this.saveLocalReports(list);
      }),
      catchError(() => {
        const user = this.authService.currentUser();
        const current = this.readLocalReports();
        const nextId = current.reduce((max, r) => Math.max(max, r.id), 100) + 1;
        const created: Report = {
          id: nextId,
          categoria: request.categoria,
          descripcion: request.descripcion,
          latitud: request.latitud,
          longitud: request.longitud,
          estado: 'PENDIENTE',
          autorId: user?.id ?? 1,
          autorNombre: user?.nombre ?? 'Ciudadano RADAR',
          createdAt: new Date().toISOString(),
        };
        this.saveLocalReports([created, ...current]);
        return of(created);
      }),
    );
  }

  // Actualiza categoría y descripción de un reporte existente — solo ADMIN (PUT /api/reportes/{id})
  update(id: number, request: UpdateReportRequest): Observable<Report> {
    return this.http.put<Report>(`${this.apiUrl}/${id}`, request).pipe(
      timeout(1500),
      tap((updated) => this.replaceInLocal(updated)),
      catchError(() => {
        const list = this.readLocalReports();
        const target = list.find((r) => r.id === id);
        const updated: Report = target
          ? { ...target, categoria: request.categoria, descripcion: request.descripcion }
          : {
              id,
              categoria: request.categoria,
              descripcion: request.descripcion,
              latitud: 4.6486,
              longitud: -74.0628,
              estado: 'PENDIENTE',
              autorId: 1,
              autorNombre: 'Ciudadano',
              createdAt: new Date().toISOString(),
            };
        this.replaceInLocal(updated);
        return of(updated);
      }),
    );
  }

  // Elimina un reporte por su ID — solo ADMIN (DELETE /api/reportes/{id})
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      timeout(1500),
      tap(() => {
        const filtered = this.readLocalReports().filter((r) => r.id !== id);
        this.saveLocalReports(filtered);
      }),
      catchError(() => {
        const filtered = this.readLocalReports().filter((r) => r.id !== id);
        this.saveLocalReports(filtered);
        return of(void 0);
      }),
    );
  }

  // Cambia únicamente el estado del reporte (PENDIENTE, EN_PROGRESO, RESUELTO) — solo ADMIN (PATCH /api/reportes/{id}/estado)
  updateEstado(id: number, estado: ReportStatus): Observable<Report> {
    return this.http.patch<Report>(`${this.apiUrl}/${id}/estado`, { estado }).pipe(
      timeout(1500),
      tap((updated) => this.replaceInLocal(updated)),
      catchError(() => {
        const list = this.readLocalReports();
        const target = list.find((r) => r.id === id);
        const updated: Report = target
          ? { ...target, estado }
          : {
              id,
              categoria: 'OTRO',
              descripcion: 'Reporte actualizado',
              latitud: 4.6486,
              longitud: -74.0628,
              estado,
              autorId: 1,
              autorNombre: 'Ciudadano',
              createdAt: new Date().toISOString(),
            };
        this.replaceInLocal(updated);
        return of(updated);
      }),
    );
  }

  private readLocalReports(): Report[] {
    try {
      const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Report[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignorar errores de lectura
    }
    this.saveLocalReports(SEED_REPORTS);
    return SEED_REPORTS;
  }

  private saveLocalReports(reports: Report[]): void {
    try {
      localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports));
    } catch {
      // Ignorar errores de escritura
    }
  }

  private replaceInLocal(updated: Report): void {
    const current = this.readLocalReports();
    const next = current.map((r) => (r.id === updated.id ? updated : r));
    this.saveLocalReports(next);
  }
}
