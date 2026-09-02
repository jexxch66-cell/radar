package com.radar.api.repository;

import com.radar.api.model.Report;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ReportRepository extends JpaRepository<Report, Long> {

    // JOIN FETCH trae el autor en la misma consulta: evita el LazyInitializationException
    // que dispararia acceder a report.getAutor() fuera de la transaccion (open-in-view: false)
    @Query("SELECT r FROM Report r JOIN FETCH r.autor ORDER BY r.createdAt DESC")
    List<Report> findAllByOrderByCreatedAtDesc();

    @Query("SELECT r FROM Report r JOIN FETCH r.autor WHERE r.id = :id")
    Optional<Report> findByIdWithAutor(Long id);
}
