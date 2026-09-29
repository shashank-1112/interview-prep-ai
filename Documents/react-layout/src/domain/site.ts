/**
 * Site-level rules: what may sit outside the exhibition ground, how far, and
 * where roads / parking get placed "beside" a side of the ground.
 *
 * Coordinates are ground coordinates (layout units). The ground occupies
 * [0, width] × [0, height]; the surrounding site extends into negative
 * coordinates and beyond the ground's far edges.
 */
import { UNIT_LABELS } from './constants';
import { boundingBox, clean, rectsOverlap } from './geometry';
import { ANNOTATION_TYPE_VALUES, type AnnotationType, type ExhibitionGround, type GroundSide, type LayoutAnnotation, type LayoutUnit, type Rect } from './types';

const EPS = 1e-6;

export const GROUND_SIDES: { value: GroundSide; label: string }[] = [
  { value: 'top', label: 'Top (north)' },
  { value: 'bottom', label: 'Bottom (south)' },
  { value: 'left', label: 'Left (west)' },
  { value: 'right', label: 'Right (east)' },
];

export function sideLabel(side: GroundSide): string {
  return GROUND_SIDES.find((s) => s.value === side)!.label;
}

/**
 * - `outside`: must not overlap the ground at all (roads).
 * - `either`: fully inside OR fully outside the ground (parking and the counter-type
 *   markers: ticketing, gift counter, washroom).
 * - `inside`: fully inside the ground (gates, open areas, walking paths).
 */
export type PlacementRule = 'inside' | 'outside' | 'either';

/** Counter-style markers: behave like the ticketing counter (inside or outside, also allowed in hangars). */
export const COUNTER_TYPES: readonly AnnotationType[] = ['ticketing', 'gift-counter', 'washroom'];

export function placementRule(type: AnnotationType): PlacementRule {
  if (type === 'road') return 'outside';
  if (type === 'parking' || COUNTER_TYPES.includes(type)) return 'either';
  return 'inside';
}

/** Types that only make sense at ground level (never inside a hangar). */
export const GROUND_ONLY_TYPES: readonly AnnotationType[] = ['road', 'parking'];

export function allowedAnnotationTypes(scope: 'ground' | 'hangar'): AnnotationType[] {
  const all = [...ANNOTATION_TYPE_VALUES];
  return scope === 'ground' ? all : all.filter((t) => !GROUND_ONLY_TYPES.includes(t));
}

/** Plural display name used in placement error messages. */
export function placementName(type: AnnotationType): string {
  switch (type) {
    case 'road':
      return 'Roads';
    case 'parking':
      return 'Parking areas';
    case 'ticketing':
      return 'Ticket counters';
    case 'gift-counter':
      return 'Gift counters';
    case 'washroom':
      return 'Washrooms';
    default:
      return 'This marker';
  }
}

/**
 * Ground-level items that occupy real floor space inside the ground and so must
 * not sit on top of a hangar (and hangars must not be dropped onto them).
 */
export function blocksHangars(a: Pick<LayoutAnnotation, 'type' | 'hangarId'>): boolean {
  return a.hangarId === null && placementRule(a.type) === 'either';
}

export function groundRect(g: Pick<ExhibitionGround, 'width' | 'height'>): Rect {
  return { x: 0, y: 0, width: g.width, height: g.height };
}

/** How far outside the ground things may be placed (layout units). */
export function siteMargin(g: Pick<ExhibitionGround, 'width' | 'height'>): number {
  return Math.max(15, Math.ceil(Math.max(g.width, g.height) * 0.3));
}

/**
 * The drawable / placeable site: the ground plus a margin on every side,
 * grown to include any ground-level annotation already stored further out
 * (so loaded data is never clipped or clamped).
 */
export function siteBounds(g: Pick<ExhibitionGround, 'width' | 'height'>, annotations: readonly LayoutAnnotation[] = []): Rect {
  const m = siteMargin(g);
  const base: Rect = { x: -m, y: -m, width: g.width + 2 * m, height: g.height + 2 * m };
  const outer = annotations.filter((a) => a.hangarId === null);
  return boundingBox([base, ...outer]) ?? base;
}

export function isInsideRect(r: Rect, outer: Rect): boolean {
  return (
    r.x >= outer.x - EPS &&
    r.y >= outer.y - EPS &&
    r.x + r.width <= outer.x + outer.width + EPS &&
    r.y + r.height <= outer.y + outer.height + EPS
  );
}

export function isInsideGround(r: Rect, g: Pick<ExhibitionGround, 'width' | 'height'>): boolean {
  return isInsideRect(r, groundRect(g));
}

/** Touching the ground edge counts as outside. */
export function isOutsideGround(r: Rect, g: Pick<ExhibitionGround, 'width' | 'height'>): boolean {
  return !rectsOverlap(r, groundRect(g));
}

export type GroundLocation = 'inside' | 'outside' | 'straddling';

export function groundLocation(r: Rect, g: Pick<ExhibitionGround, 'width' | 'height'>): GroundLocation {
  if (isInsideGround(r, g)) return 'inside';
  if (isOutsideGround(r, g)) return 'outside';
  return 'straddling';
}

/** Which side of the ground an outside rect sits beside (nearest side for corner positions). */
export function inferSide(r: Rect, g: Pick<ExhibitionGround, 'width' | 'height'>): GroundSide | null {
  if (!isOutsideGround(r, g)) return null;
  const gaps: Array<[GroundSide, number]> = [
    ['top', -(r.y + r.height)],
    ['bottom', r.y - g.height],
    ['left', -(r.x + r.width)],
    ['right', r.x - g.width],
  ];
  // Largest non-negative gap = the side it is clearly beyond; ties favour top/bottom.
  const beyond = gaps.filter(([, d]) => d >= -EPS);
  if (beyond.length === 0) return null;
  beyond.sort((a, b) => b[1] - a[1]);
  return beyond[0]![0];
}

/** Returns an error message, or null when the rect is a valid spot for a ground-level annotation of this type. */
export function validateGroundAnnotationRect(
  type: AnnotationType,
  r: Rect,
  g: Pick<ExhibitionGround, 'width' | 'height'>,
  site: Rect,
): string | null {
  const name = placementName(type);
  const rule = placementRule(type);
  if (rule === 'inside') {
    return isInsideGround(r, g) ? null : 'This marker must stay inside the ground.';
  }
  if (!isInsideRect(r, site)) return `${name} must stay within the site area around the ground.`;
  if (rule === 'outside') return isOutsideGround(r, g) ? null : 'Roads must be outside the ground — they cannot overlap it.';
  return groundLocation(r, g) === 'straddling' ? `${name} must be fully inside or fully outside the ground, not across its boundary.` : null;
}

/** Bounds a ground-level annotation of this type may be dragged/resized within. */
export function annotationDragBounds(type: AnnotationType, g: Pick<ExhibitionGround, 'width' | 'height'>, site: Rect): Rect {
  return placementRule(type) === 'inside' ? groundRect(g) : site;
}

/**
 * Size of a road/strip laid along a side: `length` runs parallel to the side,
 * `depth` is perpendicular (e.g. road width).
 */
export function orientSize(side: GroundSide, length: number, depth: number): { width: number; height: number } {
  return side === 'top' || side === 'bottom' ? { width: length, height: depth } : { width: depth, height: length };
}

/** Inverse of orientSize for an existing rect. */
export function lengthAndDepth(side: GroundSide, r: Pick<Rect, 'width' | 'height'>): { length: number; depth: number } {
  return side === 'top' || side === 'bottom' ? { length: r.width, depth: r.height } : { length: r.height, depth: r.width };
}

/**
 * Place a width×height rect beside `side` of the ground, at least `gap` away
 * from its edge. Candidates stay within the side's span (so the item is really
 * *beside* that side, never slid round a corner): first centred, then sliding
 * along the side, then stepping further out until nothing overlaps. Positions
 * snap to `grid`. The site grows to include whatever is placed, so the outward
 * search is not limited by the current site edge.
 */
export function placeBesideGround(
  side: GroundSide,
  width: number,
  height: number,
  gap: number,
  g: Pick<ExhibitionGround, 'width' | 'height'>,
  obstacles: readonly Rect[],
  grid = 0.5,
): { x: number; y: number; fits: boolean } {
  const step = Math.max(grid, 0.5);
  const horizontal = side === 'top' || side === 'bottom';
  const len = horizontal ? width : height;
  const depth = horizontal ? height : width;
  const sideLen = horizontal ? g.width : g.height;
  // Along-side range that keeps the item overlapping the side's span.
  const lo = Math.min(0, sideLen - len);
  const hi = Math.max(0, sideLen - len);
  const centred = clean(Math.min(hi, Math.max(lo, Math.round((sideLen - len) / 2 / step) * step)));
  const along: number[] = [centred];
  for (let k = 1; k < 100_000; k++) {
    const a = clean(centred + k * step);
    const b = clean(centred - k * step);
    const aOk = a <= hi + EPS;
    const bOk = b >= lo - EPS;
    if (!aOk && !bOk) break;
    if (aOk) along.push(a);
    if (bOk) along.push(b);
  }
  if (!along.some((a) => Math.abs(a - hi) < EPS)) along.push(clean(hi));
  if (!along.some((a) => Math.abs(a - lo) < EPS)) along.push(clean(lo));

  // Search outward until past every obstacle on this side — a spot beyond them all always fits.
  const reach = obstacles.reduce((m, o) => {
    const far = { top: -o.y, bottom: o.y + o.height - g.height, left: -o.x, right: o.x + o.width - g.width }[side];
    return Math.max(m, far);
  }, 0);
  const outwardMax = Math.max(siteMargin(g) * 4, reach) + depth + step;
  for (let d = gap; d <= gap + outwardMax + EPS; d = clean(d + step)) {
    for (const a of along) {
      const r = rectAt(side, a, d, len, depth, g);
      if (!obstacles.some((o) => rectsOverlap(r, o))) return { x: r.x, y: r.y, fits: true };
    }
  }
  const fallback = rectAt(side, centred, gap, len, depth, g);
  return { x: fallback.x, y: fallback.y, fits: false };
}

/** Distance from the ground edge to the far edge of an outside rect beside `side`. */
export function gapFromGround(r: Rect, side: GroundSide, g: Pick<ExhibitionGround, 'width' | 'height'>): number {
  return clean({ top: -(r.y + r.height), bottom: r.y - g.height, left: -(r.x + r.width), right: r.x - g.width }[side]);
}

/** Rect for an outside item beside `side` at `gap`, keeping its along-side position. */
export function atGap(r: Rect, side: GroundSide, gap: number, g: Pick<ExhibitionGround, 'width' | 'height'>): Rect {
  switch (side) {
    case 'top':
      return { ...r, y: beforeEdge(-gap - r.height) };
    case 'bottom':
      return { ...r, y: clean(g.height + gap) };
    case 'left':
      return { ...r, x: beforeEdge(-gap - r.width) };
    case 'right':
      return { ...r, x: clean(g.width + gap) };
  }
}

/**
 * How far out (layout units) the chain of outside items hugging each side
 * reaches: an item counts if it starts within `joinGap` of the ground edge or of
 * a counted item. Used to put dimension lines beyond them.
 */
export function outsideReach(
  annotations: readonly LayoutAnnotation[],
  g: Pick<ExhibitionGround, 'width' | 'height'>,
  joinGap: number,
): Record<GroundSide, number> {
  const bySide: Record<GroundSide, Array<{ gap: number; far: number }>> = { top: [], bottom: [], left: [], right: [] };
  for (const a of annotations) {
    if (a.hangarId !== null || groundLocation(a, g) !== 'outside') continue;
    const side = inferSide(a, g);
    if (!side) continue;
    const gap = gapFromGround(a, side, g);
    bySide[side].push({ gap, far: gap + (side === 'top' || side === 'bottom' ? a.height : a.width) });
  }
  const reach = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const side of Object.keys(bySide) as GroundSide[]) {
    for (const it of bySide[side].sort((x, y) => x.gap - y.gap)) {
      if (it.gap <= reach[side] + joinGap) reach[side] = Math.max(reach[side], it.far);
    }
  }
  return reach;
}

/**
 * Round a top/left coordinate DOWN to 4 decimals, so `coord + size` never pokes
 * past the ground edge by float noise (e.g. a 19.68504 ft road flush on top).
 */
const beforeEdge = (v: number) => Math.floor(v * 1e4 + 1e-7) / 1e4;

function rectAt(side: GroundSide, along: number, dist: number, len: number, depth: number, g: Pick<ExhibitionGround, 'width' | 'height'>): Rect {
  switch (side) {
    case 'top':
      return { x: along, y: beforeEdge(-dist - depth), width: len, height: depth };
    case 'bottom':
      return { x: along, y: clean(g.height + dist), width: len, height: depth };
    case 'left':
      return { x: beforeEdge(-dist - depth), y: along, width: depth, height: len };
    case 'right':
      return { x: clean(g.width + dist), y: along, width: depth, height: len };
  }
}

/** Largest size an outside item may have (sanity bound; the site grows to fit). */
export function maxOutsideSize(g: Pick<ExhibitionGround, 'width' | 'height'>): number {
  return Math.max(g.width, g.height) * 3;
}

// ── Measurements ─────────────────────────────────────────────────────────────

/** "24 m", "7.5 ft", "0.25 m" — at most 2 decimals, no trailing zeros. */
export function formatLength(value: number, unit: LayoutUnit): string {
  return `${Math.round(value * 100) / 100} ${UNIT_LABELS[unit]}`;
}

export function formatSize(width: number, height: number, unit: LayoutUnit): string {
  return `${Math.round(width * 100) / 100} × ${Math.round(height * 100) / 100} ${UNIT_LABELS[unit]}`;
}

const SQFT_PER_SQM = 10.7639;
/** Rule of thumb: ~25 m² per car including its share of the driving aisle. */
export const SQM_PER_CAR = 25;

export function parkingCapacity(width: number, height: number, unit: LayoutUnit): number {
  const area = width * height;
  const sqm = unit === 'feet' ? area / SQFT_PER_SQM : area;
  return Math.max(0, Math.floor(sqm / SQM_PER_CAR + EPS));
}
