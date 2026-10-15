/**
 * Pure layout operations. Every function takes immutable inputs and returns new
 * values — the store wraps them to push undo snapshots.
 * Behaviour mirrors the original Angular planner rule-for-rule.
 */
import type {
  ExhibitionGround,
  GenerateGroundForm,
  GenerateStallsForm,
  Hangar,
  LayoutAnnotation,
  Rect,
  RectSide,
  Stall,
  StallLayoutData,
  StallStatus,
} from './types';
import { annotationMeta, UNIT_LABELS } from './constants';
import { boundingBox, clamp, clean, nextId, rectsOverlap, round2, snap } from './geometry';
import { blocksHangars, isInsideGround, isOutsideGround } from './site';
import { planStallLayout, type GenerateStallsInput } from './stallLayout';

export type Result<T> = { ok: true; value: T; warnings: string[] } | { ok: false; error: string; field?: string };

const ok = <T,>(value: T, warnings: string[] = []): Result<T> => ({ ok: true, value, warnings });
const fail = <T,>(error: string, field?: string): Result<T> =>
  field === undefined ? { ok: false, error } : { ok: false, error, field };

export function stallArea(width: number, height: number): number {
  return round2(width * height);
}

export function minSizeFor(ground: ExhibitionGround | null | undefined): number {
  const g = ground?.gridSize ?? 0.5;
  return clean(g * 2);
}

// ── Ground generation ────────────────────────────────────────────────────────

export function autoFillHangarSize(f: GenerateGroundForm): { hangarWidth: number; hangarHeight: number } | null {
  const numCols = Math.max(1, Number(f.hangarsPerRow));
  const numRows = Math.ceil(Math.max(1, Number(f.numHangars)) / numCols);
  const gap = Math.max(0, Number(f.gap));
  const sX = Math.max(0, Number(f.startX));
  const sY = Math.max(0, Number(f.startY));
  const gW = Math.max(1, Number(f.width));
  const gH = Math.max(1, Number(f.height));
  // Whole units, rounded down (so the hangars always still fit); the epsilon keeps 26.9999… at 27.
  const hW = Math.floor((gW - 2 * sX - (numCols - 1) * gap) / numCols + 1e-9);
  const hH = Math.floor((gH - 2 * sY - (numRows - 1) * gap) / numRows + 1e-9);
  if (hW <= 0 || hH <= 0) return null;
  return { hangarWidth: hW, hangarHeight: hH };
}

/** Hangar letter for index i: A..Z, then AA, AB, … (original used A+i only). */
export function hangarLetter(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** exhibition comes from the picker (PlannerRoot sets it on the store once,
 *  at selection time), never from this form — see GenerateGroundForm's doc
 *  comment in domain/types.ts. */
export function generateGround(f: GenerateGroundForm, exhibition: { name: string; venueName: string }): Result<StallLayoutData> {
  const ground: ExhibitionGround = {
    id: 1,
    exhibitionName: exhibition.name.trim(),
    venueName: exhibition.venueName.trim(),
    unit: f.unit,
    width: f.width,
    height: f.height,
    gridSize: f.gridSize,
  };
  const perRow = Math.max(1, f.hangarsPerRow);
  const hangars: Hangar[] = [];
  for (let i = 0; i < f.numHangars; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = clean(f.startX + col * (f.hangarWidth + f.gap));
    const y = clean(f.startY + row * (f.hangarHeight + f.gap));
    if (x + f.hangarWidth > ground.width + 1e-6 || y + f.hangarHeight > ground.height + 1e-6) {
      return fail(`Hangar ${i + 1} would exceed the ground boundary. Increase ground size or reduce hangar count.`);
    }
    const letter = hangarLetter(i);
    hangars.push({
      id: i + 1,
      name: `${f.hangarPrefix.trim()} ${letter}`,
      code: `H-${letter}`,
      x,
      y,
      width: f.hangarWidth,
      height: f.hangarHeight,
    });
  }
  for (let i = 0; i < hangars.length; i++) {
    for (let j = i + 1; j < hangars.length; j++) {
      if (rectsOverlap(hangars[i]!, hangars[j]!)) {
        return fail('Hangars would overlap. Reduce hangar size or increase gap.');
      }
    }
  }
  return ok({ ground, hangars, stalls: [], annotations: [] });
}

// ── Ground edit ──────────────────────────────────────────────────────────────

export interface GroundEdit {
  width: number;
  height: number;
  gridSize: number;
}

const GATE_TYPES: readonly LayoutAnnotation['type'][] = ['entry', 'exit', 'entry-exit'];

function nameList(names: string[]): string {
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

/**
 * Change the ground's size and grid in place, keeping every hangar, stall and marker.
 * The origin (top-left) is fixed, so only the right and bottom edges move: ground-level
 * items beyond those edges (roads, parking, counters outside the ground) and gates sitting on
 * them move with the edge, keeping their distance. Everything else stays put.
 * Refuses a size that would cut off a hangar, a marker inside the ground or a custom
 * boundary, and a coarser grid than the smallest stall/hangar can take (its minimum size is
 * two grid steps).
 */
export function resizeGround(data: StallLayoutData, edit: GroundEdit): Result<StallLayoutData> {
  const old = data.ground;
  const ground: ExhibitionGround = { ...old, width: clean(Number(edit.width)), height: clean(Number(edit.height)), gridSize: clean(Number(edit.gridSize)) };
  if (!(ground.width > 0) || !(ground.height > 0) || !(ground.gridSize > 0)) return fail('Width, length and grid size must be positive.');
  const u = UNIT_LABELS[old.unit];
  const EPS = 1e-6;

  const dW = ground.width - old.width;
  const dH = ground.height - old.height;
  const annotations = data.annotations.map((a) => {
    if (a.hangarId !== null) return a;
    const outside = isOutsideGround(a, old);
    const gate = !outside && GATE_TYPES.includes(a.type);
    const right = outside ? a.x >= old.width - EPS : gate && Math.abs(a.x + a.width - old.width) < EPS;
    const below = outside ? a.y >= old.height - EPS : gate && Math.abs(a.y + a.height - old.height) < EPS;
    if (!right && !below) return a;
    return { ...a, x: right ? clean(a.x + dW) : a.x, y: below ? clean(a.y + dH) : a.y };
  });

  // Everything that sits inside the ground and doesn't move must still fit.
  const staying = [
    ...data.hangars.map((h) => ({ name: h.name, r: h as Rect })),
    ...annotations
      .filter((a, i) => a.hangarId === null && isInsideGround(data.annotations[i]!, old))
      .map((a) => ({ name: a.label || annotationMeta(a.type).label, r: a as Rect })),
  ];
  const cut = staying.filter(({ r }) => !isInsideGround(r, ground));
  if (cut.length) {
    const needW = clean(Math.max(...staying.map(({ r }) => r.x + r.width)));
    const needH = clean(Math.max(...staying.map(({ r }) => r.y + r.height)));
    return fail(
      `${nameList(cut.map((c) => c.name))} would be cut off — the ground must be at least ${needW} × ${needH} ${u}.`,
      ground.width < needW - EPS ? 'width' : 'height',
    );
  }
  if (old.boundary && old.boundary.length >= 3 && old.boundary.some((p) => p.x > ground.width + EPS || p.y > ground.height + EPS)) {
    return fail('The custom ground boundary reaches beyond the new size.');
  }

  for (const [type, plural] of [['road', 'Roads'], ['parking', 'Parking areas']] as const) {
    const items = annotations.filter((a) => a.hangarId === null && a.type === type);
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++)
        if (rectsOverlap(items[i]!, items[j]!)) return fail(`${plural} "${items[i]!.label}" and "${items[j]!.label}" would overlap at this size.`);
  }

  if (ground.gridSize > old.gridSize + EPS) {
    const sizes = [...data.hangars, ...data.stalls].map((r) => Math.min(r.width, r.height));
    const smallest = sizes.length ? Math.min(...sizes) : Infinity;
    if (ground.gridSize * 2 > smallest + EPS) {
      return fail(
        `A ${ground.gridSize} ${u} grid is too coarse: the smallest stall or hangar side is ${clean(smallest)} ${u}, so the grid can be at most ${clean(smallest / 2)} ${u}.`,
        'gridSize',
      );
    }
  }

  return ok({ ...data, ground, annotations });
}

// ── Hangar spacing ───────────────────────────────────────────────────────────

export interface HangarSpacing {
  /** Gap between hangars side by side in a row. */
  gapX: number;
  /** Gap between one row of hangars and the next. */
  gapY: number;
}

/** Hangars grouped into rows, top to bottom, each row left to right. Hangars whose vertical extents overlap share a row. */
export function hangarRows(hangars: readonly Hangar[]): Hangar[][] {
  const rows: Hangar[][] = [];
  let bottom = -Infinity;
  for (const h of [...hangars].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && h.y < bottom - 1e-6) {
      row.push(h);
      bottom = Math.max(bottom, h.y + h.height);
    } else {
      rows.push([h]);
      bottom = h.y + h.height;
    }
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

/** The most common gap now (side by side / between rows), or null when there is no such pair. */
export function currentHangarSpacing(hangars: readonly Hangar[]): { gapX: number | null; gapY: number | null } {
  const rows = hangarRows(hangars);
  const mostCommon = (gaps: number[]) => {
    if (!gaps.length) return null;
    const tally = new Map<number, number>();
    for (const g of gaps.map((v) => round2(v))) tally.set(g, (tally.get(g) ?? 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  };
  const xs = rows.flatMap((r) => r.slice(1).map((h, i) => h.x - (r[i]!.x + r[i]!.width)));
  const ys = rows.slice(1).map((r, i) => Math.min(...r.map((h) => h.y)) - Math.max(...rows[i]!.map((h) => h.y + h.height)));
  return { gapX: mostCommon(xs), gapY: mostCommon(ys) };
}

export interface HangarGap {
  /** 'x' = a horizontal gap (measured left → right), 'y' = a vertical gap (top → bottom). */
  axis: 'x' | 'y';
  from: number;
  to: number;
  /** Where the measuring line sits on the other axis. */
  at: number;
  /** The far side is the ground edge, not another hangar. */
  edge: boolean;
}

/**
 * Clear space around hangars, for the dimension overlay: from each hangar to its nearest
 * neighbour to the right and below (one entry per pair), and to the ground edge on any side
 * with no hangar between. Lines sit three-quarters of the way along the shared span, which
 * keeps them off the hangar name (top-left) and the centred width/length labels.
 */
export function hangarGaps(hangars: readonly Hangar[], ground: Pick<ExhibitionGround, 'width' | 'height'>): HangarGap[] {
  const EPS = 1e-6;
  const at = (a0: number, a1: number, b0: number, b1: number) => {
    const s = Math.max(a0, b0);
    return s + (Math.min(a1, b1) - s) * 0.75;
  };
  const gaps: HangarGap[] = [];
  for (const h of hangars) {
    const r = h.x + h.width;
    const b = h.y + h.height;
    const sameRow = hangars.filter((o) => o !== h && o.y < b - EPS && o.y + o.height > h.y + EPS);
    const right = sameRow.filter((o) => o.x >= r - EPS).sort((p, q) => p.x - q.x)[0];
    if (right) {
      if (right.x - r > EPS) gaps.push({ axis: 'x', from: r, to: right.x, at: at(h.y, b, right.y, right.y + right.height), edge: false });
    } else if (ground.width - r > EPS) gaps.push({ axis: 'x', from: r, to: ground.width, at: at(h.y, b, h.y, b), edge: true });
    if (h.x > EPS && !sameRow.some((o) => o.x + o.width <= h.x + EPS)) gaps.push({ axis: 'x', from: 0, to: h.x, at: at(h.y, b, h.y, b), edge: true });

    const sameColumn = hangars.filter((o) => o !== h && o.x < r - EPS && o.x + o.width > h.x + EPS);
    const below = sameColumn.filter((o) => o.y >= b - EPS).sort((p, q) => p.y - q.y)[0];
    if (below) {
      if (below.y - b > EPS) gaps.push({ axis: 'y', from: b, to: below.y, at: at(h.x, r, below.x, below.x + below.width), edge: false });
    } else if (ground.height - b > EPS) gaps.push({ axis: 'y', from: b, to: ground.height, at: at(h.x, r, h.x, r), edge: true });
    if (h.y > EPS && !sameColumn.some((o) => o.y + o.height <= h.y + EPS)) gaps.push({ axis: 'y', from: 0, to: h.y, at: at(h.x, r, h.x, r), edge: true });
  }
  return gaps;
}

/** Where every hangar lands at the given gaps — positions only, no validation (see spaceHangars). */
export function respacedHangars(hangars: readonly Hangar[], spacing: HangarSpacing): Hangar[] {
  const gapX = Number(spacing.gapX);
  const gapY = Number(spacing.gapY);
  const placed = new Map<number, { x: number; y: number }>();
  let prevBottom: number | null = null;
  for (const row of hangarRows(hangars)) {
    const top = Math.min(...row.map((h) => h.y));
    const dy = prevBottom === null ? 0 : prevBottom + gapY - top;
    let nextX: number | null = null;
    for (const h of row) {
      const x: number = nextX ?? h.x;
      placed.set(h.id, { x: clean(x), y: clean(h.y + dy) });
      nextX = x + h.width + gapX;
    }
    prevBottom = Math.max(...row.map((h) => h.y + dy + h.height));
  }
  return hangars.map((h) => ({ ...h, ...placed.get(h.id)! }));
}

/**
 * Re-space every hangar to the given gaps, keeping rows and their order: the first hangar in
 * each row and the top row stay put, the rest slide (hangars keep their vertical offsets within
 * a row). Stalls and in-hangar markers are hangar-relative, so they move with their hangar.
 * Refuses spacing that pushes a hangar past the ground edge, onto another hangar, or onto a
 * ground-level marker hangars may not cover (parking, counters) — the same rules as moving one.
 */
export function spaceHangars(data: StallLayoutData, spacing: HangarSpacing): Result<StallLayoutData> {
  if (!(Number(spacing.gapX) >= 0) || !(Number(spacing.gapY) >= 0)) return fail('Gaps cannot be negative.');
  const hangars = respacedHangars(data.hangars, spacing);

  const g = data.ground;
  const u = UNIT_LABELS[g.unit];
  const off = hangars.filter((h) => !isInsideGround(h, g));
  if (off.length) {
    const needW = clean(Math.max(...hangars.map((h) => h.x + h.width)));
    const needH = clean(Math.max(...hangars.map((h) => h.y + h.height)));
    return fail(
      `${nameList(off.map((h) => h.name))} would go past the ground edge — this spacing needs ${needW} × ${needH} ${u} and the ground is ${g.width} × ${g.height} ${u}. Use a smaller gap, or enlarge the ground with Edit ground.`,
      needW > g.width + 1e-6 ? 'gapX' : 'gapY',
    );
  }
  for (let i = 0; i < hangars.length; i++)
    for (let j = i + 1; j < hangars.length; j++)
      if (rectsOverlap(hangars[i]!, hangars[j]!)) return fail(`${hangars[i]!.name} and ${hangars[j]!.name} would overlap at this spacing.`);
  for (const h of hangars) {
    const was = data.hangars.find((o) => o.id === h.id)!;
    const blocker = data.annotations.find((a) => blocksHangars(a) && rectsOverlap(h, a) && !rectsOverlap(was, a));
    if (blocker) return fail(`${h.name} would land on "${blocker.label}" — move that marker first, or use a different gap.`);
  }
  return ok({ ...data, hangars });
}

// ── Hangar placement validation ──────────────────────────────────────────────

export interface HangarDraft {
  name: string;
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Field → message map for cross-entity hangar rules (bounds, overlap, duplicates, contents). */
export function validateHangarDraft(
  data: StallLayoutData,
  draft: HangarDraft,
  excludeId: number | null,
): Partial<Record<keyof HangarDraft, string>> {
  const errors: Partial<Record<keyof HangarDraft, string>> = {};
  const { ground } = data;
  const unit = ground.unit === 'feet' ? 'ft' : 'm';
  const others = data.hangars.filter((h) => h.id !== excludeId);
  const dup = others.find(
    (h) =>
      h.code.toLowerCase() === draft.code.trim().toLowerCase() ||
      h.name.toLowerCase() === draft.name.trim().toLowerCase(),
  );
  if (dup) errors.name = 'A hangar with this name or code already exists.';
  if (draft.x + draft.width > ground.width + 1e-6) errors.x = `Exceeds ground width (${ground.width}${unit}).`;
  if (draft.y + draft.height > ground.height + 1e-6) errors.y = `Exceeds ground height (${ground.height}${unit}).`;
  if (!errors.x && others.some((h) => rectsOverlap(draft, h))) errors.x = 'Hangar overlaps an existing hangar.';
  // Only NEW overlaps count, so a hangar that already overlaps (legacy data) can still be renamed.
  const current = excludeId !== null ? data.hangars.find((h) => h.id === excludeId) : undefined;
  const blocker = data.annotations.find((a) => blocksHangars(a) && rectsOverlap(draft, a) && !(current && rectsOverlap(current, a)));
  if (!errors.x && blocker) errors.x = `Overlaps "${blocker.label}" on the ground.`;
  if (excludeId !== null) {
    const outside = data.stalls.some(
      (s) => s.hangarId === excludeId && (s.x + s.width > draft.width + 1e-6 || s.y + s.height > draft.height + 1e-6),
    );
    if (outside) errors.width = 'Existing stalls would fall outside the new size — resize/move them first.';
  }
  return errors;
}

/** Smallest size a hangar can be resized to without pushing its stalls/markers outside. */
export function hangarContentExtent(data: StallLayoutData, hangarId: number): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const s of data.stalls) {
    if (s.hangarId !== hangarId) continue;
    width = Math.max(width, s.x + s.width);
    height = Math.max(height, s.y + s.height);
  }
  for (const a of data.annotations) {
    if (a.hangarId !== hangarId) continue;
    width = Math.max(width, a.x + a.width);
    height = Math.max(height, a.y + a.height);
  }
  return { width, height };
}

export function deleteHangar(data: StallLayoutData, hangarId: number): StallLayoutData {
  return {
    ...data,
    hangars: data.hangars.filter((h) => h.id !== hangarId),
    stalls: data.stalls.filter((s) => s.hangarId !== hangarId),
    annotations: data.annotations.filter((a) => a.hangarId !== hangarId),
  };
}

// ── Hangar duplication ───────────────────────────────────────────────────────

/**
 * Spacing between a hangar and its copy: the smallest gap already used between
 * neighbouring hangars (so it matches however the ground was generated), else
 * 2 units; rounded UP to the grid so it's never reduced to zero.
 */
export function defaultHangarGap(data: Pick<StallLayoutData, 'ground' | 'hangars'>): number {
  const { ground, hangars } = data;
  let best = Infinity;
  for (let i = 0; i < hangars.length; i++) {
    for (let j = i + 1; j < hangars.length; j++) {
      const a = hangars[i]!;
      const b = hangars[j]!;
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      if (overlapY > 0) best = Math.min(best, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)));
      if (overlapX > 0) best = Math.min(best, Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)));
    }
  }
  const gap = Number.isFinite(best) && best > 0 ? best : 2;
  const g = ground.gridSize > 0 ? ground.gridSize : 0.5;
  return clean(Math.ceil(gap / g - 1e-9) * g);
}

/**
 * Find where a w×h hangar can go without overlapping other hangars (keeping
 * `gap` clear between them) or inside-ground markers. Tries right of / below /
 * left of / above the source first, then scans the whole ground row by row.
 */
export function findHangarSpot(
  data: StallLayoutData,
  source: Pick<Hangar, 'x' | 'y' | 'width' | 'height'>,
  gap: number,
): { x: number; y: number } | null {
  const { ground } = data;
  const w = source.width;
  const h = source.height;
  // Padded obstacles so copies keep the same breathing room generated hangars get.
  const hangarBoxes = data.hangars.map((o) => ({ x: o.x - gap, y: o.y - gap, width: o.width + gap * 2, height: o.height + gap * 2 }));
  // Any ground-level marker that touches the ground at all (flush or straddling) is in the way.
  const groundBox = { x: 0, y: 0, width: ground.width, height: ground.height };
  const markers = data.annotations.filter((a) => a.hangarId === null && rectsOverlap(a, groundBox));
  const fits = (x: number, y: number) => {
    if (x < -1e-6 || y < -1e-6 || x + w > ground.width + 1e-6 || y + h > ground.height + 1e-6) return false;
    const r = { x, y, width: w, height: h };
    return !hangarBoxes.some((o) => rectsOverlap(r, o)) && !markers.some((m) => rectsOverlap(r, m));
  };
  const g = ground.gridSize;
  const preferred: Array<[number, number]> = [
    [source.x + source.width + gap, source.y],
    [source.x, source.y + source.height + gap],
    [source.x - gap - w, source.y],
    [source.x, source.y - gap - h],
  ];
  for (const [x, y] of preferred) {
    const sx = snap(x, g);
    const sy = snap(y, g);
    if (fits(sx, sy)) return { x: sx, y: sy };
  }
  // A multiple of the grid that is at least 0.5, so fallback spots stay on the grid.
  const step = g > 0 ? g * Math.max(1, Math.ceil(0.5 / g - 1e-9)) : 0.5;
  for (let y = 0; y + h <= ground.height + 1e-6; y = clean(y + step)) {
    for (let x = 0; x + w <= ground.width + 1e-6; x = clean(x + step)) {
      if (fits(x, y)) return { x, y };
    }
  }
  return null;
}

/** Next unused name/code for a copy of `source`: "Hangar A" → "Hangar D", "H-A" → "H-D". */
export function nextHangarIdentity(data: StallLayoutData, source: Pick<Hangar, 'name' | 'code'>): { name: string; code: string; letter: string } {
  const taken = new Set(data.hangars.flatMap((h) => [h.name.toLowerCase(), h.code.toLowerCase()]));
  // Only a short trailing letter token counts as the hangar's letter ("Hangar A", "H-AB"),
  // so names like "NORTH" or "VIP LOUNGE" are kept whole and get a letter appended.
  const nameMatch = /^(.*\s)([A-Z]{1,2})$/.exec(source.name);
  const codeMatch = /^(.*-)([A-Z]{1,2})$/.exec(source.code);
  for (let i = 0; i < 26 * 27; i++) {
    const letter = hangarLetter(i);
    const name = nameMatch ? `${nameMatch[1]}${letter}` : `${source.name} ${letter}`;
    const code = codeMatch ? `${codeMatch[1]}${letter}` : `${source.code}-${letter}`;
    if (!taken.has(name.toLowerCase()) && !taken.has(code.toLowerCase())) return { name, code, letter };
  }
  const n = data.hangars.length + 1;
  return { name: `${source.name} copy ${n}`, code: `${source.code}-${n}`, letter: String(n) };
}

/** Stall-number prefix a hangar's stalls use by convention: code "H-A" → "A". */
export function hangarStallPrefix(code: string): string {
  return code.replace(/^H-/i, '');
}

export interface DuplicateHangarResult {
  data: StallLayoutData;
  hangar: Hangar;
  stallCount: number;
  markerCount: number;
}

/**
 * Copy a hangar at the same size. With `withContents`, its stalls and
 * hangar-scoped markers come along (same positions relative to the hangar),
 * stall numbers are re-prefixed for the new hangar ("A-01" → "D-01"), and every
 * copied stall is reset to available with no exhibitor.
 */
export function duplicateHangar(
  data: StallLayoutData,
  hangarId: number,
  opts: { withContents: boolean; gap?: number },
): Result<DuplicateHangarResult> {
  const source = data.hangars.find((h) => h.id === hangarId);
  if (!source) return fail('Hangar not found.');
  const gap = opts.gap ?? defaultHangarGap(data);
  // Prefer the layout's spacing; fall back to one grid step, then touching, before giving up.
  const spot =
    findHangarSpot(data, source, gap) ??
    (opts.gap === undefined ? (findHangarSpot(data, source, data.ground.gridSize) ?? findHangarSpot(data, source, 0)) : null);
  if (!spot) {
    return fail(
      `No free space on the ground for another ${source.width}×${source.height} hangar — enlarge the ground or move hangars to make room.`,
    );
  }
  const identity = nextHangarIdentity(data, source);
  const hangar: Hangar = { ...source, id: nextId(data.hangars), name: identity.name, code: identity.code, x: spot.x, y: spot.y };

  if (!opts.withContents) {
    return ok({ data: { ...data, hangars: [...data.hangars, hangar] }, hangar, stallCount: 0, markerCount: 0 });
  }

  const oldPrefix = hangarStallPrefix(source.code);
  const newPrefix = hangarStallPrefix(identity.code);
  // Re-prefix each "+"-joined part (merged stalls are named "A-01+A-02"); plain string ops, so
  // codes containing regex/replacement characters ('$', '.', …) are handled literally.
  const rename = (no: string) =>
    oldPrefix && oldPrefix !== newPrefix
      ? no
          .split('+')
          .map((part) => (part.startsWith(`${oldPrefix}-`) ? `${newPrefix}-${part.slice(oldPrefix.length + 1)}` : part))
          .join('+')
      : no;

  let sid = nextId(data.stalls);
  const used = new Set<string>();
  const unique = (no: string) => {
    let name = no;
    for (let n = 2; used.has(name); n++) name = `${no}-${n}`;
    used.add(name);
    return name;
  };
  const stalls: Stall[] = data.stalls
    .filter((s) => s.hangarId === source.id)
    .map((s) => {
      const no = unique(rename(s.stallNo));
      return { ...s, id: sid++, hangarId: hangar.id, stallNo: no, stallCode: no, status: 'available', exhibitorName: null };
    });
  let aid = nextId(data.annotations);
  const markers: LayoutAnnotation[] = data.annotations
    .filter((a) => a.hangarId === source.id)
    .map((a) => ({ ...a, id: aid++, hangarId: hangar.id }));

  return ok({
    data: {
      ...data,
      hangars: [...data.hangars, hangar],
      stalls: [...data.stalls, ...stalls],
      annotations: [...data.annotations, ...markers],
    },
    hangar,
    stallCount: stalls.length,
    markerCount: markers.length,
  });
}

// ── Stall generation ─────────────────────────────────────────────────────────

export function stallFitEstimate(
  hangar: Pick<Hangar, 'width' | 'height'> | null | undefined,
  f: Pick<GenerateStallsForm, 'stallWidth' | 'stallHeight' | 'gapX' | 'gapY' | 'startX' | 'startY'>,
): { cols: number; rows: number; total: number } {
  const sW = Number(f.stallWidth);
  const sH = Number(f.stallHeight);
  const gX = Number(f.gapX) || 0;
  const gY = Number(f.gapY) || 0;
  const sX = Number(f.startX) || 0;
  const sY = Number(f.startY) || 0;
  if (!hangar || !(sW > 0) || !(sH > 0)) return { cols: 0, rows: 0, total: 0 };
  const availW = hangar.width - sX;
  const availH = hangar.height - sY;
  const cols = availW > 0 ? Math.max(0, Math.floor((availW + gX + 1e-9) / (sW + gX))) : 0;
  const rows = availH > 0 ? Math.max(0, Math.floor((availH + gY + 1e-9) / (sH + gY))) : 0;
  return { cols, rows, total: cols * rows };
}

export function formatStallNo(prefix: string, n: number): string {
  return `${prefix.trim()}-${String(n).padStart(2, '0')}`;
}

/** Defaults for the layout-pattern options when a caller passes only the ported form fields. */
export const DEFAULT_LAYOUT_OPTIONS: Omit<GenerateStallsInput, keyof GenerateStallsForm> = {
  pattern: 'grid',
  walls: ['top', 'left', 'right'],
  wallGap: 0,
  aisle: 3,
  islands: true,
  openSides: [],
};

export function generateStalls(
  data: StallLayoutData,
  form: GenerateStallsForm & Partial<Omit<GenerateStallsInput, keyof GenerateStallsForm>>,
): Result<{ stalls: Stall[]; generatedIds: number[] }> {
  const f: GenerateStallsInput = { ...DEFAULT_LAYOUT_OPTIONS, ...form };
  const hangar = data.hangars.find((h) => h.id === Number(f.hangarId));
  if (!hangar) return fail('Select a hangar.', 'hangarId');

  const inHangar = data.stalls.filter((s) => s.hangarId === hangar.id);
  const existingNos = new Set(inHangar.map((s) => s.stallNo));
  const hangarAnnots = data.annotations.filter((a) => a.hangarId === hangar.id);
  const plan = planStallLayout(hangar, f, data.ground.gridSize, inHangar);
  const warnings: string[] = [];
  const generated: Stall[] = [];
  let id = nextId(data.stalls);
  let seq = f.startNumber;
  let skippedOverlap = 0;
  let skippedAnnot = 0;

  for (const p of plan.stalls) {
    const stallNo = formatStallNo(f.prefix, seq);
    seq++;
    if (existingNos.has(stallNo)) return fail(`Stall "${stallNo}" already exists in this hangar.`, 'prefix');
    const rect: Rect = { x: p.x, y: p.y, width: p.width, height: p.height };
    if (inHangar.some((s) => rectsOverlap(rect, s)) || generated.some((s) => rectsOverlap(rect, s))) {
      skippedOverlap++;
      continue;
    }
    if (hangarAnnots.some((a) => rectsOverlap(rect, a))) {
      skippedAnnot++;
      continue;
    }
    const stall: Stall = {
      id: id++,
      hangarId: hangar.id,
      stallNo,
      stallCode: stallNo,
      stallType: f.stallType,
      ...rect,
      area: stallArea(rect.width, rect.height),
      basePrice: f.basePrice,
      finalPrice: f.basePrice,
      status: 'available',
      exhibitorName: null,
      isBillable: f.isBillable,
    };
    if (f.stallType === 'Corner') stall.cornerOrientation = f.cornerOrientation;
    if (p.openSides.length) stall.openSides = [...p.openSides];
    generated.push(stall);
  }
  if (plan.overflowAt !== null) {
    warnings.push(`Stalls from ${formatStallNo(f.prefix, f.startNumber + plan.overflowAt)} onward exceed hangar bounds — generation stopped.`);
  }
  if (skippedOverlap > 0) warnings.push(`${skippedOverlap} stall(s) skipped — they would overlap an existing stall.`);
  if (skippedAnnot > 0) warnings.push(`${skippedAnnot} stall(s) skipped — they would overlap a marker (gate, counter, washroom…).`);
  return ok({ stalls: [...data.stalls, ...generated], generatedIds: generated.map((s) => s.id) }, warnings);
}

// ── Selection tools ──────────────────────────────────────────────────────────

export type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV';

export function alignStalls(stalls: readonly Stall[], ids: ReadonlySet<number>, edge: AlignEdge): Stall[] {
  const sel = stalls.filter((s) => ids.has(s.id));
  if (sel.length < 2) return stalls as Stall[];
  const box = boundingBox(sel)!;
  const ref = {
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    bottom: box.y + box.height,
    centerH: box.x + box.width / 2,
    centerV: box.y + box.height / 2,
  }[edge];
  return stalls.map((s) => {
    if (!ids.has(s.id)) return s;
    switch (edge) {
      case 'left':
        return { ...s, x: clean(ref) };
      case 'right':
        return { ...s, x: clean(ref - s.width) };
      case 'top':
        return { ...s, y: clean(ref) };
      case 'bottom':
        return { ...s, y: clean(ref - s.height) };
      case 'centerH':
        return { ...s, x: clean(ref - s.width / 2) };
      case 'centerV':
        return { ...s, y: clean(ref - s.height / 2) };
    }
  });
}

export function distributeStalls(stalls: readonly Stall[], ids: ReadonlySet<number>, axis: 'h' | 'v'): Result<Stall[]> {
  const sel = stalls.filter((s) => ids.has(s.id));
  if (sel.length < 3) return fail('Select at least 3 stalls to distribute evenly.');
  const pos = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'width' : 'height';
  const sorted = [...sel].sort((a, b) => a[pos] - b[pos]);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const total = sorted.reduce((acc, s) => acc + s[size], 0);
  const span = last[pos] + last[size] - first[pos];
  const gap = (span - total) / (sorted.length - 1);
  const updates = new Map<number, number>();
  let cursor = first[pos] + first[size] + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const s = sorted[i]!;
    updates.set(s.id, round2(cursor));
    cursor += s[size] + gap;
  }
  return ok(stalls.map((s) => (updates.has(s.id) ? { ...s, [pos]: updates.get(s.id)! } : s)));
}

function uniqueSequentialNo(stallNo: string, existing: Set<string>): string {
  const base = stallNo.replace(/-\d+$/, '') || stallNo;
  let n = 1;
  while (existing.has(formatStallNo(base, n))) n++;
  const name = formatStallNo(base, n);
  existing.add(name);
  return name;
}

/**
 * Duplicate the selected stalls as a block: placed one grid step to the right
 * of the selection, or below it when there's no room, clamped to the hangar.
 */
export function duplicateStalls(
  stalls: readonly Stall[],
  ids: ReadonlySet<number>,
  hangar: Hangar,
  grid: number,
): Result<{ stalls: Stall[]; newIds: number[] }> {
  const sel = stalls.filter((s) => ids.has(s.id) && s.hangarId === hangar.id);
  if (sel.length === 0) return fail('Select a stall to duplicate.');
  const box = boundingBox(sel)!;
  let dx = snap(box.x + box.width + grid, grid) - box.x;
  let dy = 0;
  if (box.x + dx + box.width > hangar.width + 1e-6) {
    dx = 0;
    dy = snap(box.y + box.height + grid, grid) - box.y;
  }
  dx = clamp(box.x + dx, 0, hangar.width - box.width) - box.x;
  dy = clamp(box.y + dy, 0, hangar.height - box.height) - box.y;
  const existing = new Set(stalls.filter((s) => s.hangarId === hangar.id).map((s) => s.stallNo));
  let id = nextId(stalls);
  const copies: Stall[] = sel.map((s) => {
    const no = uniqueSequentialNo(s.stallNo, existing);
    return {
      ...s,
      id: id++,
      stallNo: no,
      stallCode: no,
      x: clean(s.x + dx),
      y: clean(s.y + dy),
      status: 'available',
      exhibitorName: null,
    };
  });
  return ok({ stalls: [...stalls, ...copies], newIds: copies.map((c) => c.id) });
}

export interface MergeCandidate {
  a: Stall;
  b: Stall;
  axis: 'h' | 'v';
}

/** Exactly two available stalls touching edge-to-edge whose union is a rectangle. */
export function mergeCandidate(stalls: readonly Stall[], ids: ReadonlySet<number>): MergeCandidate | null {
  if (ids.size !== 2) return null;
  const [a, b] = stalls.filter((s) => ids.has(s.id));
  if (!a || !b || a.hangarId !== b.hangarId) return null;
  if (a.status !== 'available' || b.status !== 'available') return null;
  const E = 0.01;
  if (
    Math.abs(a.y - b.y) < E &&
    Math.abs(a.height - b.height) < E &&
    (Math.abs(a.x + a.width - b.x) < E || Math.abs(b.x + b.width - a.x) < E)
  ) {
    return { a, b, axis: 'h' };
  }
  if (
    Math.abs(a.x - b.x) < E &&
    Math.abs(a.width - b.width) < E &&
    (Math.abs(a.y + a.height - b.y) < E || Math.abs(b.y + b.height - a.y) < E)
  ) {
    return { a, b, axis: 'v' };
  }
  return null;
}

export function mergeStalls(stalls: readonly Stall[], c: MergeCandidate): Result<{ stalls: Stall[]; merged: Stall }> {
  const { a, b, axis } = c;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = axis === 'h' ? clean(a.width + b.width) : a.width;
  const height = axis === 'v' ? clean(a.height + b.height) : a.height;
  const rect = { x, y, width, height };
  const blocked = stalls.some(
    (s) => s.hangarId === a.hangarId && s.id !== a.id && s.id !== b.id && rectsOverlap(rect, s),
  );
  if (blocked) return fail('Cannot merge — another stall occupies the combined area.');
  const no = `${a.stallNo}+${b.stallNo}`;
  const merged: Stall = {
    id: nextId(stalls),
    hangarId: a.hangarId,
    stallNo: no,
    stallCode: no,
    stallType: a.stallType,
    ...rect,
    area: stallArea(width, height),
    basePrice: a.basePrice + b.basePrice,
    finalPrice: a.finalPrice + b.finalPrice,
    status: 'available',
    exhibitorName: null,
    isBillable: a.isBillable ?? true,
  };
  if (a.cornerOrientation) merged.cornerOrientation = a.cornerOrientation;
  const open = mergedOpenSides(a, b, axis);
  if (open.length) merged.openSides = open;
  return ok({ stalls: [...stalls.filter((s) => s.id !== a.id && s.id !== b.id), merged], merged });
}

/** Return the stall with `side` opened or walled; keeps a canonical order and drops an empty list. */
export function withOpenSide(stall: Stall, side: RectSide, open: boolean): Stall {
  const order: RectSide[] = ['top', 'right', 'bottom', 'left'];
  const cur = new Set(stall.openSides ?? []);
  if (open) cur.add(side);
  else cur.delete(side);
  const next = order.filter((x) => cur.has(x));
  const { openSides: _drop, ...rest } = stall;
  return next.length ? { ...rest, openSides: next } : rest;
}

/**
 * Open sides of two merged stalls: the outer ends come from whichever stall is
 * at that end; the long sides are open if either half was open there.
 */
function mergedOpenSides(a: Stall, b: Stall, axis: 'h' | 'v'): RectSide[] {
  const has = (s: Stall, side: RectSide) => !!s.openSides?.includes(side);
  const [first, second] = axis === 'h' ? (a.x <= b.x ? [a, b] : [b, a]) : a.y <= b.y ? [a, b] : [b, a];
  const out: RectSide[] = [];
  if (axis === 'h') {
    if (has(first, 'top') || has(second, 'top')) out.push('top');
    if (has(second, 'right')) out.push('right');
    if (has(first, 'bottom') || has(second, 'bottom')) out.push('bottom');
    if (has(first, 'left')) out.push('left');
  } else {
    if (has(first, 'top')) out.push('top');
    if (has(first, 'right') || has(second, 'right')) out.push('right');
    if (has(second, 'bottom')) out.push('bottom');
    if (has(first, 'left') || has(second, 'left')) out.push('left');
  }
  return out;
}

/** 'h' splits top/bottom (halves the height); 'v' splits left/right (halves the width). */
export function canSplitStall(stall: Stall | null | undefined, axis: 'h' | 'v', grid: number): boolean {
  if (!stall || stall.status !== 'available') return false;
  const minSize = Math.max(grid, 0.5);
  const half = axis === 'h' ? stall.height / 2 : stall.width / 2;
  return half >= minSize;
}

export function splitStall(
  stalls: readonly Stall[],
  stallId: number,
  axis: 'h' | 'v',
  grid: number,
): Result<{ stalls: Stall[]; first: Stall; second: Stall }> {
  const stall = stalls.find((s) => s.id === stallId);
  if (!stall) return fail('Select a single stall to split.');
  if (stall.status !== 'available') return fail('Only available stalls can be split.');
  if (!canSplitStall(stall, axis, grid)) {
    return fail('Stall is too small to split — halves would fall below the minimum size.');
  }
  const existing = new Set(stalls.filter((s) => s.hangarId === stall.hangarId).map((s) => s.stallNo));
  const suffixName = (suffix: string) => {
    let name = `${stall.stallNo}-${suffix}`;
    let n = 1;
    while (existing.has(name)) name = `${stall.stallNo}-${suffix}${n++}`;
    existing.add(name);
    return name;
  };
  const id = nextId(stalls);
  const halfBase = round2(stall.basePrice / 2);
  const halfFinal = round2(stall.finalPrice / 2);
  const common = {
    hangarId: stall.hangarId,
    stallType: stall.stallType,
    status: 'available' as StallStatus,
    exhibitorName: null,
    isBillable: stall.isBillable ?? true,
    ...(stall.cornerOrientation ? { cornerOrientation: stall.cornerOrientation } : {}),
  };
  const firstRect: Rect =
    axis === 'h'
      ? { x: stall.x, y: stall.y, width: stall.width, height: clean(stall.height / 2) }
      : { x: stall.x, y: stall.y, width: clean(stall.width / 2), height: stall.height };
  const secondRect: Rect =
    axis === 'h'
      ? { x: stall.x, y: clean(stall.y + firstRect.height), width: stall.width, height: clean(stall.height - firstRect.height) }
      : { x: clean(stall.x + firstRect.width), y: stall.y, width: clean(stall.width - firstRect.width), height: stall.height };
  const firstNo = suffixName('A');
  const secondNo = suffixName('B');
  const first: Stall = {
    ...common,
    id,
    stallNo: firstNo,
    stallCode: firstNo,
    ...firstRect,
    area: stallArea(firstRect.width, firstRect.height),
    basePrice: halfBase,
    finalPrice: halfFinal,
  };
  const second: Stall = {
    ...common,
    id: id + 1,
    stallNo: secondNo,
    stallCode: secondNo,
    ...secondRect,
    area: stallArea(secondRect.width, secondRect.height),
    basePrice: round2(stall.basePrice - halfBase),
    finalPrice: round2(stall.finalPrice - halfFinal),
  };
  // The new shared edge between the halves is a wall; every other open side carries over.
  const shared: [RectSide, RectSide] = axis === 'h' ? ['bottom', 'top'] : ['right', 'left'];
  if (stall.openSides?.length) {
    const a = stall.openSides.filter((x) => x !== shared[0]);
    const b = stall.openSides.filter((x) => x !== shared[1]);
    if (a.length) first.openSides = a;
    if (b.length) second.openSides = b;
  }
  return ok({ stalls: [...stalls.filter((s) => s.id !== stall.id), first, second], first, second });
}

/** Translate stalls by (dx, dy), clamping the whole block inside the hangar. */
export function moveStalls(
  stalls: readonly Stall[],
  ids: ReadonlySet<number>,
  dx: number,
  dy: number,
  hangar: Pick<Hangar, 'width' | 'height'>,
): Stall[] {
  const sel = stalls.filter((s) => ids.has(s.id));
  const box = boundingBox(sel);
  if (!box) return stalls as Stall[];
  const cdx = clamp(box.x + dx, 0, hangar.width - box.width) - box.x;
  const cdy = clamp(box.y + dy, 0, hangar.height - box.height) - box.y;
  if (cdx === 0 && cdy === 0) return stalls as Stall[];
  return stalls.map((s) => (ids.has(s.id) ? { ...s, x: clean(s.x + cdx), y: clean(s.y + cdy) } : s));
}

/** Apply new geometry to a set of stalls (e.g. after a Transformer resize). Keeps `area` in sync. */
export function setStallRects(stalls: readonly Stall[], rects: ReadonlyMap<number, Rect>): Stall[] {
  let changed = false;
  const next = stalls.map((s) => {
    const r = rects.get(s.id);
    if (!r || (r.x === s.x && r.y === s.y && r.width === s.width && r.height === s.height)) return s;
    changed = true;
    return { ...s, ...r, area: stallArea(r.width, r.height) };
  });
  return changed ? next : (stalls as Stall[]);
}

// ── Annotations ──────────────────────────────────────────────────────────────

export function annotationsIn(data: StallLayoutData, hangarId: number | null): LayoutAnnotation[] {
  return data.annotations.filter((a) => a.hangarId === hangarId);
}

// ── Filters ──────────────────────────────────────────────────────────────────

export interface StallFilters {
  hangarId: number | null;
  status: StallStatus | '';
  stallType: string;
  search: string;
  priceMin: number | null;
  priceMax: number | null;
}

export const EMPTY_FILTERS: StallFilters = {
  hangarId: null,
  status: '',
  stallType: '',
  search: '',
  priceMin: null,
  priceMax: null,
};

export function hasActiveFilters(f: StallFilters): boolean {
  return !!(f.hangarId || f.status || f.stallType || f.search.trim() || f.priceMin !== null || f.priceMax !== null);
}

export function filterStalls(data: StallLayoutData, f: StallFilters): Stall[] {
  const q = f.search.trim().toLowerCase();
  const hangarNames = new Map(data.hangars.map((h) => [h.id, h.name.toLowerCase()]));
  return data.stalls.filter((s) => {
    if (f.hangarId && s.hangarId !== f.hangarId) return false;
    if (f.status && s.status !== f.status) return false;
    if (f.stallType && s.stallType !== f.stallType) return false;
    if (f.priceMin !== null && s.finalPrice < f.priceMin) return false;
    if (f.priceMax !== null && s.finalPrice > f.priceMax) return false;
    if (q) {
      const hit =
        s.stallNo.toLowerCase().includes(q) ||
        s.stallCode.toLowerCase().includes(q) ||
        s.stallType.toLowerCase().includes(q) ||
        (s.exhibitorName?.toLowerCase().includes(q) ?? false) ||
        (hangarNames.get(s.hangarId)?.includes(q) ?? false);
      if (!hit) return false;
    }
    return true;
  });
}

// ── Bulk ─────────────────────────────────────────────────────────────────────

export type BulkAction =
  | { kind: 'status'; status: StallStatus }
  | { kind: 'price'; finalPrice: number }
  | { kind: 'type'; stallType: string }
  | { kind: 'delete' };

export function applyBulk(stalls: readonly Stall[], ids: ReadonlySet<number>, action: BulkAction): Stall[] {
  if (action.kind === 'delete') return stalls.filter((s) => !ids.has(s.id));
  return stalls.map((s) => {
    if (!ids.has(s.id)) return s;
    switch (action.kind) {
      case 'status':
        return {
          ...s,
          status: action.status,
          exhibitorName: action.status === 'available' || action.status === 'blocked' ? null : s.exhibitorName,
        };
      case 'price':
        return { ...s, finalPrice: action.finalPrice };
      case 'type':
        return { ...s, stallType: action.stallType };
    }
  });
}

export function statusCounts(stalls: readonly Stall[]): Record<StallStatus, number> {
  const c: Record<StallStatus, number> = { available: 0, reserved: 0, booked: 0, allocated: 0, blocked: 0 };
  for (const s of stalls) c[s.status]++;
  return c;
}
