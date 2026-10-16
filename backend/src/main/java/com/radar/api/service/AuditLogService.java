package com.radar.api.service;

import com.radar.api.model.AuditLog;
import com.radar.api.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

// Servicio encargado de registrar y consultar la auditoría de cambios del sistema
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    // Registra un evento en la tabla audit_logs y también en el archivo físico logs/radar-api.log
    public AuditLog registrarEvento(
            String modulo,
            String accion,
            String usuario,
            String rol,
            String entidad,
            String valorAnterior,
            String valorNuevo,
            String detalle
    ) {
        AuditLog evento = AuditLog.builder()
                .modulo(modulo)
                .accion(accion)
                .usuario(usuario != null ? usuario : "Sistema")
                .rol(rol != null ? rol : "ADMIN")
                .entidad(entidad != null ? entidad : "-")
                .valorAnterior(valorAnterior)
                .valorNuevo(valorNuevo)
                .detalle(detalle)
                .build();

        AuditLog guardado = auditLogRepository.save(evento);
        log.info("[AUDITORIA] modulo={}, accion={}, usuario={} ({}), entidad={}, antes='{}', despues='{}', detalle='{}'",
                modulo, accion, evento.getUsuario(), evento.getRol(), entidad, valorAnterior, valorNuevo, detalle);
        return guardado;
    }

    // Devuelve el historial completo de auditoría ordenado por fecha descendente
    public List<AuditLog> listarHistorial() {
        return auditLogRepository.findTop200ByOrderByCreatedAtDesc();
    }
}
