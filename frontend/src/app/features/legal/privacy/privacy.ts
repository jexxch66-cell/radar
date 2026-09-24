import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeToggle } from '../../../shared/theme-toggle/theme-toggle';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, ThemeToggle],
  templateUrl: './privacy.html',
  styleUrl: './privacy.css',
})
export class Privacy {}
