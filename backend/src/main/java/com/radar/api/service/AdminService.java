package com.radar.api.service;

import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.dto.response.AdministradorResponse;
import com.radar.api.exception.EmailAlreadyExistsException;
import com.radar.api.model.Administrador;
import com.radar.api.repository.AdministradorRepository;
import com.radar.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final AdministradorRepository administradorRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AdministradorResponse registrar(RegisterRequest request) {
        if (administradorRepository.existsByEmail(request.getEmail()) || userRepository.existsByEmail(request.getEmail())) {
            throw new EmailAlreadyExistsException(request.getEmail());
        }

        Administrador administrador = Administrador.builder()
                .nombre(request.getNombre())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .build();
        administradorRepository.save(administrador);

        return AdministradorResponse.builder()
                .id(administrador.getId())
                .nombre(administrador.getNombre())
                .email(administrador.getEmail())
                .createdAt(administrador.getCreatedAt())
                .build();
    }
}
