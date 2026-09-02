package com.radar.api.exception;

public class ReportNotFoundException extends RuntimeException {

    public ReportNotFoundException(Long id) {
        super("No existe un reporte con id: " + id);
    }
}
