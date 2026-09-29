function readEnv(name: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export const authConfig = {
  /** Same backend both apps talk to — see the Angular app's environment.ts apiBaseUrl. */
  apiBaseUrl: readEnv('VITE_API_BASE_URL', 'https://megatradefairapi.azurewebsites.net').replace(/\/+$/, ''),
  /** Where the Angular app is hosted. Used only for the login/home redirects below. */
  angularAppUrl: readEnv('VITE_ANGULAR_APP_URL', 'http://localhost:4300').replace(/\/+$/, ''),
  angularLoginPath: readEnv('VITE_ANGULAR_LOGIN_PATH', '/login'),
  /** The Angular route that redirects an authorized user back out to this app — see
   *  LayoutPlannerRedirectComponent. Used as `returnUrl` so a fresh login lands
   *  back here instead of on the Angular dashboard. */
  angularPlannerPath: readEnv('VITE_ANGULAR_PLANNER_PATH', '/stall-layout-planner'),
  /** Must match the Angular app's AuthSessionService storageKey exactly. */
  storageKey: readEnv('VITE_AUTH_STORAGE_KEY', 'gs-exhibitor-auth-session'),
  /** Refresh this many ms before the access token actually expires. */
  refreshLeadTimeMs: 60_000,
} as const;

export function angularLoginUrl(): string {
  const returnUrl = encodeURIComponent(authConfig.angularPlannerPath);
  return `${authConfig.angularAppUrl}${authConfig.angularLoginPath}?returnUrl=${returnUrl}`;
}

export function angularHomeUrl(): string {
  return `${authConfig.angularAppUrl}/`;
}
