import { Component, signal } from '@angular/core';

const COOKIE_CONSENT_KEY = 'radar_cookie_consent';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  templateUrl: './cookie-consent.html',
  styleUrl: './cookie-consent.css',
})
export class CookieConsent {
  readonly visible = signal(this.readConsent() === null);

  accept(): void {
    this.saveConsent('accepted');
  }

  reject(): void {
    this.saveConsent('necessary');
  }

  private saveConsent(value: 'accepted' | 'necessary'): void {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    this.visible.set(false);
  }

  private readConsent(): string | null {
    return localStorage.getItem(COOKIE_CONSENT_KEY);
  }
}
