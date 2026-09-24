package com.radar.api.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class RecaptchaService {

    private final boolean enabled;
    private final String secretKey;
    private final RestClient restClient = RestClient.create("https://www.google.com");

    public RecaptchaService(
            @Value("${recaptcha.enabled:false}") boolean enabled,
            @Value("${recaptcha.secret-key:}") String secretKey) {
        this.enabled = enabled;
        this.secretKey = secretKey;
    }

    public void verify(String token) {
        if (!enabled) {
            return;
        }
        if (token == null || token.isBlank() || secretKey.isBlank()) {
            throw new IllegalArgumentException("Verificación CAPTCHA requerida");
        }

        CaptchaResponse response = restClient.post()
                .uri(uriBuilder -> uriBuilder.path("/recaptcha/api/siteverify")
                        .queryParam("secret", secretKey)
                        .queryParam("response", token)
                        .build())
                .retrieve()
                .body(CaptchaResponse.class);
        if (response == null || !response.success()) {
            throw new IllegalArgumentException("Verificación CAPTCHA inválida");
        }
    }

    private record CaptchaResponse(boolean success) {}
}