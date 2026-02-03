import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root App Component
 * Mobile-first layout with responsive header and navigation
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  standalone: true
})
export class App {
  title = 'Seilbahn Planer';
}
