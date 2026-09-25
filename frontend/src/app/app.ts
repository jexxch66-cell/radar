import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CookieConsent } from './shared/cookie-consent/cookie-consent';
import { SessionLock } from './shared/session-lock/session-lock';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CookieConsent, SessionLock],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
