package com.radar.api.service;

import com.radar.api.dto.request.CreateReportRequest;
import com.radar.api.dto.request.UpdateReportRequest;
import com.radar.api.dto.request.UpdateReportStatusRequest;
import com.radar.api.dto.response.ReportResponse;
import com.radar.api.exception.ReportNotFoundException;
import com.radar.api.model.Report;
import com.radar.api.model.User;
import com.radar.api.repository.ReportRepository;
import com.radar.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

// Servicio de negocio para la gestión de reportes ciudadanos (creación, consulta, cambio de estado, edición y borrado)
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    // Repositorios de base de datos para reportes y usuarios, y servicio de auditoría
    private final ReportRepository reportRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;

    // Crea y guarda un nuevo reporte urbano asociándolo al ciudadano autenticado
    public ReportResponse create(CreateReportRequest request, String autorEmail) {
        User autor = userRepository.findByEmail(autorEmail)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado: " + autorEmail));

        Report report = Report.builder()
                .categoria(request.getCategoria())
                .descripcion(request.getDescripcion())
                .latitud(request.getLatitud())
                .longitud(request.getLongitud())
                .autor(autor)
                .build();

        reportRepository.save(report);
        log.info("Reporte creado: id={}, categoria={}, autor={}", report.getId(), report.getCategoria(), autorEmail);
        auditLogService.registrarEvento(
                "REPORTES",
                "CREACION",
                autor.getNombre() + " (" + autorEmail + ")",
                autor.getRole().name(),
                "Reporte #" + report.getId(),
                "-",
                report.getCategoria().name() + " · " + report.getEstado().name(),
                "Creación de reporte urbano: " + report.getDescripcion()
        );
        return toResponse(report);
    }

    // Lista todos los reportes del más reciente al más antiguo para mostrarlos en el mapa y el panel admin
    public List<ReportResponse> findAll() {
        return reportRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .toList();
    }

    // Busca un reporte específico por su clave primaria (ID)
    public ReportResponse findById(Long id) {
        return toResponse(getOrThrow(id));
    }

    // Actualiza el estado del reporte (PENDIENTE -> EN_PROGRESO -> RESUELTO) desde el panel de administración
    public ReportResponse updateStatus(Long id, UpdateReportStatusRequest request) {
        Report report = getOrThrow(id);
        String estadoAnterior = report.getEstado().name();
        report.setEstado(request.getEstado());
        reportRepository.save(report);
        log.info("Estado de reporte actualizado: id={}, nuevoEstado={}", id, request.getEstado());
        auditLogService.registrarEvento(
                "REPORTES",
                "CAMBIO_ESTADO",
                "Administrador",
                "ADMIN",
                "Reporte #" + id,
                estadoAnterior,
                request.getEstado().name(),
                "Cambio de estado del reporte #" + id + " de " + estadoAnterior + " a " + request.getEstado().name()
        );
        return toResponse(report);
    }

    // Modifica la categoría y descripción de un reporte existente (acción exclusiva de ADMIN)
    public ReportResponse update(Long id, UpdateReportRequest request) {
        Report report = getOrThrow(id);
        String anterior = report.getCategoria().name() + ": " + report.getDescripcion();
        report.setCategoria(request.getCategoria());
        report.setDescripcion(request.getDescripcion());
        reportRepository.save(report);
        log.info("Reporte editado por administrador: id={}, categoria={}", id, request.getCategoria());
        auditLogService.registrarEvento(
                "REPORTES",
                "EDICION",
                "Administrador",
                "ADMIN",
                "Reporte #" + id,
                anterior,
                request.getCategoria().name() + ": " + request.getDescripcion(),
                "Edición de categoría/descripción del reporte #" + id
        );
        return toResponse(report);
    }

    // Elimina físicamente un reporte de PostgreSQL verificando primero que exista
    public void delete(Long id) {
        Report report = reportRepository.findByIdWithAutor(id)
                .orElseThrow(() -> new ReportNotFoundException(id));
        String resumen = report.getCategoria().name() + " (" + report.getDescripcion() + ")";
        reportRepository.deleteById(id);
        log.info("Reporte eliminado por administrador: id={}", id);
        auditLogService.registrarEvento(
                "REPORTES",
                "ELIMINACION",
                "Administrador",
                "ADMIN",
                "Reporte #" + id,
                resumen,
                "ELIMINADO",
                "Eliminación definitiva del reporte #" + id + " de " + report.getAutor().getNombre()
        );
    }

    // Método auxiliar que busca el reporte junto con su autor o lanza excepción 404 (ReportNotFoundException)
    private Report getOrThrow(Long id) {
        return reportRepository.findByIdWithAutor(id)
                .orElseThrow(() -> new ReportNotFoundException(id));
    }

    // Convierte la entidad JPA Report en el DTO ReportResponse que se envía como JSON al frontend
    private ReportResponse toResponse(Report report) {
        return ReportResponse.builder()
                .id(report.getId())
                .categoria(report.getCategoria())
                .descripcion(report.getDescripcion())
                .latitud(report.getLatitud())
                .longitud(report.getLongitud())
                .estado(report.getEstado())
                .autorId(report.getAutor().getId())
                .autorNombre(report.getAutor().getNombre())
                .createdAt(report.getCreatedAt())
                .build();
    }
}
