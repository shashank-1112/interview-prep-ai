import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './auth/AuthContext';
import './canvas/konvaUtils';
import './index.css';
import PlannerRoot from './PlannerRoot';

/**
 * Composition root. PlannerRoot picks which exhibition to plan (via GET
 * /api/layout/exhibitions) and constructs an ApiLayoutRepository scoped to
 * it — App itself stays repository-agnostic; LocalStorageLayoutRepository /
 * MemoryLayoutRepository still exist and are exercised directly by tests
 * (src/test/components.test.tsx, e2e/*), just no longer the default entry.
 *
 * AuthGate only belongs here, not inside App: it validates the super-admin session
 * (shared with the Angular app — see src/auth/), redirecting out to the
 * Angular login/home when there isn't one. Unit tests render App directly and
 * never see it; e2e tests seed a session before the page loads (e2e/helpers.ts).
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <PlannerRoot />
    </AuthGate>
  </StrictMode>,
);
