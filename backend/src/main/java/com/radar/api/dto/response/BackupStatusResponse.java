package com.radar.api.dto.response;

import java.time.Instant;

public record BackupStatusResponse(
        boolean storageConfigured,
        String storageType,
        boolean scheduleEnabled,
        int intervalHours,
        Instant nextBackupAt,
        Instant lastBackupAt,
        String lastError,
        String latestBackupName,
        Instant latestBackupAt) {
}
