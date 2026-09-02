import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateReportRequest, Report } from '../models/report.models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/reportes`;

  getAll(): Observable<Report[]> {
    return this.http.get<Report[]>(this.apiUrl);
  }

  create(request: CreateReportRequest): Observable<Report> {
    return this.http.post<Report>(this.apiUrl, request);
  }
}
