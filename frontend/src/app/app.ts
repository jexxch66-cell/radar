import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CookieConsent } from './shared/cookie-consent/cookie-consent';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CookieConsent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
