// Importaciones de Angular para componentes, referencias al DOM, ciclo de vida e inyección de dependencias
import { AfterViewInit, Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
// ReactiveFormsModule y FormBuilder para construir y validar el formulario reactivo de inicio de sesión
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
// Router y ActivatedRoute para redireccionar según el rol y leer parámetros de URL (ej. sessionExpired)
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
// Servicios de autenticación, tema, idioma, login con Google y reCAPTCHA
import { AuthService } from '../../../core/services/auth.service';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';
import { LanguageService } from '../../../core/services/language.service';
import { ApiErrorResponse } from '../../../core/models/auth.models';
import { GoogleIdentityService } from '../../../core/services/google-identity.service';
import { RecaptchaService } from '../../../core/services/recaptcha.service';

// Componente de inicio de sesión: soporta email/contraseña, Google Identity y control de sesión única
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements AfterViewInit {
  // Inyección de servicios necesarios para formularios, autenticación, navegación e idioma
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly googleIdentity = inject(GoogleIdentityService);
  private readonly recaptcha = inject(RecaptchaService);
  protected readonly i18n = inject(LanguageService);

  // Referencia al contenedor HTML donde Google Identity renderiza su botón oficial
  @ViewChild('googleButton') private googleButton?: ElementRef<HTMLElement>;

  // Definición del formulario reactivo con validaciones de email válido y contraseña de mínimo 8 caracteres
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  // Signals reactivos para controlar el estado de carga, mensajes de error y opción de forzar cierre de otra sesión
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly canForceLogin = signal(false);
  private lastGoogleToken: string | null = null;
  // Indica si el usuario fue redirigido aquí porque su sesión se abrió en otro navegador o expiró
  readonly sessionExpired = this.route.snapshot.queryParamMap.get('sessionExpired') === 'true';

  ngAfterViewInit(): void {
    // Una vez cargado el HTML, inicializamos el botón de Google
    this.renderGoogleButton();
  }

  // Renderiza el botón de Google; si el script externo aún no carga, reintenta cada 500ms
  private renderGoogleButton(): void {
    if (!this.googleButton || this.googleIdentity.renderButton(this.googleButton.nativeElement, (idToken) => this.loginWithGoogle(idToken))) {
      return;
    }
    window.setTimeout(() => this.renderGoogleButton(), 500);
  }

  // Envía las credenciales al backend; si force=true, cierra cualquier otra sesión activa del mismo usuario
  onSubmit(force = false): void {
    if (this.form.invalid || (this.submitting() && !force)) {
      this.form.markAllAsTouched();
      return;
    }

    this.lastGoogleToken = null;
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.canForceLogin.set(false);

    this.authService.login({ ...this.form.getRawValue(), force }).subscribe({
      next: () => {
        this.submitting.set(false);
        // Redirige a /admin si tiene rol ADMIN, o a /mapa si es ciudadano (USER)
        void this.router.navigateByUrl(this.authService.isAdmin() ? '/admin' : '/mapa');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        // HTTP 409 Conflict significa que ya existe una sesión activa en otro navegador
        if (err.status === 409) {
          this.canForceLogin.set(true);
        }
        this.errorMessage.set(body?.message ?? 'No se pudo iniciar sesión. Intenta nuevamente.');
      },
    });
  }

  // Permite al usuario reclamar su sesión cerrando la que estaba abierta en otro dispositivo (funciona para Email y para Google)
  onForceLogin(): void {
    if (this.lastGoogleToken) {
      void this.loginWithGoogle(this.lastGoogleToken, true);
      return;
    }
    this.onSubmit(true);
  }

  // Autenticación mediante Google OAuth: verifica reCAPTCHA y envía el idToken al backend
  private async loginWithGoogle(idToken: string, force = false): Promise<void> {
    if (this.submitting() && !force) {
      return;
    }
    this.lastGoogleToken = idToken;
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.canForceLogin.set(false);
    const captchaToken = await this.recaptcha.execute('google_login');
    this.authService.loginWithGoogle({ idToken, acceptDataTreatment: true, captchaToken, force }).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl(this.authService.isAdmin() ? '/admin' : '/mapa');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        if (err.status === 409) {
          this.canForceLogin.set(true);
        }
        this.errorMessage.set(body?.message ?? 'No se pudo iniciar sesión con Google.');
      },
    });
  }
}
