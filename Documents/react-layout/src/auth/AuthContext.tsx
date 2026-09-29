import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { logout as apiLogout, refreshToken as apiRefreshToken } from './authApi';
import { angularHomeUrl, angularLoginUrl, authConfig } from './config';
import { applyHandoffFromLocation } from './handoff';
import { hasPlannerAccess, isExpired, toAuthSession } from './session';
import { clearStoredTokens, readStoredTokens, writeStoredTokens } from './sessionStorage';
import type { AuthSession } from './types';

interface AuthContextValue {
  session: AuthSession;
  logout: () => void;
  /** fetch wrapper that attaches the current bearer token and retries once,
   *  with a refreshed token, on a 401 — use this for any LayoutRepository
   *  implementation that talks to the .NET API instead of localStorage. */
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Calls the refresh endpoint and persists the result. Returns null (without
 *  throwing) if the refresh token itself is no longer valid — callers decide
 *  what "not refreshable" means for them (redirect to login, fail the request). */
async function performRefresh(current: AuthSession): Promise<AuthSession | null> {
  try {
    const response = await apiRefreshToken({ token: current.accessToken, refreshToken: current.refreshToken });
    const nextTokens = { accessToken: response.token, refreshToken: response.refreshToken };
    writeStoredTokens(nextTokens);
    const next = toAuthSession(nextTokens);
    return next && hasPlannerAccess(next) ? next : null;
  } catch {
    return null;
  }
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth must be used within <AuthGate>');
  }

  return ctx;
}

type Status = 'checking' | 'ready';

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [session, setSession] = useState<AuthSession | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function goToLogin(): void {
      window.location.replace(angularLoginUrl());
    }

    function goHome(): void {
      window.location.replace(angularHomeUrl());
    }

    function setActiveSession(next: AuthSession): void {
      sessionRef.current = next;
      setSession(next);
    }

    function scheduleRefresh(current: AuthSession): void {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }

      const msUntilExpiry = Date.parse(current.tokenExpiryTime) - Date.now();
      const delay = Math.max(msUntilExpiry - authConfig.refreshLeadTimeMs, 5_000);
      refreshTimer.current = setTimeout(() => {
        void doRefresh(current);
      }, delay);
    }

    async function doRefresh(current: AuthSession): Promise<void> {
      const next = await performRefresh(current);

      if (!next) {
        goToLogin();
        return;
      }

      setActiveSession(next);
      scheduleRefresh(next);
    }

    function onStorage(event: StorageEvent): void {
      if (event.key !== authConfig.storageKey) {
        return;
      }

      // The session changed in another tab — e.g. signed out (or in) from the
      // Angular app. Re-validate rather than trusting stale in-memory state.
      const latestTokens = readStoredTokens();

      if (!latestTokens) {
        goToLogin();
        return;
      }

      const latestSession = toAuthSession(latestTokens);

      if (!latestSession || isExpired(latestSession)) {
        clearStoredTokens();
        goToLogin();
        return;
      }

      if (!hasPlannerAccess(latestSession)) {
        goHome();
        return;
      }

      setActiveSession(latestSession);
      scheduleRefresh(latestSession);
    }

    applyHandoffFromLocation();
    const tokens = readStoredTokens();

    if (!tokens) {
      goToLogin();
      return;
    }

    const current = toAuthSession(tokens);

    if (!current || isExpired(current)) {
      clearStoredTokens();
      goToLogin();
      return;
    }

    if (!hasPlannerAccess(current)) {
      goHome();
      return;
    }

    setActiveSession(current);
    scheduleRefresh(current);
    setStatus('ready');

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
    };
  }, []);

  async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const current = sessionRef.current;
    const withAuth = (token: string): RequestInit => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return { ...init, headers };
    };

    if (!current) {
      return fetch(input, init);
    }

    const first = await fetch(input, withAuth(current.accessToken));

    if (first.status !== 401) {
      return first;
    }

    const refreshed = await performRefresh(current);

    if (!refreshed) {
      window.location.replace(angularLoginUrl());
      return first;
    }

    sessionRef.current = refreshed;
    setSession(refreshed);
    return fetch(input, withAuth(refreshed.accessToken));
  }

  function logout(): void {
    const current = sessionRef.current;
    clearStoredTokens();

    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
    }

    if (current) {
      void apiLogout({ token: current.accessToken, refreshToken: current.refreshToken });
    }

    window.location.replace(angularLoginUrl());
  }

  if (status !== 'ready' || !session) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Checking your session…
      </div>
    );
  }

  return <AuthContext.Provider value={{ session, logout, authorizedFetch }}>{children}</AuthContext.Provider>;
}
