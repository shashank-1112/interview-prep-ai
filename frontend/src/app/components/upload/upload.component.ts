import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ApiService } from '../../services/api.service';
import { InterviewStateService } from '../../services/interview-state.service';

// Kept in sync with the backend's MAX_FILE_SIZE_BYTES (app/routes/resume.py).
// Checking here too isn't redundant with the backend check - it just lets
// us reject an obviously-too-big file before spending a round trip on it.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Screen 1: pick a resume PDF, upload it, and kick off question generation.
 *
 * Upload and question-generation are deliberately one user action ("Start
 * Interview") rather than two separate screens/steps - there's nothing for
 * the user to decide in between the two backend calls, so splitting them
 * would just add a click with no value.
 */
@Component({
  selector: 'app-upload',
  imports: [],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.scss',
})
export class UploadComponent {
  selectedFile = signal<File | null>(null);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);

  constructor(
    private readonly api: ApiService,
    private readonly state: InterviewStateService,
    private readonly router: Router,
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.errorMessage.set(null);

    if (!file) {
      this.selectedFile.set(null);
      return;
    }

    // Client-side checks mirror the backend's validation (see
    // backend/app/routes/resume.py) - not a substitute for it, just a
    // faster/friendlier rejection before we make a network request at all.
    if (file.type !== 'application/pdf') {
      this.errorMessage.set('Please select a PDF file.');
      this.selectedFile.set(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.errorMessage.set('File too large - please upload a resume under 5MB.');
      this.selectedFile.set(null);
      return;
    }

    this.selectedFile.set(file);
  }

  startInterview(): void {
    const file = this.selectedFile();
    if (!file) {
      this.errorMessage.set('Please select a resume PDF first.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.api.uploadResume(file).subscribe({
      next: (uploadResult) => {
        this.state.setSession(uploadResult.session_id);

        // Chain straight into question generation - one loading spinner
        // covers both network calls, since the user only cares about the
        // combined outcome ("my questions are ready"), not the two steps.
        this.api.generateQuestions(uploadResult.session_id).subscribe({
          next: (questionsResult) => {
            this.state.setQuestions(questionsResult.questions);
            this.isLoading.set(false);
            this.router.navigate(['/questions']);
          },
          error: (err: Error) => {
            this.isLoading.set(false);
            this.errorMessage.set(err.message);
          },
        });
      },
      error: (err: Error) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.message);
      },
    });
  }
}
