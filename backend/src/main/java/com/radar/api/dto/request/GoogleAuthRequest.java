package com.radar.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class GoogleAuthRequest {

    @NotBlank(message = "El token de Google es obligatorio")
    private String idToken;

    private boolean acceptDataTreatment;

    private String captchaToken;
}