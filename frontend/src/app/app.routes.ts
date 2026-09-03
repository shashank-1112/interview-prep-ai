import { Routes } from '@angular/router';

/**
 * Three screens, visited in a fixed order: upload -> questions -> results.
 * Each is lazy-loaded (loadComponent) so the initial bundle only contains
 * whichever screen the user actually lands on first.
 *
 * There's no route guard stopping someone from jumping straight to
 * /questions or /results - instead, each of those components checks
 * InterviewStateService in ngOnInit and redirects back to /upload if the
 * expected state isn't there (e.g. a page refresh, which loses all
 * in-memory state - see InterviewStateService's docstring). Simpler than a
 * separate CanActivate guard for an app this size, and keeps the "what do
 * I need before I can render" logic next to the component that needs it.
 */
export const routes: Routes = [
  { path: '', redirectTo: 'upload', pathMatch: 'full' },
  {
    path: 'upload',
    loadComponent: () => import('./components/upload/upload.component').then((m) => m.UploadComponent),
  },
  {
    path: 'questions',
    loadComponent: () =>
      import('./components/questions/questions.component').then((m) => m.QuestionsComponent),
  },
  {
    path: 'results',
    loadComponent: () => import('./components/results/results.component').then((m) => m.ResultsComponent),
  },
];
