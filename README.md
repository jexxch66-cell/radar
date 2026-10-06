# RADAR

Angular (frontend) + Spring Boot (backend) + PostgreSQL.

## Requisitos

- Git
- Java 25 (`java -version`)
- Maven 3.9+ (`mvn -v`)
- Node 20+ y npm (`node -v`)
- Docker Desktop (para la base de datos) **o** PostgreSQL instalado a mano

## Levantar en local

Abrir 3 terminales en la raíz del proyecto.

### 1. Base de datos

```bash
docker compose up -d
```

Crea PostgreSQL en `localhost:5433` con base `radar_db`, usuario `radar_user`, contraseña `changeme_local_dev`
(son los valores por defecto del backend, no hay que configurar nada).

Sin Docker: instalar PostgreSQL y crear la base y el usuario:

```sql
CREATE USER radar_user WITH PASSWORD 'changeme_local_dev';
CREATE DATABASE radar_db OWNER radar_user;
```

Al usar PostgreSQL instalado localmente en el puerto predeterminado, inicia el backend con `DB_PORT=5432`.

### 2. Backend (http://localhost:8080)

```bash
cd backend
mvn spring-boot:run
```

Las tablas se crean solas. También se crea un admin por defecto:
`admin@radar.com` / `Admin123!`

Cada usuario y administrador mantiene una sola sesión activa. Al iniciar sesión en otro navegador, se invalidan los tokens anteriores; el navegador anterior cierra sesión al hacer su siguiente petición protegida.

### Google, CAPTCHA y consentimientos

El login con Google usa Google Identity Services y el backend valida el `id_token` antes de emitir el JWT de RADAR. Para activarlo, registra una aplicación web en Google Cloud Console y configura su Client ID en los archivos de entorno del frontend:

```ts
googleClientId: 'TU_CLIENT_ID.apps.googleusercontent.com'
recaptchaSiteKey: 'TU_SITE_KEY'
```

En el backend configura las mismas credenciales mediante variables de entorno:

```text
GOOGLE_CLIENT_ID=TU_CLIENT_ID.apps.googleusercontent.com
RECAPTCHA_ENABLED=true
RECAPTCHA_SECRET_KEY=TU_SECRET_KEY
```

Durante desarrollo local `RECAPTCHA_ENABLED` permanece desactivado. La casilla de tratamiento de datos es obligatoria al crear una cuenta y el banner de cookies guarda la elección en `localStorage`.

### Backups desde el dashboard del administrador

El dashboard permite crear un backup manual, configurar un intervalo automático de 1 a 8760 horas y restaurar el backup más reciente. Los backups son volcados de PostgreSQL (`pg_dump` en formato custom). Si Azure Blob Storage está configurado se guardan en un contenedor privado; de lo contrario, el modo local los persiste en `%USERPROFILE%\\.radar\\backups` (Windows) o `$HOME/.radar/backups` (Linux/macOS). El modo local es útil para desarrollo, pero no protege ante la pérdida del servidor. La restauración pide escribir `RESTAURAR` y, antes de reemplazar la base de datos, genera automáticamente una copia adicional del estado actual.

Para backups externos, configura `AZURE_STORAGE_CONNECTION_STRING` como variable secreta del entorno del backend y, opcionalmente, `AZURE_STORAGE_BACKUP_CONTAINER` (por defecto `radar-backups`). No guardes esa conexión en el repositorio ni en los backups. Se puede cambiar la carpeta local con `BACKUP_LOCAL_DIRECTORY`. En desarrollo, `BACKUP_DOCKER_CONTAINER` usa por defecto `radar-db` y ejecuta las utilidades PostgreSQL del contenedor de `docker-compose.yml`, sin instalarlas en Windows. Si usas PostgreSQL nativo, establece esa variable vacía y asegúrate de tener `pg_dump` y `pg_restore` en `PATH` o configura `BACKUP_PG_DUMP_PATH` y `BACKUP_PG_RESTORE_PATH`. La imagen Docker de producción desactiva el modo de contenedor y ya instala `postgresql-client`.

Los backups cubren la base de datos (reportes, usuarios y administradores); el proyecto actualmente no almacena archivos subidos. Código y configuración de despliegue se recuperan mediante el control de versiones y el proceso normal de despliegue.

### 3. Frontend (http://localhost:4200)

```bash
cd frontend
npm install
npm start
```

### Instalar RADAR como aplicación de escritorio

La versión de producción incluye manifest y service worker. Publica el frontend por HTTPS (Render/Vercel) y abre el sitio en Chrome o Edge; usa el botón **Instalar RADAR** o la opción **Instalar aplicación** del menú del navegador. En desarrollo, `ng serve` funciona en `localhost`, pero el service worker solo se activa en el build de producción.

## Problemas comunes

| Error | Causa / solución |
|---|---|
| `Connection to localhost:5432 refused` | La base no está corriendo. Ejecutar `docker compose up -d` (y abrir Docker Desktop). |
| `password authentication failed` | El usuario/contraseña de Postgres no coincide con los de arriba. |
| `Port 8080 already in use` | Cerrar el proceso que usa el puerto 8080, o `set PORT=8081` antes de correr el backend. |
| `release version 25 not supported` | Instalar Java 25. |

## Flujo de trabajo en equipo

- No trabajar directo sobre `main`. Crear una rama: `git checkout -b feature/lo-que-hago`.
- Commits pequeños y `git push -u origin feature/lo-que-hago`.
- Abrir Pull Request en GitHub y pedir revisión antes de mezclar.
- Antes de empezar a trabajar: `git pull`.

## Producción

Backend en Render (`render.yaml`) y frontend en Vercel. No tocar la configuración de producción sin avisar al equipo.
