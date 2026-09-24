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
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));

        var details = service.loadUserByUsername(user.getEmail());

        assertEquals(user.getEmail(), details.getUsername());
        assertEquals("hash", details.getPassword());
        assertTrue(details.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_USER")));
        verifyNoInteractions(administradorRepository);
    }

    @Test
    void fallsBackToAdministrator() {
        Administrador admin = Administrador.builder().email("admin@example.com").password("hash").build();
        when(userRepository.findByEmail(admin.getEmail())).thenReturn(Optional.empty());
        when(administradorRepository.findByEmail(admin.getEmail())).thenReturn(Optional.of(admin));

        var details = service.loadUserByUsername(admin.getEmail());

        assertEquals("ROLE_ADMIN", details.getAuthorities().iterator().next().getAuthority());
    }

    @Test
    void throwsWhenEmailDoesNotExist() {
        when(userRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());
        when(administradorRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());

        assertThrows(UsernameNotFoundException.class,
                () -> service.loadUserByUsername("missing@example.com"));
    }
}