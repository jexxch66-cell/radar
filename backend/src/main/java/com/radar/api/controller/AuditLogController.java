package com.radar.api.controller;

import com.radar.api.model.AuditLog;
import com.radar.api.service.AuditLogService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Controlador REST para consultar y registrar eventos en la sección de Auditoría del panel de administrador
@RestController
@RequestMapping("/api/admin/auditoria")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AuditLogController {

    private final AuditLogService auditLogService;

    // GET /api/admin/auditoria -> Obtiene el historial de cambios para el reporte de auditoría
    @GetMapping
    public ResponseEntity<List<AuditLog>> obtenerHistorial() {
        return ResponseEntity.ok(auditLogService.listarHistorial());
    }

    // POST /api/admin/auditoria -> Permite registrar una acción auditada desde el panel de administración
    @PostMapping
    public ResponseEntity<AuditLog> registrarEvento(
            @RequestBody CreateAuditLogRequest request,
            Authentication authentication
    ) {
        String usuario = request.getUsuario() != null && !request.getUsuario().isBlank()
                ? request.getUsuario()
                : (authentication != null ? authentication.getName() : "Administrador");

        AuditLog creado = auditLogService.registrarEvento(
                request.getModulo(),
                request.getAccion(),
                usuario,
                request.getRol() != null ? request.getRol() : "ADMIN",
                request.getEntidad(),
                request.getValorAnterior(),
                request.getValorNuevo(),
                request.getDetalle()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(creado);
    }

    // DTO interno para recibir eventos de auditoría desde el frontend
    @Data
    public static class CreateAuditLogRequest {
        private String modulo;
        private String accion;
        private String usuario;
        private String rol;
        private String entidad;
        private String valorAnterior;
        private String valorNuevo;
        private String detalle;
    }
}
