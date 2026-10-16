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
import java.util.UUID;

// Servicio de negocio para registro, login tradicional/Google, control de sesión única (concurrencia) y heartbeat
// @Slf4j habilita el logger automático (log.info, log.warn) que escribe en la carpeta logs/radar-api.log
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    // Si el usuario está activo (heartbeat cada 25 s), 5 min da margen más que suficiente.
    // Una vez que el timeout expira, la sesión se considera libre y se puede iniciar otra.
    public static final Duration SESSION_INACTIVITY_TIMEOUT = Duration.ofMinutes(5);

    // Repositorios JPA y servicios auxiliares inyectados por constructor gracias a @RequiredArgsConstructor
    private final UserRepository userRepository;
    private final AdministradorRepository administradorRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsServiceImpl userDetailsService;
    private final GoogleTokenService googleTokenService;
    private final RecaptchaService recaptchaService;

    // Registra un nuevo ciudadano verificando reCAPTCHA, unicidad de email y cifrando la contraseña con BCrypt
    public AuthResponse register(RegisterRequest request) {
        recaptchaService.verify(request.getCaptchaToken());
        if (userRepository.existsByEmail(request.getEmail())) {
            log.warn("Intento de registro con email ya existente: {}", request.getEmail());
            throw new EmailAlreadyExistsException(request.getEmail());
        }

        String sessionId = jwtService.newSessionId();
        Instant now = Instant.now();
        User user = User.builder()
                .nombre(request.getNombre())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .privacyConsentAt(now)
                .role(Role.USER)
                .activeSessionId(sessionId)
                .lastActiveAt(now)
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

    // Autentica usuario o administrador, verifica si ya hay una sesión activa y emite un JWT con sessionId único
    public AuthResponse login(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );
        } catch (BadCredentialsException ex) {
            log.warn("Intento de login fallido (credenciales inválidas) para email={}", request.getEmail());
            throw new InvalidCredentialsException();
        }

        String rawEmail = request.getEmail() != null ? request.getEmail().trim() : "";
        // Primero verifica si el correo corresponde a un Administrador
        var adminMatch = administradorRepository.findByEmail(rawEmail)
                .or(() -> administradorRepository.findByEmail(rawEmail.toLowerCase()));
        if (adminMatch.isPresent()) {
            Administrador admin = adminMatch.get();
            // Si no se envió force=true y existe una sesión con heartbeat reciente, bloquea por sesión concurrente (HTTP 409)
            if (!request.isForce() && isSessionActive(admin.getActiveSessionId(), admin.getLastActiveAt())) {
                log.warn("Sesión concurrente detectada para administrador: email={}", admin.getEmail());
                throw new ConcurrentSessionException();
            }

            String sessionId = jwtService.newSessionId();
            Instant now = Instant.now();
            requireSessionUpdated(administradorRepository.updateActiveSessionId(admin.getEmail(), sessionId, now));
            log.info("Inicio de sesión exitoso (ADMIN): email={}, force={}", admin.getEmail(), request.isForce());
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
                .or(() -> userRepository.findByEmail(rawEmail.toLowerCase()))
                .orElseThrow(InvalidCredentialsException::new);

        if (!request.isForce() && isSessionActive(user.getActiveSessionId(), user.getLastActiveAt())) {
            log.warn("Sesión concurrente detectada para usuario: email={}", user.getEmail());
            throw new ConcurrentSessionException();
        }

        String sessionId = jwtService.newSessionId();
        Instant now = Instant.now();
        requireSessionUpdated(userRepository.updateActiveSessionId(user.getEmail(), sessionId, now));
        log.info("Inicio de sesión exitoso (USER): email={}, force={}", user.getEmail(), request.isForce());
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

    public AuthResponse loginWithGoogle(String idToken, boolean acceptDataTreatment, String captchaToken) {
        return loginWithGoogle(idToken, acceptDataTreatment, captchaToken, false);
    }

    // Valida el idToken con Google, crea la cuenta si es la primera vez y aplica el mismo control de sesión única
    public AuthResponse loginWithGoogle(String idToken, boolean acceptDataTreatment, String captchaToken, boolean force) {
        recaptchaService.verify(captchaToken);
        GoogleTokenService.GoogleProfile profile = googleTokenService.verify(idToken);

        User user = userRepository.findByEmail(profile.email()).orElseGet(() -> {
            if (!acceptDataTreatment) {
                throw new IllegalArgumentException("Debes aceptar el tratamiento de datos personales");
            }
            User created = User.builder()
                    .nombre(profile.name())
                    .email(profile.email())
                    .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .googleSubject(profile.subject())
                    .privacyConsentAt(Instant.now())
                    .role(Role.USER)
                    .build();
            log.info("Cuenta creada mediante Google OAuth: email={}", profile.email());
            return userRepository.save(created);
        });

        if (user.getId() != null && !force && isSessionActive(user.getActiveSessionId(), user.getLastActiveAt())) {
            log.warn("Sesión concurrente detectada en login Google: email={}", user.getEmail());
            throw new ConcurrentSessionException();
        }

        String sessionId = jwtService.newSessionId();
        Instant now = Instant.now();
        requireSessionUpdated(userRepository.updateActiveSessionId(user.getEmail(), sessionId, now));
        log.info("Login con Google exitoso: email={}, force={}", user.getEmail(), force);
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        return AuthResponse.builder()
                .token(jwtService.generateToken(userDetails, sessionId))
                .id(user.getId())
                .nombre(user.getNombre())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    // Actualiza la marca de tiempo lastActiveAt para confirmar que el navegador del usuario sigue abierto
    public void heartbeat(String email, String sessionId) {
        Instant now = Instant.now();
        userRepository.updateLastActiveAt(email, sessionId, now);
        administradorRepository.updateLastActiveAt(email, sessionId, now);
    }

    // Limpia el activeSessionId en base de datos cuando el usuario cierra sesión explícitamente
    public void logout(String email) {
        userRepository.clearActiveSession(email);
        administradorRepository.clearActiveSession(email);
        log.info("Sesión cerrada correctamente para email={}", email);
    }

    private boolean isSessionActive(String activeSessionId, Instant lastActiveAt) {
        // Sin sessionId o sin timestamp de actividad → no hay sesión en curso
        if (activeSessionId == null || activeSessionId.trim().isEmpty() || lastActiveAt == null) {
            return false;
        }
        // Hay sesión sólo si hubo un heartbeat reciente dentro del margen de tolerancia (5 minutos)
        return lastActiveAt.isAfter(Instant.now().minus(SESSION_INACTIVITY_TIMEOUT));
    }

    private void requireSessionUpdated(int updatedAccounts) {
        if (updatedAccounts != 1) {
            throw new IllegalStateException("No se pudo activar la sesión. Intenta iniciar sesión nuevamente.");
        }
    }
}
