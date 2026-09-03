import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root shell component. Its only job is to host the router outlet -
 * which screen (upload / questions / results) actually renders is wired
 * up in app.routes.ts in Stage 7.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
