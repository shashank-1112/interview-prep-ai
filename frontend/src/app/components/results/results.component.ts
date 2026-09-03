import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';

import { GradingResponse } from '../../models/interview.model';
import { InterviewStateService } from '../../services/interview-state.service';

/**
 * Screen 3: final results - overall rating, per-question feedback, and
 * improvement suggestions. Read-only; the only action here is "Start Over".
 */
@Component({
  selector: 'app-results',
  imports: [],
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss',
})
export class ResultsComponent implements OnInit {
  result = signal<GradingResponse | null>(null);

  constructor(
    private readonly state: InterviewStateService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const result = this.state.gradingResult();
    // No grading result in state - direct navigation or a page refresh
    // (state is in-memory only). Send the user back to start over.
    if (!result) {
      this.router.navigate(['/upload']);
      return;
    }
    this.result.set(result);
  }

  startOver(): void {
    this.state.reset();
    this.router.navigate(['/upload']);
  }
}
