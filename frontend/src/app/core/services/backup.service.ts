import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BackupInfo, BackupStatus } from '../models/backup.models';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/admin/backups`;

  getStatus(): Observable<BackupStatus> {
    return this.http.get<BackupStatus>(this.apiUrl);
  }

  updateSchedule(enabled: boolean, intervalHours: number): Observable<BackupStatus> {
    return this.http.put<BackupStatus>(`${this.apiUrl}/schedule`, { enabled, intervalHours });
  }

  createBackup(): Observable<BackupInfo> {
    return this.http.post<BackupInfo>(this.apiUrl, {});
  }

  restoreLatest(confirmation: string): Observable<BackupInfo> {
    return this.http.post<BackupInfo>(`${this.apiUrl}/restore-latest`, { confirmation });
  }
}
