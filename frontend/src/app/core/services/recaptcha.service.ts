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

// Tiempo máximo de espera para cargar el script y obtener el token. En producción la primera ejecución tarda
// alrededor de 1,5 s; con un límite menor se enviaba la petición sin token y el backend respondía
// "Verificación CAPTCHA requerida".
const RECAPTCHA_TIMEOUT_MS = 10_000;

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
        new Promise<void>((resolve) => setTimeout(resolve, RECAPTCHA_TIMEOUT_MS)),
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
        new Promise<string | null>((resolve) => setTimeout(() => resolve(null), RECAPTCHA_TIMEOUT_MS)),
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
