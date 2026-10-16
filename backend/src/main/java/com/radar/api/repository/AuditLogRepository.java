package com.radar.api.repository;

import com.radar.api.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Repositorio JPA para consultar y guardar registros de auditoría en la tabla audit_logs
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    // Obtiene los últimos 200 eventos de auditoría ordenados del más reciente al más antiguo
    List<AuditLog> findTop200ByOrderByCreatedAtDesc();
}
