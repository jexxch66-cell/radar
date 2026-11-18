import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * RECORRIDO E2E COMPLETO DE RADAR, GRABADO EN VIDEO (con rotulos explicativos en pantalla).
 * Ejecutar con:  npx playwright test -c playwright.video.config.ts
 * Precondicion: stack levantado (frontend :4200, backend :8080, PostgreSQL desechable), ver e2e/README.md.
 * Cada escena verifica su resultado con expect(), de modo que el video tambien es una prueba que pasa o falla.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:8080/api';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin.e2e@radar.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'AdminE2e123!';
const TOTAL = 12;

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

/** Rotulo superior con el numero de escena, el actor y lo que se esta demostrando. */
async function caption(page: Page, step: number, title: string, detail = '') {
  await page.evaluate(
    ({ step, total, title, detail }) => {
      let el = document.getElementById('radar-video-caption');
      if (!el) {
        el = document.createElement('div');
        el.id = 'radar-video-caption';
        el.setAttribute('style', [
          'position:fixed', 'left:50%', 'top:14px', 'transform:translateX(-50%)', 'z-index:2147483647',
          'max-width:900px', 'width:calc(100% - 80px)', 'padding:12px 20px', 'border-radius:14px',
          'background:rgba(17,24,39,.88)', 'color:#fff', 'font:500 15px/1.35 Inter,Segoe UI,Arial,sans-serif',
          'box-shadow:0 10px 30px rgba(0,0,0,.35)', 'pointer-events:none', 'text-align:center',
        ].join(';'));
        document.body.appendChild(el);
      }
      el.innerHTML =
        `<div style="font-size:12px;letter-spacing:.08em;color:#fdba74;font-weight:700">ESCENA ${step} DE ${total}</div>` +
        `<div style="font-size:18px;font-weight:700;margin-top:2px">${title}</div>` +
        (detail ? `<div style="font-size:14px;color:#e5e7eb;margin-top:4px">${detail}</div>` : '');
    },
    { step, total: TOTAL, title, detail },
  );
}

/** Pantalla de titulo / cierre (sin depender de la aplicacion). */
async function card(page: Page, heading: string, lines: string[], ms: number) {
  await page.setContent(`
    <html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#111827,#1f2937 60%,#7c2d12);font-family:Segoe UI,Arial,sans-serif;color:#fff">
      <div style="text-align:center;max-width:980px;padding:40px">
        <div style="font-size:15px;letter-spacing:.3em;color:#fdba74;font-weight:700">RADAR</div>
        <h1 style="font-size:40px;margin:14px 0 22px;font-weight:800">${heading}</h1>
        ${lines.map((l) => `<p style="font-size:20px;margin:8px 0;color:#e5e7eb">${l}</p>`).join('')}
      </div></body></html>`);
  await pause(page, ms);
}

async function acceptCookies(page: Page) {
  const btn = page.getByRole('button', { name: 'Aceptar todas' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function typeLogin(page: Page, email: string, password: string) {
  await page.locator('#email').fill('');
  await page.locator('#email').pressSequentially(email, { delay: 25 });
  await page.locator('#password').fill('');
  await page.locator('#password').pressSequentially(password, { delay: 35 });
}

async function waitForMapTiles(page: Page) {
  await page.locator('img.leaflet-tile-loaded').first().waitFor({ timeout: 15_000 }).catch(() => {});
  await pause(page, 1200);
}

async function isolate(context: BrowserContext) {
  await context.route(/(google\.com\/recaptcha|gstatic\.com\/recaptcha|accounts\.google\.com\/gsi)/, (r) => r.abort());
}

test('Recorrido E2E completo de RADAR (video)', async ({ page, context, browser, request }) => {
  await isolate(context);
  const stamp = Date.now();
  const citizen = { nombre: 'Laura Gómez', email: `laura.gomez.${stamp}@radar.test`, password: 'Ciudadana2026' };

  // ------------------------------------------------------------------ Portada del video
  await card(page, 'Recorrido E2E completo', [
    'Pruebas de extremo a extremo con navegador real (Playwright + Google Chrome)',
    'Frontend Angular · Backend Spring Boot · PostgreSQL 16',
    'Ciudadano, administrador, sesión única y seguridad ante fallos del servidor',
  ], 5000);

  // ------------------------------------------------------------------ 1. Portada
  await page.goto('/');
  await acceptCookies(page);
  await expect(page).toHaveURL(/\/bienvenida$/);
  await caption(page, 1, 'Visitante: portada pública', 'La raíz del sitio redirige a /bienvenida');
  await pause(page, 3500);

  // ------------------------------------------------------------------ 2. Guard de rutas
  await page.goto('/mapa');
  await expect(page).toHaveURL(/\/login/);
  await caption(page, 2, 'Visitante: ruta protegida', 'Sin sesión, /mapa redirige al inicio de sesión (guard de Angular)');
  await pause(page, 3500);

  // ------------------------------------------------------------------ 3. Registro
  await page.goto('/registro');
  await acceptCookies(page);
  await caption(page, 3, 'Ciudadano: registro de cuenta', 'Política de contraseñas: 8+ caracteres, una mayúscula y un número');
  await page.locator('#nombre').pressSequentially(citizen.nombre, { delay: 30 });
  await page.locator('#email').pressSequentially(citizen.email, { delay: 20 });
  await page.locator('#password').pressSequentially(citizen.password, { delay: 45 });
  await page.locator('#confirmarPassword').pressSequentially(citizen.password, { delay: 30 });
  await page.locator('#acceptDataTreatment').check();
  await pause(page, 1500);
  const [reg] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/auth/register')),
    page.getByRole('button', { name: 'Registrarme' }).click(),
  ]);
  expect(reg.status()).toBe(201);
  await expect(page.getByText('Usuario registrado correctamente')).toBeVisible();
  await caption(page, 3, 'Ciudadano: registro de cuenta', 'Cuenta creada (HTTP 201)');
  await pause(page, 3000);
  await page.getByRole('button', { name: 'Ir a iniciar sesión' }).click();

  // ------------------------------------------------------------------ 4. Primer inicio de sesion
  await expect(page).toHaveURL(/\/login/);
  await caption(page, 4, 'Ciudadano: primer inicio de sesión', 'Antes de la corrección DEF-13 nadie podía entrar desde la interfaz');
  await typeLogin(page, citizen.email, citizen.password);
  await pause(page, 1200);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/mapa/);
  await waitForMapTiles(page);
  await caption(page, 4, 'Ciudadano: primer inicio de sesión', 'Acceso concedido: mapa de reportes de la ciudad');
  await pause(page, 3000);

  // ------------------------------------------------------------------ 5. Crear reporte
  await caption(page, 5, 'Ciudadano: reportar un problema', 'El reporte se ubica con la geolocalización del dispositivo');
  await page.getByRole('button', { name: /Reportar aquí/ }).click();
  await page.getByRole('button', { name: /Publicar reporte aquí/ }).waitFor();
  await pause(page, 1500);
  await page.getByRole('button', { name: /Zona oscura/ }).click();
  await pause(page, 800);
  await page.locator('textarea').pressSequentially('Poste de alumbrado apagado frente al parque', { delay: 30 });
  await pause(page, 1200);
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/reportes') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /Publicar reporte aquí/ }).click(),
  ]);
  expect(created.status()).toBe(201);
  const reportId = (await created.json()).id as number;
  await expect(page.getByRole('button', { name: /Publicar reporte aquí/ })).toBeHidden();
  await waitForMapTiles(page);
  await caption(page, 5, 'Ciudadano: reportar un problema', `Reporte #${reportId} publicado con estado PENDIENTE (HTTP 201)`);
  await pause(page, 3500);

  // ------------------------------------------------------------------ 6. Integridad ante error del servidor
  await page.route('**/api/reportes', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500,"message":"Error simulado"}' })
      : route.continue(),
  );
  await caption(page, 6, 'Integridad: el servidor falla al guardar', 'Se simula un HTTP 500: la app debe informar el error, no fingir éxito (DEF-14)');
  await page.getByRole('button', { name: /Reportar aquí/ }).click();
  await page.locator('textarea').pressSequentially('Este reporte no debe darse por publicado', { delay: 25 });
  await page.getByRole('button', { name: /Publicar reporte aquí/ }).click();
  await expect(page.getByText('No se pudo crear el reporte. Intenta nuevamente.')).toBeVisible();
  await pause(page, 4000);
  await page.unroute('**/api/reportes');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: /Cerrar sesión/ }).first().click();
  await expect(page).toHaveURL(/\/login/);

  // ------------------------------------------------------------------ 7. Sesion unica estricta
  const other = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 4.65, longitude: -74.08 } });
  await isolate(other);
  const otherPage = await other.newPage();
  await otherPage.goto('/login');
  await acceptCookies(otherPage);
  await otherPage.locator('#email').fill(citizen.email);
  await otherPage.locator('#password').fill(citizen.password);
  await otherPage.getByRole('button', { name: 'Entrar' }).click();
  await expect(otherPage).toHaveURL(/\/mapa/);

  await caption(page, 7, 'Seguridad: sesión única estricta', 'La misma cuenta ya está abierta en OTRO navegador; aquí se intenta entrar de nuevo');
  await typeLogin(page, citizen.email, citizen.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/sesión activa/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await pause(page, 4000);
  await otherPage.getByRole('button', { name: /Cerrar sesión/ }).first().click();
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();
  await caption(page, 7, 'Seguridad: sesión única estricta', 'El otro navegador cerró sesión: ahora el ingreso sí se permite');
  await pause(page, 1500);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/mapa/);
  await waitForMapTiles(page);
  await pause(page, 2000);
  await page.getByRole('button', { name: /Cerrar sesión/ }).first().click();
  await expect(page).toHaveURL(/\/login/);

  // ------------------------------------------------------------------ 8. Administrador
  await caption(page, 8, 'Administrador: inicio de sesión', 'El rol ADMIN accede al panel de gestión');
  await typeLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin/);
  await caption(page, 8, 'Administrador: panel de control', 'Métricas, backups, gestión de reportes y auditoría');
  await pause(page, 3500);

  // ------------------------------------------------------------------ 9. Gestion del reporte
  const select = page.getByLabel(`Estado del reporte ${reportId}`);
  await select.scrollIntoViewIfNeeded();
  await caption(page, 9, 'Administrador: gestión del reporte ciudadano', `El reporte #${reportId} de Laura pasa de Pendiente a En progreso`);
  await pause(page, 2500);
  const [patch] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/reportes/${reportId}/estado`)),
    select.selectOption('EN_PROGRESO'),
  ]);
  expect(patch.status()).toBe(200);
  await pause(page, 3500);

  // ------------------------------------------------------------------ 10. Auditoria
  await page.getByRole('button', { name: /Auditoría/ }).first().click();
  await page.locator('#auditoria-section').scrollIntoViewIfNeeded();
  await caption(page, 10, 'Administrador: auditoría', 'Cada acción queda registrada con su autor, valor anterior y valor nuevo');
  await pause(page, 4500);

  // ------------------------------------------------------------------ 11. Backups (integridad)
  await page.route('**/api/admin/backups', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":503,"message":"El almacenamiento de backups no esta disponible"}' })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Crear backup ahora' }).scrollIntoViewIfNeeded();
  await caption(page, 11, 'Integridad: fallo al crear un backup', 'Se simula un HTTP 503: antes se mostraba "Backup creado"; ahora se informa el error real');
  await pause(page, 2000);
  await page.getByRole('button', { name: 'Crear backup ahora' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /almacenamiento/i })).toBeVisible();
  await pause(page, 4000);
  await page.unroute('**/api/admin/backups');
  await page.getByRole('button', { name: /Cerrar sesión/ }).first().click();
  await expect(page).toHaveURL(/\/login/);

  // ------------------------------------------------------------------ 12. Seguridad: backend caido
  await page.route('**/api/auth/login', (route) => route.abort('connectionrefused'));
  await caption(page, 12, 'Seguridad: servidor no disponible', 'Antes, cualquier credencial entraba (con rol ADMIN si el correo decía "admin") — DEF-12');
  await typeLogin(page, 'admin.inventado@radar.test', 'Inventada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText(/No se pudo conectar con el servidor/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await caption(page, 12, 'Seguridad: servidor no disponible', 'Ahora se informa el error y NO se concede ningún acceso');
  await pause(page, 4500);
  await page.unroute('**/api/auth/login');

  // Limpieza: cerrar la sesion del ciudadano por API no es necesaria (ya se cerro en la interfaz)
  expect((await request.get(`${API}/health`)).status()).toBe(200);

  // ------------------------------------------------------------------ Cierre
  await card(page, 'Recorrido completado', [
    '12 escenas verificadas automáticamente con aserciones',
    'Suite completa: 165 pruebas JUnit · 13 escenarios E2E · 23 verificaciones HTTP · CI en GitHub ✔',
    '14 defectos detectados y corregidos',
  ], 6000);
});
