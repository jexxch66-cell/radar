package com.radar.api.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

// Nunca se devuelve la entidad User directamente: solo los datos que el frontend necesita
@Getter
@Builder
@AllArgsConstructor
public class AuthResponse {

    private String token;
    private final String tipo = "Bearer";
    private Long id;
    private String nombre;
    private String email;
    private String role;
}
