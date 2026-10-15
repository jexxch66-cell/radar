import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

const LOCK_AFTER_MS = 150_000;
const LOGOUT_AFTER_MS = 300_000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  readonly isLocked = signal(false);

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private lockTimer?: number;
  private logoutTimer?: number;
  private heartbeatTimer?: number;
  private activityHandler = (): void => this.handleActivity();

  constructor() {
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, this.activityHandler, { passive: true }));

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.triggerHeartbeat();
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => this.triggerHeartbeat());
    }

    effect(() => {
      if (this.authService.currentUser()) {
        this.start();
      } else {
        this.stop();
      }
    });
  }

  unlock(): void {
    if (!this.isLocked()) {
      return;
    }

    this.isLocked.set(false);
    this.scheduleLock();
    this.scheduleHeartbeat();
    this.triggerHeartbeat();
  }

  private start(): void {
    if (this.isLocked()) {
      return;
    }

    this.scheduleLock();
    this.scheduleHeartbeat();
    this.triggerHeartbeat();
  }

  private stop(): void {
    this.clearTimers();
    this.isLocked.set(false);
  }

  private handleActivity(): void {
    if (!this.authService.isAuthenticated() || this.isLocked()) {
      return;
    }

    this.scheduleLock();
  }

  private scheduleLock(): void {
    this.clearLockTimer();
    this.lockTimer = window.setTimeout(() => this.lock(), LOCK_AFTER_MS);
  }

  private lock(): void {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    this.clearHeartbeatTimer();
    this.isLocked.set(true);
    this.logoutTimer = window.setTimeout(() => this.expireSession(), LOGOUT_AFTER_MS - LOCK_AFTER_MS);
  }

  private expireSession(): void {
    this.clearTimers();
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }

  private triggerHeartbeat(): void {
    if (!this.authService.isAuthenticated() || this.isLocked()) {
      return;
    }

    this.authService.heartbeat().subscribe({
      next: () => {},
      error: () => {}, // 401 is handled by authInterceptor
    });
  }

  private scheduleHeartbeat(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      this.triggerHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer !== undefined) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private clearLockTimer(): void {
    if (this.lockTimer !== undefined) {
      window.clearTimeout(this.lockTimer);
      this.lockTimer = undefined;
    }
  }

  private clearTimers(): void {
    this.clearLockTimer();
    this.clearHeartbeatTimer();
    if (this.logoutTimer !== undefined) {
      window.clearTimeout(this.logoutTimer);
      this.logoutTimer = undefined;
    }
  }
}
