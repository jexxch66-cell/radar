package com.radar.api.service;

import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.exception.EmailAlreadyExistsException;
import com.radar.api.model.Administrador;
import com.radar.api.repository.AdministradorRepository;
import com.radar.api.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminServiceTest {

    @Mock AdministradorRepository administradorRepository;
    @Mock UserRepository userRepository;
    @Mock PasswordEncoder passwordEncoder;
    @InjectMocks AdminService service;

    @Test
    void registersAdministratorWithEncodedPassword() {
        RegisterRequest request = request("admin@example.com");
        when(administradorRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(passwordEncoder.encode("password")).thenReturn("encoded");

        var response = service.registrar(request);

        assertEquals("admin@example.com", response.getEmail());
        verify(administradorRepository).save(argThat(admin ->
                "admin@example.com".equals(admin.getEmail()) && "encoded".equals(admin.getPassword())));
    }

    @Test
    void rejectsEmailUsedByAUser() {
        RegisterRequest request = request("existing@example.com");
        when(administradorRepository.existsByEmail(request.getEmail())).thenReturn(false);
        when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);

        assertThrows(EmailAlreadyExistsException.class, () -> service.registrar(request));
        verify(administradorRepository, never()).save(any(Administrador.class));
    }

    private RegisterRequest request(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setNombre("Admin");
        request.setEmail(email);
        request.setPassword("password");
        return request;
    }
}