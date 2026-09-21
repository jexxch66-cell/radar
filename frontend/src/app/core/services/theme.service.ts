import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'radar_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.readInitialTheme());

  constructor() {
    // Refleja el tema en <html class="dark"> y lo persiste; index.html hace lo mismo antes de arrancar Angular para evitar el parpadeo
    effect(() => {
      const theme = this.theme();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // Almacenamiento bloqueado: el tema sigue funcionando, solo no se recuerda
      }
    });
  }

  toggle(): void {
    this.theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  private readInitialTheme(): Theme {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // ver arriba
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
