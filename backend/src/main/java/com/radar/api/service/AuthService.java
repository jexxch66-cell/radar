package com.radar.api.service;

import com.radar.api.dto.request.LoginRequest;
import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.dto.response.AuthResponse;
import com.radar.api.exception.EmailAlreadyExistsException;
import com.radar.api.exception.InvalidCredentialsException;
import com.radar.api.model.Administrador;
import com.radar.api.model.Role;
import com.radar.api.model.User;
import com.radar.api.repository.AdministradorRepository;
import com.radar.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final AdministradorRepository administradorRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;
    private final UserDetailsServiceImpl userDetailsService;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new EmailAlreadyExistsException(request.getEmail());
        }

        User user = User.builder()
                .nombre(request.getNombre())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(Role.USER)
                .build();
        userRepository.save(user);

        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String token = jwtService.generateToken(userDetails);

        return AuthResponse.builder()
                .token(token)
                .id(user.getId())
                .nombre(user.getNombre())
                .email(user.getEmail())
                .role(Role.USER.name())
                .build();
    }

    public AuthResponse login(LoginRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );
        } catch (BadCredentialsException ex) {
            throw new InvalidCredentialsException();
        }

        var adminMatch = administradorRepository.findByEmail(request.getEmail());
        if (adminMatch.isPresent()) {
            Administrador admin = adminMatch.get();
            String token = jwtService.generateToken(userDetailsService.loadUserByUsername(admin.getEmail()));
            return AuthResponse.builder()
                    .token(token)
                    .id(admin.getId())
                    .nombre(admin.getNombre())
                    .email(admin.getEmail())
                    .role(Role.ADMIN.name())
                    .build();
        }

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(InvalidCredentialsException::new);

        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String token = jwtService.generateToken(userDetails);

        return AuthResponse.builder()
                .token(token)
                .id(user.getId())
                .nombre(user.getNombre())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build();
    }
}
