import { authConfig } from '../auth/config';
import { defaultLayout } from '../domain/seed';
import type { AnnotationType, CornerOrientation, LayoutConfigItem, LayoutEvent, LayoutUnit, RectSide, Stall, StallLayoutData, StallStatus } from '../domain/types';
import type { AssignableBooking, LayoutLoadResult, LayoutRepository } from './LayoutRepository';

export type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// Wire shapes exactly as Modules.Layout's controller returns/accepts them
// (Shared.DTOs.Layout on the .NET side) — kept private to this file; nothing
// outside the repository should know the wire format exists.
interface HangarWire {
  id: number;
  name: string;
  code: string;
  categoryCode?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutEventWire {
  type: string;
  sourceStallLabels: string[];
  resultStallLabels: string[];
}

interface StallWire {
  id: number;
  hangarId: number;
  stallNo: string;
  stallCode: string;
  stallType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  basePrice: number;
  finalPrice: number;
  status: string;
  exhibitorName: string | null;
  cornerOrientation?: string | null;
  openSides?: string | null;
  stallBookingId?: number | null;
  isBillable: boolean;
}

/** Only "open-area" | "walking" | "cctv" | "fire-exit" come through this bucket now — see
 *  the Road/ParkingArea/GroundAsset wire types below and ROAD_ID_OFFSET's doc comment for why. */
interface AnnotationWire {
  id: number;
  hangarId: number | null;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Always ground-level — roads are never inside a hangar. */
interface RoadWire {
  id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Always ground-level — same as RoadWire. */
interface ParkingAreaWire {
  id: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** type is "Entry" | "Exit" | "EntryExit" | "Ticketing" | "GiftCounter" | "Washroom" | "Decorative". */
interface GroundAssetWire {
  id: number;
  hangarId: number | null;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GroundSnapshotWire {
  id: number;
  exhibitionId: number;
  exhibitionName: string;
  venueName: string;
  unit: string;
  width: number;
  height: number;
  gridSize: number;
  boundaryPoints: { x: number; y: number }[];
  setbackDistance: number;
  rowVersion: string;
  hangars: HangarWire[];
  stalls: StallWire[];
  roads: RoadWire[];
  parkingAreas: ParkingAreaWire[];
  groundAssets: GroundAssetWire[];
  annotations: AnnotationWire[];
}

/** Matches Shared.DTOs.Layout.AssignableBookingResponse exactly — no mapping needed. */
type AssignableBookingWire = AssignableBooking;

/** Matches Shared.DTOs.Layout.LayoutConfigItemDto exactly — no mapping needed. */
type LayoutConfigItemWire = LayoutConfigItem;

const OPEN_SIDES: readonly string[] = ['top', 'right', 'bottom', 'left'];

function parseOpenSides(value: string | null | undefined): RectSide[] | undefined {
  if (!value) return undefined;
  const sides = value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is RectSide => (OPEN_SIDES as string[]).includes(s));
  return sides.length ? sides : undefined;
}

function serializeOpenSides(sides: RectSide[] | undefined): string | null {
  return sides && sides.length ? sides.join(',') : null;
}

/**
 * Roads, parking areas and ground assets are their own backend tables (LAYOUT_PHASE1_DECISIONS.md
 * item 1), each with its own id sequence — but the frontend's domain model still represents
 * everything as one flat `annotations: LayoutAnnotation[]` array (deliberately not refactored
 * in this pass: it already has a lot of well-tested placement/validation logic in domain/site.ts
 * keyed generically on that shape, and splitting it would be a much larger, separate change).
 * These offsets keep each bucket's ids from colliding once merged into that one array — applied
 * on load, stripped (by range, not by re-checking type) on save. No realistic collision risk:
 * a bucket would need a million rows before reaching the next one's range.
 */
const ROAD_ID_OFFSET = 1_000_000;
const PARKING_ID_OFFSET = 2_000_000;
const GROUND_ASSET_ID_OFFSET = 3_000_000;

/** Frontend AnnotationType -> backend GroundAssetType enum name. Only types actually routed to GroundAsset appear here. */
const GROUND_ASSET_TYPE_TO_WIRE: Partial<Record<AnnotationType, string>> = {
  entry: 'Entry',
  exit: 'Exit',
  'entry-exit': 'EntryExit',
  ticketing: 'Ticketing',
  'gift-counter': 'GiftCounter',
  washroom: 'Washroom',
};
const GROUND_ASSET_TYPE_FROM_WIRE: Record<string, AnnotationType> = Object.fromEntries(
  Object.entries(GROUND_ASSET_TYPE_TO_WIRE).map(([k, v]) => [v as string, k as AnnotationType]),
);

function stallToDomain(s: StallWire): Stall {
  return {
    id: s.id,
    hangarId: s.hangarId,
    stallNo: s.stallNo,
    stallCode: s.stallCode,
    stallType: s.stallType,
    x: s.x,
    y: s.y,
    width: s.width,
    height: s.height,
    area: s.area,
    basePrice: s.basePrice,
    finalPrice: s.finalPrice,
    status: s.status as StallStatus,
    exhibitorName: s.exhibitorName,
    cornerOrientation: (s.cornerOrientation ?? undefined) as CornerOrientation | undefined,
    openSides: parseOpenSides(s.openSides),
    stallBookingId: s.stallBookingId ?? undefined,
    isBillable: s.isBillable,
  };
}

function toDomain(wire: GroundSnapshotWire): StallLayoutData {
  return {
    ground: {
      id: wire.id,
      exhibitionName: wire.exhibitionName,
      venueName: wire.venueName,
      unit: wire.unit as LayoutUnit,
      width: wire.width,
      height: wire.height,
      gridSize: wire.gridSize,
      boundary: wire.boundaryPoints.length >= 3 ? wire.boundaryPoints : undefined,
      setbackDistance: wire.setbackDistance || undefined,
    },
    hangars: wire.hangars.map((h) => ({
      id: h.id,
      name: h.name,
      code: h.code,
      categoryCode: h.categoryCode ?? undefined,
      x: h.x,
      y: h.y,
      width: h.width,
      height: h.height,
    })),
    stalls: wire.stalls.map(stallToDomain),
    annotations: [
      ...wire.annotations.map((a) => ({
        id: a.id,
        type: a.type as AnnotationType,
        label: a.label,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
        hangarId: a.hangarId,
      })),
      ...wire.roads.map((r) => ({
        id: r.id + ROAD_ID_OFFSET,
        type: 'road' as AnnotationType,
        label: r.label,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        hangarId: null,
      })),
      ...wire.parkingAreas.map((p) => ({
        id: p.id + PARKING_ID_OFFSET,
        type: 'parking' as AnnotationType,
        label: p.label,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        hangarId: null,
      })),
      ...wire.groundAssets.map((a) => ({
        id: a.id + GROUND_ASSET_ID_OFFSET,
        type: (GROUND_ASSET_TYPE_FROM_WIRE[a.type] ?? a.type) as AnnotationType,
        label: a.label,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
        hangarId: a.hangarId,
      })),
    ],
  };
}

function toWireRequest(data: StallLayoutData, rowVersion: string | null, events: LayoutEvent[]) {
  return {
    id: data.ground.id,
    exhibitionName: data.ground.exhibitionName,
    venueName: data.ground.venueName,
    unit: data.ground.unit,
    width: data.ground.width,
    height: data.ground.height,
    gridSize: data.ground.gridSize,
    boundaryPoints: data.ground.boundary ?? [],
    setbackDistance: data.ground.setbackDistance ?? 0,
    rowVersion,
    hangars: data.hangars.map((h) => ({
      id: h.id,
      name: h.name,
      code: h.code,
      categoryCode: h.categoryCode ?? null,
      x: h.x,
      y: h.y,
      width: h.width,
      height: h.height,
    })),
    stalls: data.stalls.map((s) => ({
      id: s.id,
      hangarId: s.hangarId,
      stallNo: s.stallNo,
      stallCode: s.stallCode,
      stallType: s.stallType,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      area: s.area,
      basePrice: s.basePrice,
      finalPrice: s.finalPrice,
      status: s.status,
      exhibitorName: s.exhibitorName,
      cornerOrientation: s.cornerOrientation ?? null,
      openSides: serializeOpenSides(s.openSides),
      stallBookingId: s.stallBookingId ?? null,
      isBillable: s.isBillable ?? true,
    })),
    // Split back into the 4 backend buckets by type — the inverse of toDomain's merge. Each
    // bucket's real id is recovered by subtracting the same offset used on the way in; a new
    // (not-yet-saved) annotation has id <= 0 either way, so offset or not it still reads as
    // "new" server-side (see GroundSnapshotRequest's id convention).
    annotations: data.annotations
      .filter((a) => a.type === 'open-area' || a.type === 'walking' || a.type === 'cctv' || a.type === 'fire-exit')
      .map((a) => ({ id: a.id, hangarId: a.hangarId, type: a.type, label: a.label, x: a.x, y: a.y, width: a.width, height: a.height })),
    roads: data.annotations
      .filter((a) => a.type === 'road')
      .map((a) => ({ id: a.id > 0 ? a.id - ROAD_ID_OFFSET : a.id, label: a.label, x: a.x, y: a.y, width: a.width, height: a.height })),
    parkingAreas: data.annotations
      .filter((a) => a.type === 'parking')
      .map((a) => ({ id: a.id > 0 ? a.id - PARKING_ID_OFFSET : a.id, label: a.label, x: a.x, y: a.y, width: a.width, height: a.height })),
    groundAssets: data.annotations
      .filter((a) => a.type in GROUND_ASSET_TYPE_TO_WIRE)
      .map((a) => ({
        id: a.id > 0 ? a.id - GROUND_ASSET_ID_OFFSET : a.id,
        hangarId: a.hangarId,
        type: GROUND_ASSET_TYPE_TO_WIRE[a.type]!,
        label: a.label,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
      })),
    events: events.map((e): LayoutEventWire => ({
      type: e.type === 'merge' ? 'Merge' : 'Split',
      sourceStallLabels: e.sourceStallLabels,
      resultStallLabels: e.resultStallLabels,
    })),
  };
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { messages?: string[] } | null;
    return body?.messages?.[0] || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Backs the planner with the .NET Layout module instead of localStorage.
 * Scoped to one exhibition per instance — construct a new one (and remount
 * <App key={exhibitionId}>) when the user switches exhibitions in the picker.
 *
 * RowVersion is tracked purely in memory here, never in domain data: it's a
 * repository/concurrency concern the rest of the app has no reason to know
 * about. It resets to null on load() with no ground yet (nothing to
 * conflict with) and is refreshed from every load/save response.
 */
export class ApiLayoutRepository implements LayoutRepository {
  private rowVersion: string | null = null;

  constructor(
    private readonly exhibitionId: number,
    private readonly authorizedFetch: AuthorizedFetch,
    private readonly apiBaseUrl: string = authConfig.apiBaseUrl,
  ) {}

  private url(suffix = ''): string {
    return `${this.apiBaseUrl}/api/layout/${this.exhibitionId}${suffix}`;
  }

  async load(): Promise<LayoutLoadResult> {
    const response = await this.authorizedFetch(this.url());

    if (response.status === 404) {
      this.rowVersion = null;
      return { data: null, source: 'empty', fromVersion: null };
    }
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Could not load the layout (${response.status}).`));
    }

    const wire = (await response.json()) as GroundSnapshotWire;
    this.rowVersion = wire.rowVersion;
    return { data: toDomain(wire), source: 'current', fromVersion: 3 };
  }

  async save(data: StallLayoutData, events: LayoutEvent[] = []): Promise<StallLayoutData> {
    const response = await this.authorizedFetch(this.url(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toWireRequest(data, this.rowVersion, events)),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Could not save the layout (${response.status}).`));
    }

    const wire = (await response.json()) as GroundSnapshotWire;
    this.rowVersion = wire.rowVersion;
    // Real ids for anything sent as new — see LayoutRepository.save's doc
    // comment for why the store adopts this instead of keeping local state.
    return toDomain(wire);
  }

  async reset(): Promise<void> {
    const response = await this.authorizedFetch(this.url(), { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Could not reset the layout (${response.status}).`));
    }
    this.rowVersion = null;
  }

  /** Same demo seed every repository falls back to — "load demo" is a local
   *  starting point regardless of backend; saving it is what actually creates
   *  the real Ground row for this exhibition. */
  getDefaultLayout(): StallLayoutData {
    return defaultLayout();
  }

  async getAssignableBookings(): Promise<AssignableBooking[]> {
    const response = await this.authorizedFetch(this.url('/assignable-bookings'));
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Could not load bookings (${response.status}).`));
    }
    return (await response.json()) as AssignableBookingWire[];
  }

  async assignStall(stallId: number, stallBookingId: number): Promise<Stall> {
    const response = await this.authorizedFetch(this.url(`/stalls/${stallId}/assign`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stallBookingId }),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Could not assign that booking (${response.status}).`));
    }
    return stallToDomain((await response.json()) as StallWire);
  }

  async unassignStall(stallId: number): Promise<Stall> {
    const response = await this.authorizedFetch(this.url(`/stalls/${stallId}/assign`), { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Could not unassign that stall (${response.status}).`));
    }
    return stallToDomain((await response.json()) as StallWire);
  }

  /** Global config, not scoped to this.exhibitionId — see LayoutRepository.getConfig's doc comment. */
  async getConfig(): Promise<LayoutConfigItem[]> {
    const response = await this.authorizedFetch(`${this.apiBaseUrl}/api/layout/config`);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `Could not load layout config (${response.status}).`));
    }
    return (await response.json()) as LayoutConfigItemWire[];
  }
}
