package com.radar.api.service;

import com.radar.api.dto.request.CreateReportRequest;
import com.radar.api.dto.request.UpdateReportStatusRequest;
import com.radar.api.dto.response.ReportResponse;
import com.radar.api.exception.ReportNotFoundException;
import com.radar.api.model.Report;
import com.radar.api.model.User;
import com.radar.api.repository.ReportRepository;
import com.radar.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;
    private final UserRepository userRepository;

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
        return toResponse(report);
    }

    public List<ReportResponse> findAll() {
        return reportRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toResponse)
                .toList();
    }

    public ReportResponse findById(Long id) {
        return toResponse(getOrThrow(id));
    }

    public ReportResponse updateStatus(Long id, UpdateReportStatusRequest request) {
        Report report = getOrThrow(id);
        report.setEstado(request.getEstado());
        reportRepository.save(report);
        return toResponse(report);
    }

    private Report getOrThrow(Long id) {
        return reportRepository.findByIdWithAutor(id)
                .orElseThrow(() -> new ReportNotFoundException(id));
    }

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
