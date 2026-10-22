import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Agrega el JWT como Authorization: Bearer <token> a toda petición saliente, si hay sesión activa
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (!token) {
    return next(req);
  }

  const isLocalFallbackToken = token.endsWith('.local-signature');

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authReq).pipe(
    catchError((error: unknown) => {
      // Solo cerramos sesión por 401 si el token fue emitido por el backend y no es un endpoint de login/auditoría
      if (
        !isLocalFallbackToken &&
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 401 &&
        !req.url.endsWith('/auth/login') &&
        !req.url.endsWith('/auth/register') &&
        !req.url.endsWith('/auth/google') &&
        !req.url.includes('/admin/auditoria')
      ) {
        authService.logout(false);
        void router.navigate(['/login'], { queryParams: { sessionExpired: 'true' } });
      }
      return throwError(() => error);
    }),
  );
};
