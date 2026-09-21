package com.radar.api.controller;

import com.radar.api.dto.request.RegisterRequest;
import com.radar.api.dto.response.AdministradorResponse;
import com.radar.api.service.AdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Gestion de administradores; solo un administrador ya autenticado puede crear otros
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AdminService adminService;

    @PostMapping("/administradores")
    public ResponseEntity<AdministradorResponse> registrar(@Valid @RequestBody RegisterRequest request) {
        AdministradorResponse response = adminService.registrar(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
