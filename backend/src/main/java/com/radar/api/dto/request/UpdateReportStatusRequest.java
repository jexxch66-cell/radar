package com.radar.api.dto.request;

import com.radar.api.model.ReportStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdateReportStatusRequest {

    @NotNull(message = "El estado es obligatorio")
    private ReportStatus estado;
}
