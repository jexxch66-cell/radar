import { AfterViewInit, Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import { ApiErrorResponse } from '../../../core/models/auth.models';
import { GoogleIdentityService } from '../../../core/services/google-identity.service';
import { RecaptchaService } from '../../../core/services/recaptcha.service';

// Valida que password y confirmarPassword coincidan; el error se coloca en confirmarPassword
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmar = group.get('confirmarPassword')?.value;
  if (password && confirmar && password !== confirmar) {
    group.get('confirmarPassword')?.setErrors({ mismatch: true });
    return { mismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly googleIdentity = inject(GoogleIdentityService);
  private readonly recaptcha = inject(RecaptchaService);

  @ViewChild('googleButton') private googleButton?: ElementRef<HTMLElement>;

  readonly form = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmarPassword: ['', [Validators.required]],
      acceptDataTreatment: [false, [Validators.requiredTrue]],
    },
    { validators: passwordsMatchValidator },
  );

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly registrationSuccess = signal(false);

  ngAfterViewInit(): void {
    this.renderGoogleButton();
  }

  private renderGoogleButton(): void {
    if (!this.googleButton || this.googleIdentity.renderButton(this.googleButton.nativeElement, (idToken) => this.registerWithGoogle(idToken))) {
      return;
    }
    window.setTimeout(() => this.renderGoogleButton(), 500);
  }

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
        this.errorMessage.set(body?.message ?? 'No se pudo completar el registro. Intenta nuevamente.');
      },
    });
  }

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
        this.router.navigateByUrl('/mapa');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        this.errorMessage.set(body?.message ?? 'No se pudo crear la cuenta con Google.');
      },
    });
  }

  goToLogin(): void {
    this.registrationSuccess.set(false);
    this.router.navigateByUrl('/login');
  }
}
