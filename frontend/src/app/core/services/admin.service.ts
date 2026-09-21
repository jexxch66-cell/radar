import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdministradorResponse, RegisterAdminRequest } from '../models/admin.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/admin`;

  registrarAdministrador(request: RegisterAdminRequest): Observable<AdministradorResponse> {
    return this.http.post<AdministradorResponse>(`${this.apiUrl}/administradores`, request);
  }
}
