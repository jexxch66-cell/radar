// Importamos los decoradores y utilidades reactivas de Angular (Injectable, signal, computed, effect)
import { Injectable, computed, effect, signal } from '@angular/core';

// Definimos el tipo de idiomas soportados por la aplicación: Español ('es') e Inglés ('en')
export type Language = 'es' | 'en';

// Clave utilizada para guardar la preferencia de idioma en el navegador (localStorage)
const LANG_KEY = 'radar_lang';

// Diccionario centralizado con todas las traducciones de la interfaz en Español e Inglés
const TRANSLATIONS = {
  es: {
    // Barra de navegación y Landing (Hero)
    'nav.map': 'Mapa',
    'nav.howItWorks': 'Cómo funciona',
    'nav.community': 'Comunidad',
    'nav.plans': 'Planes',
    'nav.login': 'Iniciar sesión',
    'nav.register': 'Registrarse',
    'nav.back': '← Volver',
    'nav.backToPanel': '← Volver al panel',
    'nav.logout': 'Cerrar sesión',
    'hero.titleLine1': 'Lo que ves,',
    'hero.titleLine2': 'repórtalo ahora',
    'hero.leftText': 'Cada reporte que envías se suma a un mapa vivo de tu ciudad: baches, zonas oscuras, escombros y basura, visibles para todos.',
    'hero.rightText': 'Nuestro mapa interactivo conecta a vecinos y autoridades para priorizar arreglos donde más se necesitan, barrio por barrio.',
    'hero.cta': 'Empieza a reportar',

    // Login
    'login.title': 'Bienvenido de nuevo',
    'login.subtitle': 'Ingresa para ver y reportar lo que pasa en tu ciudad.',
    'login.sessionExpired': 'Tu sesión se cerró porque se inició sesión en otro navegador. Vuelve a ingresar para continuar.',
    'login.orEmail': 'o continúa con tu email',
    'login.email': 'Email',
    'login.password': 'Contraseña',
    'login.forceBtn': 'Cerrar la otra sesión e ingresar aquí',
    'login.submitting': 'Ingresando…',
    'login.submit': 'Entrar',
    'login.noAccount': '¿No tienes cuenta?',
    'login.registerLink': 'Regístrate',

    // Registro
    'register.title': 'Crea tu cuenta',
    'register.subtitle': 'Únete y empieza a reportar lo que pasa en tu ciudad.',
    'register.consentText': 'Acepto el tratamiento de mis datos personales para gestionar mi cuenta y usar RADAR.',
    'register.privacyLink': 'Ver política de privacidad',
    'register.name': 'Nombre',
    'register.namePlaceholder': 'Tu nombre',
    'register.confirmPassword': 'Confirmar contraseña',
    'register.submitting': 'Creando cuenta…',
    'register.submit': 'Registrarme',
    'register.hasAccount': '¿Ya tienes cuenta?',
    'register.loginLink': 'Inicia sesión',
    'register.successTitle': 'Usuario registrado correctamente',
    'register.successSubtitle': 'Ya puedes iniciar sesión con tu nueva cuenta.',
    'register.close': 'Cerrar',
    'register.goToLogin': 'Ir a iniciar sesión',

    // Mapa (Home)
    'map.loading': 'Cargando reportes…',
    'map.locPending': 'Buscando tu ubicación… acepta el permiso del navegador',
    'map.locDenied': 'Ubicación bloqueada: actívala en el candado de la barra de direcciones.',
    'map.locUnavailable': 'No se pudo obtener tu ubicación.',
    'map.retry': 'Reintentar',
    'map.myLocation': 'Mi ubicación',
    'map.reportHere': 'Reportar aquí',
    'map.touchMap': 'Toca el mapa donde está el problema',
    'map.whatFound': '¿Qué encontraste?',
    'map.searchingAddress': 'Buscando dirección…',
    'map.noLocation': 'Sin ubicación todavía',
    'map.move': 'Mover',
    'map.myPosition': 'Mi posición',
    'map.detail': 'Detalle',
    'map.severity': 'Gravedad',
    'map.notePlaceholder': 'Nota opcional (referencia, color, tamaño…)',
    'map.sending': 'Enviando…',
    'map.publish': 'Publicar reporte aquí',
    'map.reportedBy': 'Reportado por',

    // Panel de Administración
    'admin.title': 'RADAR · Administrador',
    'admin.viewMap': 'Ver mapa',
    'admin.newAdmin': '+ Nuevo administrador',
    'admin.loading': 'Cargando reportes…',
    'admin.totalReports': 'Total de reportes',
    'admin.ofTotal': '% del total',
    'admin.backupsTitle': 'Backups de la base de datos',
    'admin.refreshStatus': 'Actualizar estado',
    'admin.refreshing': 'Actualizando…',
    'admin.byCategory': 'Reportes por categoría',
    'admin.byStatus': 'Estado de los reportes',
    'admin.manageReports': 'Gestión de reportes',
    'admin.exportPdf': 'Exportar PDF',
    'admin.exportExcel': 'Exportar Excel',
    'admin.searchPlaceholder': 'Buscar descripción o autor…',
    'admin.allCategories': 'Todas las categorías',
    'admin.allStatuses': 'Todos los estados',
    'admin.edit': 'Editar',
    'admin.delete': 'Eliminar',
    'admin.auditNav': 'Auditoría',
    'admin.auditTitle': 'Auditoría · Historial de cambios y reporte de actividad',
    'admin.auditSubtitle': 'Registro trazable de quién hizo cada acción, qué cambió (antes y después) y cuándo ocurrió.',
    'admin.auditExportPdf': 'Reporte Auditoría PDF',
    'admin.auditExportExcel': 'Reporte Auditoría Excel',
    'admin.auditSearch': 'Buscar usuario, reporte o detalle…',
    'admin.auditAllModules': 'Todos los módulos',
    'admin.auditAllActions': 'Todas las acciones',
    'admin.auditTotalEvents': 'Eventos registrados',
    'admin.auditStatusChanges': 'Cambios de estado',
    'admin.auditEditsDeletes': 'Ediciones y bajas',
    'admin.auditBackupsExports': 'Backups y reportes',
    'admin.auditColDate': 'Fecha / Hora',
    'admin.auditColUser': 'Usuario / Rol',
    'admin.auditColModule': 'Módulo',
    'admin.auditColAction': 'Acción',
    'admin.auditColEntity': 'Recurso',
    'admin.auditColChange': 'Cambio realizado (Antes → Después)',
    'admin.auditColDetail': 'Detalle del movimiento',

    // Nuevo Administrador
    'adminNew.title': 'Nuevo administrador',
    'adminNew.subtitle': 'Crea acceso de administrador para otra persona del equipo.',
    'adminNew.submit': 'Crear administrador',
    'adminNew.submitting': 'Creando…',

    // PWA
    'pwa.install': 'Instalar RADAR',
    'pwa.understood': 'Entendido',
  },
  en: {
    // Navbar & Landing (Hero)
    'nav.map': 'Map',
    'nav.howItWorks': 'How it works',
    'nav.community': 'Community',
    'nav.plans': 'Plans',
    'nav.login': 'Sign in',
    'nav.register': 'Sign up',
    'nav.back': '← Back',
    'nav.backToPanel': '← Back to dashboard',
    'nav.logout': 'Log out',
    'hero.titleLine1': 'What you see,',
    'hero.titleLine2': 'report it now',
    'hero.leftText': 'Every report you send joins a living map of your city: potholes, dark zones, debris, and trash, visible to everyone.',
    'hero.rightText': 'Our interactive map connects neighbors and authorities to prioritize fixes where they are needed most, neighborhood by neighborhood.',
    'hero.cta': 'Start reporting',

    // Login
    'login.title': 'Welcome back',
    'login.subtitle': 'Sign in to view and report what is happening in your city.',
    'login.sessionExpired': 'Your session was closed because you signed in on another browser. Please sign in again to continue.',
    'login.orEmail': 'or continue with your email',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.forceBtn': 'Close other session and sign in here',
    'login.submitting': 'Signing in…',
    'login.submit': 'Sign in',
    'login.noAccount': "Don't have an account?",
    'login.registerLink': 'Sign up',

    // Register
    'register.title': 'Create your account',
    'register.subtitle': 'Join and start reporting what happens in your city.',
    'register.consentText': 'I accept the processing of my personal data to manage my account and use RADAR.',
    'register.privacyLink': 'View privacy policy',
    'register.name': 'Name',
    'register.namePlaceholder': 'Your name',
    'register.confirmPassword': 'Confirm password',
    'register.submitting': 'Creating account…',
    'register.submit': 'Sign up',
    'register.hasAccount': 'Already have an account?',
    'register.loginLink': 'Sign in',
    'register.successTitle': 'User registered successfully',
    'register.successSubtitle': 'You can now sign in with your new account.',
    'register.close': 'Close',
    'register.goToLogin': 'Go to sign in',

    // Map (Home)
    'map.loading': 'Loading reports…',
    'map.locPending': 'Finding your location… please allow browser permission',
    'map.locDenied': 'Location blocked: enable it in the address bar lock icon.',
    'map.locUnavailable': 'Could not obtain your location.',
    'map.retry': 'Retry',
    'map.myLocation': 'My location',
    'map.reportHere': 'Report here',
    'map.touchMap': 'Tap the map where the issue is located',
    'map.whatFound': 'What did you find?',
    'map.searchingAddress': 'Searching address…',
    'map.noLocation': 'No location yet',
    'map.move': 'Move',
    'map.myPosition': 'My position',
    'map.detail': 'Detail',
    'map.severity': 'Severity',
    'map.notePlaceholder': 'Optional note (landmark, color, size…)',
    'map.sending': 'Sending…',
    'map.publish': 'Publish report here',
    'map.reportedBy': 'Reported by',

    // Admin Dashboard
    'admin.title': 'RADAR · Administrator',
    'admin.viewMap': 'View map',
    'admin.newAdmin': '+ New administrator',
    'admin.loading': 'Loading reports…',
    'admin.totalReports': 'Total reports',
    'admin.ofTotal': '% of total',
    'admin.backupsTitle': 'Database backups',
    'admin.refreshStatus': 'Refresh status',
    'admin.refreshing': 'Refreshing…',
    'admin.byCategory': 'Reports by category',
    'admin.byStatus': 'Report status',
    'admin.manageReports': 'Report management',
    'admin.exportPdf': 'Export PDF',
    'admin.exportExcel': 'Export Excel',
    'admin.searchPlaceholder': 'Search description or author…',
    'admin.allCategories': 'All categories',
    'admin.allStatuses': 'All statuses',
    'admin.edit': 'Edit',
    'admin.delete': 'Delete',
    'admin.auditNav': 'Audit Log',
    'admin.auditTitle': 'Audit · Change history and activity report',
    'admin.auditSubtitle': 'Traceable record of who performed each action, what changed (before & after), and when it happened.',
    'admin.auditExportPdf': 'Audit Report PDF',
    'admin.auditExportExcel': 'Audit Report Excel',
    'admin.auditSearch': 'Search user, report, or detail…',
    'admin.auditAllModules': 'All modules',
    'admin.auditAllActions': 'All actions',
    'admin.auditTotalEvents': 'Recorded events',
    'admin.auditStatusChanges': 'Status changes',
    'admin.auditEditsDeletes': 'Edits & deletions',
    'admin.auditBackupsExports': 'Backups & exports',
    'admin.auditColDate': 'Date / Time',
    'admin.auditColUser': 'User / Role',
    'admin.auditColModule': 'Module',
    'admin.auditColAction': 'Action',
    'admin.auditColEntity': 'Resource',
    'admin.auditColChange': 'Change made (Before → After)',
    'admin.auditColDetail': 'Activity detail',

    // Admin Register
    'adminNew.title': 'New administrator',
    'adminNew.subtitle': 'Create administrator access for another team member.',
    'adminNew.submit': 'Create administrator',
    'adminNew.submitting': 'Creating…',

    // PWA
    'pwa.install': 'Install RADAR',
    'pwa.understood': 'Got it',
  },
} as const;

// Tipo que representa todas las claves válidas del diccionario de traducciones
export type TranslationKey = keyof typeof TRANSLATIONS.es;

// Servicio global (singleton) que administra el idioma activo de la aplicación
@Injectable({ providedIn: 'root' })
export class LanguageService {
  // Signal reactivo que guarda el idioma actual ('es' o 'en') leyendo primero de localStorage
  readonly lang = signal<Language>(this.readInitialLanguage());

  // Signal computado que expone el diccionario correspondiente al idioma activo
  readonly dictionary = computed(() => TRANSLATIONS[this.lang()]);

  constructor() {
    // Efecto reactivo: cada vez que cambia el idioma, actualiza el atributo lang del <html> y lo guarda en localStorage
    effect(() => {
      const current = this.lang();
      if (typeof document !== 'undefined') {
        document.documentElement.lang = current;
      }
      try {
        localStorage.setItem(LANG_KEY, current);
      } catch {
        // Si el navegador bloquea localStorage, el cambio sigue funcionando en memoria
      }
    });
  }

  // Alterna entre español ('es') e inglés ('en') al hacer clic en el botón de idioma
  toggle(): void {
    this.lang.update((current) => (current === 'es' ? 'en' : 'es'));
  }

  // Devuelve el texto traducido según la clave solicitada y el idioma activo
  t(key: TranslationKey): string {
    return this.dictionary()[key] ?? key;
  }

  // Lee el idioma guardado en localStorage o usa español ('es') por defecto
  private readInitialLanguage(): Language {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored === 'es' || stored === 'en') {
        return stored;
      }
    } catch {
      // Ignorar errores de acceso a localStorage
    }
    return 'es';
  }
}

