package com.radar.api.controller;

import com.radar.api.dto.request.CreateReportRequest;
import com.radar.api.dto.request.UpdateReportRequest;
import com.radar.api.dto.request.UpdateReportStatusRequest;
import com.radar.api.dto.response.ReportResponse;
import com.radar.api.service.ReportService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Controlador REST para gestionar reportes urbanos bajo el endpoint /api/reportes
@RestController
@RequestMapping("/api/reportes")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    // POST /api/reportes: cualquier usuario autenticado puede crear un reporte; el autor se toma del token JWT
    @PostMapping
    public ResponseEntity<ReportResponse> create(@Valid @RequestBody CreateReportRequest request,
                                                  Authentication authentication) {
        ReportResponse response = reportService.create(request, authentication.getName());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // GET /api/reportes: devuelve la lista completa de reportes para pintarlos en el mapa o en la tabla admin
    @GetMapping
    public ResponseEntity<List<ReportResponse>> findAll() {
        return ResponseEntity.ok(reportService.findAll());
    }

    // GET /api/reportes/{id}: obtiene el detalle de un reporte específico por su ID
    @GetMapping("/{id}")
    public ResponseEntity<ReportResponse> findById(@PathVariable Long id) {
        return ResponseEntity.ok(reportService.findById(id));
    }

    // PUT /api/reportes/{id}: edita categoría y descripción de un reporte (restringido a rol ADMIN)
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ReportResponse> update(@PathVariable Long id,
                                                   @Valid @RequestBody UpdateReportRequest request) {
        return ResponseEntity.ok(reportService.update(id, request));
    }

    // DELETE /api/reportes/{id}: elimina un reporte de la base de datos (restringido a rol ADMIN)
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        reportService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // PATCH /api/reportes/{id}/estado: cambia el estado (PENDIENTE, EN_PROGRESO, RESUELTO) (restringido a rol ADMIN)
    @PatchMapping("/{id}/estado")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ReportResponse> updateStatus(@PathVariable Long id,
                                                         @Valid @RequestBody UpdateReportStatusRequest request) {
        return ResponseEntity.ok(reportService.updateStatus(id, request));
    }
}
