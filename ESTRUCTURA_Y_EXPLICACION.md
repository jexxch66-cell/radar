# Guía Completa de Arquitectura, Estructura y Código — Proyecto RADAR

Este documento está diseñado para ayudarte a **explicar y sustentar el proyecto hoy** frente a cualquier pregunta sobre arquitectura, tecnologías, seguridad, base de datos o código.

---

## 1. ¿Qué es RADAR y cómo está construido? (Arquitectura General)

**RADAR** es una plataforma web progresiva (**PWA**) de participación ciudadana para reportar y gestionar incidentes urbanos (baches, luminarias dañadas, basura, escombros, seguridad) sobre un mapa interactivo en tiempo real.

Sigue una **Arquitectura Cliente-Servidor de 3 Capas**:

1. **Capa de Presentación (Frontend — `/frontend`):**
   - Desarrollada en **Angular 21** con **TypeScript**, **Tailwind CSS 4** y **Signals** (reactividad moderna sin depender de Zone.js pesado).
   - Mapas interactivos con **Leaflet** + **OpenStreetMap** y geocodificación inversa con **Nominatim**.
   - **PWA (Progressive Web App):** Instalable en escritorio y celular (`manifest.webmanifest` + Service Worker).
   - **Internacionalización (`ES` / `EN`)** y **Tema Claro/Oscuro** reactivos guardados en `localStorage`.

2. **Capa de Lógica de Negocio (Backend — `/backend`):**
   - Desarrollada en **Java 21 / Spring Boot 3.3.4** siguiendo el patrón **Controlador → Servicio → Repositorio → Modelo (MVC / Capas)**.
   - Seguridad con **Spring Security 6** + **JWT (JSON Web Tokens)** + **BCrypt** + **Google OAuth 2.0** + **reCAPTCHA**.
   - Registro de auditoría y eventos con **SLF4J + Logback** en la carpeta `logs/radar-api.log`.

3. **Capa de Datos y Almacenamiento (Base de Datos — `docker-compose.yml`):**
   - **PostgreSQL 16** ejecutándose en contenedor Docker (`radar-db`, puerto `5433` en Docker -> `5432` interno).
   - Mapeo Objeto-Relacional (**ORM**) con **Spring Data JPA / Hibernate**.
   - Respaldos automáticos y manuales (`pg_dump` / `pg_restore`) almacenados localmente o en **Azure Blob Storage**.

---

## 2. Estructura de Carpetas del Proyecto (Qué hay en cada carpeta)

```text
RP/
├── docker-compose.yml               # Levanta PostgreSQL 16 en contenedor Docker
├── README.md                        # Manual de instalación y ejecución local
├── ESTRUCTURA_Y_EXPLICACION.md      # Esta guía de arquitectura y sustentación
├── logs/                            # Carpeta de logs de Spring Boot y bitácora de Sprints
│   ├── radar-api.log                # Archivo de log generado automáticamente por Spring Boot
│   ├── README_LOGS.md               # Explicación del sistema de logs SLF4J / Logback
│   └── SPRINT_LOG.md                # Bitácora detallada de entregas por Sprint
│
├── backend/                         # API REST en Java + Spring Boot
│   ├── pom.xml                      # Dependencias Maven (Spring Web, Security, JPA, PostgreSQL, JJWT, Azure Blob, Lombok)
│   └── src/main/
│       ├── resources/
│       │   └── application.yml      # Configuración de BD, puerto 8080, JWT, Google, CORS, Backups y carpeta logs/
│       └── java/com/radar/api/
│           ├── ApiApplication.java  # Clase principal (@SpringBootApplication y @EnableScheduling)
│           ├── config/              # Configuración de Seguridad, Filtro JWT, Semilla de Admin y Azure Storage
│           ├── controller/          # Endpoints REST (/api/auth, /api/reportes, /api/admin, /api/admin/backups, /api/health)
│           ├── service/             # Lógica de negocio (AuthService, ReportService, BackupService, JwtService...)
│           ├── repository/          # Interfaces JPA que hacen consultas SQL a PostgreSQL
│           ├── model/               # Entidades de BD (@Entity: User, Administrador, Report, BackupSchedule)
│           ├── dto/                 # Objetos de transferencia JSON (request/ y response/)
│           └── exception/           # Manejo centralizado de errores HTTP (GlobalExceptionHandler)
│
└── frontend/                        # Single Page Application (SPA) en Angular 21
    ├── package.json                 # Dependencias npm (Angular, Leaflet, jsPDF, ExcelJS, Tailwind)
    └── src/app/
        ├── app.routes.ts            # Definición de rutas (/bienvenida, /login, /registro, /mapa, /admin)
        ├── app.config.ts            # Configuración global (HttpClient con authInterceptor, Router, ServiceWorker)
        ├── core/
        │   ├── guards/              # Protección de rutas (authGuard, adminGuard, guestGuard)
        │   ├── interceptors/        # authInterceptor: inyecta "Authorization: Bearer <token>" en cada petición
        │   ├── models/              # Interfaces TypeScript (Report, AuthUser, BackupStatus...)
        │   └── services/            # Servicios globales (AuthService, ReportService, BackupService, ThemeService, LanguageService, SessionTimeoutService)
        ├── shared/                  # Componentes reutilizables (LanguageToggle, ThemeToggle, CookieConsent, SessionLock)
        └── features/                # Pantallas del sistema:
            ├── landing/hero/        # Portada con efecto linterna (spotlight)
            ├── auth/                # Login y Registro con Google + reCAPTCHA
            ├── home/                # Mapa interactivo estilo Waze para ciudadanos
            ├── admin/               # Dashboard administrativo (KPIs, gráficas, exportar PDF/Excel, backups)
            └── legal/               # Políticas de privacidad y cookies
```

---

## 3. Explicación de las Funcionalidades Clave (Preguntas Frecuentes del Jurado/Profesor)

### A. ¿Cómo funciona la Seguridad y el Control de Sesión Única (Commit de Jammer `m3ll0www`)?
1. Cuando el usuario inicia sesión (`POST /api/auth/login`), `AuthService` verifica si el usuario ya tiene un `activeSessionId` en PostgreSQL y si su `lastActiveAt` (último latido) ocurrió hace menos de **5 minutos**.
2. Si ya hay una sesión activa en otro navegador, el backend responde con **HTTP `409 Conflict` (`ConcurrentSessionException`)** y el frontend muestra el botón **"Cerrar la otra sesión e ingresar aquí"** (`force: true`).
3. Cuando el login es exitoso, se genera un `sessionId` único (UUID), se guarda en la base de datos y se incrusta dentro del token JWT (claim `"sid"`).
4. Mientras el usuario tiene la pestaña abierta, `SessionTimeoutService` envía un **heartbeat** cada **25 segundos** (`POST /api/auth/heartbeat`) para actualizar `lastActiveAt`.
5. Si el usuario deja de mover el mouse o escribir durante **2.5 minutos** (`150_000 ms`), se muestra la pantalla de bloqueo (`SessionLock`). Si llega a **5 minutos** (`300_000 ms`), se cierra la sesión automáticamente.

### B. ¿Cómo funciona el Botón de Cambio de Idioma (`ES` / `EN`)?
- Se creó el servicio [`LanguageService`](file:///c:/Users/xhop7/OneDrive/Escritorio/RP/frontend/src/app/core/services/language.service.ts) usando **Angular Signals** (`signal<'es' | 'en'>`).
- Al pulsar el botón `<app-language-toggle />` (ubicado junto al botón de tema claro/oscuro en todas las barras de navegación), se invoca `languageService.toggle()`.
- El idioma seleccionado se guarda en `localStorage` (`radar_lang`), actualiza el atributo `<html lang="...">` del navegador y todas las vistas que usan `{{ i18n.t('clave') }}` cambian de idioma instantáneamente sin recargar la página.

### C. ¿Cómo funciona la Carpeta de Logs en Spring Boot?
- En [`application.yml`](file:///c:/Users/xhop7/OneDrive/Escritorio/RP/backend/src/main/resources/application.yml) se configuró `logging.file.name: logs/radar-api.log` junto con una política de rotación (`rollingpolicy`).
- En las clases de servicio del backend (`AuthService`, `ReportService`, `BackupService`) se utiliza la anotación `@Slf4j` de Lombok, que provee el objeto `log`.
- Cada acción importante (`log.info(...)`, `log.warn(...)`) queda registrada con fecha, hora, hilo de ejecución, clase Java y detalle en `logs/radar-api.log`.

