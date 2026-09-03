import { Injectable, signal } from '@angular/core';

import { GradingResponse, Question } from '../models/interview.model';

/**
 * Holds frontend state for the current interview session, in memory only.
 *
 * Deliberately NOT persisted (no sessionStorage, no backend database) -
 * this matches the MVP scope ("no persistence needed yet"): a page refresh
 * loses all progress and the user starts over from /upload. If that
 * trade-off ever becomes a problem, this is the one place to add
 * sessionStorage-backed persistence - nothing else in the app needs to change.
 *
 * `providedIn: 'root'` means Angular creates exactly one instance for the
 * whole app, so it survives navigation between routes/components - that's
 * what makes it usable as shared state here instead of a database.
 */
@Injectable({ providedIn: 'root' })
export class InterviewStateService {
  readonly sessionId = signal<string | null>(null);
  readonly questions = signal<Question[]>([]);
  readonly gradingResult = signal<GradingResponse | null>(null);

  setSession(sessionId: string): void {
    this.sessionId.set(sessionId);
  }

  setQuestions(questions: Question[]): void {
    this.questions.set(questions);
  }

  setGradingResult(result: GradingResponse): void {
    this.gradingResult.set(result);
  }

  /** Called from the results screen's "Start Over" button. */
  reset(): void {
    this.sessionId.set(null);
    this.questions.set([]);
    this.gradingResult.set(null);
  }
}
