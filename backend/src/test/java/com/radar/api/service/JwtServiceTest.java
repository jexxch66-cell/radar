package com.radar.api.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;
    private UserDetails userDetails;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secret", "a-secret-key-that-is-long-enough-for-hmac-sha");
        ReflectionTestUtils.setField(jwtService, "expirationMs", 60_000L);
        userDetails = User.withUsername("user@example.com").password("encoded").roles("USER").build();
    }

    @Test
    void generatesTokenAndExtractsUsername() {
        String token = jwtService.generateToken(userDetails, "session-one");

        assertEquals("user@example.com", jwtService.extractUsername(token));
        assertEquals("session-one", jwtService.extractSessionId(token));
        assertTrue(jwtService.isTokenValid(token, userDetails, "session-one"));
        assertFalse(jwtService.isTokenValid(token, userDetails, "session-two"));
    }

    @Test
    void rejectsTokenForAnotherUser() {
        String token = jwtService.generateToken(userDetails, "session-one");
        UserDetails anotherUser = User.withUsername("other@example.com").password("encoded").roles("USER").build();

        assertFalse(jwtService.isTokenValid(token, anotherUser, "session-one"));
    }

    @Test
    void rejectsTokenWithoutAnActiveSession() {
        String token = jwtService.generateToken(userDetails, "session-one");

        assertFalse(jwtService.isTokenValid(token, userDetails, null));
    }
}