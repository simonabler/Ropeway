import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

/**
 * Root App Component
 * Mobile-first layout with responsive header and navigation
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  standalone: true
})
export class App {
  title = 'Seilbahn Planer';
}
