package com.radar.api.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record UpdateBackupScheduleRequest(
        boolean enabled,
        @Min(value = 1, message = "El intervalo mínimo es 1 hora")
        @Max(value = 8760, message = "El intervalo máximo es 8760 horas")
        int intervalHours) {
}
