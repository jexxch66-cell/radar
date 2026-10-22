import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
          renderButton(element: HTMLElement, options: Record<string, string | number>): void;
        };
      };
    };
  }
}

@Injectable({ providedIn: 'root' })
export class GoogleIdentityService {
  private lastCredentialTime = 0;

  renderButton(element: HTMLElement, onCredential: (credential: string) => void): boolean {
    if (!environment.googleClientId) {
      return true;
    }
    if (!window.google?.accounts?.id) {
      return false;
    }

    window.google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response) => {
        const now = Date.now();
        // Evita que el SDK de Google dispare dos callbacks en el mismo segundo y sobrescriba el activeSessionId
        if (now - this.lastCredentialTime < 1500) {
          return;
        }
        this.lastCredentialTime = now;
        onCredential(response.credential);
      },
    });
    window.google.accounts.id.renderButton(element, {
      theme: 'outline',
      size: 'large',
      width: 320,
      text: 'continue_with',
      shape: 'pill',
    });
    return true;
  }
}
