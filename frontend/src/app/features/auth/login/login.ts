import { AfterViewInit, Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import { ApiErrorResponse } from '../../../core/models/auth.models';
import { GoogleIdentityService } from '../../../core/services/google-identity.service';
import { RecaptchaService } from '../../../core/services/recaptcha.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly googleIdentity = inject(GoogleIdentityService);
  private readonly recaptcha = inject(RecaptchaService);

  @ViewChild('googleButton') private googleButton?: ElementRef<HTMLElement>;

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  ngAfterViewInit(): void {
    this.renderGoogleButton();
  }

  private renderGoogleButton(): void {
    if (!this.googleButton || this.googleIdentity.renderButton(this.googleButton.nativeElement, (idToken) => this.loginWithGoogle(idToken))) {
      return;
    }
    window.setTimeout(() => this.renderGoogleButton(), 500);
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.authService.isAdmin() ? '/admin' : '/mapa');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        this.errorMessage.set(body?.message ?? 'No se pudo iniciar sesión. Intenta nuevamente.');
      },
    });
  }

  private async loginWithGoogle(idToken: string): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    const captchaToken = await this.recaptcha.execute('google_login');
    this.authService.loginWithGoogle({ idToken, acceptDataTreatment: false, captchaToken }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.authService.isAdmin() ? '/admin' : '/mapa');
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        this.errorMessage.set(body?.message ?? 'No se pudo iniciar sesión con Google.');
      },
    });
  }
}
