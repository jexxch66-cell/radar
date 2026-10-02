import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CookieConsent } from './shared/cookie-consent/cookie-consent';
import { SessionLock } from './shared/session-lock/session-lock';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CookieConsent, SessionLock],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly canInstall = signal(!this.isInstalled());
  readonly showInstallHelp = signal(false);
  private installPrompt: InstallPromptEvent | null = null;

  constructor() {
    if (this.isInstalled()) {
      return;
    }

    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.canInstall.set(false);
    });
  }

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

  closeInstallHelp(): void {
    this.showInstallHelp.set(false);
  }

  private isInstalled(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  private readonly onBeforeInstallPrompt = (event: Event): void => {
    event.preventDefault();
    this.installPrompt = event as InstallPromptEvent;
    this.canInstall.set(true);
  };
}
