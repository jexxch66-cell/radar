// Importamos Component e inject de Angular para definir el componente e inyectar dependencias
import { Component, inject } from '@angular/core';
// Importamos el servicio de idioma que gestiona el estado reactivo ('es' | 'en')
import { LanguageService } from '../../core/services/language.service';

// Componente reutilizable de botón para alternar el idioma entre Español (ES) e Inglés (EN)
@Component({
  selector: 'app-language-toggle',
  template: `
    <button
      type="button"
      (click)="languageService.toggle()"
      [attr.aria-label]="languageService.lang() === 'es' ? 'Switch language to English' : 'Cambiar idioma a Español'"
      [title]="languageService.lang() === 'es' ? 'Switch to English (EN)' : 'Cambiar a Español (ES)'"
      class="flex items-center justify-center gap-1 px-2.5 h-9 rounded-full border border-fg/20 bg-panel/90 text-fg text-xs font-semibold backdrop-blur-md shadow-lg hover:border-fg/40 transition-colors cursor-pointer"
    >
      <!-- Icono de globo terráqueo para representar el selector de idioma -->
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <!-- Muestra el código del idioma activo en mayúsculas (ES o EN) -->
      <span>{{ languageService.lang() === 'es' ? 'ES' : 'EN' }}</span>
    </button>
  `,
})
export class LanguageToggle {
  // Inyectamos LanguageService como propiedad protegida para usarlo directamente en el template HTML
  protected readonly languageService = inject(LanguageService);
}

