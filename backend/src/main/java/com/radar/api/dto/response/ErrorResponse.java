package com.radar.api.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.time.Instant;
import java.util.Map;

@Getter
@Builder
public class ErrorResponse {

    @Builder.Default
    private Instant timestamp = Instant.now();
    private int status;
    private String message;
    // Errores de validacion por campo (nombre del campo -> mensaje), null si no aplica
    private Map<String, String> fieldErrors;
}
