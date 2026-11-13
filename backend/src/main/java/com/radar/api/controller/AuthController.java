package com.radar.api.controller;

import com.radar.api.dto.request.LoginRequest;
import com.radar.api.dto.request.GoogleAuthRequest;
import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.dto.response.AuthResponse;
import com.radar.api.service.AuthService;
import com.radar.api.service.JwtService;
import com.radar.api.service.UserDetailsServiceImpl;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
    private final UserDetailsServiceImpl userDetailsService;

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

    // GET y POST /api/auth/session-lock: candado en memoria del servidor para impedir doble sesión entre navegadores distintos.
    // "check" es público (se consulta antes de iniciar sesión); "claim", "heartbeat" y "release" exigen estar autenticado
    // y solo sobre la propia cuenta, para que un tercero no pueda bloquear ni liberar el candado de otra persona (DEF-11)
    @GetMapping("/session-lock")
    public ResponseEntity<Map<String, Object>> sessionLockGet(
            @RequestParam(defaultValue = "check") String action,
            @RequestParam(defaultValue = "") String email,
            @RequestParam(defaultValue = "") String tabId,
            Authentication authentication
    ) {
        if (!"check".equals(action) && !isOwner(authentication, email)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                    "locked", false,
                    "message", "Debes iniciar sesión para gestionar el candado de tu propia cuenta."
            ));
        }
        boolean allowed = authService.handleSessionLockAction(action, email, tabId);
        if (!allowed) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "locked", true,
                    "message", "No se puede iniciar sesión: esta cuenta ya tiene una sesión activa en este u otro navegador."
            ));
        }
        return ResponseEntity.ok(Map.of("ok", true, "locked", false));
    }

    @PostMapping("/session-lock")
    public ResponseEntity<Map<String, Object>> sessionLockPost(
            @RequestParam(defaultValue = "check") String action,
            @RequestParam(defaultValue = "") String email,
            @RequestParam(defaultValue = "") String tabId,
            Authentication authentication
    ) {
        return sessionLockGet(action, email, tabId, authentication);
    }

    private static boolean isAuthenticated(Authentication authentication) {
        return authentication != null && authentication.isAuthenticated()
                && !"anonymousUser".equals(authentication.getPrincipal());
    }

    private static boolean isOwner(Authentication authentication, String email) {
        return isAuthenticated(authentication) && email != null && authentication.getName().equalsIgnoreCase(email.trim());
    }

    // POST /api/auth/heartbeat: señal periódica enviada por el frontend para mantener viva la sesión única
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

    // POST /api/auth/logout: libera inmediatamente el activeSessionId en base de datos y en memoria al cerrar sesión o pestaña.
    // Solo cierra la sesión del titular de un token válido de la sesión ACTIVA: por la autenticación de la petición, la
    // cabecera Authorization o el parámetro "token" (para navigator.sendBeacon al cerrar la pestaña, que no admite
    // cabeceras). Ya no se acepta un correo arbitrario sin autenticar (DEF-10).
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            Authentication authentication,
            HttpServletRequest request,
            @RequestParam(required = false) String token
    ) {
        String email = null;
        if (isAuthenticated(authentication)) {
            email = authentication.getName();
        } else {
            String authHeader = request.getHeader("Authorization");
            String rawToken = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : token;
            email = ownerOfActiveSession(rawToken);
        }

        if (email != null) {
            authService.logout(email);
        }
        return ResponseEntity.ok().build();
    }

    // Devuelve el titular del token solo si su firma es válida y corresponde a la sesión activa (un token antiguo no puede
    // cerrar la sesión más reciente de la misma cuenta)
    private String ownerOfActiveSession(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return null;
        }
        try {
            String username = jwtService.extractUsername(rawToken);
            String sessionId = jwtService.extractSessionId(rawToken);
            return userDetailsService.isActiveSession(username, sessionId) ? username : null;
        } catch (Exception invalidToken) {
            return null;
        }
    }
}
