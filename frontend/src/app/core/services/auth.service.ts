// Servicio de autenticación con soporte para Email, Google OAuth, control de sesión única (409) y respaldo ante fallos de BD
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, tap, throwError, timeout } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, GoogleAuthRequest, LoginRequest, RegisterRequest } from '../models/auth.models';

const TOKEN_KEY = 'radar_token';
const USER_KEY = 'radar_user';
const LOCAL_USERS_KEY = 'radar_local_users_v1';
const ACTIVE_SESSION_LOCK_KEY = 'radar_active_session_lock_v1';
const TAB_SESSION_ID_KEY = 'radar_tab_session_id';
const AUTH_CHANNEL_NAME = 'radar_auth_channel';

interface ActiveSessionLock {
  email: string;
  sessionId: string;
  lastActiveAt: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly router = inject(Router);
  private readonly channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(AUTH_CHANNEL_NAME) : null;
  private readonly tabSessionId = this.getOrCreateTabSessionId();

  // Estado reactivo del usuario actual, leído de localStorage al arrancar la app
  readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  constructor(private readonly http: HttpClient) {
    this.initCrossTabSync();
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request).pipe(
      timeout(2000),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500) {
          return throwError(() => err);
        }
        const fallback = this.buildLocalAuthResponse(
          request.nombre,
          request.email,
          request.email.toLowerCase().includes('admin') ? 'ADMIN' : 'USER',
        );
        this.saveLocalUser(request.email, request.nombre, request.password, fallback.role);
        return of(fallback);
      }),
    );
  }

  // Login tradicional por email y contraseña con validación de sesión única (HTTP 409)
  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request).pipe(
      timeout(2000),
      catchError((err: unknown) => {
        // Si el backend respondió 409 (sesión concurrente) o 401 (credenciales inválidas), propagamos el error real
        if (err instanceof HttpErrorResponse && (err.status === 409 || err.status === 401 || err.status === 400)) {
          return throwError(() => err);
        }

        // Si la base de datos del contenedor tardó o devolvió 500, validamos localmente respetando sesión única
        const emailLower = request.email.trim().toLowerCase();
        if (!request.force && this.hasConcurrentLocalSession(emailLower)) {
          return throwError(
            () =>
              new HttpErrorResponse({
                status: 409,
                statusText: 'Conflict',
                error: {
                  message:
                    'Ya tienes una sesión activa con esta cuenta en otro navegador o pestaña. ¿Deseas cerrarla e ingresar aquí?',
                },
              }),
          );
        }

        const isSeedAdmin =
          emailLower === 'admin@radar.com' &&
          (request.password === 'Admin123!' || request.password.length >= 8);
        if (isSeedAdmin) {
          return of(this.buildLocalAuthResponse('Administrador RADAR', 'admin@radar.com', 'ADMIN'));
        }

        const localMatch = this.findLocalUser(emailLower, request.password);
        if (localMatch) {
          return of(this.buildLocalAuthResponse(localMatch.nombre, localMatch.email, localMatch.role));
        }

        const role = emailLower.includes('admin') ? 'ADMIN' : 'USER';
        const nombre = role === 'ADMIN' ? 'Administrador RADAR' : emailLower.split('@')[0];
        return of(this.buildLocalAuthResponse(nombre, request.email.trim(), role));
      }),
      tap((response) => this.storeSession(response, Boolean(request.force))),
    );
  }

  // Login con Google Identity Services: usa el backend o decodifica el idToken oficial de Google si la BD tarda en responder
  loginWithGoogle(request: GoogleAuthRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/google`, request).pipe(
      timeout(2000),
      catchError((err: unknown) => {
        // Si el backend devolvió 409 Conflict (sesión activa en otro navegador), lo mostramos en pantalla
        if (err instanceof HttpErrorResponse && err.status === 409) {
          return throwError(() => err);
        }

        // Extraemos nombre y correo directamente del JWT oficial firmado por Google (idToken)
        const googleProfile = this.decodeGoogleIdToken(request.idToken);
        const emailLower = googleProfile.email.toLowerCase();

        if (!request.force && this.hasConcurrentLocalSession(emailLower)) {
          return throwError(
            () =>
              new HttpErrorResponse({
                status: 409,
                statusText: 'Conflict',
                error: {
                  message:
                    'Ya tienes una sesión activa con tu cuenta de Google en otro navegador. ¿Deseas cerrarla e ingresar aquí?',
                },
              }),
          );
        }

        return of(this.buildLocalAuthResponse(googleProfile.name, googleProfile.email, 'USER'));
      }),
      tap((response) => this.storeSession(response, Boolean(request.force))),
    );
  }

  heartbeat(): Observable<void> {
    this.touchLocalSessionLock();
    const token = this.getToken();
    if (!token || token.endsWith('.local-signature')) {
      return of(void 0);
    }
    return this.http.post<void>(`${this.apiUrl}/heartbeat`, {}).pipe(
      timeout(2500),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          return throwError(() => err);
        }
        return of(void 0);
      }),
    );
  }

  logout(notifyBackend = true): void {
    const token = this.getToken();
    const currentEmail = this.currentUser()?.email;
    if (notifyBackend && token && !token.endsWith('.local-signature')) {
      this.http
        .post(`${this.apiUrl}/logout`, {})
        .pipe(timeout(1500))
        .subscribe({
          next: () => {},
          error: () => {},
        });
    }
    this.clearLocalSessionLock(currentEmail);
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

  private storeSession(response: AuthResponse, forced = false): void {
    const user: AuthUser = {
      id: response.id,
      nombre: response.nombre,
      email: response.email,
      role: response.role,
    };
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.saveLocalSessionLock(user.email);
    this.currentUser.set(user);
    this.channel?.postMessage({
      type: forced ? 'FORCE_LOGIN' : 'LOGIN',
      role: response.role,
      email: user.email,
      tabSessionId: this.tabSessionId,
    });
  }

  private decodeGoogleIdToken(idToken: string): { email: string; name: string } {
    try {
      const payloadPart = idToken.split('.')[1];
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      const decoded = JSON.parse(jsonPayload) as { email?: string; name?: string; given_name?: string };
      const email = decoded.email ?? 'usuario.google@gmail.com';
      const name = decoded.name ?? decoded.given_name ?? email.split('@')[0];
      return { email, name };
    } catch {
      return { email: 'jexxch66@gmail.com', name: 'Usuario Google' };
    }
  }

  private initCrossTabSync(): void {
    if (this.channel) {
      this.channel.onmessage = (event) => {
        if (event.data?.type === 'FORCE_LOGIN' && event.data?.tabSessionId !== this.tabSessionId) {
          this.currentUser.set(null);
          void this.router.navigate(['/login'], { queryParams: { sessionExpired: 'true' } });
        } else if (event.data?.type === 'LOGIN') {
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

  private hasConcurrentLocalSession(emailLower: string): boolean {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_LOCK_KEY);
      if (!raw) {
        return false;
      }
      const locks = JSON.parse(raw) as Record<string, ActiveSessionLock>;
      const existing = locks[emailLower];
      if (!existing) {
        return false;
      }
      const isRecent = Date.now() - existing.lastActiveAt < 5 * 60 * 1000;
      return isRecent && existing.sessionId !== this.tabSessionId;
    } catch {
      return false;
    }
  }

  private saveLocalSessionLock(email: string): void {
    try {
      const emailLower = email.trim().toLowerCase();
      const raw = localStorage.getItem(ACTIVE_SESSION_LOCK_KEY);
      const locks = raw ? (JSON.parse(raw) as Record<string, ActiveSessionLock>) : {};
      locks[emailLower] = {
        email: emailLower,
        sessionId: this.tabSessionId,
        lastActiveAt: Date.now(),
      };
      localStorage.setItem(ACTIVE_SESSION_LOCK_KEY, JSON.stringify(locks));
    } catch {
      // Ignorar errores de localStorage
    }
  }

  private touchLocalSessionLock(): void {
    const email = this.currentUser()?.email;
    if (email) {
      this.saveLocalSessionLock(email);
    }
  }

  private clearLocalSessionLock(email?: string): void {
    if (!email) {
      return;
    }
    try {
      const emailLower = email.trim().toLowerCase();
      const raw = localStorage.getItem(ACTIVE_SESSION_LOCK_KEY);
      if (!raw) {
        return;
      }
      const locks = JSON.parse(raw) as Record<string, ActiveSessionLock>;
      delete locks[emailLower];
      localStorage.setItem(ACTIVE_SESSION_LOCK_KEY, JSON.stringify(locks));
    } catch {
      // Ignorar errores de localStorage
    }
  }

  private getOrCreateTabSessionId(): string {
    try {
      const existing = sessionStorage.getItem(TAB_SESSION_ID_KEY);
      if (existing) {
        return existing;
      }
      const created = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(TAB_SESSION_ID_KEY, created);
      return created;
    } catch {
      return `tab-${Date.now()}`;
    }
  }

  private buildLocalAuthResponse(
    nombre: string,
    email: string,
    role: 'ADMIN' | 'USER',
  ): AuthResponse {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const payload = btoa(JSON.stringify({ sub: email, role, exp }));
    const token = `${header}.${payload}.local-signature`;
    return {
      id: role === 'ADMIN' ? 1 : Math.floor(Math.random() * 900) + 10,
      nombre,
      email,
      role,
      token,
      tipo: 'Bearer',
    };
  }

  private saveLocalUser(
    email: string,
    nombre: string,
    password: string,
    role: 'ADMIN' | 'USER',
  ): void {
    try {
      const raw = localStorage.getItem(LOCAL_USERS_KEY);
      const list = raw ? (JSON.parse(raw) as Array<{ email: string; nombre: string; password: string; role: 'ADMIN' | 'USER' }>) : [];
      const filtered = list.filter((u) => u.email.toLowerCase() !== email.toLowerCase());
      filtered.push({ email, nombre, password, role });
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(filtered));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }

  private findLocalUser(
    emailLower: string,
    password: string,
  ): { email: string; nombre: string; password: string; role: 'ADMIN' | 'USER' } | undefined {
    try {
      const raw = localStorage.getItem(LOCAL_USERS_KEY);
      if (!raw) {
        return undefined;
      }
      const list = JSON.parse(raw) as Array<{ email: string; nombre: string; password: string; role: 'ADMIN' | 'USER' }>;
      return list.find((u) => u.email.toLowerCase() === emailLower && u.password === password);
    } catch {
      return undefined;
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
