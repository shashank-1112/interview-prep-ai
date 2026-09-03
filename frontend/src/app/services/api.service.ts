import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  AnswerInput,
  GradingResponse,
  QuestionGenerationResponse,
  ResumeUploadResponse,
} from '../models/interview.model';

/**
 * The ONLY place in the frontend that talks HTTP to the backend.
 * Components call these methods and get back typed Observables - they
 * never construct HttpClient requests themselves. This means if the API
 * base URL, request shape, or error handling ever needs to change, it
 * changes here once instead of in every component that happens to call it.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private readonly http: HttpClient) {}

  /** POST /resume/upload - sends the PDF as multipart/form-data. */
  uploadResume(file: File): Observable<ResumeUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http
      .post<ResumeUploadResponse>(`${this.baseUrl}/resume/upload`, formData)
      .pipe(catchError(this.handleError));
  }

  /** POST /questions/generate - kicks off Gemini question generation for this session. */
  generateQuestions(sessionId: string): Observable<QuestionGenerationResponse> {
    return this.http
      .post<QuestionGenerationResponse>(`${this.baseUrl}/questions/generate`, {
        session_id: sessionId,
      })
      .pipe(catchError(this.handleError));
  }

  /** POST /grading/submit - sends all answers at once for holistic grading. */
  submitGrading(sessionId: string, answers: AnswerInput[]): Observable<GradingResponse> {
    return this.http
      .post<GradingResponse>(`${this.baseUrl}/grading/submit`, {
        session_id: sessionId,
        answers,
      })
      .pipe(catchError(this.handleError));
  }

  /**
   * Normalizes any HttpErrorResponse into a single user-facing string, so
   * every component can just do:
   *   this.api.uploadResume(file).subscribe({ error: (err) => this.errorMessage = err.message })
   * instead of re-deriving "what does this failure mean" separately in
   * each component.
   *
   * Three cases, in order:
   * 1. status === 0 - the request never reached the server at all (backend
   *    not running, wrong API base URL, CORS misconfigured, no network).
   *    The browser gives us almost no detail here, so we show a generic
   *    "can't reach the server" message rather than a confusing "Unknown Error".
   * 2. The backend responded with a structured FastAPI error body -
   *    `{ detail: "..." }` - which is exactly what our 400/422/502
   *    responses from the resume/questions/grading routes look like.
   *    We surface that `detail` directly, since those messages were
   *    written to be shown to the user.
   * 3. Anything else (e.g. a 500 with an HTML error page, a proxy in the
   *    middle) - fall back to a generic message rather than dumping raw
   *    HTML/stack traces into the UI.
   */
  private handleError = (err: HttpErrorResponse): Observable<never> => {
    let message: string;

    if (err.status === 0) {
      message = 'Could not reach the server. Please check that the backend is running.';
    } else if (err.error && typeof err.error === 'object' && 'detail' in err.error) {
      message = err.error.detail;
    } else {
      message = 'Something went wrong. Please try again.';
    }

    return throwError(() => new Error(message));
  };
}
