// Modelos TypeScript para la sección de Auditoría e Historial de Cambios en el panel de administrador

// Módulos del sistema sobre los cuales se registran eventos de auditoría
export type AuditModule =
  | 'REPORTES'
  | 'BACKUPS'
  | 'ADMINISTRADORES'
  | 'SEGURIDAD'
  | 'EXPORTACIONES';

// Tipos de acción registrados en el historial de auditoría
export type AuditAction =
  | 'CREACION'
  | 'CAMBIO_ESTADO'
  | 'EDICION'
  | 'ELIMINACION'
  | 'BACKUP'
  | 'RESTAURACION'
  | 'EXPORTACION'
  | 'ACCESO';

// Estructura de cada registro individual en el reporte/historial de auditoría
export interface AuditEntry {
  id: string;
  createdAt: string;       // Fecha y hora ISO del cambio
  usuario: string;         // Nombre o correo de quien ejecutó el cambio
  rol: string;             // Rol del actor: 'ADMIN' | 'CIUDADANO' | 'SISTEMA'
  modulo: AuditModule;     // Módulo del sistema afectado
  accion: AuditAction;     // Acción realizada
  entidad: string;         // Recurso afectado (ej. 'Reporte #12', 'Backup PostgreSQL')
  valorAnterior: string;   // Valor o estado antes del cambio
  valorNuevo: string;      // Valor o estado después del cambio
  detalle: string;         // Descripción completa de la operación para el reporte
}

// Etiquetas legibles y colores para cada tipo de acción de auditoría
export const AUDIT_ACTION_META: Record<
  AuditAction,
  { label: string; labelEn: string; color: string; bg: string }
> = {
  CREACION: {
    label: 'Creación',
    labelEn: 'Created',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.14)',
  },
  CAMBIO_ESTADO: {
    label: 'Cambio de estado',
    labelEn: 'Status change',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.14)',
  },
  EDICION: {
    label: 'Edición',
    labelEn: 'Edited',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.14)',
  },
  ELIMINACION: {
    label: 'Eliminación',
    labelEn: 'Deleted',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.14)',
  },
  BACKUP: {
    label: 'Backup BD',
    labelEn: 'DB Backup',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.14)',
  },
  RESTAURACION: {
    label: 'Restauración BD',
    labelEn: 'DB Restore',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.14)',
  },
  EXPORTACION: {
    label: 'Reporte exportado',
    labelEn: 'Report exported',
    color: '#e8702a',
    bg: 'rgba(232, 112, 42, 0.14)',
  },
  ACCESO: {
    label: 'Acceso / Sesión',
    labelEn: 'Access / Session',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.14)',
  },
};
