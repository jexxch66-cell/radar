package com.radar.api.controller;

import com.radar.api.dto.request.RestoreBackupRequest;
import com.radar.api.dto.request.UpdateBackupScheduleRequest;
import com.radar.api.dto.response.BackupInfoResponse;
import com.radar.api.dto.response.BackupStatusResponse;
import com.radar.api.service.BackupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Controlador REST exclusivo para administradores (@PreAuthorize) que gestiona copias de seguridad de PostgreSQL
@RestController
@RequestMapping("/api/admin/backups")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class BackupController {

    private final BackupService backupService;

    // GET /api/admin/backups: consulta el estado actual de backups (último archivo, programación y destino Azure/Local)
    @GetMapping
    public ResponseEntity<BackupStatusResponse> getStatus() {
        return ResponseEntity.ok(backupService.getStatus());
    }

    // PUT /api/admin/backups/schedule: activa/desactiva el backup automático y configura cada cuántas horas se ejecuta
    @PutMapping("/schedule")
    public ResponseEntity<BackupStatusResponse> updateSchedule(
            @Valid @RequestBody UpdateBackupScheduleRequest request) {
        return ResponseEntity.ok(backupService.updateSchedule(request));
    }

    // POST /api/admin/backups: ejecuta inmediatamente un pg_dump de la base de datos y lo sube a Azure o carpeta local
    @PostMapping
    public ResponseEntity<BackupInfoResponse> createBackup() {
        return ResponseEntity.ok(backupService.createBackup());
    }

    // POST /api/admin/backups/restore-latest: restaura el último backup disponible tras validar la palabra "RESTAURAR"
    @PostMapping("/restore-latest")
    public ResponseEntity<BackupInfoResponse> restoreLatest(
            @Valid @RequestBody RestoreBackupRequest request) {
        if (!"RESTAURAR".equals(request.confirmation())) {
            throw new IllegalArgumentException("Escribe RESTAURAR para confirmar la restauración.");
        }
        return ResponseEntity.ok(backupService.restoreLatestBackup());
    }
}
