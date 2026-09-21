import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, effect, input, signal } from '@angular/core';

// Dibuja un gradiente radial en un canvas oculto siguiendo el cursor y lo usa como máscara CSS
// sobre la imagen "revelada", creando el efecto de linterna/spotlight que descubre la segunda imagen.
@Component({
  selector: 'app-reveal-layer',
  template: `
    <canvas #maskCanvas class="absolute inset-0 pointer-events-none" style="display: none"></canvas>
    <div
      class="landing-scene absolute inset-0 bg-center bg-cover bg-no-repeat z-30 pointer-events-none"
      [style.background-image]="'url(' + image() + ')'"
      [style.mask-image]="maskDataUrl() ? 'url(' + maskDataUrl() + ')' : 'none'"
      [style.-webkit-mask-image]="maskDataUrl() ? 'url(' + maskDataUrl() + ')' : 'none'"
      style="mask-size: 100% 100%; -webkit-mask-size: 100% 100%"
    ></div>
  `,
})
export class RevealLayer implements AfterViewInit, OnDestroy {
  readonly image = input.required<string>();
  readonly cursor = input.required<{ x: number; y: number }>();

  @ViewChild('maskCanvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly SPOTLIGHT_R = 260;
  protected readonly maskDataUrl = signal<string | null>(null);
  private ctx: CanvasRenderingContext2D | null = null;

  constructor() {
    effect(() => {
      const { x, y } = this.cursor();
      this.draw(x, y);
    });
  }

  ngAfterViewInit(): void {
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeCanvas);
  }

  private resizeCanvas = (): void => {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.ctx = canvas.getContext('2d');
    this.draw(this.cursor().x, this.cursor().y);
  };

  private draw(x: number, y: number): void {
    if (!this.ctx) {
      return;
    }
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, this.SPOTLIGHT_R);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(0.75, 'rgba(255,255,255,0.4)');
    gradient.addColorStop(0.88, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.SPOTLIGHT_R, 0, Math.PI * 2);
    this.ctx.fill();

    this.maskDataUrl.set(canvas.toDataURL());
  }
}
