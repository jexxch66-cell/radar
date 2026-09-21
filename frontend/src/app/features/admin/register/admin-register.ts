import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminService } from '../../../core/services/admin.service';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import { ApiErrorResponse } from '../../../core/models/auth.models';

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
  selector: 'app-admin-register',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle],
  templateUrl: './admin-register.html',
  styleUrl: './admin-register.css',
})
export class AdminRegister {
  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmarPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { nombre, email, password } = this.form.getRawValue();
    this.adminService.registrarAdministrador({ nombre, email, password }).subscribe({
      next: (admin) => {
        this.submitting.set(false);
        this.successMessage.set(`Administrador "${admin.nombre}" creado correctamente.`);
        this.form.reset();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        const body = err.error as ApiErrorResponse | undefined;
        this.errorMessage.set(body?.message ?? 'No se pudo crear el administrador. Intenta nuevamente.');
      },
    });
  }
}
