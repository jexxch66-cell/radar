// Servicio para la gestión de respaldos (Backups) de PostgreSQL con respuesta rápida garantizada
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BackupInfo, BackupStatus } from '../models/backup.models';

// Con el modo presentacion se espera poco y se muestran datos simulados; en uso real se espera al servidor
const REQUEST_TIMEOUT_MS = environment.offlineDemo ? 1500 : 15_000;

const LOCAL_BACKUP_STATUS_KEY = 'radar_backup_status_v1';

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/admin/backups`;

  getStatus(): Observable<BackupStatus> {
    return this.http.get<BackupStatus>(this.apiUrl).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      tap((status) => this.saveLocalStatus(status)),
      catchError((err: unknown) => (environment.offlineDemo ? of(this.readLocalStatus()) : throwError(() => err))),
    );
  }

  updateSchedule(enabled: boolean, intervalHours: number): Observable<BackupStatus> {
    return this.http.put<BackupStatus>(`${this.apiUrl}/schedule`, { enabled, intervalHours }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      tap((status) => this.saveLocalStatus(status)),
      catchError((err: unknown) => {
        if (!environment.offlineDemo) {
          return throwError(() => err);
        }
        const current = this.readLocalStatus();
        const next: BackupStatus = {
          ...current,
          scheduleEnabled: enabled,
          intervalHours,
          nextBackupAt: enabled
            ? new Date(Date.now() + intervalHours * 3600_000).toISOString()
            : null,
        };
        this.saveLocalStatus(next);
        return of(next);
      }),
    );
  }

  createBackup(): Observable<BackupInfo> {
    return this.http.post<BackupInfo>(this.apiUrl, {}).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError((err: unknown) => {
        if (!environment.offlineDemo) {
          return throwError(() => err);
        }
        const now = new Date();
        const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backup: BackupInfo = {
          name: `radar_db_backup_${stamp}.dump`,
          createdAt: now.toISOString(),
          sizeBytes: 248_512,
        };
        const current = this.readLocalStatus();
        this.saveLocalStatus({
          ...current,
          lastBackupAt: now.toISOString(),
          latestBackupAt: now.toISOString(),
          latestBackupName: backup.name,
        });
        return of(backup);
      }),
    );
  }

  restoreLatest(confirmation: string): Observable<BackupInfo> {
    return this.http.post<BackupInfo>(`${this.apiUrl}/restore-latest`, { confirmation }).pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError((err: unknown) => {
        if (!environment.offlineDemo) {
          return throwError(() => err);
        }
        const current = this.readLocalStatus();
        const now = new Date().toISOString();
        return of({
          name: current.latestBackupName ?? 'radar_db_backup_latest.dump',
          createdAt: current.latestBackupAt ?? now,
          sizeBytes: 248_512,
        });
      }),
    );
  }

  private readLocalStatus(): BackupStatus {
    try {
      const raw = localStorage.getItem(LOCAL_BACKUP_STATUS_KEY);
      if (raw) {
        return JSON.parse(raw) as BackupStatus;
      }
    } catch {
      // Ignorar error de lectura
    }
    const initial: BackupStatus = {
      storageConfigured: true,
      storageType: 'LOCAL',
      scheduleEnabled: true,
      intervalHours: 24,
      nextBackupAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      lastBackupAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      lastError: null,
      latestBackupName: 'radar_db_backup_inicial.dump',
      latestBackupAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    };
    this.saveLocalStatus(initial);
    return initial;
  }

  private saveLocalStatus(status: BackupStatus): void {
    try {
      localStorage.setItem(LOCAL_BACKUP_STATUS_KEY, JSON.stringify(status));
    } catch {
      // Ignorar error de escritura
    }
  }
}
