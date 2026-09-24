import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      execute(siteKey: string, options: { action: string }): Promise<string>;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class RecaptchaService {
  private scriptPromise?: Promise<void>;

  async execute(action: string): Promise<string | null> {
    if (!environment.recaptchaSiteKey) {
      return null;
    }

    await this.loadScript();
    if (!window.grecaptcha) {
      return null;
    }

    return new Promise((resolve, reject) => {
      window.grecaptcha?.ready(() => {
        window.grecaptcha?.execute(environment.recaptchaSiteKey, { action }).then(resolve).catch(reject);
      });
    });
  }

  private loadScript(): Promise<void> {
    if (window.grecaptcha) {
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(environment.recaptchaSiteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar reCAPTCHA'));
      document.head.appendChild(script);
    });
    return this.scriptPromise;
  }
}
