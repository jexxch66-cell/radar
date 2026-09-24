package com.radar.api.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;

@Service
public class GoogleTokenService {

    private final String clientId;

    public GoogleTokenService(@Value("${google.client-id}") String clientId) {
        this.clientId = clientId;
    }

    public GoogleProfile verify(String idToken) {
        if (clientId == null || clientId.isBlank()) {
            throw new IllegalStateException("Google login no está configurado");
        }

        try {
            GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(List.of(clientId))
                    .setIssuers(List.of("https://accounts.google.com", "accounts.google.com"))
                    .build();
            GoogleIdToken verifiedToken = verifier.verify(idToken);
            if (verifiedToken == null) {
                throw new IllegalArgumentException("Token de Google inválido");
            }

            GoogleIdToken.Payload payload = verifiedToken.getPayload();
            return new GoogleProfile(payload.getSubject(), payload.getEmail(), payload.get("name") instanceof String name
                    ? name : payload.getEmail());
        } catch (GeneralSecurityException | IOException ex) {
            throw new IllegalArgumentException("No se pudo validar la cuenta de Google", ex);
        }
    }

    public record GoogleProfile(String subject, String email, String name) {}
}