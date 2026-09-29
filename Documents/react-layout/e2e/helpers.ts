import { expect, type Page } from '@playwright/test';

export type Scope = 'ground' | 'editor';
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const AUTH_STORAGE_KEY = 'gs-exhibitor-auth-session';

function base64url(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** An unsigned but well-formed super_admin JWT — AuthGate only decodes claims
 *  client-side, it never verifies the signature (the backend does that on
 *  every real API call), so this is enough to satisfy it in tests. Must carry
 *  a role from PLANNER_ROLES (src/auth/types.ts) or AuthGate redirects away. */
function fakePlannerAccessToken(): string {
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({
    role: 'super_admin',
    email: 'e2e-super-admin@example.test',
    name: 'E2E Super Admin',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.`;
}

/** Seeds a valid, authorized session before any page script runs, so AuthGate
 *  (see src/auth/AuthContext.tsx) finds one instead of redirecting out to the
 *  Angular app, which doesn't exist in the e2e environment. */
export async function boot(page: Page) {
  await page.addInitScript(
    ({ key, accessToken }) => {
      window.localStorage.setItem(key, JSON.stringify({ accessToken, refreshToken: 'e2e-refresh-token' }));
    },
    { key: AUTH_STORAGE_KEY, accessToken: fakePlannerAccessToken() },
  );
  await page.goto('/');
  await page.waitForFunction(() => !!window.__layoutTest__?.stages.ground);
  // Let the initial fit-to-ground settle.
  await page.waitForTimeout(250);
}

export async function nodeBox(page: Page, scope: Scope, selector: string): Promise<Box> {
  const box = await page.evaluate(([s, sel]) => window.__layoutTest__!.nodeBox(s as Scope, sel!), [scope, selector] as const);
  expect(box, `node ${selector} in ${scope}`).not.toBeNull();
  return box!;
}

export const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Screen px per layout unit for the given stage (20 world px per unit × zoom). */
export async function pxPerUnit(page: Page, scope: Scope): Promise<number> {
  return page.evaluate((s) => window.__layoutTest__!.stages[s as Scope]!.scaleX() * 20, scope);
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + (to.x - from.x) / 4, from.y + (to.y - from.y) / 4, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export function state<T>(page: Page, fn: (s: ReturnType<NonNullable<Window['__layoutTest__']>['getState']>) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__layoutTest__.getState())`) as Promise<T>;
}

export async function openEditor(page: Page, hangarId: number) {
  const frame = await nodeBox(page, 'ground', `#hangar-${hangarId} .hangar-frame`);
  await page.mouse.dblclick(frame.x + frame.width - 8, frame.y + frame.height - 8);
  await expect(page.getByTestId('hangar-editor')).toBeVisible();
  await page.waitForFunction(() => !!window.__layoutTest__?.stages.editor);
  await page.waitForTimeout(250);
}

export const onGrid = (v: number, grid = 0.5) => Math.abs(v / grid - Math.round(v / grid)) < 1e-6;
