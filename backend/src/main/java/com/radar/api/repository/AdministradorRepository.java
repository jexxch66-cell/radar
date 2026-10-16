package com.radar.api.repository;

import com.radar.api.model.Administrador;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface AdministradorRepository extends JpaRepository<Administrador, Long> {

    Optional<Administrador> findByEmail(String email);

    Optional<Administrador> findByEmailIgnoreCase(String email);

    boolean existsByEmail(String email);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("update Administrador a set a.activeSessionId = :sessionId, a.lastActiveAt = :lastActiveAt where a.email = :email")
    int updateActiveSessionId(@Param("email") String email, @Param("sessionId") String sessionId, @Param("lastActiveAt") Instant lastActiveAt);

    default int updateActiveSessionId(String email, String sessionId) {
        return updateActiveSessionId(email, sessionId, Instant.now());
    }

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("update Administrador a set a.lastActiveAt = :lastActiveAt where a.email = :email and a.activeSessionId = :sessionId")
    int updateLastActiveAt(@Param("email") String email, @Param("sessionId") String sessionId, @Param("lastActiveAt") Instant lastActiveAt);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("update Administrador a set a.activeSessionId = null, a.lastActiveAt = null where a.email = :email")
    int clearActiveSession(@Param("email") String email);
}
