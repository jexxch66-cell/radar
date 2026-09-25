import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

const LOCK_AFTER_MS = 150_000;
const LOGOUT_AFTER_MS = 300_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  readonly isLocked = signal(false);

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private lockTimer?: number;
  private logoutTimer?: number;
  private activityHandler = (): void => this.handleActivity();

  constructor() {
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, this.activityHandler, { passive: true }));

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
  }

  private start(): void {
    if (this.isLocked()) {
      return;
    }

    this.scheduleLock();
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

    this.isLocked.set(true);
    this.logoutTimer = window.setTimeout(() => this.expireSession(), LOGOUT_AFTER_MS - LOCK_AFTER_MS);
  }

  private expireSession(): void {
    this.clearTimers();
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }

  private clearLockTimer(): void {
    if (this.lockTimer !== undefined) {
      window.clearTimeout(this.lockTimer);
      this.lockTimer = undefined;
    }
  }

  private clearTimers(): void {
    this.clearLockTimer();
    if (this.logoutTimer !== undefined) {
      window.clearTimeout(this.logoutTimer);
      this.logoutTimer = undefined;
    }
  }
}
