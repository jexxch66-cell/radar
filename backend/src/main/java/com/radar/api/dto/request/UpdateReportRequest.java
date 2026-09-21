package com.radar.api.dto.request;

import com.radar.api.model.ReportCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdateReportRequest {

    @NotNull(message = "La categoria es obligatoria")
    private ReportCategory categoria;

    @NotBlank(message = "La descripcion es obligatoria")
    @Size(max = 500, message = "La descripcion no puede superar 500 caracteres")
    private String descripcion;
}
