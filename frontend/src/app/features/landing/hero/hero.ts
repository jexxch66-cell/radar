import { Component, OnDestroy, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RevealLayer } from './reveal-layer';

// Landing pública de RADAR: hero con efecto spotlight que revela, al mover el cursor,
// un segundo estado de la misma zona urbana con los reportes marcados sobre el mapa.
@Component({
  selector: 'app-hero',
  imports: [RouterLink, RevealLayer],
  templateUrl: './hero.html',
  styleUrl: './hero.css',
})
export class Hero implements OnDestroy {
  protected readonly baseImage = '/images/street-base.svg';
  protected readonly revealImage = '/images/street-reveal.svg';

  protected readonly cursor = signal({ x: -999, y: -999 });
  protected readonly menuOpen = signal(false);

  private readonly mouse = { x: -999, y: -999 };
  private readonly smooth = { x: -999, y: -999 };
  private rafId: number | null = null;
  private readonly onMouseMove = (event: MouseEvent): void => {
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
  };

  constructor() {
    window.addEventListener('mousemove', this.onMouseMove);
    this.rafId = requestAnimationFrame(this.tick);
  }

  ngOnDestroy(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  private readonly tick = (): void => {
    this.smooth.x += (this.mouse.x - this.smooth.x) * 0.1;
    this.smooth.y += (this.mouse.y - this.smooth.y) * 0.1;
    this.cursor.set({ x: this.smooth.x, y: this.smooth.y });
    this.rafId = requestAnimationFrame(this.tick);
  };
}
