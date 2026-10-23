// Importaciones de Angular para componentes, referencias al DOM, ciclo de vida e inyección de dependencias
import { AfterViewInit, Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
// ReactiveFormsModule y FormBuilder para construir y validar el formulario reactivo de inicio de sesión
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
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

// Valida la política de seguridad de contraseña: mínimo 8 caracteres, al menos una mayúscula y un número
function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) {
    return null;
  }
  const errors: ValidationErrors = {};
  if (value.length < 8) {
    errors['minlength'] = { requiredLength: 8, actualLength: value.length };
  }
  if (!/[A-Z]/.test(value)) {
    errors['missingUppercase'] = true;
  }
  if (!/\d/.test(value)) {
    errors['missingNumber'] = true;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

// Componente de inicio de sesión: soporta email/contraseña, Google Identity y bloqueo estricto de sesión única
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

  // Definición del formulario reactivo con validaciones de email válido y política de contraseña (8+ caracteres, mayúscula y número)
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), passwordPolicyValidator]],
  });

  // Signals reactivos para controlar el estado de carga y mensajes de error
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  // Indica si el usuario fue redirigido aquí porque su sesión expiró
  readonly sessionExpired = this.route.snapshot.queryParamMap.get('sessionExpired') === 'true';

  get passwordValue(): string {
    return this.form.controls.password.value ?? '';
  }

  get hasMinLength(): boolean {
    return this.passwordValue.length >= 8;
  }

  get hasUppercase(): boolean {
    return /[A-Z]/.test(this.passwordValue);
  }

  get hasNumber(): boolean {
    return /\d/.test(this.passwordValue);
  }

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

  // Envía las credenciales al backend; bloquea estrictamente si la cuenta ya tiene una sesión activa en cualquier navegador
  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authService.login({ ...this.form.getRawValue(), force: false }).subscribe({
      next: () => {
        this.submitting.set(false);
        // Redirige a /admin si tiene rol ADMIN, o a /mapa si es ciudadano (USER)
        void this.router.navigateByUrl(this.authService.isAdmin() ? '/admin' : '/mapa');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        const fieldMsg = body?.fieldErrors ? Object.values(body.fieldErrors)[0] : undefined;
        this.errorMessage.set(fieldMsg ?? body?.message ?? 'No se pudo iniciar sesión. Intenta nuevamente.');
      },
    });
  }

  // Autenticación mediante Google OAuth: verifica reCAPTCHA y bloquea si la cuenta ya tiene una sesión activa
  private async loginWithGoogle(idToken: string): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    const captchaToken = await this.recaptcha.execute('google_login');
    this.authService.loginWithGoogle({ idToken, acceptDataTreatment: true, captchaToken, force: false }).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl(this.authService.isAdmin() ? '/admin' : '/mapa');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        this.errorMessage.set(body?.message ?? 'No se pudo iniciar sesión con Google.');
      },
    });
  }
}
