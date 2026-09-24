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
  renderButton(element: HTMLElement, onCredential: (credential: string) => void): boolean {
    if (!environment.googleClientId) {
      return true;
    }
    if (!window.google?.accounts?.id) {
      return false;
    }

    window.google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response) => onCredential(response.credential),
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
