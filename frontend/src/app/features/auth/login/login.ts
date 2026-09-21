import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import { ApiErrorResponse } from '../../../core/models/auth.models';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

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
}
