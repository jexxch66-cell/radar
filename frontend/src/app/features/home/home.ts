import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { ThemeToggle } from '../../shared/theme-toggle/theme-toggle';
import { AuthService } from '../../core/services/auth.service';
import { ReportService } from '../../core/services/report.service';
import {
  CreateReportRequest,
  Report,
  REPORT_CATEGORIES,
  REPORT_STATUS_LABELS,
  ReportCategory,
} from '../../core/models/report.models';

// Bogotá como centro por defecto; ajustar cuando haya geolocalizacion real por ciudad
const DEFAULT_CENTER: [number, number] = [4.6486, -74.0912];
const DEFAULT_ZOOM = 13;

@Component({
  selector: 'app-home',
  imports: [FormsModule, ThemeToggle],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements AfterViewInit, OnDestroy {
  protected readonly authService = inject(AuthService);
  private readonly reportService = inject(ReportService);
  private readonly router = inject(Router);

  @ViewChild('mapContainer') private mapContainer!: ElementRef<HTMLDivElement>;

  protected readonly categories = REPORT_CATEGORIES;
  protected readonly statusLabels = REPORT_STATUS_LABELS;

  protected readonly reports = signal<Report[]>([]);
  protected readonly loadingReports = signal(true);
  protected readonly loadError = signal<string | null>(null);

  // Modo "reportar": el siguiente click en el mapa ubica el nuevo reporte
  protected readonly addMode = signal(false);
  protected readonly pendingLatLng = signal<{ lat: number; lng: number } | null>(null);
  protected readonly selectedCategory = signal<ReportCategory>('BACHE');
  protected readonly descripcion = signal('');
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly selectedReport = signal<Report | null>(null);

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;

  constructor() {
    effect(() => this.renderMarkers(this.reports()));
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; colaboradores de OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomleft' }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);

    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (!this.addMode()) {
        return;
      }
      this.selectedReport.set(null);
      this.pendingLatLng.set({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    this.loadReports();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  protected categoryMeta(categoria: ReportCategory) {
    return this.categories.find((c) => c.value === categoria) ?? this.categories[this.categories.length - 1];
  }

  protected toggleAddMode(): void {
    this.addMode.update((value) => !value);
    this.pendingLatLng.set(null);
    this.selectedReport.set(null);
  }

  protected selectCategory(categoria: ReportCategory): void {
    this.selectedCategory.set(categoria);
  }

  protected cancelForm(): void {
    this.pendingLatLng.set(null);
    this.formError.set(null);
    this.descripcion.set('');
  }

  protected closeDetail(): void {
    this.selectedReport.set(null);
  }

  protected submitReport(): void {
    const coords = this.pendingLatLng();
    const descripcion = this.descripcion().trim();

    if (!coords || this.submitting()) {
      return;
    }
    if (!descripcion) {
      this.formError.set('Escribe una descripción para el reporte.');
      return;
    }

    const request: CreateReportRequest = {
      categoria: this.selectedCategory(),
      descripcion,
      latitud: coords.lat,
      longitud: coords.lng,
    };

    this.submitting.set(true);
    this.formError.set(null);

    this.reportService.create(request).subscribe({
      next: (report) => {
        this.reports.update((current) => [report, ...current]);
        this.submitting.set(false);
        this.addMode.set(false);
        this.pendingLatLng.set(null);
        this.descripcion.set('');
        this.selectedCategory.set('BACHE');
      },
      error: () => {
        this.formError.set('No se pudo crear el reporte. Intenta nuevamente.');
        this.submitting.set(false);
      },
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  private loadReports(): void {
    this.loadingReports.set(true);
    this.loadError.set(null);

    this.reportService.getAll().subscribe({
      next: (reports) => {
        this.reports.set(reports);
        this.loadingReports.set(false);
      },
      error: () => {
        this.loadError.set('No se pudieron cargar los reportes.');
        this.loadingReports.set(false);
      },
    });
  }

  private renderMarkers(reports: Report[]): void {
    if (!this.markersLayer) {
      return;
    }
    this.markersLayer.clearLayers();

    for (const report of reports) {
      const meta = this.categoryMeta(report.categoria);
      const icon = L.divIcon({
        className: '',
        html: `<div class="report-pin" style="background:${meta.color}">${meta.icon}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const marker = L.marker([report.latitud, report.longitud], { icon });
      marker.on('click', () => {
        this.pendingLatLng.set(null);
        this.selectedReport.set(report);
      });
      marker.addTo(this.markersLayer);
    }
  }
}
