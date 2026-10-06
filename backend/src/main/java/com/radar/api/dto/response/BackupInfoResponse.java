package com.radar.api.dto.response;

import java.time.Instant;

public record BackupInfoResponse(
        String name,
        Instant createdAt,
        long sizeBytes) {
}
