import { Component, OnInit, signal } from '@angular/core';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { Question } from '../../models/interview.model';
import { ApiService } from '../../services/api.service';
import { InterviewStateService } from '../../services/interview-state.service';

/**
 * Screen 2: every generated question, each with its own text area, all
 * visible at once. This satisfies "one at a time or all at once" from the
 * spec without separate UI modes - since every question is on screen
 * together, the candidate can naturally answer them in any order, or just
 * one at a time top to bottom.
 *
 * Leaving an answer blank is allowed - the backend grades a missing answer
 * as "no answer provided" (see grading_service.py) rather than erroring,
 * so there's no need to force an answer here either.
 */
@Component({
  selector: 'app-questions',
  imports: [ReactiveFormsModule],
  templateUrl: './questions.component.html',
  styleUrl: './questions.component.scss',
})
export class QuestionsComponent implements OnInit {
  questions: Question[] = [];
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  // One FormControl per question - built in ngOnInit once we know how many
  // questions there are. Index i here always corresponds to questions[i].
  answersForm = new FormArray<FormControl<string>>([]);

  constructor(
    private readonly api: ApiService,
    private readonly state: InterviewStateService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const sessionId = this.state.sessionId();
    const questions = this.state.questions();

    // No session/questions in state - most likely a direct navigation to
    // this URL, or a page refresh (state is in-memory only - see
    // InterviewStateService's docstring). Simplest correct behavior: send
    // the user back to start over, rather than rendering an empty screen.
    if (!sessionId || questions.length === 0) {
      this.router.navigate(['/upload']);
      return;
    }

    this.questions = questions;
    this.answersForm = new FormArray(questions.map(() => new FormControl('', { nonNullable: true })));
  }

  submitAnswers(): void {
    const sessionId = this.state.sessionId();
    if (!sessionId) {
      this.router.navigate(['/upload']);
      return;
    }

    const answers = this.questions.map((question, i) => ({
      question_id: question.id,
      answer_text: this.answersForm.at(i).value,
    }));

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.api.submitGrading(sessionId, answers).subscribe({
      next: (result) => {
        this.state.setGradingResult(result);
        this.isLoading.set(false);
        this.router.navigate(['/results']);
      },
      error: (err: Error) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.message);
      },
    });
  }
}
