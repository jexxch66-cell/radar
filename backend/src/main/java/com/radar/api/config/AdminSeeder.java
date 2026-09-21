package com.radar.api.config;

import com.radar.api.model.Administrador;
import com.radar.api.repository.AdministradorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

// Crea el administrador por defecto en el primer arranque si la tabla administradores esta vacia
@Component
@RequiredArgsConstructor
@Slf4j
public class AdminSeeder implements CommandLineRunner {

    private final AdministradorRepository administradorRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.default-email}")
    private String defaultEmail;

    @Value("${app.admin.default-password}")
    private String defaultPassword;

    @Override
    public void run(String... args) {
        if (administradorRepository.count() > 0) {
            return;
        }

        Administrador admin = Administrador.builder()
                .nombre("Administrador")
                .email(defaultEmail)
                .password(passwordEncoder.encode(defaultPassword))
                .build();
        administradorRepository.save(admin);

        log.info("Administrador creado -> email: {} / password: {}", defaultEmail, defaultPassword);
    }
}
