package com.radar.api.service;

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
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserDetailsServiceImplTest {

    @Mock UserRepository userRepository;
    @Mock AdministradorRepository administradorRepository;
    @InjectMocks UserDetailsServiceImpl service;

    @Test
    void mapsRegularUserToUserDetails() {
        User user = User.builder().email("user@example.com").password("hash").role(Role.USER).build();
        when(administradorRepository.findByEmail(user.getEmail())).thenReturn(Optional.empty());
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));

        var details = service.loadUserByUsername(user.getEmail());

        assertEquals(user.getEmail(), details.getUsername());
        assertEquals("hash", details.getPassword());
        assertTrue(details.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_USER")));
    }

    @Test
    void resolvesAdministratorFirst() {
        Administrador admin = Administrador.builder().email("admin@example.com").password("hash").build();
        when(administradorRepository.findByEmail(admin.getEmail())).thenReturn(Optional.of(admin));

        var details = service.loadUserByUsername(admin.getEmail());

        assertEquals("ROLE_ADMIN", details.getAuthorities().iterator().next().getAuthority());
        verifyNoInteractions(userRepository);
    }

    @Test
    void administratorPrevailsOverCitizenWithSameEmail() {
        // Regresion DEF-01 (CB-UDS-01): si ya existiera un ciudadano con el correo de un administrador, prevalece el administrador
        Administrador admin = Administrador.builder().email("admin@example.com").password("admin-hash")
                .activeSessionId("admin-session").build();
        when(administradorRepository.findByEmail("admin@example.com")).thenReturn(Optional.of(admin));

        var details = service.loadUserByUsername("admin@example.com");

        assertEquals("admin-hash", details.getPassword());
        assertEquals("ROLE_ADMIN", details.getAuthorities().iterator().next().getAuthority());
        assertTrue(service.isActiveSession("admin@example.com", "admin-session"));
        verifyNoInteractions(userRepository);
    }

    @Test
    void throwsWhenEmailDoesNotExist() {
        when(userRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());
        when(administradorRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());

        assertThrows(UsernameNotFoundException.class,
                () -> service.loadUserByUsername("missing@example.com"));
    }

    @Test
    void validatesOnlyTheCurrentUserSession() {
        User user = User.builder()
                .email("user@example.com")
                .password("hash")
                .role(Role.USER)
                .activeSessionId("new-session")
                .build();
        when(administradorRepository.findByEmail(user.getEmail())).thenReturn(Optional.empty());
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));

        assertTrue(service.isActiveSession(user.getEmail(), "new-session"));
        assertFalse(service.isActiveSession(user.getEmail(), "old-session"));
        assertFalse(service.isActiveSession(user.getEmail(), null));
    }

    @Test
    void validatesTheCurrentAdministratorSession() {
        Administrador admin = Administrador.builder()
                .email("admin@example.com")
                .password("hash")
                .activeSessionId("admin-session")
                .build();
        when(administradorRepository.findByEmail(admin.getEmail())).thenReturn(Optional.of(admin));

        assertTrue(service.isActiveSession(admin.getEmail(), "admin-session"));
        assertFalse(service.isActiveSession(admin.getEmail(), "stale-session"));
    }
}