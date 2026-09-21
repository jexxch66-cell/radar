import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ReportService } from '../../../core/services/report.service';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';
import {
  Report,
  ReportCategory,
  ReportStatus,
  REPORT_CATEGORIES,
  REPORT_STATUS_COLORS,
  REPORT_STATUS_LABELS,
} from '../../../core/models/report.models';

@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, FormsModule, RouterLink, ThemeToggle],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly reportService = inject(ReportService);
  private readonly router = inject(Router);

  protected readonly categories = REPORT_CATEGORIES;
  protected readonly statuses: ReportStatus[] = ['PENDIENTE', 'EN_PROGRESO', 'RESUELTO'];
  protected readonly statusLabels = REPORT_STATUS_LABELS;
  protected readonly statusColors = REPORT_STATUS_COLORS;

  protected readonly reports = signal<Report[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  // Filtros de la tabla
  protected readonly filterStatus = signal<ReportStatus | ''>('');
  protected readonly filterCategory = signal<ReportCategory | ''>('');
  protected readonly search = signal('');

  // Edición (modal) y borrado (confirmación)
  protected readonly editing = signal<Report | null>(null);
  protected readonly editCategory = signal<ReportCategory>('OTRO');
  protected readonly editDescripcion = signal('');
  protected readonly editError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly deleting = signal<Report | null>(null);
  protected readonly deleteBusy = signal(false);

  // --- Dashboard: todo se deriva de la lista de reportes ---
  protected readonly total = computed(() => this.reports().length);

  protected readonly countByStatus = computed(() => {
    const counts: Record<ReportStatus, number> = { PENDIENTE: 0, EN_PROGRESO: 0, RESUELTO: 0 };
    for (const report of this.reports()) {
      counts[report.estado]++;
    }
    return counts;
  });

  protected readonly resolvedPercent = computed(() => {
    const total = this.total();
    return total === 0 ? 0 : Math.round((this.countByStatus().RESUELTO / total) * 100);
  });

  // Ordenado de mayor a menor; "width" es relativo a la categoría con más reportes
  protected readonly byCategory = computed(() => {
    const counts = new Map<ReportCategory, number>();
    for (const report of this.reports()) {
      counts.set(report.categoria, (counts.get(report.categoria) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return this.categories
      .map((cat) => ({ ...cat, count: counts.get(cat.value) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .map((row) => ({ ...row, width: (row.count / max) * 100 }));
  });

  protected readonly filtered = computed(() => {
    const status = this.filterStatus();
    const category = this.filterCategory();
    const term = this.search().trim().toLowerCase();
    return this.reports().filter(
      (r) =>
        (!status || r.estado === status) &&
        (!category || r.categoria === category) &&
        (!term || r.descripcion.toLowerCase().includes(term) || r.autorNombre.toLowerCase().includes(term)),
    );
  });

  ngOnInit(): void {
    this.loadReports();
  }

  protected loadReports(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.reportService.getAll().subscribe({
      next: (reports) => {
        this.reports.set(reports);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('No se pudieron cargar los reportes.');
        this.loading.set(false);
      },
    });
  }

  protected categoryMeta(categoria: ReportCategory) {
    return this.categories.find((c) => c.value === categoria) ?? this.categories[this.categories.length - 1];
  }

  protected percentOf(count: number): number {
    const total = this.total();
    return total === 0 ? 0 : (count / total) * 100;
  }

  protected clearFilters(): void {
    this.filterStatus.set('');
    this.filterCategory.set('');
    this.search.set('');
  }

  // --- Update: estado (inline) ---
  protected onEstadoChange(report: Report, estado: ReportStatus): void {
    if (estado === report.estado) {
      return;
    }
    this.reportService.updateEstado(report.id, estado).subscribe({
      next: (updated) => this.replaceReport(updated),
      error: () => this.errorMessage.set('No se pudo actualizar el estado del reporte.'),
    });
  }

  // --- Update: categoría y descripción (modal) ---
  protected openEdit(report: Report): void {
    this.editing.set(report);
    this.editCategory.set(report.categoria);
    this.editDescripcion.set(report.descripcion);
    this.editError.set(null);
  }

  protected closeEdit(): void {
    this.editing.set(null);
  }

  protected saveEdit(): void {
    const report = this.editing();
    const descripcion = this.editDescripcion().trim();
    if (!report || this.saving()) {
      return;
    }
    if (!descripcion) {
      this.editError.set('La descripción es obligatoria.');
      return;
    }
    this.saving.set(true);
    this.editError.set(null);
    this.reportService.update(report.id, { categoria: this.editCategory(), descripcion }).subscribe({
      next: (updated) => {
        this.replaceReport(updated);
        this.saving.set(false);
        this.closeEdit();
      },
      error: () => {
        this.editError.set('No se pudo guardar el reporte. Intenta nuevamente.');
        this.saving.set(false);
      },
    });
  }

  // --- Delete ---
  protected askDelete(report: Report): void {
    this.deleting.set(report);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected confirmDelete(): void {
    const report = this.deleting();
    if (!report || this.deleteBusy()) {
      return;
    }
    this.deleteBusy.set(true);
    this.reportService.delete(report.id).subscribe({
      next: () => {
        this.reports.update((current) => current.filter((r) => r.id !== report.id));
        this.deleteBusy.set(false);
        this.deleting.set(null);
      },
      error: () => {
        this.errorMessage.set('No se pudo eliminar el reporte.');
        this.deleteBusy.set(false);
        this.deleting.set(null);
      },
    });
  }

  protected logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }

  private replaceReport(updated: Report): void {
    this.reports.update((current) => current.map((r) => (r.id === updated.id ? updated : r)));
  }
}
