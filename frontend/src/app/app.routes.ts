import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'bienvenida',
  },
  {
    path: 'bienvenida',
    loadComponent: () => import('./features/landing/hero/hero').then((m) => m.Hero),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'politica-privacidad',
    loadComponent: () => import('./features/legal/privacy/privacy').then((m) => m.Privacy),
  },
  {
    path: 'politica-cookies',
    loadComponent: () => import('./features/legal/cookies/cookies').then((m) => m.CookiesPolicy),
  },
  {
    path: 'mapa',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/dashboard/admin-dashboard').then((m) => m.AdminDashboard),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/nuevo',
    loadComponent: () =>
      import('./features/admin/register/admin-register').then((m) => m.AdminRegister),
    canActivate: [adminGuard],
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
