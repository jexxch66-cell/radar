package com.radar.api.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

// Entidad JPA que almacena en PostgreSQL el historial de auditoría de todos los cambios del sistema
@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    // Identificador único autoincremental del registro de auditoría
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Módulo afectado: REPORTES, BACKUPS, ADMINISTRADORES, SEGURIDAD, EXPORTACIONES
    @Column(nullable = false, length = 40)
    private String modulo;

    // Tipo de acción ejecutada: CREACION, CAMBIO_ESTADO, EDICION, ELIMINACION, BACKUP, RESTAURACION, etc.
    @Column(nullable = false, length = 40)
    private String accion;

    // Nombre o correo del usuario/administrador que realizó la acción
    @Column(nullable = false, length = 120)
    private String usuario;

    // Rol del actor al momento del cambio (ADMIN o CIUDADANO)
    @Column(nullable = false, length = 30)
    private String rol;

    // Identificador legible del recurso afectado (ej. "Reporte #15", "Backup BD")
    @Column(nullable = false, length = 80)
    private String entidad;

    // Estado o valor previo antes de la modificación (opcional)
    @Column(length = 250)
    private String valorAnterior;

    // Estado o valor nuevo después de la modificación (opcional)
    @Column(length = 250)
    private String valorNuevo;

    // Explicación detallada del cambio para el reporte de auditoría
    @Column(nullable = false, length = 600)
    private String detalle;

    // Fecha y hora exacta en que ocurrió el evento (generada automáticamente)
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
