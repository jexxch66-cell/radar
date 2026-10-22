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

    try {
      await Promise.race([
        this.loadScript(),
        new Promise<void>((resolve) => setTimeout(resolve, 1200)),
      ]);
      if (!window.grecaptcha) {
        return null;
      }

      return await Promise.race([
        new Promise<string | null>((resolve) => {
          window.grecaptcha?.ready(() => {
            window.grecaptcha
              ?.execute(environment.recaptchaSiteKey, { action })
              .then(resolve)
              .catch(() => resolve(null));
          });
        }),
        new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 1200)),
      ]);
    } catch {
      return null;
    }
  }

  private loadScript(): Promise<void> {
    if (window.grecaptcha) {
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(environment.recaptchaSiteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
    return this.scriptPromise;
  }
}
