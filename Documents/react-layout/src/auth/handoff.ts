import { writeStoredTokens } from './sessionStorage';

/**
 * Cross-origin bootstrap. If the two apps are deployed on the same origin,
 * localStorage is already shared and this is a no-op. If they're on separate
 * origins, LayoutPlannerRedirectComponent (Angular) navigates here with
 * `#at=<accessToken>&rt=<refreshToken>` in the URL fragment — never a query
 * string, so it's never sent to a server or logged. This reads it once,
 * persists it under the same storage key the Angular app uses, and strips the
 * fragment immediately so the tokens don't linger in the address bar.
 */
export function applyHandoffFromLocation(): void {
  const hash = window.location.hash;

  if (!hash || hash.length < 2) {
    return;
  }

  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get('at');
  const refreshToken = params.get('rt');

  if (!accessToken || !refreshToken) {
    return;
  }

  writeStoredTokens({ accessToken, refreshToken });

  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.toString());
}
