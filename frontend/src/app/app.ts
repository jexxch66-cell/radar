// Importaciones de Angular para el componente raíz, inyección y signals
import { Component, inject, signal } from '@angular/core';
// RouterOutlet renderiza dinámicamente el componente de la ruta actual (/bienvenida, /login, /mapa, /admin...)
import { RouterOutlet } from '@angular/router';
// Actualizaciones del service worker (PWA)
import { SwUpdate } from '@angular/service-worker';
// Banner de consentimiento de cookies y pantalla de bloqueo por inactividad
import { CookieConsent } from './shared/cookie-consent/cookie-consent';
import { SessionLock } from './shared/session-lock/session-lock';
// Servicio de idioma global
import { LanguageService } from './core/services/language.service';

// Interfaz del evento nativo del navegador para instalar una Progressive Web App (PWA)
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Componente raíz (<app-root>) que envuelve toda la aplicación Angular
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CookieConsent, SessionLock],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  // Servicio de idioma expuesto a la plantilla para traducir el botón de instalación PWA
  protected readonly i18n = inject(LanguageService);

  // Controla si se muestra el botón flotante "Instalar RADAR" y el modal de ayuda
  readonly canInstall = signal(!this.isInstalled());
  readonly showInstallHelp = signal(false);
  private installPrompt: InstallPromptEvent | null = null;

  constructor() {
    this.watchForUpdates();

    // Si la aplicación ya corre instalada como ventana independiente (standalone), no mostramos el botón
    if (this.isInstalled()) {
      return;
    }

    // Capturamos el evento beforeinstallprompt del navegador para poder disparar la instalación cuando el usuario haga clic
    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.canInstall.set(false);
    });
  }

  // Dispara el diálogo nativo de instalación PWA o muestra instrucciones manuales si el navegador no lo soporta directo
  async installApp(): Promise<void> {
    if (!this.installPrompt) {
      this.showInstallHelp.set(true);
      return;
    }

    const prompt = this.installPrompt;
    this.installPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      this.canInstall.set(false);
    }
  }

  // El service worker guarda la aplicación para funcionar como PWA. Sin esto, quien ya la había abierto seguía
  // usando la versión anterior hasta cerrar todas las pestañas. Al detectar una versión nueva, se activa y se recarga.
  private watchForUpdates(): void {
    const swUpdate = inject(SwUpdate, { optional: true });
    if (!swUpdate?.isEnabled) {
      return;
    }
    swUpdate.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        void swUpdate.activateUpdate().then(() => document.location.reload());
      }
    });
    swUpdate.unrecoverable.subscribe(() => document.location.reload());
    void swUpdate.checkForUpdate().catch(() => undefined);
  }

  // Cierra el modal con instrucciones de instalación
  closeInstallHelp(): void {
    this.showInstallHelp.set(false);
  }

  // Detecta si la app ya está instalada en el escritorio o móvil mediante media query display-mode: standalone
  private isInstalled(): boolean {
    return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  // Guarda el evento de instalación diferida para usarlo cuando el usuario pulse "Instalar RADAR"
  private readonly onBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.installPrompt = event as InstallPromptEvent;
    this.canInstall.set(true);
  };
}
