/**
 * Wire-compatible data model. Field names and semantics match the existing
 * Angular app / .NET API one-for-one — do not rename or reshape.
 */
/**
 * "allocated" is a new status (seeded alongside "booked" on the backend, see
 * LAYOUT_PHASE1_DECISIONS.md item 3) — added to the type/schema so it round-trips, but no
 * code transitions a stall into it yet. When a stall becomes Allocated vs. Booked is Phase 2
 * lifecycle logic, deliberately not decided here.
 */
export type StallStatus = 'available' | 'reserved' | 'booked' | 'allocated' | 'blocked';
export type LayoutUnit = 'meter' | 'feet';

/**
 * Which corner of a Corner stall's bounding box is cut away to form its
 * L-shaped footprint.
 */
export type CornerOrientation = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Every annotation type, in display order. Single source for schemas and pickers. */
export const ANNOTATION_TYPE_VALUES = [
  'entry', // entrance door / gate
  'exit', // exit door / gate
  'entry-exit', // combined entry + exit
  'ticketing', // ticketing / registration counter — inside or outside the ground
  'gift-counter', // gift / souvenir counter — inside or outside the ground
  'washroom', // washroom / toilet block — inside or outside the ground
  'open-area', // open plaza / courtyard
  'walking', // walking corridor / pathway
  'road', // access road — always OUTSIDE the ground, ground level only
  'parking', // parking area — inside or outside the ground, ground level only
  'cctv', // security camera — inside a hangar or at ground level
  'fire-exit', // fire exit / escape route — inside a hangar or at ground level
] as const;

export type AnnotationType = (typeof ANNOTATION_TYPE_VALUES)[number]; // parking area — inside or outside the ground, ground level only

/** A point in layout units, ground coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** Top-level ground / fairground container. */
export interface ExhibitionGround {
  id: number;
  exhibitionName: string;
  venueName: string;
  unit: LayoutUnit;
  width: number;
  height: number;
  gridSize: number;
  /**
   * Custom boundary polygon, ordered around its perimeter, in ground coordinates. Undefined
   * or fewer than 3 points means "use the plain width×height rectangle" — width/height stay
   * the bounding-box size either way (grid/snap/canvas sizing are unaffected by the polygon
   * shape). See domain/site.ts's activeBoundary and LAYOUT_PHASE1_DECISIONS.md item 2.
   */
  boundary?: Point[];
  /**
   * Uniform inset from the boundary that hangars should stay clear of, in Unit. Zero/undefined
   * means no setback configured. A violation is a warning only — see domain/site.ts's
   * setbackViolation, never blocks a save or a drag.
   */
  setbackDistance?: number;
}

/** A hall / hangar positioned within the ground (ground coordinates). */
export interface Hangar {
  id: number;
  name: string;
  code: string;
  /** References a LayoutConfigItem.Code where kind is "HangarCategory" (e.g. "standard", "premium", "sponsor"). Undefined = uncategorized — no UI sets this yet. */
  categoryCode?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single bookable stall; x/y are relative to its hangar origin. */
export interface Stall {
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
  status: StallStatus;
  exhibitorName: string | null;
  /** Only meaningful when stallType === 'Corner' — defaults to 'top-right' when unset. */
  cornerOrientation?: CornerOrientation;
  /**
   * Links this stall to an existing booking (see AssignStallCommand on the
   * .NET side). Set/cleared only by the assign/unassign flow, never typed by
   * hand — ApiLayoutRepository must round-trip it unchanged on every save, or
   * a whole-snapshot PUT would silently drop the assignment.
   */
  stallBookingId?: number;
  /**
   * Sides left open to the aisle (drawn dotted). Omitted / empty = fully walled.
   * NEW optional field — the existing API must accept (or at least round-trip) it.
   */
  openSides?: RectSide[];
  /**
   * False for a complimentary/sponsor stall that shouldn't be charged for — BRD task 4.5.
   * Optional, undefined reads as billable (true) — matches the backend's own default, so
   * every stall created before this field existed (and every spot in this app that builds a
   * Stall without setting it) is still correctly billable without needing an update.
   */
  isBillable?: boolean;
}

export interface LayoutAnnotation {
  id: number;
  type: AnnotationType;
  label: string;
  /**
   * Ground coords when hangarId === null; local hangar coords otherwise.
   * Ground-level roads / parking / ticketing may sit outside the ground, so
   * x/y can be negative or exceed ground.width/height.
   */
  x: number;
  y: number;
  width: number;
  height: number;
  /** null = ground level. */
  hangarId: number | null;
}

/** Root storage shape. */
export interface StallLayoutData {
  ground: ExhibitionGround;
  hangars: Hangar[];
  stalls: Stall[];
  annotations: LayoutAnnotation[];
}

/**
 * A semantic action to record in the audit trail alongside the generic per-row CRUD logging
 * a save already produces — currently just stall merge/split. Queued in the store
 * (layoutStore.pendingLayoutEvents) when the action happens, sent on the next save, then
 * cleared. See LAYOUT_PHASE1_DECISIONS.md item 7.
 */
export interface LayoutEvent {
  type: 'merge' | 'split';
  /** Stall numbers before the action (the stalls merged, or the one stall split). */
  sourceStallLabels: string[];
  /** Stall numbers that resulted from the action. */
  resultStallLabels: string[];
}

// ── Form types (ported as-is) ────────────────────────────────────────────────

/**
 * No exhibitionName/venueName here on purpose: the exhibition is already
 * fixed by the picker (PlannerRoot) before this form ever opens, and the
 * backend ignores whatever a client sends for those two fields on create
 * anyway (LayoutSaveService always takes them from the real Exhibition). See
 * generateGround's `exhibition` parameter for where the real values come from.
 */
export interface GenerateGroundForm {
  unit: LayoutUnit;
  width: number;
  height: number;
  gridSize: number;
  numHangars: number;
  hangarPrefix: string;
  hangarWidth: number;
  hangarHeight: number;
  gap: number;
  startX: number;
  startY: number;
  hangarsPerRow: number;
}

export interface AddHangarForm {
  name: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HangarEditForm {
  name: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerateStallsForm {
  hangarId: number;
  rows: number;
  columns: number;
  prefix: string;
  startNumber: number;
  sizePreset: string;
  stallWidth: number;
  stallHeight: number;
  gapX: number;
  gapY: number;
  startX: number;
  startY: number;
  stallType: string;
  basePrice: number;
  cornerOrientation: CornerOrientation;
  isBillable: boolean;
}

export interface StallEditForm {
  stallNo: string;
  stallType: string;
  width: number;
  height: number;
  x: number;
  y: number;
  basePrice: number;
  finalPrice: number;
  status: StallStatus;
  exhibitorName: string;
  cornerOrientation: CornerOrientation;
  isBillable: boolean;
}

export interface StallSizePreset {
  label: string;
  width: number;
  height: number;
}

/** Axis-aligned rectangle in layout units. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A side of an axis-aligned rectangle (stall, hangar, ground). */
export type RectSide = 'top' | 'right' | 'bottom' | 'left';

export const RECT_SIDES: readonly RectSide[] = ['top', 'right', 'bottom', 'left'];

/** A side of the exhibition ground, for placing roads / parking beside it. */
export type GroundSide = RectSide;

/**
 * Admin-configurable category/status/colour entry — matches
 * Shared.DTOs.Layout.LayoutConfigItemDto. Fetched once via LayoutRepository.getConfig() and
 * stored in layoutStore.layoutConfig; see domain/constants.ts's STALL_COLORS etc. for the
 * fallback values used when this list is empty (not yet fetched, or a repo — e.g. the
 * in-memory/localStorage ones used in tests — that doesn't implement getConfig()).
 */
export interface LayoutConfigItem {
  kind: 'StallCategory' | 'StallStatus' | 'HangarCategory';
  code: string;
  name: string;
  colorFill: string;
  colorStroke: string;
  colorText: string;
  sortOrder: number;
  isSystem: boolean;
}
