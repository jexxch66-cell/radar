package com.radar.api.service;

import com.radar.api.model.Administrador;
import com.radar.api.model.User;
import com.radar.api.repository.AdministradorRepository;
import com.radar.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

// Puente entre nuestras entidades User/Administrador y el UserDetails que Spring Security necesita para autenticar
@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserRepository userRepository;
    private final AdministradorRepository administradorRepository;

    @Override
    // Se consulta primero la tabla de administradores, igual que AuthService.login: si en la base ya existiera un
    // ciudadano con el correo de un administrador (datos previos a la correccion de DEF-01), prevalece el administrador
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return administradorRepository.findByEmail(email)
                .map(this::toUserDetails)
                .or(() -> userRepository.findByEmail(email).map(this::toUserDetails))
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado: " + email));
    }

    public boolean isActiveSession(String email, String sessionId) {
        if (AuthService.isMemorySessionMatching(email, sessionId)) {
            return true;
        }
        return administradorRepository.findByEmail(email)
                .map(admin -> sessionId != null && sessionId.equals(admin.getActiveSessionId()))
                .orElseGet(() -> userRepository.findByEmail(email)
                        .map(user -> sessionId != null && sessionId.equals(user.getActiveSessionId()))
                        .orElse(false));
    }

    private UserDetails toUserDetails(User user) {
        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                .password(user.getPassword())
                .authorities("ROLE_" + user.getRole().name())
                .build();
    }

    private UserDetails toUserDetails(Administrador administrador) {
        return org.springframework.security.core.userdetails.User.builder()
                .username(administrador.getEmail())
                .password(administrador.getPassword())
                .authorities("ROLE_ADMIN")
                .build();
    }
}
