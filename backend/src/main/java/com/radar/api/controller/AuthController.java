package com.radar.api.controller;

import com.radar.api.dto.request.LoginRequest;
import com.radar.api.dto.request.GoogleAuthRequest;
import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.dto.response.AuthResponse;
import com.radar.api.service.AuthService;
import com.radar.api.service.JwtService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// Controlador REST que expone los endpoints públicos y de sesión bajo la ruta /api/auth
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    // Servicios inyectados para lógica de autenticación y lectura de claims del token JWT
    private final AuthService authService;
    private final JwtService jwtService;

    // POST /api/auth/register: registra un nuevo usuario ciudadano y devuelve su token JWT con estado HTTP 201
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // POST /api/auth/login: autentica usuario o administrador con email/contraseña y valida sesión única activa
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    // POST /api/auth/google: autentica o registra mediante token de Google Identity Services
    @PostMapping("/google")
    public ResponseEntity<AuthResponse> loginWithGoogle(@Valid @RequestBody GoogleAuthRequest request) {
        AuthResponse response = authService.loginWithGoogle(
                request.getIdToken(), request.isAcceptDataTreatment(), request.getCaptchaToken(), request.isForce());
        return ResponseEntity.ok(response);
    }

    // POST /api/auth/heartbeat: señal periódica (cada 25 s) enviada por el frontend para mantener viva la sesión única
    @PostMapping("/heartbeat")
    public ResponseEntity<?> heartbeat(Authentication authentication, HttpServletRequest request) {
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Sesión inválida o expirada"));
        }

        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            try {
                String sessionId = jwtService.extractSessionId(token);
                authService.heartbeat(authentication.getName(), sessionId);
            } catch (Exception ignored) {
            }
        }
        return ResponseEntity.ok().build();
    }

    // POST /api/auth/logout: libera inmediatamente el activeSessionId en base de datos al cerrar sesión
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(Authentication authentication, HttpServletRequest request) {
        String email = null;
        if (authentication != null && authentication.isAuthenticated() && !"anonymousUser".equals(authentication.getPrincipal())) {
            email = authentication.getName();
        } else {
            String authHeader = request.getHeader("Authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                try {
                    String token = authHeader.substring(7);
                    email = jwtService.extractUsername(token);
                } catch (Exception ignored) {
                }
            }
        }

        if (email != null) {
            authService.logout(email);
        }
        return ResponseEntity.ok().build();
    }
}
