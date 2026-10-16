// Importamos el tipo Routes del enrutador de Angular para definir el mapa de navegación de la SPA
import { Routes } from '@angular/router';
// Guard que protege rutas privadas: exige que el usuario tenga un JWT válido en sesión
import { authGuard } from './core/guards/auth.guard';
// Guard exclusivo para administradores: exige sesión activa y rol 'ADMIN'
import { adminGuard } from './core/guards/admin.guard';
// Guard para invitados: si el usuario ya inició sesión, lo redirige a /mapa o /admin para no mostrar login otra vez
import { guestGuard } from './core/guards/guest.guard';

// Definición de todas las rutas de la aplicación con carga perezosa (Lazy Loading con loadComponent)
export const routes: Routes = [
  {
    // Si el usuario entra a la raíz '/', redirige automáticamente a la portada '/bienvenida'
    path: '',
    pathMatch: 'full',
    redirectTo: 'bienvenida',
  },
  {
    // Portada pública (Landing Page con efecto linterna sobre la ciudad)
    path: 'bienvenida',
    loadComponent: () => import('./features/landing/hero/hero').then((m) => m.Hero),
  },
  {
    // Pantalla de inicio de sesión (protegida con guestGuard para usuarios no autenticados)
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
    canActivate: [guestGuard],
  },
  {
    // Pantalla de registro ciudadano (protegida con guestGuard)
    path: 'registro',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
    canActivate: [guestGuard],
  },
  {
    // Página legal de política de privacidad y tratamiento de datos personales
    path: 'politica-privacidad',
    loadComponent: () => import('./features/legal/privacy/privacy').then((m) => m.Privacy),
  },
  {
    // Página legal de política de uso de cookies
    path: 'politica-cookies',
    loadComponent: () => import('./features/legal/cookies/cookies').then((m) => m.CookiesPolicy),
  },
  {
    // Mapa interactivo ciudadano (requiere haber iniciado sesión mediante authGuard)
    path: 'mapa',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
    canActivate: [authGuard],
  },
  {
    // Panel de control del Administrador: métricas, gráficas, reportes y backups (requiere adminGuard)
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/dashboard/admin-dashboard').then((m) => m.AdminDashboard),
    canActivate: [adminGuard],
  },
  {
    // Formulario para dar de alta un nuevo administrador (requiere adminGuard)
    path: 'admin/nuevo',
    loadComponent: () =>
      import('./features/admin/register/admin-register').then((m) => m.AdminRegister),
    canActivate: [adminGuard],
  },
  {
    // Ruta comodín (404): captura cualquier URL no existente y muestra la página NotFound
    path: '**',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
