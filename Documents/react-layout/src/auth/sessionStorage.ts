import { authConfig } from './config';
import type { StoredAuthTokens } from './types';

function parseTokens(raw: string | null): StoredAuthTokens | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const accessToken = parsed['accessToken'];
    const refreshToken = parsed['refreshToken'];

    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
      return null;
    }

    const isRecovery = parsed['isRecovery'];
    const imageUrl = parsed['imageUrl'];

    return {
      accessToken,
      refreshToken,
      isRecovery: typeof isRecovery === 'boolean' ? isRecovery : undefined,
      imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Mirrors AuthSessionService.readPersistedSession: a recovery session (tab-scoped,
 * sessionStorage) takes priority over the shared, persistent one (localStorage).
 * Same-origin deployments read the exact bytes the Angular app itself wrote.
 */
export function readStoredTokens(): StoredAuthTokens | null {
  return parseTokens(window.sessionStorage.getItem(authConfig.storageKey)) ?? parseTokens(window.localStorage.getItem(authConfig.storageKey));
}

/** Mirrors AuthSessionService.persistSession's storage split. */
export function writeStoredTokens(tokens: StoredAuthTokens): void {
  const serialized = JSON.stringify(tokens);

  if (tokens.isRecovery) {
    window.sessionStorage.setItem(authConfig.storageKey, serialized);
    return;
  }

  window.sessionStorage.removeItem(authConfig.storageKey);
  window.localStorage.setItem(authConfig.storageKey, serialized);
}

export function clearStoredTokens(): void {
  window.localStorage.removeItem(authConfig.storageKey);
  window.sessionStorage.removeItem(authConfig.storageKey);
}
