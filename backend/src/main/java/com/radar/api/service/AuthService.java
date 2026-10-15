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
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    public static final Duration SESSION_INACTIVITY_TIMEOUT = Duration.ofMinutes(2);

    private final UserRepository userRepository;
    private final AdministradorRepository administradorRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsServiceImpl userDetailsService;
    private final GoogleTokenService googleTokenService;
    private final RecaptchaService recaptchaService;

    public AuthResponse register(RegisterRequest request) {
        recaptchaService.verify(request.getCaptchaToken());
        if (userRepository.existsByEmail(request.getEmail())) {
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

    public AuthResponse login(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );
        } catch (BadCredentialsException ex) {
            throw new InvalidCredentialsException();
        }

        var adminMatch = administradorRepository.findByEmail(request.getEmail());
        if (adminMatch.isPresent()) {
            Administrador admin = adminMatch.get();
            if (!request.isForce() && isSessionActive(admin.getActiveSessionId(), admin.getLastActiveAt())) {
                throw new ConcurrentSessionException();
            }

            String sessionId = jwtService.newSessionId();
            Instant now = Instant.now();
            requireSessionUpdated(administradorRepository.updateActiveSessionId(admin.getEmail(), sessionId, now));
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

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(InvalidCredentialsException::new);

        if (!request.isForce() && isSessionActive(user.getActiveSessionId(), user.getLastActiveAt())) {
            throw new ConcurrentSessionException();
        }

        String sessionId = jwtService.newSessionId();
        Instant now = Instant.now();
        requireSessionUpdated(userRepository.updateActiveSessionId(user.getEmail(), sessionId, now));
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
            return userRepository.save(created);
        });

        if (user.getId() != null && !force && isSessionActive(user.getActiveSessionId(), user.getLastActiveAt())) {
            throw new ConcurrentSessionException();
        }

        String sessionId = jwtService.newSessionId();
        Instant now = Instant.now();
        requireSessionUpdated(userRepository.updateActiveSessionId(user.getEmail(), sessionId, now));
        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        return AuthResponse.builder()
                .token(jwtService.generateToken(userDetails, sessionId))
                .id(user.getId())
                .nombre(user.getNombre())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }

    public void heartbeat(String email, String sessionId) {
        Instant now = Instant.now();
        userRepository.updateLastActiveAt(email, sessionId, now);
        administradorRepository.updateLastActiveAt(email, sessionId, now);
    }

    public void logout(String email) {
        userRepository.clearActiveSession(email);
        administradorRepository.clearActiveSession(email);
    }

    private boolean isSessionActive(String activeSessionId, Instant lastActiveAt) {
        if (activeSessionId == null || lastActiveAt == null) {
            return false;
        }
        return lastActiveAt.isAfter(Instant.now().minus(SESSION_INACTIVITY_TIMEOUT));
    }

    private void requireSessionUpdated(int updatedAccounts) {
        if (updatedAccounts != 1) {
            throw new IllegalStateException("No se pudo activar la sesión. Intenta iniciar sesión nuevamente.");
        }
    }
}
