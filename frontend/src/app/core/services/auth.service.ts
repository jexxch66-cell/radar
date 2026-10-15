import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, GoogleAuthRequest, LoginRequest, RegisterRequest } from '../models/auth.models';

const TOKEN_KEY = 'radar_token';
const USER_KEY = 'radar_user';
const AUTH_CHANNEL_NAME = 'radar_auth_channel';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly router = inject(Router);
  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(AUTH_CHANNEL_NAME) : null;

  // Estado reactivo del usuario actual, leído de localStorage al arrancar la app
  readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  constructor(private readonly http: HttpClient) {
    this.initCrossTabSync();
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request);
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/login`, request)
      .pipe(tap((response) => this.storeSession(response)));
  }

  loginWithGoogle(request: GoogleAuthRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/google`, request)
      .pipe(tap((response) => this.storeSession(response)));
  }

  heartbeat(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/heartbeat`, {});
  }

  logout(notifyBackend = true): void {
    const token = this.getToken();
    if (notifyBackend && token) {
      this.http.post(`${this.apiUrl}/logout`, {}).subscribe({
        next: () => {},
        error: () => {},
      });
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.channel?.postMessage({ type: 'LOGOUT' });
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }
    const expiration = this.getTokenExpiration(token);
    return expiration === null || expiration > Date.now();
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'ADMIN';
  }

  private storeSession(response: AuthResponse): void {
    const user: AuthUser = {
      id: response.id,
      nombre: response.nombre,
      email: response.email,
      role: response.role,
    };
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.channel?.postMessage({ type: 'LOGIN', role: response.role });
  }

  private initCrossTabSync(): void {
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data?.type === 'LOGIN') {
          const user = this.readStoredUser();
          this.currentUser.set(user);
          if (window.location.pathname.includes('/login') || window.location.pathname.includes('/registro')) {
            void this.router.navigateByUrl(this.isAdmin() ? '/admin' : '/mapa');
          }
        } else if (event.data?.type === 'LOGOUT') {
          this.currentUser.set(null);
          if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/bienvenida')) {
            void this.router.navigate(['/login'], { queryParams: { sessionExpired: 'true' } });
          }
        }
      };
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === TOKEN_KEY) {
          if (!event.newValue) {
            this.currentUser.set(null);
            if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/bienvenida')) {
              void this.router.navigate(['/login'], { queryParams: { sessionExpired: 'true' } });
            }
          } else {
            const user = this.readStoredUser();
            this.currentUser.set(user);
            if (window.location.pathname.includes('/login') || window.location.pathname.includes('/registro')) {
              void this.router.navigateByUrl(this.isAdmin() ? '/admin' : '/mapa');
            }
          }
        }
      });
    }
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  // Decodifica el payload del JWT (sin verificar firma, solo para leer la expiración en el cliente)
  private getTokenExpiration(token: string): number | null {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    } catch {
      return null;
    }
  }
}
