import { defineConfig } from '@playwright/test';

/**
 * Configuracion para GRABAR el recorrido E2E completo de RADAR en video (tests/*.video.spec.ts).
 * Se ejecuta aparte de la suite normal:  npx playwright test -c playwright.video.config.ts
 * El video queda en test-results/ (WebM 1280x720).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.video.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: './test-results-video',
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    locale: 'es-CO',
    geolocation: { latitude: 4.6534, longitude: -74.0836 },
    permissions: ['geolocation'],
    launchOptions: { slowMo: 120 },
  },
});
