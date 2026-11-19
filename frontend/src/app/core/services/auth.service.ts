// Servicio de autenticación con política de contraseña y bloqueo estricto de sesión única (mismo o diferente navegador)
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, switchMap, tap, throwError, timeout } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthResponse, AuthUser, GoogleAuthRequest, LoginRequest, RegisterRequest } from '../models/auth.models';

const TOKEN_KEY = 'radar_token';
const USER_KEY = 'radar_user';
// Clave usada por versiones anteriores para guardar usuarios y CONTRASENAS en texto plano (DEF-12); solo se purga
const LEGACY_LOCAL_USERS_KEY = 'radar_local_users_v1';
// Tiempo maximo de espera de las llamadas de autenticacion (el backend en Render puede tardar en "despertar")
// El backend en Render (plan gratuito) se suspende sin uso y tarda hasta ~50 s en despertar. Con un limite menor la
// pagina abandonaba el login mientras el backend lo completaba, y la sesion quedaba "activa" sin que nadie la usara.
const AUTH_TIMEOUT_MS = 60_000;
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
      // Elimina las contrasenas en texto plano que versiones anteriores dejaron en el navegador (DEF-12)
      localStorage.removeItem(LEGACY_LOCAL_USERS_KEY);
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

    // Si el servidor no responde se informa el error: nunca se simula un registro local (DEF-12)
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request).pipe(
      timeout(AUTH_TIMEOUT_MS),
      catchError((err: unknown) => throwError(() => this.toClientError(err))),
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

        // Solo el backend autentica: si no responde se informa el error y NUNCA se concede una sesion local
        // simulada (antes cualquier credencial entraba, y con rol ADMIN si el correo contenia "admin": DEF-12)
        return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { ...request, force: false }).pipe(
          timeout(AUTH_TIMEOUT_MS),
          catchError((err: unknown) => throwError(() => this.toClientError(err))),
        );
      }),
      switchMap((response) =>
        this.claimCrossBrowserLock(response.email, response.token).pipe(
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

        // El token de Google lo valida el backend; si no responde, no se crea una sesion local con datos sin verificar
        return this.http.post<AuthResponse>(`${this.apiUrl}/google`, { ...request, force: false }).pipe(
          timeout(AUTH_TIMEOUT_MS),
          catchError((err: unknown) => throwError(() => this.toClientError(err))),
        );
      }),
      switchMap((response) =>
        this.claimCrossBrowserLock(response.email, response.token).pipe(
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

  // Despierta el backend al abrir el login o el registro, para que el usuario no espere el arranque al enviar el formulario
  warmUp(): void {
    this.http.get(`${environment.apiUrl}/health`).subscribe({ next: () => {}, error: () => {} });
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
        // El backend identifica al titular por el token (cabecera Authorization), no por un correo arbitrario (DEF-10)
        this.http
          .post(`${this.apiUrl}/logout`, {})
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

  // Errores 4xx del backend se propagan tal cual; cualquier otro fallo (sin conexion, 5xx, tiempo agotado) se informa
  private toClientError(err: unknown): HttpErrorResponse {
    if (err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500) {
      return err;
    }
    return new HttpErrorResponse({
      status: 0,
      statusText: 'Server Unavailable',
      error: { message: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente en unos segundos.' },
    });
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

  private checkSingleLockEndpoint(url: string): Observable<boolean> {
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

  private checkCrossBrowserLock(email: string): Observable<boolean> {
    const query = `action=check&email=${encodeURIComponent(email.trim().toLowerCase())}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    return forkJoin([
      this.checkSingleLockEndpoint(`/session-lock?${query}`),
      this.checkSingleLockEndpoint(`${this.apiUrl}/session-lock?${query}`),
    ]).pipe(map(([devLocked, apiLocked]) => devLocked || apiLocked));
  }

  private claimSingleLockEndpoint(url: string, token?: string): Observable<boolean> {
    const options = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return this.http.get<{ ok?: boolean }>(url, options).pipe(
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

  // El backend solo permite reclamar el candado de la propia cuenta autenticada (DEF-11): se envia el token recien emitido
  private claimCrossBrowserLock(email: string, token: string): Observable<boolean> {
    const query = `action=claim&email=${encodeURIComponent(email.trim().toLowerCase())}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    return forkJoin([
      this.claimSingleLockEndpoint(`/session-lock?${query}`),
      this.claimSingleLockEndpoint(`${this.apiUrl}/session-lock?${query}`, token),
    ]).pipe(map(([devClaimed, apiClaimed]) => devClaimed && apiClaimed));
  }

  private sendCrossBrowserHeartbeat(email: string): void {
    const query = `action=heartbeat&email=${encodeURIComponent(email.trim().toLowerCase())}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    this.http.get(`/session-lock?${query}`).pipe(timeout(1200)).subscribe({ next: () => {}, error: () => {} });
    this.http.get(`${this.apiUrl}/session-lock?${query}`).pipe(timeout(1200)).subscribe({ next: () => {}, error: () => {} });
  }

  private releaseCrossBrowserLock(email: string): void {
    const normalized = email.trim().toLowerCase();
    const query = `action=release&email=${encodeURIComponent(normalized)}&tabId=${encodeURIComponent(this.tabSessionId)}`;
    const lockUrl = `/session-lock?${query}`;
    const apiLockUrl = `${this.apiUrl}/session-lock?${query}`;
    // sendBeacon no admite cabeceras: el cierre de sesion al cerrar la pestana envia el token de la propia sesion
    const token = this.getToken();
    const backendLogoutUrl = token ? `${this.apiUrl}/logout?token=${encodeURIComponent(token)}` : null;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(lockUrl);
        navigator.sendBeacon(apiLockUrl);
        if (backendLogoutUrl) {
          navigator.sendBeacon(backendLogoutUrl);
        }
      }
    } catch {
      // Fallback a petición HTTP
    }
    this.http.get(lockUrl).subscribe({ next: () => {}, error: () => {} });
    this.http.get(apiLockUrl).subscribe({ next: () => {}, error: () => {} });
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
      const email = decoded.email ?? '';
      const name = decoded.name ?? decoded.given_name ?? email.split('@')[0];
      return { email, name };
    } catch {
      return { email: '', name: 'Usuario Google' };
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
