/**
 * Wire-compatible data model. Field names and semantics match the existing
 * Angular app / .NET API one-for-one — do not rename or reshape.
 */
export type StallStatus = 'available' | 'reserved' | 'booked' | 'blocked';
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
] as const;

export type AnnotationType = (typeof ANNOTATION_TYPE_VALUES)[number]; // parking area — inside or outside the ground, ground level only

/** Top-level ground / fairground container. */
export interface ExhibitionGround {
  id: number;
  exhibitionName: string;
  venueName: string;
  unit: LayoutUnit;
  width: number;
  height: number;
  gridSize: number;
}

/** A hall / hangar positioned within the ground (ground coordinates). */
export interface Hangar {
  id: number;
  name: string;
  code: string;
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
   * Sides left open to the aisle (drawn dotted). Omitted / empty = fully walled.
   * NEW optional field — the existing API must accept (or at least round-trip) it.
   */
  openSides?: RectSide[];
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

// ── Form types (ported as-is) ────────────────────────────────────────────────

export interface GenerateGroundForm {
  exhibitionName: string;
  venueName: string;
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
