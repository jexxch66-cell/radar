export interface BackupStatus {
  storageConfigured: boolean;
  storageType: 'AZURE' | 'LOCAL';
  scheduleEnabled: boolean;
  intervalHours: number;
  nextBackupAt: string | null;
  lastBackupAt: string | null;
  lastError: string | null;
  latestBackupName: string | null;
  latestBackupAt: string | null;
}

export interface BackupInfo {
  name: string;
  createdAt: string;
  sizeBytes: number;
}
