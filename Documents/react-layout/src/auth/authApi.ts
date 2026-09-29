import { authConfig } from './config';
import type { LoginResponse, RefreshTokenRequest } from './types';

function buildUrl(path: string): string {
  return `${authConfig.apiBaseUrl}${path}`;
}

/** Same endpoint and payload shape as the Angular app's AuthApiService.refreshToken. */
export async function refreshToken(payload: RefreshTokenRequest): Promise<LoginResponse> {
  const response = await fetch(buildUrl('/api/identity/Auth/refresh-token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Unable to refresh the session (${response.status}).`);
  }

  return (await response.json()) as LoginResponse;
}

/** Same endpoint as the Angular app's AuthApiService.logout — best-effort only. */
export async function logout(payload: RefreshTokenRequest): Promise<void> {
  try {
    await fetch(buildUrl('/api/identity/Auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // The local session is cleared regardless of whether this call succeeds.
  }
}
