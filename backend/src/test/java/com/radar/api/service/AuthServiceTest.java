package com.radar.api.service;

import com.radar.api.dto.request.LoginRequest;
import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.exception.ConcurrentSessionException;
import com.radar.api.exception.EmailAlreadyExistsException;
import com.radar.api.exception.InvalidCredentialsException;
import com.radar.api.model.Administrador;
import com.radar.api.model.Role;
import com.radar.api.model.User;
import com.radar.api.repository.AdministradorRepository;
import com.radar.api.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock UserRepository userRepository;
    @Mock AdministradorRepository administradorRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtService jwtService;
    @Mock AuthenticationManager authenticationManager;
    @Mock UserDetailsServiceImpl userDetailsService;
    @Mock GoogleTokenService googleTokenService;
    @Mock RecaptchaService recaptchaService;
    @InjectMocks AuthService service;

    @Test
    void registersUserAndReturnsToken() {
        RegisterRequest request = registerRequest();
        User savedUser = User.builder().id(7L).nombre("User").email(request.getEmail()).role(Role.USER).build();
        UserDetails details = org.springframework.security.core.userdetails.User.withUsername(request.getEmail())
                .password("encoded").roles("USER").build();
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode("password")).thenReturn("encoded");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(savedUser.getId());
            return user;
        });
        when(jwtService.newSessionId()).thenReturn("register-session");
        when(userDetailsService.loadUserByUsername(request.getEmail())).thenReturn(details);
        when(jwtService.generateToken(details, "register-session")).thenReturn("token");

        var response = service.register(request);

        assertEquals("token", response.getToken());
        assertEquals(7L, response.getId());
        assertEquals(Role.USER.name(), response.getRole());
        verify(userRepository).save(argThat(user -> "register-session".equals(user.getActiveSessionId())));
        verify(userRepository).save(any(User.class));
    }

    @Test
    void rejectsDuplicateRegistration() {
        RegisterRequest request = registerRequest();
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);

        assertThrows(EmailAlreadyExistsException.class, () -> service.register(request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void rejectsBadCredentials() {
        LoginRequest request = loginRequest();
        doThrow(new BadCredentialsException("bad")).when(authenticationManager).authenticate(any());

        assertThrows(InvalidCredentialsException.class, () -> service.login(request));
        verifyNoInteractions(administradorRepository, jwtService);
    }

    @Test
    void logsInAdministrator() {
        LoginRequest request = loginRequest();
        Administrador admin = Administrador.builder().id(3L).nombre("Admin").email(request.getEmail()).build();
        UserDetails details = org.springframework.security.core.userdetails.User.withUsername(request.getEmail())
                .password("encoded").roles("ADMIN").build();
        when(jwtService.newSessionId()).thenReturn("admin-session");
        when(administradorRepository.updateActiveSessionId(eq(request.getEmail()), eq("admin-session"), any(Instant.class))).thenReturn(1);
        when(administradorRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(admin));
        when(userDetailsService.loadUserByUsername(request.getEmail())).thenReturn(details);
        when(jwtService.generateToken(details, "admin-session")).thenReturn("admin-token");

        var response = service.login(request);

        assertEquals("admin-token", response.getToken());
        assertEquals(3L, response.getId());
        assertEquals(Role.ADMIN.name(), response.getRole());
        verify(administradorRepository).updateActiveSessionId(eq(request.getEmail()), eq("admin-session"), any(Instant.class));
        verifyNoInteractions(userRepository);
    }

    @Test
    void logsInUserWhenNoActiveSession() {
        LoginRequest request = loginRequest();
        User user = User.builder()
                .id(7L)
                .nombre("User")
                .email(request.getEmail())
                .role(Role.USER)
                .build();
        UserDetails details = org.springframework.security.core.userdetails.User.withUsername(request.getEmail())
                .password("encoded").roles("USER").build();
        when(authenticationManager.authenticate(any())).thenReturn(null);
        when(administradorRepository.findByEmail(request.getEmail())).thenReturn(Optional.empty());
        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(jwtService.newSessionId()).thenReturn("new-user-session");
        when(userRepository.updateActiveSessionId(eq(request.getEmail()), eq("new-user-session"), any(Instant.class))).thenReturn(1);
        when(userDetailsService.loadUserByUsername(request.getEmail())).thenReturn(details);
        when(jwtService.generateToken(details, "new-user-session")).thenReturn("user-token");

        var response = service.login(request);

        assertEquals("user-token", response.getToken());
        assertEquals(Role.USER.name(), response.getRole());
        verify(userRepository).updateActiveSessionId(eq(request.getEmail()), eq("new-user-session"), any(Instant.class));
    }

    @Test
    void rejectsLoginWhenSessionIsAlreadyActive() {
        LoginRequest request = loginRequest();
        User user = User.builder()
                .id(7L)
                .nombre("User")
                .email(request.getEmail())
                .role(Role.USER)
                .activeSessionId("existing-session")
                .lastActiveAt(Instant.now())
                .build();
        when(authenticationManager.authenticate(any())).thenReturn(null);
        when(administradorRepository.findByEmail(request.getEmail())).thenReturn(Optional.empty());
        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));

        assertThrows(ConcurrentSessionException.class, () -> service.login(request));
        verify(userRepository, never()).updateActiveSessionId(any(), any(), any());
    }

    @Test
    void allowsLoginWhenForceIsTrueEvenIfSessionIsActive() {
        LoginRequest request = loginRequest();
        request.setForce(true);
        User user = User.builder()
                .id(7L)
                .nombre("User")
                .email(request.getEmail())
                .role(Role.USER)
                .activeSessionId("existing-session")
                .lastActiveAt(Instant.now())
                .build();
        UserDetails details = org.springframework.security.core.userdetails.User.withUsername(request.getEmail())
                .password("encoded").roles("USER").build();
        when(authenticationManager.authenticate(any())).thenReturn(null);
        when(administradorRepository.findByEmail(request.getEmail())).thenReturn(Optional.empty());
        when(userRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(user));
        when(jwtService.newSessionId()).thenReturn("forced-session");
        when(userRepository.updateActiveSessionId(eq(request.getEmail()), eq("forced-session"), any(Instant.class))).thenReturn(1);
        when(userDetailsService.loadUserByUsername(request.getEmail())).thenReturn(details);
        when(jwtService.generateToken(details, "forced-session")).thenReturn("forced-token");

        var response = service.login(request);

        assertEquals("forced-token", response.getToken());
        verify(userRepository).updateActiveSessionId(eq(request.getEmail()), eq("forced-session"), any(Instant.class));
    }

    private RegisterRequest registerRequest() {
        RegisterRequest request = new RegisterRequest();
        request.setNombre("User");
        request.setEmail("user@example.com");
        request.setPassword("password");
        return request;
    }

    private LoginRequest loginRequest() {
        LoginRequest request = new LoginRequest();
        request.setEmail("user@example.com");
        request.setPassword("password");
        return request;
    }
}