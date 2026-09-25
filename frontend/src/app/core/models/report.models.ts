export type ReportCategory = 'BACHE' | 'ZONA_OSCURA' | 'ESCOMBROS' | 'BASURA' | 'OTRO';
export type ReportStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'RESUELTO';

export interface CreateReportRequest {
  categoria: ReportCategory;
  descripcion: string;
  latitud: number;
  longitud: number;
}

export interface UpdateReportRequest {
  categoria: ReportCategory;
  descripcion: string;
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

// Colores de estado, fijos en ambos temas; siempre van acompañados de texto (nunca solo color)
export const REPORT_STATUS_COLORS: Record<ReportStatus, string> = {
  PENDIENTE: '#fab219',
  EN_PROGRESO: '#2a78d6',
  RESUELTO: '#0ca30c',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  RESUELTO: 'Resuelto',
};

// Detalle específico por categoría: chips de un toque para no depender solo de texto libre
export const REPORT_DETAILS: Record<ReportCategory, string[]> = {
  BACHE: ['Pequeño', 'Profundo', 'Cráter grande', 'Con agua'],
  ZONA_OSCURA: ['Poste apagado', 'Sin alumbrado', 'Poca luz', 'Zona insegura'],
  ESCOMBROS: ['Escombros en la vía', 'Material de obra', 'Muebles o colchones', 'Ramas o árboles'],
  BASURA: ['Bolsas en la calle', 'Acumulación', 'Caneca desbordada', 'Punto crítico'],
  OTRO: [],
};

export const REPORT_SEVERITIES: { value: string; label: string; color: string }[] = [
  { value: 'Leve', label: 'Leve', color: '#16a34a' },
  { value: 'Moderado', label: 'Moderado', color: '#fab219' },
  { value: 'Grave', label: 'Grave', color: '#e8702a' },
  { value: 'Bloquea el paso', label: 'Bloquea el paso', color: '#dc2626' },
];
