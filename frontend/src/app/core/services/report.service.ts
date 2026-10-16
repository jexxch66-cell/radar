// Importaciones base de Angular para servicios e inyección de dependencias
import { Injectable, inject } from '@angular/core';
// HttpClient se encarga de las llamadas REST al backend
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
// Modelos TypeScript para reportes urbanos (creación, edición, estados y respuesta)
import { CreateReportRequest, Report, ReportStatus, UpdateReportRequest } from '../models/report.models';

// Servicio global que centraliza el CRUD de reportes contra /api/reportes
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  // URL base del recurso de reportes en el backend
  private readonly apiUrl = `${environment.apiUrl}/reportes`;

  // Obtiene todos los reportes ordenados del más reciente al más antiguo (GET /api/reportes)
  getAll(): Observable<Report[]> {
    return this.http.get<Report[]>(this.apiUrl);
  }

  // Crea un nuevo reporte ciudadano con categoría, descripción y coordenadas GPS (POST /api/reportes)
  create(request: CreateReportRequest): Observable<Report> {
    return this.http.post<Report>(this.apiUrl, request);
  }

  // Actualiza categoría y descripción de un reporte existente — solo ADMIN (PUT /api/reportes/{id})
  update(id: number, request: UpdateReportRequest): Observable<Report> {
    return this.http.put<Report>(`${this.apiUrl}/${id}`, request);
  }

  // Elimina un reporte por su ID — solo ADMIN (DELETE /api/reportes/{id})
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Cambia únicamente el estado del reporte (PENDIENTE, EN_PROGRESO, RESUELTO) — solo ADMIN (PATCH /api/reportes/{id}/estado)
  updateEstado(id: number, estado: ReportStatus): Observable<Report> {
    return this.http.patch<Report>(`${this.apiUrl}/${id}/estado`, { estado });
  }
}
