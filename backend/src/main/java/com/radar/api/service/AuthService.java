package com.radar.api.service;

import com.radar.api.dto.request.LoginRequest;
import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.dto.response.AuthResponse;
import com.radar.api.exception.ConcurrentSessionException;
import com.radar.api.exception.EmailAlreadyExistsException;
import com.radar.api.exception.InvalidCredentialsException;
import com.radar.api.model.Administrador;
import com.radar.api.model.Role;
import com.radar.api.model.User;
import com.radar.api.repository.AdministradorRepository;
import com.radar.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

// Servicio de negocio para registro, login tradicional/Google, control de sesión única (concurrencia) y heartbeat
// @Slf4j habilita el logger automático (log.info, log.warn) que escribe en la carpeta logs/radar-api.log
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    // Si el usuario está activo (heartbeat periódico), el timeout mantiene bloqueado cualquier intento de doble sesión.
    // Una vez que el usuario cierra sesión o el timeout expira, la sesión se libera.
    public static final Duration SESSION_INACTIVITY_TIMEOUT = Duration.ofSeconds(30);

    private static final Pattern PASSWORD_POLICY_PATTERN = Pattern.compile("^(?=.*[A-Z])(?=.*\\d).{8,}$");

    // Registro atómico en memoria de sesiones activas para bloquear doble sesión entre navegadores de forma inmediata
    private static final Map<String, ActiveSessionRecord> ACTIVE_SESSIONS = new ConcurrentHashMap<>();
    private static final Map<String, Object> EMAIL_LOCKS = new ConcurrentHashMap<>();

    public record ActiveSessionRecord(String sessionId, Instant lastActiveAt) {}

    // Repositorios JPA y servicios auxiliares inyectados por constructor gracias a @RequiredArgsConstructor
    private final UserRepository userRepository;
    private final AdministradorRepository administradorRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsServiceImpl userDetailsService;
    private final GoogleTokenService googleTokenService;
    private final RecaptchaService recaptchaService;

    public static void validatePasswordPolicy(String password) {
        if (password == null || !PASSWORD_POLICY_PATTERN.matcher(password).matches()) {
            throw new IllegalArgumentException(
                    "La contraseña debe tener mínimo 8 caracteres, al menos una letra mayúscula y un número."
            );
        }
    }

    public static boolean isMemorySessionMatching(String email, String sessionId) {
        if (email == null || sessionId == null) {
            return false;
        }
        ActiveSessionRecord record = ACTIVE_SESSIONS.get(email.trim().toLowerCase());
        return record != null && sessionId.equals(record.sessionId());
    }

    // Gestión atómica de candado de sesión entre navegadores sin depender de base de datos
    public boolean handleSessionLockAction(String action, String email, String tabId) {
        if (email == null || email.isBlank()) {
            return true;
        }
        String normalized = email.trim().toLowerCase();
        String safeTabId = tabId != null ? tabId.trim() : "";
        Object lock = EMAIL_LOCKS.computeIfAbsent(normalized, k -> new Object());

        synchronized (lock) {
            Instant now = Instant.now();
            ActiveSessionRecord current = ACTIVE_SESSIONS.get(normalized);
            boolean currentActive = current != null && isSessionActive(current.sessionId(), current.lastActiveAt());
            if (!currentActive && current != null) {
                ACTIVE_SESSIONS.remove(normalized);
                current = null;
            }

            switch (action != null ? action : "check") {
                case "claim":
                    if (current != null && !current.sessionId().equals(safeTabId)) {
                        return false;
                    }
                    ACTIVE_SESSIONS.put(normalized, new ActiveSessionRecord(safeTabId, now));
                    return true;
                case "heartbeat":
                    if (current != null && current.sessionId().equals(safeTabId)) {
                        ACTIVE_SESSIONS.put(normalized, new ActiveSessionRecord(safeTabId, now));
                    } else if (current == null && !safeTabId.isEmpty()) {
                        ACTIVE_SESSIONS.put(normalized, new ActiveSessionRecord(safeTabId, now));
                    }
                    return true;
                case "release":
                    if (current == null || safeTabId.isEmpty() || current.sessionId().equals(safeTabId)) {
                        ACTIVE_SESSIONS.remove(normalized);
                    }
                    return true;
                default:
                    return current == null || current.sessionId().equals(safeTabId);
            }
        }
    }

    // Registra un nuevo ciudadano verificando reCAPTCHA, política de contraseña, unicidad de email y cifrando con BCrypt
    public AuthResponse register(RegisterRequest request) {
        validatePasswordPolicy(request.getPassword());
        recaptchaService.verify(request.getCaptchaToken());
        if (userRepository.existsByEmail(request.getEmail())) {
            log.warn("Intento de registro con email ya existente: {}", request.getEmail());
            throw new EmailAlreadyExistsException(request.getEmail());
        }

        String sessionId = jwtService.newSessionId();
        Instant now = Instant.now();
        // Al registrarse aún no se abre sesión activa (el usuario es dirigido a /login para iniciar sesión)
        User user = User.builder()
                .nombre(request.getNombre())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .privacyConsentAt(now)
                .role(Role.USER)
                .activeSessionId(null)
                .lastActiveAt(null)
                .build();
        userRepository.save(user);
        log.info("Nuevo usuario ciudadano registrado: email={}, id={}", user.getEmail(), user.getId());

        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String token = jwtService.generateToken(userDetails, sessionId);

        return AuthResponse.builder()
                .token(token)
                .id(user.getId())
                .nombre(user.getNombre())
                .email(user.getEmail())
                .role(Role.USER.name())
                .build();
    }

    // Autentica usuario o administrador, bloquea estrictamente si ya hay una sesión activa y emite un JWT con sessionId único
    public AuthResponse login(LoginRequest request) {
        validatePasswordPolicy(request.getPassword());
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );
        } catch (BadCredentialsException ex) {
            log.warn("Intento de login fallido (credenciales inválidas) para email={}", request.getEmail());
            throw new InvalidCredentialsException();
        }

        String rawEmail = request.getEmail() != null ? request.getEmail().trim() : "";
        String normalizedEmail = rawEmail.toLowerCase();
        Object lock = EMAIL_LOCKS.computeIfAbsent(normalizedEmail, k -> new Object());

        synchronized (lock) {
            // Primero verifica si el correo corresponde a un Administrador
            var adminMatch = administradorRepository.findByEmail(rawEmail)
                    .or(() -> administradorRepository.findByEmail(normalizedEmail));
            if (adminMatch.isPresent()) {
                Administrador admin = adminMatch.get();
                // Bloqueo estricto: no se permite iniciar sesión si ya hay una sesión activa en el mismo u otro navegador
                if (hasActiveSession(normalizedEmail, admin.getActiveSessionId(), admin.getLastActiveAt())) {
                    log.warn("Sesión concurrente bloqueada para administrador: email={}", admin.getEmail());
                    throw new ConcurrentSessionException();
                }

                String sessionId = jwtService.newSessionId();
                Instant now = Instant.now();
                requireSessionUpdated(administradorRepository.updateActiveSessionId(admin.getEmail(), sessionId, now));
                ACTIVE_SESSIONS.put(normalizedEmail, new ActiveSessionRecord(sessionId, now));
                log.info("Inicio de sesión exitoso (ADMIN): email={}", admin.getEmail());
                String token = jwtService.generateToken(
                        userDetailsService.loadUserByUsername(admin.getEmail()), sessionId);
                return AuthResponse.builder()
                        .token(token)
                        .id(admin.getId())
                        .nombre(admin.getNombre())
                        .email(admin.getEmail())
                        .role(Role.ADMIN.name())
                        .build();
            }

            // Si no es administrador, busca en la tabla de usuarios ciudadanos
            User user = userRepository.findByEmail(rawEmail)
                    .or(() -> userRepository.findByEmail(normalizedEmail))
                    .orElseThrow(InvalidCredentialsException::new);

            if (hasActiveSession(normalizedEmail, user.getActiveSessionId(), user.getLastActiveAt())) {
                log.warn("Sesión concurrente bloqueada para usuario: email={}", user.getEmail());
                throw new ConcurrentSessionException();
            }

            String sessionId = jwtService.newSessionId();
            Instant now = Instant.now();
            requireSessionUpdated(userRepository.updateActiveSessionId(user.getEmail(), sessionId, now));
            ACTIVE_SESSIONS.put(normalizedEmail, new ActiveSessionRecord(sessionId, now));
            log.info("Inicio de sesión exitoso (USER): email={}", user.getEmail());
            UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
            String token = jwtService.generateToken(userDetails, sessionId);

            return AuthResponse.builder()
                    .token(token)
                    .id(user.getId())
                    .nombre(user.getNombre())
                    .email(user.getEmail())
                    .role(user.getRole().name())
                    .build();
        }
    }

    public AuthResponse loginWithGoogle(String idToken, boolean acceptDataTreatment, String captchaToken) {
        return loginWithGoogle(idToken, acceptDataTreatment, captchaToken, false);
    }

    // Valida el idToken con Google, crea la cuenta si es la primera vez y aplica el mismo bloqueo estricto de sesión única
    public AuthResponse loginWithGoogle(String idToken, boolean acceptDataTreatment, String captchaToken, boolean force) {
        recaptchaService.verify(captchaToken);
        GoogleTokenService.GoogleProfile profile = googleTokenService.verify(idToken);
        String normalizedEmail = profile.email().trim().toLowerCase();
        Object lock = EMAIL_LOCKS.computeIfAbsent(normalizedEmail, k -> new Object());

        synchronized (lock) {
            User user = userRepository.findByEmail(profile.email()).orElseGet(() -> {
                if (!acceptDataTreatment) {
                    throw new IllegalArgumentException("Debes aceptar el tratamiento de datos personales");
                }
                User created = User.builder()
                        .nombre(profile.name())
                        .email(profile.email())
                        .password(passwordEncoder.encode(UUID.randomUUID().toString() + "A1"))
                        .googleSubject(profile.subject())
                        .privacyConsentAt(Instant.now())
                        .role(Role.USER)
                        .build();
                log.info("Cuenta creada mediante Google OAuth: email={}", profile.email());
                return userRepository.save(created);
            });

            if (user.getId() != null && hasActiveSession(normalizedEmail, user.getActiveSessionId(), user.getLastActiveAt())) {
                log.warn("Sesión concurrente bloqueada en login Google: email={}", user.getEmail());
                throw new ConcurrentSessionException();
            }

            String sessionId = jwtService.newSessionId();
            Instant now = Instant.now();
            requireSessionUpdated(userRepository.updateActiveSessionId(user.getEmail(), sessionId, now));
            ACTIVE_SESSIONS.put(normalizedEmail, new ActiveSessionRecord(sessionId, now));
            log.info("Login con Google exitoso: email={}", user.getEmail());
            UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
            return AuthResponse.builder()
                    .token(jwtService.generateToken(userDetails, sessionId))
                    .id(user.getId())
                    .nombre(user.getNombre())
                    .email(user.getEmail())
                    .role(user.getRole().name())
                    .build();
        }
    }

    // Actualiza la marca de tiempo lastActiveAt para confirmar que el navegador del usuario sigue abierto
    public void heartbeat(String email, String sessionId) {
        Instant now = Instant.now();
        if (email != null && sessionId != null) {
            String normalizedEmail = email.trim().toLowerCase();
            ACTIVE_SESSIONS.computeIfPresent(normalizedEmail, (k, existing) ->
                    sessionId.equals(existing.sessionId()) ? new ActiveSessionRecord(sessionId, now) : existing
            );
        }
        try {
            userRepository.updateLastActiveAt(email, sessionId, now);
            administradorRepository.updateLastActiveAt(email, sessionId, now);
        } catch (Exception ignored) {
        }
    }

    // Limpia el activeSessionId en memoria y base de datos cuando el usuario cierra sesión explícitamente
    public void logout(String email) {
        if (email != null) {
            ACTIVE_SESSIONS.remove(email.trim().toLowerCase());
        }
        try {
            userRepository.clearActiveSession(email);
            administradorRepository.clearActiveSession(email);
        } catch (Exception ignored) {
        }
        log.info("Sesión cerrada correctamente para email={}", email);
    }

    private boolean hasActiveSession(String normalizedEmail, String dbSessionId, Instant dbLastActiveAt) {
        ActiveSessionRecord memRecord = ACTIVE_SESSIONS.get(normalizedEmail);
        if (memRecord != null && isSessionActive(memRecord.sessionId(), memRecord.lastActiveAt())) {
            return true;
        }
        return isSessionActive(dbSessionId, dbLastActiveAt);
    }

    private boolean isSessionActive(String activeSessionId, Instant lastActiveAt) {
        // Sin sessionId o sin timestamp de actividad → no hay sesión en curso
        if (activeSessionId == null || activeSessionId.trim().isEmpty() || lastActiveAt == null) {
            return false;
        }
        // Hay sesión sólo si hubo un heartbeat reciente dentro del margen de tolerancia
        return lastActiveAt.isAfter(Instant.now().minus(SESSION_INACTIVITY_TIMEOUT));
    }

    private void requireSessionUpdated(int updatedAccounts) {
        if (updatedAccounts != 1) {
            throw new IllegalStateException("No se pudo activar la sesión. Intenta iniciar sesión nuevamente.");
        }
    }
}
