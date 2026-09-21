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
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return userRepository.findByEmail(email)
                .map(this::toUserDetails)
                .or(() -> administradorRepository.findByEmail(email).map(this::toUserDetails))
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado: " + email));
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
