// Importaciones de Angular para componentes, inyección de dependencias y reactividad con signals
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
// Servicios de administración, tema, idioma y modelos de error
import { AdminService } from '../../../core/services/admin.service';
import { LanguageService } from '../../../core/services/language.service';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';
import { ApiErrorResponse } from '../../../core/models/auth.models';

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

// Componente exclusivo para administradores que permite registrar nuevos usuarios con rol ADMIN
@Component({
  selector: 'app-admin-register',
  imports: [ReactiveFormsModule, RouterLink, ThemeToggle, LanguageToggle],
  templateUrl: './admin-register.html',
  styleUrl: './admin-register.css',
})
export class AdminRegister {
  private readonly fb = inject(FormBuilder);
  private readonly adminService = inject(AdminService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(LanguageService);

  // Formulario reactivo con validaciones de nombre, email y política de contraseña
  readonly form = this.fb.nonNullable.group(
    {
      nombre: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8), passwordPolicyValidator]],
      confirmarPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator },
  );

  // Signals de estado para mostrar carga, errores o éxito
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

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

  // Envía la petición POST /api/admin/administradores al backend
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
        const fieldMsg = body?.fieldErrors ? Object.values(body.fieldErrors)[0] : undefined;
        this.errorMessage.set(fieldMsg ?? body?.message ?? 'No se pudo crear el administrador. Intenta nuevamente.');
      },
    });
  }
}
