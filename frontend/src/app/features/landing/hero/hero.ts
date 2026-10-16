// Importaciones principales de Angular: Component (decorador), OnDestroy (ciclo de vida), inject (inyección) y signal (estado reactivo)
import { Component, OnDestroy, inject, signal } from '@angular/core';
// RouterLink permite navegar entre rutas de Angular desde el HTML sin recargar la página
import { RouterLink } from '@angular/router';
// Componente hijo que dibuja la capa "linterna/spotlight" sobre el mapa de la portada
import { RevealLayer } from './reveal-layer';
// Botón para cambiar entre tema claro y oscuro
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
// Botón para cambiar el idioma entre Español (ES) e Inglés (EN)
import { LanguageToggle } from '../../../shared/language-toggle/language-toggle';
// Servicio de internacionalización que provee los textos traducidos según el idioma elegido
import { LanguageService } from '../../../core/services/language.service';

// Landing pública de RADAR: hero con efecto spotlight que revela, al mover el cursor,
// un segundo estado de la misma zona urbana con los reportes marcados sobre el mapa.
@Component({
  selector: 'app-hero',
  imports: [RouterLink, RevealLayer, ThemeToggle, LanguageToggle],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
})
export class Hero implements OnDestroy {
  // Servicio de idioma expuesto al template HTML para traducir textos en tiempo real
  protected readonly i18n = inject(LanguageService);

  // Rutas de las ilustraciones vectoriales de fondo (estado normal vs. estado con reportes)
  protected readonly baseImage = '/images/street-base.svg';
  protected readonly revealImage = '/images/street-reveal.svg';

  // Signals reactivos para la posición suavizada del cursor y el estado del menú móvil
  protected readonly cursor = signal({ x: -999, y: -999 });
  protected readonly menuOpen = signal(false);

  // Variables internas para interpolar (suavizar) el movimiento del puntero con requestAnimationFrame
  private readonly mouse = { x: -999, y: -999 };
  private readonly smooth = { x: -999, y: -999 };
  private rafId: number | null = null;

  // Listener que captura las coordenadas X e Y reales del mouse en la pantalla
  private readonly onMouseMove = (event: MouseEvent): void => {
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
  };

  constructor() {
    // Al iniciar el componente, escuchamos el movimiento del mouse e iniciamos el bucle de animación
    window.addEventListener('mousemove', this.onMouseMove);
    this.rafId = requestAnimationFrame(this.tick);
  }

  ngOnDestroy(): void {
    // Al salir de la pantalla, limpiamos el evento y el bucle de animación para evitar fugas de memoria
    window.removeEventListener('mousemove', this.onMouseMove);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }

  // Abre o cierra el menú desplegable en pantallas móviles
  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  // Cierra el menú móvil al seleccionar una opción
  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  // Bucle de interpolación lineal (lerp al 10%) para que el círculo revelador siga al cursor con fluidez
  private readonly tick = (): void => {
    this.smooth.x += (this.mouse.x - this.smooth.x) * 0.1;
    this.smooth.y += (this.mouse.y - this.smooth.y) * 0.1;
    this.cursor.set({ x: this.smooth.x, y: this.smooth.y });
    this.rafId = requestAnimationFrame(this.tick);
  };
}
