export type ReportCategory = 'BACHE' | 'ZONA_OSCURA' | 'ESCOMBROS' | 'BASURA' | 'OTRO';
export type ReportStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'RESUELTO';

export interface CreateReportRequest {
  categoria: ReportCategory;
  descripcion: string;
  latitud: number;
  longitud: number;
}

// Espejo del ReportResponse del backend
export interface Report {
  id: number;
  categoria: ReportCategory;
  descripcion: string;
  latitud: number;
  longitud: number;
  estado: ReportStatus;
  autorId: number;
  autorNombre: string;
  createdAt: string;
}

export const REPORT_CATEGORIES: { value: ReportCategory; label: string; color: string; icon: string }[] = [
  { value: 'BACHE', label: 'Bache', color: '#e8702a', icon: '🕳️' },
  { value: 'ZONA_OSCURA', label: 'Zona oscura', color: '#6366f1', icon: '💡' },
  { value: 'ESCOMBROS', label: 'Escombros', color: '#a16207', icon: '🧱' },
  { value: 'BASURA', label: 'Basura', color: '#16a34a', icon: '🗑️' },
  { value: 'OTRO', label: 'Otro', color: '#6b7280', icon: '📍' },
];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  RESUELTO: 'Resuelto',
};
