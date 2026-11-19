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

// Tiempo máximo de espera para cargar el script y para obtener cada token. En producción la primera ejecución tarda
// alrededor de 1,5 s; con un límite menor se enviaba la petición sin token y el backend respondía
// "Verificación CAPTCHA requerida".
const RECAPTCHA_TIMEOUT_MS = 10_000;
const RECAPTCHA_ATTEMPTS = 2;

@Injectable({ providedIn: 'root' })
export class RecaptchaService {
  // Mensaje para el usuario cuando el navegador no logra obtener el token (bloqueador de anuncios, red, etc.)
  static readonly UNAVAILABLE_MESSAGE =
    'No se pudo completar la verificación reCAPTCHA. Si usas un bloqueador de anuncios o de rastreadores, ' +
    'permite google.com y gstatic.com en este sitio y vuelve a intentarlo.';

  private scriptPromise?: Promise<boolean>;

  // Indica si reCAPTCHA está configurado (si no, el backend tampoco lo exige)
  get enabled(): boolean {
    return Boolean(environment.recaptchaSiteKey);
  }

  // Carga el script por adelantado (al abrir login o registro) para que el token esté listo al enviar el formulario
  preload(): void {
    if (this.enabled) {
      void this.loadScript();
    }
  }

  // Obtiene un token de reCAPTCHA v3 para la acción indicada; reintenta una vez antes de rendirse
  async execute(action: string): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }
    for (let attempt = 1; attempt <= RECAPTCHA_ATTEMPTS; attempt++) {
      const token = await this.tryExecute(action);
      if (token) {
        return token;
      }
      // Si el script falló al cargar, se descarta para volver a pedirlo en el siguiente intento
      if (!window.grecaptcha) {
        this.scriptPromise = undefined;
      }
    }
    return null;
  }

  private async tryExecute(action: string): Promise<string | null> {
    try {
      const loaded = await this.withTimeout(this.loadScript(), false);
      if (!loaded || !window.grecaptcha) {
        return null;
      }
      const grecaptcha = window.grecaptcha;
      const token = new Promise<string | null>((resolve) => {
        grecaptcha.ready(() => {
          grecaptcha
            .execute(environment.recaptchaSiteKey, { action })
            .then((value) => resolve(value || null))
            .catch(() => resolve(null));
        });
      });
      return await this.withTimeout(token, null);
    } catch {
      return null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), RECAPTCHA_TIMEOUT_MS)),
    ]);
  }

  private loadScript(): Promise<boolean> {
    if (window.grecaptcha) {
      return Promise.resolve(true);
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(environment.recaptchaSiteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        script.remove();
        resolve(false);
      };
      document.head.appendChild(script);
    });
    return this.scriptPromise;
  }
}
