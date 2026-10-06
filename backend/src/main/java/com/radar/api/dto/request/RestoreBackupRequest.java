package com.radar.api.dto.request;

import jakarta.validation.constraints.NotBlank;

public record RestoreBackupRequest(
        @NotBlank(message = "Escribe RESTAURAR para confirmar")
        String confirmation) {
}
