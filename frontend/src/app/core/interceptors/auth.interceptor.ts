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

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 401 &&
        !req.url.includes('/auth/')
      ) {
        authService.logout();
        void router.navigate(['/login'], { queryParams: { sessionExpired: 'true' } });
      }
      return throwError(() => error);
    }),
  );
};
