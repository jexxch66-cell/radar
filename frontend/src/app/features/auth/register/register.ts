// Importaciones de Angular para componentes, referencias al DOM y reactividad con signals
import { AfterViewInit, Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
// Herramientas de formularios reactivos y validadores personalizados
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
// Servicios de autenticación, tema, idioma, Google OAuth y protección reCAPTCHA
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

// Valida que password y confirmarPassword coincidan; el error se coloca en confirmarPassword
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmarControl = group.get('confirmarPassword');
  const confirmar = confirmarControl?.value;
  if (password && confirmar && password !== confirmar) {
    confirmarControl?.setErrors({ ...(confirmarControl.errors ?? {}), mismatch: true });
    return { mismatch: true };
  }
  if (confirmarControl?.hasError('mismatch')) {
    const rest = { ...(confirmarControl.errors ?? {}) };
    delete rest['mismatch'];
    confirmarControl.setErrors(Object.keys(rest).length > 0 ? rest : null);
  }
  return null;
}

// Componente de registro de nuevos usuarios ciudadanos (con consentimiento de tratamiento de datos y política de contraseña)
@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register implements AfterViewInit {
  // Inyección de dependencias para formularios, autenticación, navegación e idioma
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly googleIdentity = inject(GoogleIdentityService);
  private readonly recaptcha = inject(RecaptchaService);
  protected readonly i18n = inject(LanguageService);

  // Contenedor para el botón oficial de registro con Google
  @ViewChild('googleButton') private googleButton?: ElementRef<HTMLElement>;

  // Formulario reactivo con validaciones de campos obligatorios, formato de email, política de contraseña y consentimiento
  readonly form = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8), passwordPolicyValidator]],
      confirmarPassword: ['', [Validators.required]],
      acceptDataTreatment: [false, [Validators.requiredTrue]],
    },
    { validators: passwordsMatchValidator },
  );

  // Signals reactivos para el estado de envío, errores y modal de confirmación exitosa
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly registrationSuccess = signal(false);

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
    this.renderGoogleButton();
  }

  private renderGoogleButton(): void {
    if (!this.googleButton || this.googleIdentity.renderButton(this.googleButton.nativeElement, (idToken) => this.registerWithGoogle(idToken))) {
      return;
    }
    window.setTimeout(() => this.renderGoogleButton(), 500);
  }

  // Envía el formulario de registro al backend previo token de seguridad reCAPTCHA
  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { nombre, email, password, acceptDataTreatment } = this.form.getRawValue();
    const captchaToken = await this.recaptcha.execute('register');
    this.authService.register({ nombre, email, password, acceptDataTreatment, captchaToken }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.registrationSuccess.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        const fieldMsg = body?.fieldErrors ? Object.values(body.fieldErrors)[0] : undefined;
        this.errorMessage.set(fieldMsg ?? body?.message ?? 'No se pudo completar el registro. Intenta nuevamente.');
      },
    });
  }

  // Registra o autentica con Google exigiendo haber marcado la casilla de tratamiento de datos personales
  private async registerWithGoogle(idToken: string): Promise<void> {
    if (!this.form.controls.acceptDataTreatment.value) {
      this.form.controls.acceptDataTreatment.markAsTouched();
      this.errorMessage.set('Acepta el tratamiento de datos antes de continuar con Google.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    const captchaToken = await this.recaptcha.execute('google_register');
    this.authService.loginWithGoogle({
      idToken,
      acceptDataTreatment: true,
      captchaToken,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.registrationSuccess.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        this.errorMessage.set(body?.message ?? 'No se pudo crear la cuenta con Google.');
      },
    });
  }

  // Cierra el modal de confirmación y redirige a la pantalla de login
  goToLogin(): void {
    this.registrationSuccess.set(false);
    this.router.navigateByUrl('/login');
  }
}
