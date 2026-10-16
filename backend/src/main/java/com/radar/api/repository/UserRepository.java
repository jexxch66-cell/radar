package com.radar.api.repository;

import com.radar.api.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmail(String email);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("update User u set u.activeSessionId = :sessionId, u.lastActiveAt = :lastActiveAt where u.email = :email")
    int updateActiveSessionId(@Param("email") String email, @Param("sessionId") String sessionId, @Param("lastActiveAt") Instant lastActiveAt);

    default int updateActiveSessionId(String email, String sessionId) {
        return updateActiveSessionId(email, sessionId, Instant.now());
    }

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("update User u set u.lastActiveAt = :lastActiveAt where u.email = :email and u.activeSessionId = :sessionId")
    int updateLastActiveAt(@Param("email") String email, @Param("sessionId") String sessionId, @Param("lastActiveAt") Instant lastActiveAt);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("update User u set u.activeSessionId = null, u.lastActiveAt = null where u.email = :email")
    int clearActiveSession(@Param("email") String email);
}
