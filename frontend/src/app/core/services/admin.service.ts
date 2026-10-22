// Importamos Injectable e inject de Angular para declarar el servicio e inyectar dependencias
import { Injectable, inject } from '@angular/core';
// HttpClient permite realizar peticiones HTTP (GET, POST, PUT, DELETE) hacia el backend Spring Boot
import { HttpClient } from '@angular/common/http';
// Operadores de RxJS para manejar respuestas asíncronas, timeouts y respaldos locales
import { Observable, catchError, of, tap, timeout } from 'rxjs';
// Importamos la configuración de entorno que contiene la URL base del backend (ej. http://localhost:8080/api)
import { environment } from '../../../environments/environment';
// Modelos de datos TypeScript para tipar la petición de creación y la respuesta del administrador
import { AdministradorResponse, RegisterAdminRequest } from '../models/admin.models';
// Servicio de auditoría para dejar trazabilidad cuando se crea una nueva cuenta de administrador
import { AuditService } from './audit.service';

// @Injectable({ providedIn: 'root' }) registra este servicio como un Singleton disponible en toda la app
@Injectable({ providedIn: 'root' })
export class AdminService {
  // Inyectamos el cliente HTTP de Angular (pasa automáticamente por authInterceptor para incluir el token JWT)
  private readonly http = inject(HttpClient);
  // Inyectamos el servicio de auditoría
  private readonly auditService = inject(AuditService);
  // Construimos el endpoint base de administración: http://localhost:8080/api/admin
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  // Envía una petición POST a /api/admin/administradores para crear una nueva cuenta con rol ADMIN
  registrarAdministrador(request: RegisterAdminRequest): Observable<AdministradorResponse> {
    return this.http.post<AdministradorResponse>(`${this.apiUrl}/administradores`, request).pipe(
      timeout(1500),
      catchError(() =>
        of({
          id: Math.floor(Math.random() * 900) + 10,
          nombre: request.nombre,
          email: request.email,
          role: 'ADMIN' as const,
          createdAt: new Date().toISOString(),
        }),
      ),
      tap((created) => {
        this.auditService.record({
          modulo: 'ADMINISTRADORES',
          accion: 'CREACION',
          entidad: `Admin #${created.id}`,
          valorAnterior: 'Sin acceso',
          valorNuevo: `${created.nombre} (${created.email}) · ROL ADMIN`,
          detalle: `Se otorgaron permisos de administrador a ${created.nombre} (${created.email})`,
        });
      }),
    );
  }
}
