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
  REPORT_DETAILS,
  REPORT_SEVERITIES,
  REPORT_STATUS_LABELS,
  ReportCategory,
} from '../../core/models/report.models';

// Bogotá como centro por defecto hasta que llegue la ubicación real del usuario
const DEFAULT_CENTER: [number, number] = [4.6486, -74.0912];
const DEFAULT_ZOOM = 13;
const NAV_ZOOM = 18;
const ARROW_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2 4 21l8-4 8 4z"/></svg>';

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
  protected readonly severities = REPORT_SEVERITIES;
  protected readonly statusLabels = REPORT_STATUS_LABELS;

  protected readonly reports = signal<Report[]>([]);
  protected readonly loadingReports = signal(true);
  protected readonly loadError = signal<string | null>(null);

  // Flujo de reporte: parte de la ubicación real del usuario (GPS); si no hay, se ubica tocando el mapa
  protected readonly addMode = signal(false);
  protected readonly manualPlacing = signal(false);
  protected readonly pendingLatLng = signal<{ lat: number; lng: number } | null>(null);
  protected readonly address = signal<string | null>(null);
  protected readonly selectedCategory = signal<ReportCategory>('BACHE');
  protected readonly selectedDetail = signal<string | null>(null);
  protected readonly selectedSeverity = signal<string>('Moderado');
  protected readonly descripcion = signal('');
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  // Ubicación en vivo del usuario (estilo Waze)
  protected readonly locStatus = signal<'pending' | 'ok' | 'denied' | 'unavailable'>('pending');
  protected readonly userPos = signal<{ lat: number; lng: number; accuracy: number } | null>(null);
  protected readonly following = signal(true);

  protected readonly selectedReport = signal<Report | null>(null);

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private meMarker: L.Marker | null = null;
  private accuracyCircle: L.Circle | null = null;
  private pendingMarker: L.Marker | null = null;
  private watchId: number | null = null;
  private lastHeading = 0;
  private geocodeSeq = 0;
  // true cuando el usuario corrigió a mano la ubicación del reporte
  private manualLocation = false;

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
      if (!this.manualPlacing()) {
        return;
      }
      this.selectedReport.set(null);
      this.setPending(event.latlng.lat, event.latlng.lng, true);
      this.manualPlacing.set(false);
    });

    // Al arrastrar el mapa el usuario deja de "seguirse"
    this.map.on('dragstart', () => this.following.set(false));

    this.startLocation();
    this.loadReports();
  }

  ngOnDestroy(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.map?.remove();
  }

  protected startLocation(): void {
    if (!('geolocation' in navigator)) {
      this.locStatus.set('unavailable');
      return;
    }
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.locStatus.set('pending');

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const first = this.userPos() === null;
        const { latitude: lat, longitude: lng, accuracy, heading } = pos.coords;
        this.userPos.set({ lat, lng, accuracy });
        this.locStatus.set('ok');
        if (heading !== null && !Number.isNaN(heading)) {
          this.lastHeading = heading;
        }
        this.updateMeMarker(lat, lng, accuracy);

        if (first) {
          this.map?.setView([lat, lng], NAV_ZOOM);
        } else if (this.following()) {
          this.map?.panTo([lat, lng], { animate: true });
        }
        // Con el panel abierto y sin corrección manual, el reporte sigue al usuario
        if (this.addMode() && !this.manualLocation && !this.manualPlacing()) {
          this.setPending(lat, lng, false);
        } else if (this.addMode() && !this.pendingLatLng() && this.manualPlacing()) {
          // Llegó el GPS mientras esperaba un toque en el mapa: mejor usar la posición real
          this.manualPlacing.set(false);
          this.setPending(lat, lng, false);
        }
      },
      (error) => {
        this.locStatus.set(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  protected recenter(): void {
    const pos = this.userPos();
    if (!pos) {
      this.startLocation();
      return;
    }
    this.following.set(true);
    this.map?.setView([pos.lat, pos.lng], NAV_ZOOM, { animate: true });
  }

  protected categoryMeta(categoria: ReportCategory) {
    return this.categories.find((c) => c.value === categoria) ?? this.categories[this.categories.length - 1];
  }

  protected detailsFor(categoria: ReportCategory): string[] {
    return REPORT_DETAILS[categoria];
  }

  // Reportar parte de donde está parado el usuario; sin GPS cae a ubicar tocando el mapa
  protected toggleAddMode(): void {
    if (this.addMode()) {
      this.cancelForm();
      return;
    }
    this.addMode.set(true);
    this.selectedReport.set(null);
    this.manualLocation = false;

    const pos = this.userPos();
    if (pos) {
      this.setPending(pos.lat, pos.lng, false);
      this.following.set(true);
      this.map?.setView([pos.lat, pos.lng], NAV_ZOOM, { animate: true });
    } else {
      this.manualPlacing.set(true);
    }
  }

  protected relocate(): void {
    this.manualPlacing.set(true);
  }

  protected useMyPosition(): void {
    const pos = this.userPos();
    if (!pos) {
      return;
    }
    this.manualLocation = false;
    this.manualPlacing.set(false);
    this.setPending(pos.lat, pos.lng, false);
  }

  protected selectCategory(categoria: ReportCategory): void {
    this.selectedCategory.set(categoria);
    this.selectedDetail.set(null);
  }

  protected cancelForm(): void {
    this.addMode.set(false);
    this.manualPlacing.set(false);
    this.manualLocation = false;
    this.pendingLatLng.set(null);
    this.clearPendingMarker();
    this.address.set(null);
    this.formError.set(null);
    this.descripcion.set('');
    this.selectedDetail.set(null);
    this.selectedSeverity.set('Moderado');
  }

  protected closeDetail(): void {
    this.selectedReport.set(null);
  }

  protected submitReport(): void {
    const coords = this.pendingLatLng();
    const note = this.descripcion().trim();
    const detail = this.selectedDetail();

    if (!coords || this.submitting()) {
      return;
    }
    if (!detail && !note) {
      this.formError.set('Elige un detalle o escribe una nota para el reporte.');
      return;
    }

    // Texto compuesto: "Detalle · Gravedad. Nota" (máx. 500 en el backend)
    const descripcion = [[detail, this.selectedSeverity()].filter(Boolean).join(' · '), note]
      .filter(Boolean)
      .join('. ')
      .slice(0, 500);

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
        this.cancelForm();
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

  private setPending(lat: number, lng: number, manual: boolean): void {
    if (manual) {
      this.manualLocation = true;
    }
    this.pendingLatLng.set({ lat, lng });
    this.updatePendingMarker(lat, lng);
    this.reverseGeocode(lat, lng);
  }

  private updateMeMarker(lat: number, lng: number, accuracy: number): void {
    if (!this.map) {
      return;
    }
    const icon = L.divIcon({
      className: '',
      html: `<div class="me-marker"><div class="me-pulse"></div><div class="me-arrow" style="transform:rotate(${this.lastHeading}deg)">${ARROW_SVG}</div></div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
    if (!this.meMarker) {
      this.meMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000, interactive: false }).addTo(this.map);
      this.accuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: '#2a78d6',
        weight: 1,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(this.map);
    } else {
      this.meMarker.setLatLng([lat, lng]).setIcon(icon);
      this.accuracyCircle?.setLatLng([lat, lng]).setRadius(accuracy);
    }
  }

  private updatePendingMarker(lat: number, lng: number): void {
    if (!this.map) {
      return;
    }
    if (!this.pendingMarker) {
      this.pendingMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div class="pending-pin"></div>', iconSize: [34, 34], iconAnchor: [4, 34] }),
        zIndexOffset: 900,
        interactive: false,
      }).addTo(this.map);
    } else {
      this.pendingMarker.setLatLng([lat, lng]);
    }
  }

  private clearPendingMarker(): void {
    this.pendingMarker?.remove();
    this.pendingMarker = null;
  }

  // Dirección aproximada con Nominatim (OSM); es opcional, si falla simplemente no se muestra
  private reverseGeocode(lat: number, lng: number): void {
    const seq = ++this.geocodeSeq;
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}&accept-language=es`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (seq === this.geocodeSeq && data?.display_name) {
          this.address.set(String(data.display_name).split(',').slice(0, 3).join(','));
        }
      })
      .catch(() => undefined);
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
        this.cancelForm();
        this.selectedReport.set(report);
      });
      marker.addTo(this.markersLayer);
    }
  }
}
