# Bitácora de Sprints (Sprint Log) — Proyecto RADAR

Registro cronológico de funcionalidades, arquitectura y commits desarrollados por el equipo en el repositorio `radar`.

---

## Sprint 1: Arquitectura Base, Mapa Interactivo y Despliegue Cloud
- **Commit `07182cb`:** Inicialización del monorepo con **Angular 21** (Frontend) + **Spring Boot 3.3** (Backend) + **PostgreSQL 16**.
- **Commit `def8fa3` / `25bccc1` / `e33362d`:** Configuración de Dockerfiles, despliegue en Render (Backend) y Vercel (Frontend), y configuración dinámica de CORS.
- **Entregables:**
  - Modelo de datos inicial (`User`, `Report`, `ReportCategory`, `ReportStatus`).
  - Mapa interactivo con **Leaflet** y OpenStreetMap.
  - Autenticación sin estado (**JWT** con firma HMAC-SHA256 y contraseñas cifradas con **BCrypt**).

---

## Sprint 2: Panel de Administración, Consentimientos Legales, Google OAuth y Geolocalización Waze
- **Commit `6cae3f2`:** Creación del **Panel de Administración** (`/admin`), autenticación de administradores (`Administrador`, `AdminSeeder`) y selector de **Tema Claro / Oscuro** (`ThemeService`).
- **Commit `9e4a6a9`:** Orquestación local con `docker-compose.yml` para PostgreSQL y documentación de instalación.
- **Commit `7b72963` / `d39b94d` / `19eeaef`:** Integración de **Google Identity Services (OAuth 2.0)**, protección contra bots con **Google reCAPTCHA v3**, banner de **Política de Cookies** y casilla obligatoria de **Tratamiento de Datos Personales**.
- **Commit `f43078f`:** Flujo de reportes estilo **Waze** con geolocalización GPS en vivo (`watchPosition`), geocodificación inversa (Nominatim OSM), subcategorías detalladas y niveles de gravedad.

---

## Sprint 3: Seguridad de Sesión, PWA, Exportación de Reportes, Backups e Internacionalización (i18n + Logs)
- **Commit `35c5d70`:** Bloqueo automático de pantalla por inactividad a los 2.5 minutos (`SessionLock`) y cierre automático de sesión a los 5 minutos (`SessionTimeoutService`).
- **Commit `abac040` (`m3ll0www`):**
  - Exportación de reportes filtrados en **PDF** (`jspdf` + `jspdf-autotable`) y **Excel** (`exceljs`) desde el panel de administración.
  - Soporte **PWA (Progressive Web App)** con `manifest.webmanifest` y Service Worker (`ngsw-config.json`) para instalar RADAR en escritorio y móvil.
- **Commit `d332d68` / `76c76d7` / `d0c808a` (`m3ll0www` / `M3110ww`):**
  - **Control de Sesión Única Activa:** Impide que una misma cuenta tenga sesiones abiertas en dos navegadores simultáneamente (HTTP `409 Conflict`), usando un identificador de sesión (`sid`) dentro del JWT, **heartbeat cada 25 segundos** (`/api/auth/heartbeat`), liberación al hacer logout y sincronización multi-pestaña con `BroadcastChannel`.
  - **Módulo de Backups de Base de Datos (`BackupController`, `BackupService`):** Generación manual y programada (`@Scheduled`) de copias de seguridad de PostgreSQL (`pg_dump` / `pg_restore`) con soporte para almacenamiento local y **Azure Blob Storage**.
- **Nuevas Funciones Integradas:**
  - **Botón de Cambio de Idioma (`ES` / `EN`):** Servicio reactivo `LanguageService` y componente `<app-language-toggle />` persistido en `localStorage`.
  - **Carpeta de Logs en Spring Boot (`logs/`):** Configuración de **SLF4J + Logback** con rotación de archivos en `logs/radar-api.log` y trazabilidad de auditoría (`@Slf4j`) en servicios críticos.

