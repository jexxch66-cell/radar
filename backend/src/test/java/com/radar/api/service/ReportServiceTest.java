package com.radar.api.service;

import com.radar.api.dto.request.CreateReportRequest;
import com.radar.api.dto.request.UpdateReportRequest;
import com.radar.api.dto.request.UpdateReportStatusRequest;
import com.radar.api.exception.ReportNotFoundException;
import com.radar.api.model.Report;
import com.radar.api.model.ReportCategory;
import com.radar.api.model.ReportStatus;
import com.radar.api.model.User;
import com.radar.api.repository.ReportRepository;
import com.radar.api.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    @Mock ReportRepository reportRepository;
    @Mock UserRepository userRepository;
    @InjectMocks ReportService service;

    private User author;
    private Report report;

    @BeforeEach
    void setUp() {
        author = User.builder().id(4L).nombre("Author").email("author@example.com").build();
        report = Report.builder().id(9L).categoria(ReportCategory.BACHE).descripcion("Road damage")
                .latitud(4.7).longitud(-74.1).autor(author).build();
    }

    @Test
    void createsReportForExistingAuthor() {
        CreateReportRequest request = new CreateReportRequest();
        request.setCategoria(ReportCategory.BASURA);
        request.setDescripcion("Trash pile");
        request.setLatitud(4.7);
        request.setLongitud(-74.1);
        when(userRepository.findByEmail(author.getEmail())).thenReturn(Optional.of(author));
        when(reportRepository.save(any(Report.class))).thenAnswer(invocation -> {
            Report saved = invocation.getArgument(0);
            saved.setId(9L);
            return saved;
        });

        var response = service.create(request, author.getEmail());

        assertEquals(9L, response.getId());
        assertEquals(ReportCategory.BASURA, response.getCategoria());
        assertEquals(author.getId(), response.getAutorId());
    }

    @Test
    void rejectsCreateWhenAuthorDoesNotExist() {
        when(userRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());

        assertThrows(UsernameNotFoundException.class,
                () -> service.create(new CreateReportRequest(), "missing@example.com"));
        verifyNoInteractions(reportRepository);
    }

    @Test
    void findsAllReportsInRepositoryOrder() {
        when(reportRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(report));

        var responses = service.findAll();

        assertEquals(1, responses.size());
        assertEquals(report.getId(), responses.get(0).getId());
        assertEquals(report.getDescripcion(), responses.get(0).getDescripcion());
    }

    @Test
    void updatesStatusAndDetails() {
        when(reportRepository.findByIdWithAutor(report.getId())).thenReturn(Optional.of(report));
        UpdateReportStatusRequest statusRequest = new UpdateReportStatusRequest();
        statusRequest.setEstado(ReportStatus.RESUELTO);
        UpdateReportRequest updateRequest = new UpdateReportRequest();
        updateRequest.setCategoria(ReportCategory.OTRO);
        updateRequest.setDescripcion("Updated description");

        var statusResponse = service.updateStatus(report.getId(), statusRequest);
        var updateResponse = service.update(report.getId(), updateRequest);

        assertEquals(ReportStatus.RESUELTO, statusResponse.getEstado());
        assertEquals(ReportCategory.OTRO, updateResponse.getCategoria());
        assertEquals("Updated description", updateResponse.getDescripcion());
        verify(reportRepository, times(2)).save(report);
    }

    @Test
    void throwsForMissingFindAndDelete() {
        when(reportRepository.findByIdWithAutor(99L)).thenReturn(Optional.empty());
        when(reportRepository.existsById(99L)).thenReturn(false);

        assertThrows(ReportNotFoundException.class, () -> service.findById(99L));
        assertThrows(ReportNotFoundException.class, () -> service.delete(99L));
        verify(reportRepository, never()).deleteById(99L);
    }

    @Test
    void deletesExistingReport() {
        when(reportRepository.existsById(report.getId())).thenReturn(true);

        service.delete(report.getId());

        verify(reportRepository).deleteById(report.getId());
    }
}