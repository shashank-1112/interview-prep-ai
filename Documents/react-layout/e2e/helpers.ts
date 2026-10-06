import { expect, type Page } from '@playwright/test';
import { defaultLayout } from '../src/domain/seed';
import type { StallLayoutData } from '../src/domain/types';
import type { AssignableBooking } from '../src/repository/LayoutRepository';

export type Scope = 'ground' | 'editor';
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const AUTH_STORAGE_KEY = 'gs-exhibitor-auth-session';
const SELECTED_EXHIBITION_KEY = 'gs_layout_selected_exhibition';
const MOCK_EXHIBITION_ID = 1;

function base64url(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** An unsigned but well-formed JWT for the given role — AuthGate only decodes claims
 *  client-side, it never verifies the signature (the backend does that on
 *  every real API call), so this is enough to satisfy it in tests. Must carry
 *  a role from PLANNER_ROLES (src/auth/types.ts) or AuthGate redirects away. */
function fakePlannerAccessToken(role: string): string {
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({
    role,
    email: `e2e-${role}@example.test`,
    name: `E2E ${role}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.`;
}

/** Frontend AnnotationType -> backend GroundAssetType enum name — mirrors the (private)
 *  GROUND_ASSET_TYPE_TO_WIRE table in src/repository/apiLayoutRepository.ts, duplicated here
 *  since that one is intentionally not exported outside the repository. */
const GROUND_ASSET_TYPE_TO_WIRE: Partial<Record<string, string>> = {
  entry: 'Entry',
  exit: 'Exit',
  'entry-exit': 'EntryExit',
  ticketing: 'Ticketing',
  'gift-counter': 'GiftCounter',
  washroom: 'Washroom',
};

/** Wire shape Modules.Layout's controller returns — see Shared.DTOs.Layout on the .NET side
 *  and src/repository/apiLayoutRepository.ts's private wire types on this side. Domain and
 *  wire are identical except openSides (array on the wire's way in, string on the way out of
 *  the real API) and annotations, which the real API splits into 4 typed buckets
 *  (roads/parkingAreas/groundAssets/annotations) — reproduced here the same way so this mock
 *  matches the real GET/PUT shape exactly. */
function toWireGround(data: StallLayoutData) {
  const annotations = data.annotations.filter((a) => a.type === 'open-area' || a.type === 'walking' || a.type === 'cctv' || a.type === 'fire-exit');
  const roads = data.annotations.filter((a) => a.type === 'road');
  const parkingAreas = data.annotations.filter((a) => a.type === 'parking');
  const groundAssets = data.annotations.filter((a) => a.type in GROUND_ASSET_TYPE_TO_WIRE);

  return {
    id: data.ground.id,
    exhibitionId: MOCK_EXHIBITION_ID,
    exhibitionName: data.ground.exhibitionName,
    venueName: data.ground.venueName,
    unit: data.ground.unit,
    width: data.ground.width,
    height: data.ground.height,
    gridSize: data.ground.gridSize,
    boundaryPoints: data.ground.boundary ?? [],
    setbackDistance: data.ground.setbackDistance ?? 0,
    rowVersion: 'ZTJlLXJvdy12ZXJzaW9u', // arbitrary fixed placeholder — this mock never checks it
    hangars: data.hangars,
    stalls: data.stalls.map((s) => ({ ...s, openSides: s.openSides?.length ? s.openSides.join(',') : null })),
    annotations: annotations.map(({ hangarId, ...a }) => ({ ...a, hangarId })),
    roads: roads.map(({ id, label, x, y, width, height }) => ({ id, label, x, y, width, height })),
    parkingAreas: parkingAreas.map(({ id, label, x, y, width, height }) => ({ id, label, x, y, width, height })),
    groundAssets: groundAssets.map(({ id, hangarId, type, label, x, y, width, height }) => ({
      id,
      hangarId,
      type: GROUND_ASSET_TYPE_TO_WIRE[type] ?? type,
      label,
      x,
      y,
      width,
      height,
    })),
  };
}

interface MockLayoutApiState {
  /** null = "no Ground yet", GET should 404 — mirrors the real backend. */
  snapshot: ReturnType<typeof toWireGround> | null;
  lastPutBody: unknown;
  /** Static — "assignable" is derived by checking no stall already carries this stallBookingId, same as the real backend's query. */
  bookings: AssignableBooking[];
}

const mockState = new WeakMap<Page, MockLayoutApiState>();

/** Two bookings, one already approved — enough to exercise both the "pending" and "approved" labels, and to leave one unassigned after the other is picked. */
const DEFAULT_MOCK_BOOKINGS: AssignableBooking[] = [
  { stallBookingId: 501, exhibitorId: 9001, exhibitorName: 'Asha Patel', companyName: 'Acme Corp', noOfStalls: 1, width: 3, depth: 3, approvalState: 'approved' },
  { stallBookingId: 502, exhibitorId: 9002, exhibitorName: 'Rohit Shah', companyName: 'Globex Traders', noOfStalls: 1, width: 3, depth: 3, approvalState: 'pending' },
];

/** The mocked GET /api/layout/1 would currently return (post any PUTs so far). */
export function getMockSnapshot(page: Page): ReturnType<typeof toWireGround> | null {
  return mockState.get(page)?.snapshot ?? null;
}

/** The exact JSON body of the most recent PUT /api/layout/1, or null if none yet. */
export function getLastPutBody(page: Page): unknown {
  return mockState.get(page)?.lastPutBody ?? null;
}

export interface BootOptions {
  /** What GET /api/layout/1 returns before any save happens. Defaults to the
   *  demo seed (3 hangars, 42 stalls) — pass null to start from an empty
   *  ground (404), or a custom StallLayoutData for perf/large-data tests. */
  initialLayout?: StallLayoutData | null;
  /** What GET /api/layout/1/assignable-bookings offers, before any assignment narrows it. Defaults to two bookings (see DEFAULT_MOCK_BOOKINGS). */
  assignableBookings?: AssignableBooking[];
  /** JWT role claim — defaults to 'super_admin'. Pass 'sales_person' etc. to test role-gated UI (see src/auth/session.ts's canManageLayout). */
  role?: string;
}

/**
 * Seeds a valid, authorized session before any page script runs (so AuthGate,
 * src/auth/AuthContext.tsx, finds one instead of redirecting out to the
 * Angular app, which doesn't exist in the e2e environment), pre-selects the
 * one mock exhibition (so PlannerRoot's picker is skipped), and mocks the
 * Layout API in-memory so the real ApiLayoutRepository code path runs against
 * a fake backend instead of localStorage.
 */
export async function boot(page: Page, opts: BootOptions = {}) {
  const initialLayout = opts.initialLayout === undefined ? defaultLayout() : opts.initialLayout;
  const state: MockLayoutApiState = {
    snapshot: initialLayout ? toWireGround(initialLayout) : null,
    lastPutBody: null,
    bookings: opts.assignableBookings ?? DEFAULT_MOCK_BOOKINGS,
  };
  mockState.set(page, state);

  await page.addInitScript(
    ({ authKey, accessToken, selectedKey, selected }) => {
      window.localStorage.setItem(authKey, JSON.stringify({ accessToken, refreshToken: 'e2e-refresh-token' }));
      // Must match PlannerRoot.tsx's SelectedExhibition shape — a bare id
      // string here would make readSelected() return null and fall back to
      // the (unmocked) picker.
      window.sessionStorage.setItem(selectedKey, JSON.stringify(selected));
    },
    {
      authKey: AUTH_STORAGE_KEY,
      accessToken: fakePlannerAccessToken(opts.role ?? 'super_admin'),
      selectedKey: SELECTED_EXHIBITION_KEY,
      selected: {
        exhibitionId: MOCK_EXHIBITION_ID,
        name: initialLayout?.ground.exhibitionName ?? 'E2E Expo',
        venueName: initialLayout?.ground.venueName ?? 'Test Venue',
      },
    },
  );

  await page.route('**/api/layout/config', async (route) => {
    // Mirrors the backend's proposed seed (LayoutDbContext.SeedLayoutConfig) closely enough
    // for e2e purposes — not every row, just enough that a test asserting on config-driven
    // colours/labels has something real to check against.
    await route.fulfill({
      json: [
        { kind: 'StallStatus', code: 'available', name: 'Available', colorFill: '#dcfce7', colorStroke: '#16a34a', colorText: '#15803d', sortOrder: 1, isSystem: true },
        { kind: 'StallStatus', code: 'reserved', name: 'Reserved', colorFill: '#fef3c7', colorStroke: '#d97706', colorText: '#92400e', sortOrder: 2, isSystem: true },
        { kind: 'StallStatus', code: 'booked', name: 'Booked', colorFill: '#fee2e2', colorStroke: '#dc2626', colorText: '#991b1b', sortOrder: 3, isSystem: true },
        { kind: 'StallStatus', code: 'blocked', name: 'Blocked', colorFill: '#f1f5f9', colorStroke: '#94a3b8', colorText: '#475569', sortOrder: 4, isSystem: true },
        { kind: 'StallStatus', code: 'allocated', name: 'Allocated', colorFill: '#ede9fe', colorStroke: '#7c3aed', colorText: '#5b21b6', sortOrder: 5, isSystem: false },
      ],
    });
  });

  await page.route('**/api/layout/exhibitions', async (route) => {
    await route.fulfill({
      json: [
        {
          exhibitionId: MOCK_EXHIBITION_ID,
          name: initialLayout?.ground.exhibitionName ?? 'E2E Expo',
          venueName: initialLayout?.ground.venueName ?? 'Test Venue',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86_400_000).toISOString(),
          hasGround: state.snapshot !== null,
        },
      ],
    });
  });

  await page.route(`**/api/layout/${MOCK_EXHIBITION_ID}`, async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      if (state.snapshot === null) {
        await route.fulfill({ status: 404 });
      } else {
        await route.fulfill({ json: state.snapshot });
      }
      return;
    }

    if (method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      state.lastPutBody = body;
      state.snapshot = { ...body, exhibitionId: MOCK_EXHIBITION_ID } as ReturnType<typeof toWireGround>;
      await route.fulfill({ json: state.snapshot });
      return;
    }

    if (method === 'DELETE') {
      state.snapshot = null;
      await route.fulfill({ status: 200 });
      return;
    }

    await route.continue();
  });

  await page.route(`**/api/layout/${MOCK_EXHIBITION_ID}/assignable-bookings`, async (route) => {
    const linkedIds = new Set((state.snapshot?.stalls ?? []).map((s) => s.stallBookingId).filter((id): id is number => id != null));
    await route.fulfill({ json: state.bookings.filter((b) => !linkedIds.has(b.stallBookingId)) });
  });

  await page.route(`**/api/layout/${MOCK_EXHIBITION_ID}/stalls/*/assign`, async (route) => {
    const stallId = Number(new URL(route.request().url()).pathname.split('/').at(-2));
    const stalls = state.snapshot?.stalls ?? [];
    const stall = stalls.find((s) => s.id === stallId);
    if (!stall) {
      await route.fulfill({ status: 400, json: { succeeded: false, messages: ['Stall not found in this exhibition\'s layout.'] } });
      return;
    }

    const method = route.request().method();

    if (method === 'POST') {
      const { stallBookingId } = route.request().postDataJSON() as { stallBookingId: number };
      const booking = state.bookings.find((b) => b.stallBookingId === stallBookingId);
      if (!booking) {
        await route.fulfill({ status: 400, json: { succeeded: false, messages: ['Booking not found.'] } });
        return;
      }
      const alreadyLinked = stalls.some((s) => s.stallBookingId === stallBookingId && s.id !== stallId);
      if (alreadyLinked) {
        await route.fulfill({ status: 400, json: { succeeded: false, messages: ['This booking is already assigned to a different stall.'] } });
        return;
      }
      stall.stallBookingId = stallBookingId;
      stall.exhibitorName = booking.companyName || booking.exhibitorName;
      stall.status = booking.approvalState === 'approved' ? 'booked' : 'reserved';
      await route.fulfill({ json: stall });
      return;
    }

    if (method === 'DELETE') {
      stall.stallBookingId = undefined;
      stall.exhibitorName = null;
      stall.status = 'available';
      await route.fulfill({ json: stall });
      return;
    }

    await route.continue();
  });

  await page.goto('/');
  await page.waitForFunction(() => !!window.__layoutTest__?.stages.ground);
  // Let the initial fit-to-ground settle.
  await page.waitForTimeout(250);
}

export async function nodeBox(page: Page, scope: Scope, selector: string): Promise<Box> {
  const box = await nodeBoxOrNull(page, scope, selector);
  expect(box, `node ${selector} in ${scope}`).not.toBeNull();
  return box!;
}

/** Same lookup as nodeBox, without asserting presence — for confirming a node is (still) absent, e.g. hidden by a visibility toggle. */
export async function nodeBoxOrNull(page: Page, scope: Scope, selector: string): Promise<Box | null> {
  return page.evaluate(([s, sel]) => window.__layoutTest__!.nodeBox(s as Scope, sel!), [scope, selector] as const);
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
