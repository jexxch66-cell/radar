# Pruebas E2E de RADAR (Playwright)

Pruebas de extremo a extremo con navegador real sobre el stack completo. Usan el **Google Chrome instalado** (no descargan navegadores).

## 1. Base de datos desechable (no toca la base de desarrollo)

```bash
docker run -d --rm --name radar-e2e-db -p 5440:5432 \
  -e POSTGRES_DB=radar_e2e -e POSTGRES_USER=radar_e2e -e POSTGRES_PASSWORD=e2e_only_local postgres:16
```

## 2. Backend apuntando a esa base (desde `backend/`)

```bash
DB_PORT=5440 DB_NAME=radar_e2e DB_USERNAME=radar_e2e DB_PASSWORD=e2e_only_local DB_SSLMODE=disable \
RECAPTCHA_ENABLED=false JWT_SECRET=<clave-local-de-al-menos-48-caracteres> \
ADMIN_DEFAULT_EMAIL=admin.e2e@radar.test ADMIN_DEFAULT_PASSWORD=<clave-de-prueba> \
LOG_FILE_PATH=../e2e/.run/backend-e2e.log BACKUP_LOCAL_DIRECTORY=../e2e/.run/backups \
./mvnw spring-boot:run
```

## 3. Frontend (desde `frontend/`)

```bash
npx ng serve --port 4200
```

## 4. Ejecutar (desde `e2e/`)

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
E2E_ADMIN_EMAIL=admin.e2e@radar.test E2E_ADMIN_PASSWORD=<clave-de-prueba> npx playwright test
```

Las capturas se guardan en `docs/evidencias/02-e2e/capturas/` y el reporte HTML en `e2e/reports/html/`.

### Si los puertos 8080/4200 están ocupados por el entorno de desarrollo

Arranca el backend con `PORT=8081` y el frontend con `npx ng serve --port 4201`, y ejecuta:

```bash
E2E_BASE_URL=http://localhost:4201 E2E_API_URL=http://localhost:8081/api \
E2E_API_REWRITE=http://localhost:8081 npx playwright test
```

`E2E_API_REWRITE` redirige en el navegador las llamadas que el frontend hace a `localhost:8080` hacia el backend de pruebas. `E2E_SHOTS_DIR` cambia la carpeta de capturas.

## Otros scripts

- `npm run validate:workflow`: validación estática de `.github/workflows/ci.yml`.
- `npm run report:pdf`: genera `docs/INFORME_PRUEBAS_RADAR.pdf` a partir de `docs/INFORME_PRUEBAS_RADAR.md`.
- `npm run report:docx`: genera `docs/INFORME_PRUEBAS_RADAR_v2.docx` (APA 7) a partir de `docs/INFORME_PRUEBAS_RADAR_v2.md`. Al abrirlo, Word ofrece actualizar la tabla de contenido.
