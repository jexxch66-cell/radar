import { test, expect, type Page, type BrowserContext, type APIRequestContext } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Escenarios E2E de RADAR (especificacion vigente: commit e9e1021).
 * Actores: Visitante, Ciudadano (USER) y Administrador (ADMIN).
 * Reglas relevantes: politica de contrasenas (8+ caracteres, una mayuscula y un numero) y sesion unica ESTRICTA
 * (no existe "forzar ingreso": una segunda sesion se rechaza hasta que la primera cierra sesion o expira).
 * Precondicion: stack levantado segun e2e/README.md, con el administrador semilla configurado en
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (valores locales de prueba, nunca credenciales reales).
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:8080/api';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin.e2e@radar.test';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'AdminE2e123!';
const SHOTS = process.env.E2E_SHOTS_DIR ?? '../docs/evidencias/02-e2e/capturas';
mkdirSync(SHOTS, { recursive: true });

let seq = 0;
const unique = (p: string) => `${p}.${Date.now()}${++seq}@radar.test`;
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

/**
 * Aisla la prueba: bloquea servicios externos de Google (reCAPTCHA / Identity) para que sea determinista y,
 * si se define E2E_API_REWRITE (p. ej. http://localhost:8081), redirige las llamadas que el frontend hace a
 * localhost:8080 hacia el backend de pruebas. Asi el E2E no toca un backend de desarrollo que ocupe el 8080.
 */
async function blockGoogle(context: BrowserContext) {
  await context.route(/(google\.com\/recaptcha|gstatic\.com\/recaptcha|accounts\.google\.com\/gsi)/, (r) => r.abort());
  const target = process.env.E2E_API_REWRITE;
  if (target) {
    await context.route('http://localhost:8080/**', async (route) => {
      const response = await route.fetch({ url: route.request().url().replace('http://localhost:8080', target) });
      await route.fulfill({ response });
    });
  }
}

/** Espera (sin fallar) a que el mapa muestre teselas, para que las capturas de evidencia sean legibles. */
async function waitForMapTiles(page: Page) {
  await page.locator('img.leaflet-tile-loaded').first().waitFor({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function acceptCookies(page: Page) {
  const btn = page.getByRole('button', { name: 'Aceptar todas' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

async function uiLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await acceptCookies(page);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Crea un ciudadano por API (registro -> login) y devuelve su token; la sesion se cierra con apiLogout. */
async function apiCitizen(request: APIRequestContext, prefix: string, password = 'Ciudadano123') {
  const email = unique(prefix);
  const reg = await request.post(`${API}/auth/register`, {
    data: { nombre: `Ciudadano ${prefix}`, email, password, acceptDataTreatment: true },
  });
  expect(reg.status(), 'registro por API').toBe(201);
  const login = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(login.status(), 'login por API').toBe(200);
  return { email, password, token: (await login.json()).token as string };
}

async function apiLogout(request: APIRequestContext, token: string) {
  await request.post(`${API}/auth/logout`, { headers: { Authorization: `Bearer ${token}` } });
}

/** Token de la pestana: el frontend lo guarda en sessionStorage bajo 'radar_token'. */
const tabToken = (page: Page) => page.evaluate(() => sessionStorage.getItem('radar_token'));

test.beforeEach(async ({ context }) => {
  await blockGoogle(context);
});

test('E2E-01 Visitante: la portada carga y la ruta raiz redirige a /bienvenida', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/bienvenida$/);
  await expect(page.getByText('RADAR').first()).toBeVisible();
  await shot(page, 'E2E-01-portada');
});

test('E2E-02 Visitante: una ruta protegida (/mapa) redirige a /login', async ({ page }) => {
  await page.goto('/mapa');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('#email')).toBeVisible();
  await shot(page, 'E2E-02-guard-redirige-login');
});

test('E2E-03 Visitante: ruta inexistente muestra la pagina 404 del frontend', async ({ page }) => {
  await page.goto('/ruta-que-no-existe');
  await expect(page.getByText(/404|no encontr/i).first()).toBeVisible();
  await shot(page, 'E2E-03-pagina-404');
});

test('E2E-04 Login con credenciales invalidas muestra el mensaje de error del backend', async ({ page }) => {
  await uiLogin(page, 'nadie.e2e@radar.test', 'Incorrecta123');
  await expect(page.getByText('Email o contrasena invalidos')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await shot(page, 'E2E-04-login-invalido');
});

test('E2E-05 Ciudadano: registro por la interfaz y primer inicio de sesion llega al mapa', async ({ page }) => {
  const email = unique('e2e.registro');
  await page.goto('/registro');
  await acceptCookies(page);
  await page.locator('#nombre').fill('Ciudadana E2E');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('Ciudadana123');
  await page.locator('#confirmarPassword').fill('Ciudadana123');
  await page.locator('#acceptDataTreatment').check();
  const [registerResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/auth/register')),
    page.getByRole('button', { name: 'Registrarme' }).click(),
  ]);
  expect(registerResponse.status()).toBe(201);
  await shot(page, 'E2E-05a-registro-exitoso');

  const [loginResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/auth/login')),
    uiLogin(page, email, 'Ciudadana123'),
  ]);
  expect(loginResponse.status(), 'el primer login tras registrarse no deberia ser bloqueado').toBe(200);
  await expect(page).toHaveURL(/\/mapa/);
  await expect(page.getByRole('button', { name: /Reportar aquí/ })).toBeVisible();
  await waitForMapTiles(page);
  await shot(page, 'E2E-05b-mapa-tras-primer-login');
});

test('E2E-06 Ciudadano: inicia sesion, crea un reporte desde el mapa y lo ve publicado', async ({ page, request }) => {
  const citizen = await apiCitizen(request, 'e2e.reporte', 'Reportero123');
  await apiLogout(request, citizen.token);

  await uiLogin(page, citizen.email, citizen.password);
  await expect(page).toHaveURL(/\/mapa/);
  await page.getByRole('button', { name: /Reportar aquí/ }).click();
  await page.getByRole('button', { name: /Publicar reporte aquí/ }).waitFor();
  await page.locator('textarea').fill('E2E: hueco profundo frente al paradero');
  await waitForMapTiles(page);
  await shot(page, 'E2E-06a-formulario-reporte');
  const [created] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/reportes') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /Publicar reporte aquí/ }).click(),
  ]);
  expect(created.status()).toBe(201);
  const body = await created.json();
  expect(body.estado).toBe('PENDIENTE');
  expect(body.descripcion).toContain('E2E: hueco profundo');
  expect(body.latitud).toBeCloseTo(4.6534, 3);
  await expect(page.getByRole('button', { name: /Publicar reporte aquí/ })).toBeHidden();
  await waitForMapTiles(page);
  await shot(page, 'E2E-06b-reporte-publicado');
});

test('E2E-07 Administrador: inicia sesion, ve el reporte ciudadano y cambia su estado', async ({ page, request }) => {
  const citizen = await apiCitizen(request, 'e2e.vecino', 'Vecino12345');
  const marker = `E2E admin ${Date.now()}`;
  const rep = await request.post(`${API}/reportes`, {
    headers: { Authorization: `Bearer ${citizen.token}` },
    data: { categoria: 'ZONA_OSCURA', descripcion: marker, latitud: 4.65, longitud: -74.08 },
  });
  expect(rep.status()).toBe(201);
  const reportId = (await rep.json()).id;

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin/);
  // La descripcion tambien aparece en la tabla de auditoria: se ubica la fila por su selector de estado
  const row = page.locator('tr', { has: page.getByLabel(`Estado del reporte ${reportId}`) });
  await expect(row).toContainText(marker);
  await row.scrollIntoViewIfNeeded();
  await shot(page, 'E2E-07a-dashboard-admin');

  const [patch] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(`/api/reportes/${reportId}/estado`)),
    page.getByLabel(`Estado del reporte ${reportId}`).selectOption('EN_PROGRESO'),
  ]);
  expect(patch.status()).toBe(200);
  expect((await patch.json()).estado).toBe('EN_PROGRESO');

  // Verificacion cruzada: el ciudadano ve el nuevo estado
  const check = await request.get(`${API}/reportes/${reportId}`, { headers: { Authorization: `Bearer ${citizen.token}` } });
  expect((await check.json()).estado).toBe('EN_PROGRESO');
  await shot(page, 'E2E-07b-estado-actualizado');
  await apiLogout(request, citizen.token);
  await page.getByRole('button', { name: /Cerrar sesión/ }).first().click();
});

test('E2E-08 Sesion unica estricta: un segundo navegador es rechazado y entra solo cuando el primero cierra sesion', async ({ browser, request }) => {
  const citizen = await apiCitizen(request, 'e2e.sesion', 'SesionUnica1');
  await apiLogout(request, citizen.token);

  const ctxA = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 4.65, longitude: -74.08 } });
  const ctxB = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 4.65, longitude: -74.08 } });
  await blockGoogle(ctxA);
  await blockGoogle(ctxB);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await uiLogin(a, citizen.email, citizen.password);
  await expect(a).toHaveURL(/\/mapa/);
  const tokenA = await tabToken(a);
  expect(tokenA, 'el navegador A debe tener un token del backend').toMatch(/^eyJ/);

  // Navegador B: se rechaza y permanece en /login (no existe la opcion de forzar)
  await uiLogin(b, citizen.email, citizen.password);
  await expect(b.getByText(/sesión activa/i).first()).toBeVisible();
  await expect(b).toHaveURL(/\/login/);
  await expect(b.getByRole('button', { name: /Cerrar la otra sesión/ })).toHaveCount(0);
  await shot(b, 'E2E-08a-segundo-navegador-rechazado');

  // El navegador A sigue operativo
  expect((await request.get(`${API}/reportes`, { headers: { Authorization: `Bearer ${tokenA}` } })).status()).toBe(200);

  // A cierra sesion -> B puede ingresar
  await a.getByRole('button', { name: /Cerrar sesión/ }).first().click();
  await expect(a).toHaveURL(/\/login/);
  await uiLogin(b, citizen.email, citizen.password);
  await expect(b).toHaveURL(/\/mapa/);
  await shot(b, 'E2E-08b-segundo-navegador-ingresa-tras-logout');
  await b.getByRole('button', { name: /Cerrar sesión/ }).first().click();
  await ctxA.close();
  await ctxB.close();
});

test('E2E-09 Ciudadano: cerrar sesion devuelve a /login y bloquea volver al mapa', async ({ page, request }) => {
  const citizen = await apiCitizen(request, 'e2e.logout', 'LogoutE2e1');
  await apiLogout(request, citizen.token);

  await uiLogin(page, citizen.email, citizen.password);
  await expect(page).toHaveURL(/\/mapa/);
  await page.getByRole('button', { name: /Cerrar sesión/ }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/mapa');
  await expect(page).toHaveURL(/\/login/);
  await shot(page, 'E2E-09-logout');
});

test('E2E-10 Seguridad: si el backend no responde, el login NO concede acceso (ni rol ADMIN) con credenciales inventadas', async ({ page }) => {
  // Se simula el backend caido solo para el endpoint de login
  await page.route('**/api/auth/login', (route) => route.abort('connectionrefused'));
  await uiLogin(page, 'admin.inventado@radar.test', 'Inventada123');
  await page.waitForTimeout(3500);
  await shot(page, 'E2E-10-login-con-backend-caido');

  await expect(page).not.toHaveURL(/\/(admin|mapa)/);
  expect(await tabToken(page), 'no debe guardarse ningun token falso').toBeNull();
});

test('E2E-12 Integridad: si el servidor falla al crear un reporte, se informa el error y no se simula la publicacion', async ({ page, request }) => {
  const citizen = await apiCitizen(request, 'e2e.fallo', 'FalloE2e123');
  await apiLogout(request, citizen.token);
  await uiLogin(page, citizen.email, citizen.password);
  await expect(page).toHaveURL(/\/mapa/);

  // El servidor responde 500 solo a la creacion del reporte
  await page.route('**/api/reportes', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"status":500,"message":"Error simulado"}' })
      : route.continue(),
  );
  await page.getByRole('button', { name: /Reportar aquí/ }).click();
  await page.locator('textarea').fill('E2E: este reporte no debe darse por publicado');
  await page.getByRole('button', { name: /Publicar reporte aquí/ }).click();

  await expect(page.getByText('No se pudo crear el reporte. Intenta nuevamente.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Publicar reporte aquí/ })).toBeVisible();
  await shot(page, 'E2E-12-error-al-crear-reporte');
  await page.getByRole('button', { name: /Cerrar sesión/ }).first().click();
});

test('E2E-13 Integridad: si el servidor falla al crear un backup, el panel muestra el error y no un backup inexistente', async ({ page }) => {
  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin/);

  await page.route('**/api/admin/backups', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"status":503,"message":"El almacenamiento de backups no esta disponible"}' })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Crear backup ahora' }).click();

  const alert = page.getByRole('alert').filter({ hasText: /backup|almacenamiento/i });
  await expect(alert).toBeVisible();
  await alert.scrollIntoViewIfNeeded();
  await shot(page, 'E2E-13-error-al-crear-backup');
  await page.getByRole('button', { name: /Cerrar sesión/ }).first().click();
});

test('E2E-11 Seguridad: tras registrarse, la contrasena no queda guardada en texto plano en el navegador', async ({ page }) => {
  const email = unique('e2e.almacen');
  const password = 'SecretoLocal123';
  await page.goto('/registro');
  await acceptCookies(page);
  await page.locator('#nombre').fill('Almacen E2E');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirmarPassword').fill(password);
  await page.locator('#acceptDataTreatment').check();
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/auth/register')),
    page.getByRole('button', { name: 'Registrarme' }).click(),
  ]);
  expect(res.status()).toBe(201);

  const stored = await page.evaluate(() => {
    const dump: string[] = [];
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)!;
        dump.push(`${k}=${store.getItem(k)}`);
      }
    }
    return dump.join('\n');
  });
  expect(stored.includes(password), 'la contrasena no debe aparecer en localStorage/sessionStorage').toBe(false);
});
