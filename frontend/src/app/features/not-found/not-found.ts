import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// Pantalla 404: Rufo, la mascota zorro de RADAR, "reportando" que esta pagina no existe
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.css',
})
export class NotFound {}
