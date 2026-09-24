import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';

@Component({
  selector: 'app-cookies-policy',
  imports: [RouterLink, ThemeToggle],
  templateUrl: './cookies.html',
  styleUrl: './cookies.css',
})
export class CookiesPolicy {}
