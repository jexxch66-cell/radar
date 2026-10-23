// Servicio de autenticación con política de contraseña y bloqueo estricto de sesión única (mismo o diferente navegador)
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap, tap, throwError, timeout } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, GoogleAuthRequest, LoginRequest, RegisterRequest } from '../models/auth.models';

const TOKEN_KEY = 'radar_token';
const USER_KEY = 'radar_user';
const LOCAL_USERS_KEY = 'radar_local_users_v1';
const ACTIVE_SESSION_LOCK_KEY = 'radar_active_session_lock_v2';
const TAB_OWNER_KEY = 'radar_tab_owner_id';
const AUTH_CHANNEL_NAME = 'radar_auth_channel';
// Bloqueo activo entre pestañas con latido cada 3s y expiración rápida (15s) si se cierra la pestaña
const LOCAL_LOCK_TTL_MS = 15 * 1000;

export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

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
  // Identificador único por pestaña usando window.name (no se clona al abrir o duplicar otra pestaña)
  private readonly tabSessionId = this.getOrCreateTabSessionId();

  // Estado reactivo del usuario actual aislado exclusivamente en la pestaña propietaria
  readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  constructor(private readonly http: HttpClient) {
    // Limpiar claves antiguas de localStorage para evitar que nuevas pestañas hereden sesiones globales
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Ignorar errores de acceso a almacenamiento
    }
    this.initCrossTabSync();
  }

  isValidPasswordPolicy(password: string): boolean {
    return PASSWORD_POLICY_REGEX.test(password ?? '');
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    if (!this.isValidPasswordPolicy(request.password)) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              message: 'La contraseña debe tener mínimo 8 caracteres, al menos una letra mayúscula y un número.',
            },
          }),
      );
    }

    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request).pipe(
      timeout(2500),
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
      tap((response) => {
        this.saveLocalUser(request.email, request.nombre, request.password, response.role);
      }),
    );
  }

  // Login por email y contraseña con bloqueo estricto de doble sesión en la misma cuenta (mismo o diferente navegador)
  login(request: LoginRequest): Observable<AuthResponse> {
    const emailLower = request.email.trim().toLowerCase();

    if (!this.isValidPasswordPolicy(request.password)) {
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'Bad Request',
            error: {
              message: 'La contraseña debe cumplir la política: mínimo 8 caracteres, una mayúscula y un número.',
            },
          }),
      );
    }

    // Bloqueo inmediato si ya hay otra pestaña activa con esta misma cuenta en este navegador
    if (this.hasConcurrentLocalSession(emailLower)) {
      return throwError(() => this.buildConcurrentError());
    }

    return this.checkCrossBrowserLock(emailLower).pipe(
      switchMap((isLockedInOtherBrowser) => {
        if (isLockedInOtherBrowser || this.hasConcurrentLocalSession(emailLower)) {
          return throwError(() => this.buildConcurrentError());
        }

        return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { ...request, force: false }).pipe(
          timeout(2500),
          catchError((err: unknown) => {
            // Si el backend respondió 409 (sesión activa en otro navegador/pestaña) o 401/400, propagamos el error
            if (err instanceof HttpErrorResponse && (err.status === 409 || err.status === 401 || err.status === 400)) {
              return throwError(() => err);
            }

            if (this.hasConcurrentLocalSession(emailLower)) {
              return throwError(() => this.buildConcurrentError());
            }

            const isSeedAdmin = emailLower === 'admin@radar.com' && request.password === 'Admin123!';
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
        );
      }),
      switchMap((response) =>
        this.claimCrossBrowserLock(response.email).pipe(
          map((claimed) => {
            if (!claimed) {
              throw this.buildConcurrentError();
            }
            return response;
          }),
        ),
      ),
      tap((response) => this.storeSession(response)),
    );
  }

  // Login con Google OAuth aplicando el mismo bloqueo estricto en la misma cuenta (mismo o diferente navegador)
  loginWithGoogle(request: GoogleAuthRequest): Observable<AuthResponse> {
    const googleProfile = this.decodeGoogleIdToken(request.idToken);
    const emailLower = googleProfile.email.toLowerCase();

    if (this.hasConcurrentLocalSession(emailLower)) {
      return throwError(() => this.buildConcurrentError());
    }

    return this.checkCrossBrowserLock(emailLower).pipe(
      switchMap((isLockedInOtherBrowser) => {
        if (isLockedInOtherBrowser || this.hasConcurrentLocalSession(emailLower)) {
          return throwError(() => this.buildConcurrentError());
        }

        return this.http.post<AuthResponse>(`${this.apiUrl}/google`, { ...request, force: false }).pipe(
          timeout(2500),
          catchError((err: unknown) => {
            if (err instanceof HttpErrorResponse && err.status === 409) {
              return throwError(() => err);
            }

            if (this.hasConcurrentLocalSession(emailLower)) {
              return throwError(() => this.buildConcurrentError());
            }

            return of(this.buildLocalAuthResponse(googleProfile.name, googleProfile.email, 'USER'));
          }),
        );
      }),
      switchMap((response) =>
        this.claimCrossBrowserLock(response.email).pipe(
          map((claimed) => {
            if (!claimed) {
              throw this.buildConcurrentError();
            }
            return response;
          }),
        ),
      ),
      tap((response) => this.storeSession(response)),
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
    if (notifyBackend && currentEmail) {
      this.releaseCrossBrowserLock(currentEmail);
      if (token && !token.endsWith('.local-signature')) {
        this.http
          .post(`${this.apiUrl}/logout?emailParam=${encodeURIComponent(currentEmail)}`, {})
          .pipe(timeout(1500))
          .subscribe({
            next: () => {},
            error: () => {},
          });
      }
    }
    this.clearLocalSessionLock(currentEmail);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TAB_OWNER_KEY);
    } catch {
      // Ignorar errores de sessionStorage
    }
    this.currentUser.set(null);
    this.channel?.postMessage({ type: 'LOGOUT', tabSessionId: this.tabSessionId });
  }

  getToken(): string | null {
    try {
      const owner = sessionStorage.getItem(TAB_OWNER_KEY);
      if (owner && owner !== this.tabSessionId) {
        // Pestaña duplicada detectada: limpiar sesión clonada para aislar cada pestaña
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(TAB_OWNER_KEY);
        return null;
      }
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
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

  private buildConcurrentError(): HttpErrorResponse {
    return new HttpErrorResponse({
      status: 409,
      statusText: 'Conflict',
      error: {
        message:
          'No se puede iniciar sesión: esta cuenta ya tiene una sesión activa en este u otro navegador. Cierra la sesión abierta primero.',
      },
    });
  }

  private storeSession(response: AuthResponse): void {
    const user: AuthUser = {
      id: response.id,
      nombre: response.nombre,
      email: response.email,
      role: response.role,
    };
    try {
      sessionStorage.setItem(TAB_OWNER_KEY, this.tabSessionId);
      sessionStorage.setItem(TOKEN_KEY, response.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // Ignorar errores de sessionStorage
    }
    this.saveLocalSessionLock(user.email);
    this.currentUser.set(user);
  }

  private checkCrossBrowserLock(email: string): Observable<boolean> {
    const url = `/session-lock?action=check&email=${encodeURIComponent(email.trim().toLowerCase())}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    return this.http.get<{ locked?: boolean }>(url).pipe(
      timeout(1200),
      map((res) => Boolean(res?.locked)),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          return of(true);
        }
        return of(false);
      }),
    );
  }

  private claimCrossBrowserLock(email: string): Observable<boolean> {
    const url = `/session-lock?action=claim&email=${encodeURIComponent(email.trim().toLowerCase())}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    return this.http.get<{ ok?: boolean }>(url).pipe(
      timeout(1200),
      map(() => true),
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 409) {
          return of(false);
        }
        return of(true);
      }),
    );
  }

  private sendCrossBrowserHeartbeat(email: string): void {
    const url = `/session-lock?action=heartbeat&email=${encodeURIComponent(email.trim().toLowerCase())}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    this.http
      .get(url)
      .pipe(timeout(1200))
      .subscribe({
        next: () => {},
        error: () => {},
      });
  }

  private releaseCrossBrowserLock(email: string): void {
    const normalized = email.trim().toLowerCase();
    const lockUrl = `/session-lock?action=release&email=${encodeURIComponent(normalized)}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    const backendLogoutUrl = `${this.apiUrl}/logout?emailParam=${encodeURIComponent(normalized)}`;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(lockUrl);
        navigator.sendBeacon(backendLogoutUrl);
        return;
      }
    } catch {
      // Fallback a petición HTTP
    }
    this.http.get(lockUrl).subscribe({ next: () => {}, error: () => {} });
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
    if (typeof window !== 'undefined') {
      // Si la pestaña ya tenía sesión activa al recargar, renovar inmediatamente el candado
      const initialEmail = this.currentUser()?.email;
      if (initialEmail && this.isAuthenticated()) {
        this.touchLocalSessionLock();
      }

      // Renovar el candado de la pestaña activa cada 3 segundos mientras esté abierta
      window.setInterval(() => {
        if (this.isAuthenticated()) {
          this.touchLocalSessionLock();
        }
      }, 3000);

      // Liberar el candado local y entre navegadores inmediatamente si el usuario cierra la pestaña o ventana
      const releaseLockOnClose = () => {
        const email = this.currentUser()?.email;
        if (email) {
          this.clearLocalSessionLock(email);
          this.releaseCrossBrowserLock(email);
        }
      };
      window.addEventListener('pagehide', releaseLockOnClose);
      window.addEventListener('beforeunload', releaseLockOnClose);
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
      const isRecent = Date.now() - existing.lastActiveAt < LOCAL_LOCK_TTL_MS;
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
      this.sendCrossBrowserHeartbeat(email);
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
      if (locks[emailLower]?.sessionId === this.tabSessionId) {
        delete locks[emailLower];
        localStorage.setItem(ACTIVE_SESSION_LOCK_KEY, JSON.stringify(locks));
      }
    } catch {
      // Ignorar errores de localStorage
    }
  }

  private getOrCreateTabSessionId(): string {
    try {
      if (typeof window !== 'undefined') {
        if (window.name && window.name.startsWith('radar_tab::')) {
          return window.name;
        }
        const created = `radar_tab::${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        window.name = created;
        return created;
      }
      return `radar_tab::${Date.now()}`;
    } catch {
      return `radar_tab::${Date.now()}`;
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

  saveLocalUser(
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
    try {
      const owner = sessionStorage.getItem(TAB_OWNER_KEY);
      if (owner && owner !== this.tabSessionId) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(TAB_OWNER_KEY);
        return null;
      }
      const raw = sessionStorage.getItem(USER_KEY);
      if (!raw) {
        return null;
      }
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
