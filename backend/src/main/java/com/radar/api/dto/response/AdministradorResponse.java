package com.radar.api.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.time.Instant;

@Getter
@Builder
public class AdministradorResponse {

    private Long id;
    private String nombre;
    private String email;
    private Instant createdAt;
}
