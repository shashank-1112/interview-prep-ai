/**
 * Stall layout patterns for "Generate Stalls".
 *
 * - `perimeter` (default, matches the planning sketch): rows of stalls attached
 *   to the hangar walls, optional back-to-back island blocks in the centre,
 *   separated by aisles. Every stall is left open on the side facing an aisle.
 * - `grid`: the original rows × columns fill with gaps.
 *
 * The planner is pure and cheap, so the form uses it for a live preview and the
 * generator uses the same output — what you see is what gets created.
 */
import { clean, snap } from './geometry';
import type { GenerateStallsForm, Rect, RectSide } from './types';

export type StallPattern = 'perimeter' | 'grid';

/** Generate Stalls input: the ported GenerateStallsForm plus the layout-pattern options. */
export interface GenerateStallsInput extends GenerateStallsForm {
  pattern: StallPattern;
  /** Perimeter: which hangar walls get a row of stalls. */
  walls: RectSide[];
  /** Perimeter: distance between the walls and the wall rows (0 = attached). */
  wallGap: number;
  /** Perimeter: aisle width between wall rows and islands, and between islands. */
  aisle: number;
  /** Perimeter: fill the centre with back-to-back island blocks. */
  islands: boolean;
  /** Grid: sides left open on every generated stall. */
  openSides: RectSide[];
}

export type PlanZone = RectSide | 'island' | 'grid';

export interface PlannedStall extends Rect {
  openSides: RectSide[];
  zone: PlanZone;
}

export interface StallPlan {
  stalls: PlannedStall[];
  /** Grid only: index of the first cell that no longer fits (generation stops there). */
  overflowAt: number | null;
  counts: Record<PlanZone, number>;
  islandCount: number;
}

const EPS = 1e-6;
const OPPOSITE: Record<RectSide, RectSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** How many `size`-long stalls fit contiguously in `span`. */
const fitCount = (span: number, size: number) => (size > 0 && span > 0 ? Math.floor((span + EPS) / size) : 0);

function sideSegment(r: Rect, side: RectSide): { fixed: number; from: number; to: number; horizontal: boolean } {
  switch (side) {
    case 'top':
      return { fixed: r.y, from: r.x, to: r.x + r.width, horizontal: true };
    case 'bottom':
      return { fixed: r.y + r.height, from: r.x, to: r.x + r.width, horizontal: true };
    case 'left':
      return { fixed: r.x, from: r.y, to: r.y + r.height, horizontal: false };
    case 'right':
      return { fixed: r.x + r.width, from: r.y, to: r.y + r.height, horizontal: false };
  }
}

/**
 * Length of `side` of `r` not touched by any neighbour — i.e. how much of that
 * side actually faces open floor. A corner stall boxed in by the next row has 0.
 */
export function uncoveredLength(r: Rect, side: RectSide, neighbours: readonly Rect[]): number {
  const seg = sideSegment(r, side);
  const opposite = OPPOSITE[side];
  const covered: Array<[number, number]> = [];
  for (const n of neighbours) {
    if (n === r) continue;
    const o = sideSegment(n, opposite);
    if (o.horizontal !== seg.horizontal || Math.abs(o.fixed - seg.fixed) > 1e-3) continue;
    const a = Math.max(seg.from, o.from);
    const b = Math.min(seg.to, o.to);
    if (b > a + EPS) covered.push([a, b]);
  }
  covered.sort((p, q) => p[0] - q[0]);
  let total = 0;
  let curA = -Infinity;
  let curB = -Infinity;
  for (const [a, b] of covered) {
    if (a > curB) {
      if (curB > curA) total += curB - curA;
      curA = a;
      curB = b;
    } else curB = Math.max(curB, b);
  }
  if (curB > curA) total += curB - curA;
  return Math.max(0, seg.to - seg.from - total);
}

/** A side counts as facing the aisle when a meaningful stretch of it is uncovered. */
function facesAisle(r: Rect, side: RectSide, neighbours: readonly Rect[]): boolean {
  const len = side === 'top' || side === 'bottom' ? r.width : r.height;
  return uncoveredLength(r, side, neighbours) >= Math.max(0.5, len * 0.25) - EPS;
}

function emptyCounts(): Record<PlanZone, number> {
  return { top: 0, right: 0, bottom: 0, left: 0, island: 0, grid: 0 };
}

export function planStallLayout(
  hangar: { width: number; height: number },
  f: Pick<
    GenerateStallsInput,
    'pattern' | 'walls' | 'wallGap' | 'aisle' | 'islands' | 'openSides' | 'rows' | 'columns' | 'stallWidth' | 'stallHeight' | 'gapX' | 'gapY' | 'startX' | 'startY'
  >,
  grid = 0.5,
  /** Existing stalls in the hangar — they count as neighbours when deciding which sides face an aisle. */
  existing: readonly Rect[] = [],
): StallPlan {
  const counts = emptyCounts();
  const W = hangar.width;
  const H = hangar.height;
  const frontage = Number(f.stallWidth);
  const depth = Number(f.stallHeight);
  if (!(frontage > 0) || !(depth > 0)) return { stalls: [], overflowAt: null, counts, islandCount: 0 };

  if (f.pattern === 'grid') {
    const stalls: PlannedStall[] = [];
    let overflowAt: number | null = null;
    const open = [...new Set(f.openSides ?? [])];
    outer: for (let row = 0; row < f.rows; row++) {
      for (let col = 0; col < f.columns; col++) {
        const r: Rect = {
          x: clean(f.startX + col * (frontage + f.gapX)),
          y: clean(f.startY + row * (depth + f.gapY)),
          width: frontage,
          height: depth,
        };
        if (r.x + r.width > W + EPS || r.y + r.height > H + EPS) {
          overflowAt = row * f.columns + col;
          break outer;
        }
        stalls.push({ ...r, openSides: open, zone: 'grid' });
      }
    }
    counts.grid = stalls.length;
    return { stalls, overflowAt, counts, islandCount: 0 };
  }

  // ── Perimeter: rows attached to the walls ──
  const m = Math.max(0, Number(f.wallGap) || 0);
  const aisle = Math.max(0, Number(f.aisle) || 0);
  const walls = new Set(f.walls);
  const top = walls.has('top');
  const bottom = walls.has('bottom');
  const left = walls.has('left');
  const right = walls.has('right');
  const colStart = top ? m + depth : m;
  const colEnd = bottom ? H - m - depth : H - m;
  const planned: PlannedStall[] = [];
  const push = (r: Rect, zone: PlanZone, candidates: RectSide[]) =>
    planned.push({ x: clean(r.x), y: clean(r.y), width: r.width, height: r.height, zone, openSides: candidates });

  // Clockwise numbering: top L→R, right T→B, bottom R→L, left B→T.
  if (top && depth <= H - 2 * m + EPS) {
    const n = fitCount(W - 2 * m, frontage);
    for (let i = 0; i < n; i++) push({ x: m + i * frontage, y: m, width: frontage, height: depth }, 'top', ['bottom']);
  }
  if (right && depth <= W - 2 * m + EPS) {
    const n = fitCount(colEnd - colStart, frontage);
    for (let i = 0; i < n; i++) push({ x: W - m - depth, y: colStart + i * frontage, width: depth, height: frontage }, 'right', ['left']);
  }
  if (bottom && depth <= H - 2 * m + EPS && (!top || H - 2 * m >= 2 * depth - EPS)) {
    const n = fitCount(W - 2 * m, frontage);
    for (let i = n - 1; i >= 0; i--) push({ x: m + i * frontage, y: H - m - depth, width: frontage, height: depth }, 'bottom', ['top']);
  }
  if (left && depth <= W - 2 * m + EPS && (!right || W - 2 * m >= 2 * depth - EPS)) {
    const n = fitCount(colEnd - colStart, frontage);
    for (let i = n - 1; i >= 0; i--) push({ x: m, y: colStart + i * frontage, width: depth, height: frontage }, 'left', ['right']);
  }

  // ── Centre islands: pairs of stalls back to back, open on their outer sides ──
  let islandCount = 0;
  if (f.islands) {
    const x0 = (left ? m + depth : m) + aisle;
    const x1 = (right ? W - m - depth : W - m) - aisle;
    const y0 = (top ? m + depth : m) + aisle;
    const y1 = (bottom ? H - m - depth : H - m) - aisle;
    const islandW = depth * 2;
    const n = x1 - x0 >= islandW - EPS ? Math.floor((x1 - x0 + aisle + EPS) / (islandW + aisle)) : 0;
    const rows = fitCount(y1 - y0, frontage);
    if (n > 0 && rows > 0) {
      islandCount = n;
      const groupW = n * islandW + (n - 1) * aisle;
      // Centre the islands across the free width, on the grid, never closer than one aisle to the wall rows.
      const startX = Math.min(Math.max(snap(x0 + (x1 - x0 - groupW) / 2, grid), x0), x1 - groupW);
      for (let i = 0; i < n; i++) {
        const xi = startX + i * (islandW + aisle);
        for (const [colX, outer] of [
          [xi, 'left'],
          [xi + depth, 'right'],
        ] as const) {
          for (let r = 0; r < rows; r++) {
            const sides: RectSide[] = [outer];
            if (r === 0) sides.push('top');
            if (r === rows - 1) sides.push('bottom');
            push({ x: colX, y: y0 + r * frontage, width: depth, height: frontage }, 'island', sides);
          }
        }
      }
    }
  }

  // Keep only candidate sides that really face open floor (drops boxed-in corner stalls' sides).
  const neighbours: Rect[] = [...planned, ...existing];
  for (const p of planned) {
    p.openSides = p.openSides.filter((side) => facesAisle(p, side, neighbours));
    counts[p.zone]++;
  }
  return { stalls: planned, overflowAt: null, counts, islandCount };
}

/** Human summary for the form: "22 stalls — top 6 · right 4 · left 4 · 1 island (8)". */
export function describePlan(plan: StallPlan): string {
  const c = plan.counts;
  if (plan.stalls.length === 0) return 'No stalls fit with these settings.';
  if (c.grid) return `${c.grid} stall${c.grid === 1 ? '' : 's'}`;
  const parts: string[] = [];
  for (const z of ['top', 'right', 'bottom', 'left'] as const) if (c[z]) parts.push(`${z} ${c[z]}`);
  if (c.island) parts.push(`${plan.islandCount} island${plan.islandCount === 1 ? '' : 's'} (${c.island})`);
  return `${plan.stalls.length} stalls — ${parts.join(' · ')}`;
}
