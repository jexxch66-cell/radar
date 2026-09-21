import { Component, inject } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  template: `
    <button
      type="button"
      (click)="themeService.toggle()"
      [attr.aria-label]="themeService.theme() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      [title]="themeService.theme() === 'dark' ? 'Modo claro' : 'Modo oscuro'"
      class="flex items-center justify-center w-9 h-9 rounded-full border border-fg/20 bg-panel/90 text-fg backdrop-blur-md shadow-lg hover:border-fg/40 transition-colors"
    >
      @if (themeService.theme() === 'dark') {
        <!-- Sol: ofrece pasar a claro -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      } @else {
        <!-- Luna: ofrece pasar a oscuro -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      }
    </button>
  `,
})
export class ThemeToggle {
  protected readonly themeService = inject(ThemeService);
}
