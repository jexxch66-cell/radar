import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Si el usuario ya tiene sesión iniciada, no le permite acceder a login o registro y lo redirige
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    void router.navigateByUrl(authService.isAdmin() ? '/admin' : '/mapa');
    return false;
  }

  return true;
};

