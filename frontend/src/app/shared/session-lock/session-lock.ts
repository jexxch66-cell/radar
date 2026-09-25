import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { SessionTimeoutService } from '../../core/services/session-timeout.service';
import { ApiErrorResponse } from '../../core/models/auth.models';

@Component({
  selector: 'app-session-lock',
  imports: [ReactiveFormsModule],
  templateUrl: './session-lock.html',
  styleUrl: './session-lock.css',
})
export class SessionLock {
  private readonly fb = inject(FormBuilder);
  readonly authService = inject(AuthService);
  readonly sessionTimeout = inject(SessionTimeoutService);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required]],
  });

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.authService.currentUser();
    if (!user) {
      this.authService.logout();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.authService.login({ email: user.email, password: this.form.controls.password.value }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.form.reset();
        this.sessionTimeout.unlock();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = error.error as ApiErrorResponse | undefined;
        this.errorMessage.set(body?.message ?? 'Contraseña incorrecta. Intenta nuevamente.');
        this.form.controls.password.reset();
      },
    });
  }
}
