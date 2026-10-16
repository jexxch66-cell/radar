# Carpeta de Logs — RADAR (Spring Boot + Bitácora de Sprints)

Esta carpeta cumple dos propósitos fundamentales dentro del proyecto **RADAR**:

---

## 1. Logs de Ejecución y Auditoría en Spring Boot (`radar-api.log`)

El backend **Spring Boot** utiliza **SLF4J + Logback** (configurado en `backend/src/main/resources/application.yml`) para escribir automáticamente todos los eventos del servidor en archivo físico además de la consola:

- **Archivo activo:** `logs/radar-api.log` (y `backend/logs/radar-api.log` cuando se ejecuta desde `/backend`).
- **Rotación automática (`rollingpolicy`):** Cuando el archivo alcanza **10 MB** o cambia el día, se comprime/archiva automáticamente en `logs/archived/radar-api-YYYY-MM-DD.i.log` conservando hasta **30 días** de historial.

### ¿Qué eventos se registran en el log (`@Slf4j`)?
1. **Arranque del servidor y conexión a PostgreSQL** (`ApiApplication`, `HikariCP`, `Hibernate`).
2. **Auditoría de Autenticación (`AuthService`):**
   - `INFO`: Registro de nuevos ciudadanos (`Nuevo usuario ciudadano registrado`).
   - `INFO`: Inicio de sesión exitoso de Usuarios (`USER`), Administradores (`ADMIN`) y cuentas Google OAuth.
   - `WARN`: Intentos de login fallidos por credenciales incorrectas.
   - `WARN`: Bloqueos por **sesión concurrente** (cuando una cuenta intenta abrirse en dos navegadores al mismo tiempo).
   - `INFO`: Cierres de sesión (`logout`).
3. **Auditoría de Reportes Urbanos (`ReportService`):**
   - `INFO`: Creación de nuevos reportes con su ID, categoría y autor.
   - `INFO`: Cambios de estado (`PENDIENTE` -> `EN_PROGRESO` -> `RESUELTO`).
   - `INFO`: Edición y eliminación de reportes por parte de administradores.
4. **Respaldos de Base de Datos (`BackupService`):**
   - Ejecución de `pg_dump` y `pg_restore` (manuales y programados con `@Scheduled`).

---

## 2. Bitácora de Sprints (`SPRINT_LOG.md`)

En el archivo [`SPRINT_LOG.md`](./SPRINT_LOG.md) dentro de esta misma carpeta se encuentra el registro detallado de las entregas, commits y funcionalidades implementadas por el equipo en cada Sprint.

