import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthGate } from './auth/AuthContext';
import './canvas/konvaUtils';
import './index.css';
import { LocalStorageLayoutRepository } from './repository/localStorageRepository';

/**
 * Composition root. To back the planner with the .NET API instead of
 * localStorage, construct a different LayoutRepository here — nothing else
 * in the app needs to change.
 *
 * AuthGate only belongs here, not inside App: it validates the super-admin session
 * (shared with the Angular app — see src/auth/), redirecting out to the
 * Angular login/home when there isn't one. Unit tests render App directly and
 * never see it; e2e tests seed a session before the page loads (e2e/helpers.ts).
 */
const repository = new LocalStorageLayoutRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App repository={repository} />
    </AuthGate>
  </StrictMode>,
);
