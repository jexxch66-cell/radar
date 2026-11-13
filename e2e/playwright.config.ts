import { defineConfig } from '@playwright/test';

/**
 * E2E de RADAR con navegador real sobre el stack completo:
 * Angular (ng serve :4200) -> Spring Boot (:8080) -> PostgreSQL desechable.
 * Usa el Google Chrome instalado en la maquina (channel 'chrome'), sin descargar navegadores.
 * Ver e2e/README.md para levantar el entorno.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: './test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: './reports/resultados-e2e.json' }],
    ['html', { outputFolder: './reports/html', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 1366, height: 800 },
    locale: 'es-CO',
    // Bogota (coordenadas fijas para que el reporte se ubique de forma determinista)
    geolocation: { latitude: 4.6534, longitude: -74.0836 },
    permissions: ['geolocation'],
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
});
