package com.radar.api.service;

import com.radar.api.dto.request.LoginRequest;
import com.radar.api.dto.request.RegisterRequest;
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

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
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
        when(userDetailsService.loadUserByUsername(request.getEmail())).thenReturn(details);
        when(jwtService.generateToken(details)).thenReturn("token");

        var response = service.register(request);

        assertEquals("token", response.getToken());
        assertEquals(7L, response.getId());
        assertEquals(Role.USER.name(), response.getRole());
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
        when(administradorRepository.findByEmail(request.getEmail())).thenReturn(Optional.of(admin));
        when(userDetailsService.loadUserByUsername(request.getEmail())).thenReturn(details);
        when(jwtService.generateToken(details)).thenReturn("admin-token");

        var response = service.login(request);

        assertEquals("admin-token", response.getToken());
        assertEquals(3L, response.getId());
        assertEquals(Role.ADMIN.name(), response.getRole());
        verifyNoInteractions(userRepository);
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