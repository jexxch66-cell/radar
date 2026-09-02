package com.radar.api.dto.response;

import com.radar.api.model.ReportCategory;
import com.radar.api.model.ReportStatus;
import lombok.Builder;
import lombok.Getter;

import java.time.Instant;

@Getter
@Builder
public class ReportResponse {

    private Long id;
    private ReportCategory categoria;
    private String descripcion;
    private Double latitud;
    private Double longitud;
    private ReportStatus estado;
    private Long autorId;
    private String autorNombre;
    private Instant createdAt;
}
