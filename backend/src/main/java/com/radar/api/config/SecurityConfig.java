package com.radar.api.config;

import com.radar.api.service.UserDetailsServiceImpl;
import com.radar.api.dto.response.ErrorResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

// Configuración central de Spring Security: define qué rutas son públicas, cuáles requieren JWT, CORS y cifrado BCrypt
@Configuration
@EnableWebSecurity
// @EnableMethodSecurity permite usar @PreAuthorize("hasRole('ADMIN')") en controladores como ReportController y BackupController
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    // Servicio que carga usuarios y administradores desde PostgreSQL
    private final UserDetailsServiceImpl userDetailsService;
    // Filtro personalizado que intercepta cada petición HTTP para validar el token JWT
    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    // Serializador JSON para devolver respuestas de error estructuradas (401 No autenticado)
    private final ObjectMapper objectMapper;

    // Origen permitido para peticiones desde el frontend Angular (leído desde application.yml)
    @Value("${app.cors.allowed-origin}")
    private String allowedOrigin;

    // Define la cadena de filtros de seguridad (SecurityFilterChain) que protege toda la API
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // Desactiva CSRF porque usamos autenticación sin estado (Stateless) basada en tokens JWT en cabeceras
                .csrf(csrf -> csrf.disable())
                // Habilita CORS para permitir que el frontend en localhost:4200 o Vercel consuma la API
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                // Política STATELESS: el servidor no guarda sesiones en memoria RAM; cada petición se valida por su JWT
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Reglas de autorización por ruta: login/register/health son públicas; el resto exige estar autenticado
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/**", "/api/health").permitAll()
                        .anyRequest().authenticated()
                )
                // Registra el proveedor de autenticación con base de datos y BCrypt
                .authenticationProvider(authenticationProvider())
                // Inserta nuestro filtro JWT antes del filtro estándar de usuario/contraseña
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                // Manejador personalizado para devolver un JSON claro con HTTP 401 cuando falta el token o es inválido
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(HttpStatus.UNAUTHORIZED.value());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            ErrorResponse body = ErrorResponse.builder()
                                    .status(HttpStatus.UNAUTHORIZED.value())
                                    .message("No autenticado")
                                    .build();
                            response.getWriter().write(objectMapper.writeValueAsString(body));
                        })
                );

        return http.build();
    }

    // Configura los orígenes, métodos HTTP (GET, POST, PUT, DELETE, PATCH) y cabeceras permitidas por CORS
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = Arrays.stream(allowedOrigin.split(","))
            .map(origin -> origin.trim())
                .filter(s -> !s.isEmpty())
                .toList();
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedOriginPatterns(List.of(
                "https://*.vercel.app",
                "http://localhost:[*]",
                "http://127.0.0.1:[*]"
        ));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    // Conecta Spring Security con nuestro UserDetailsServiceImpl y el codificador BCrypt
    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    // Expone el AuthenticationManager para ser usado en AuthService durante el login
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    // Algoritmo BCrypt para hashear contraseñas de forma irreversible en la base de datos
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
