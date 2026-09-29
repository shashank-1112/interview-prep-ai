import type { CornerOrientation, Rect } from './types';

const EPS = 1e-6;

/** Round away floating-point noise (e.g. 0.1 + 0.2) to 4 decimals. */
export function clean(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function snap(value: number, grid: number): number {
  if (!(grid > 0)) return clean(value);
  return clean(Math.round(value / grid) * grid);
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Strict overlap — rectangles that only share an edge do NOT overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x + EPS ||
    b.x + b.width <= a.x + EPS ||
    a.y + a.height <= b.y + EPS ||
    b.y + b.height <= a.y + EPS
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

export function rectContainsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

export function boundingBox(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Normalise a rect that may have been drawn with a negative width/height. */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** Notch proportion for Corner stalls (matches the original renderer). */
export const CORNER_NOTCH_RATIO = 0.45;

/**
 * Polygon for a Corner stall's L-shaped footprint: the bounding rectangle with a
 * smaller rectangle cut away from `orientation`'s corner. Returns a flat
 * [x0, y0, x1, y1, …] array (Konva `Line` points format), relative to (x, y).
 */
export function cornerShapePoints(
  x: number,
  y: number,
  w: number,
  h: number,
  orientation: CornerOrientation = 'top-right',
): number[] {
  const nw = w * CORNER_NOTCH_RATIO;
  const nh = h * CORNER_NOTCH_RATIO;
  let pts: Array<[number, number]>;
  switch (orientation) {
    case 'top-right':
      pts = [[x, y], [x + w - nw, y], [x + w - nw, y + nh], [x + w, y + nh], [x + w, y + h], [x, y + h]];
      break;
    case 'top-left':
      pts = [[x + nw, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + nh], [x + nw, y + nh]];
      break;
    case 'bottom-right':
      pts = [[x, y], [x + w, y], [x + w, y + h - nh], [x + w - nw, y + h - nh], [x + w - nw, y + h], [x, y + h]];
      break;
    case 'bottom-left':
      pts = [[x, y], [x + w, y], [x + w, y + h], [x + nw, y + h], [x + nw, y + h - nh], [x, y + h - nh]];
      break;
  }
  return pts.flat();
}

/**
 * Scan candidate positions (step = the new rect's own size) for one that doesn't
 * overlap any obstacle. Falls back to (0,0) with fits:false.
 */
export function findFreeSpot(
  w: number,
  h: number,
  bounds: { width: number; height: number },
  obstacles: readonly Rect[],
  /** Scan step; defaults to the item's own size (the original behaviour). Pass the grid for a thorough search. */
  step?: number,
): { x: number; y: number; fits: boolean } {
  const stepX = step && step > 0 ? step : Math.max(w, 0.5);
  const stepY = step && step > 0 ? step : Math.max(h, 0.5);
  for (let y = 0; y + h <= bounds.height + EPS; y = clean(y + stepY)) {
    for (let x = 0; x + w <= bounds.width + EPS; x = clean(x + stepX)) {
      const candidate = { x, y, width: w, height: h };
      if (!obstacles.some((o) => rectsOverlap(candidate, o))) {
        return { x: clean(Math.min(x, bounds.width - w)), y: clean(Math.min(y, bounds.height - h)), fits: true };
      }
    }
  }
  return { x: 0, y: 0, fits: false };
}

/**
 * Ids of rects that overlap at least one other rect. Sort-and-sweep on x so
 * 500+ stalls stay cheap.
 */
export function findOverlappingIds<T extends Rect & { id: number }>(items: readonly T[]): Set<number> {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const hits = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.x >= a.x + a.width - EPS) break;
      if (rectsOverlap(a, b)) {
        hits.add(a.id);
        hits.add(b.id);
      }
    }
  }
  return hits;
}

export function nextId(items: readonly { id: number }[]): number {
  let max = 0;
  for (const it of items) if (it.id > max) max = it.id;
  return max + 1;
}
