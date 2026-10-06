package com.radar.api.repository;

import com.radar.api.model.Administrador;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AdministradorRepository extends JpaRepository<Administrador, Long> {

    Optional<Administrador> findByEmail(String email);

    boolean existsByEmail(String email);

    @Modifying
    @Transactional
    @Query("update Administrador a set a.activeSessionId = :sessionId where a.email = :email")
    int updateActiveSessionId(@Param("email") String email, @Param("sessionId") String sessionId);
}
