import { defaultLayout } from './seed';
import {
  alignStalls,
  applyBulk,
  autoFillHangarSize,
  canSplitStall,
  distributeStalls,
  duplicateStalls,
  filterStalls,
  EMPTY_FILTERS,
  generateGround,
  generateStalls,
  mergeCandidate,
  mergeStalls,
  moveStalls,
  currentHangarSpacing,
  hangarGaps,
  hangarRows,
  resizeGround,
  spaceHangars,
  splitStall,
  stallFitEstimate,
  validateHangarDraft,
} from './layoutOps';
import type { GenerateGroundForm, GenerateStallsForm, LayoutAnnotation, Stall, StallLayoutData } from './types';

const testExhibition = { name: 'Expo', venueName: 'Venue' };

const groundForm: GenerateGroundForm = {
  unit: 'meter',
  width: 60,
  height: 40,
  gridSize: 0.5,
  numHangars: 3,
  hangarPrefix: 'Hangar',
  hangarWidth: 20,
  hangarHeight: 14,
  gap: 2,
  startX: 2,
  startY: 2,
  hangarsPerRow: 2,
};

const stallsForm = (over: Partial<GenerateStallsForm> = {}): GenerateStallsForm => ({
  hangarId: 1,
  rows: 2,
  columns: 3,
  prefix: 'X',
  startNumber: 1,
  sizePreset: '3×3',
  stallWidth: 3,
  stallHeight: 3,
  gapX: 0.5,
  gapY: 0.5,
  startX: 0,
  startY: 0,
  stallType: 'Standard',
  basePrice: 1000,
  cornerOrientation: 'top-right',
  isBillable: true,
  ...over,
});

const mk = (over: Partial<Stall>): Stall => ({
  id: 1,
  hangarId: 1,
  stallNo: 'S-01',
  stallCode: 'S-01',
  stallType: 'Standard',
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  area: 4,
  basePrice: 100,
  finalPrice: 120,
  status: 'available',
  exhibitorName: null,
  ...over,
});

describe('generateGround', () => {
  it('places hangars in a grid with letters and codes', () => {
    const r = generateGround(groundForm, testExhibition);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ground.exhibitionName).toBe('Expo');
    expect(r.value.ground.venueName).toBe('Venue');
    expect(r.value.hangars.map((h) => [h.name, h.code, h.x, h.y])).toEqual([
      ['Hangar A', 'H-A', 2, 2],
      ['Hangar B', 'H-B', 24, 2],
      ['Hangar C', 'H-C', 2, 18],
    ]);
    expect(r.value.stalls).toEqual([]);
  });

  it('rejects hangars that exceed the ground', () => {
    const r = generateGround({ ...groundForm, numHangars: 6 }, testExhibition);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('Hangar 5 would exceed') });
  });

  it('rejects overlapping hangars (negative effective gap)', () => {
    const r = generateGround({ ...groundForm, hangarWidth: 10, gap: 0, numHangars: 2, hangarsPerRow: 2, startX: 0 }, testExhibition);
    expect(r.ok).toBe(true);
    const bad = generateGround({ ...groundForm, width: 100, hangarWidth: 10, gap: -5 as number, numHangars: 2 }, testExhibition);
    expect(bad.ok).toBe(false);
  });

  it('auto-fills the hangar size to fit the grid', () => {
    expect(autoFillHangarSize(groundForm)).toEqual({ hangarWidth: 27, hangarHeight: 17 });
  });

  it('rounds the auto-filled hangar size down to whole units, so the hangars still fit', () => {
    // (61 − 2·2 − 2) / 2 = 27.5 → 27;  (41.9 − 2·2 − 2) / 2 = 17.95 → 17
    expect(autoFillHangarSize({ ...groundForm, width: 61, height: 41.9 })).toEqual({ hangarWidth: 27, hangarHeight: 17 });
    // 3 per row: (60 − 4 − 4) / 3 = 17.33… → 17
    expect(autoFillHangarSize({ ...groundForm, hangarsPerRow: 3 })).toEqual({ hangarWidth: 17, hangarHeight: 36 });
    // Less than one whole unit left per hangar → doesn't fit.
    expect(autoFillHangarSize({ ...groundForm, width: 6.5 })).toBeNull();
  });
});

describe('resizeGround (Edit ground)', () => {
  // Demo seed: 60 × 40 m ground; hangars reach x 48 (Hangar C) and y 36 (Hangar B).
  const mark = (id: number, over: Partial<LayoutAnnotation>): LayoutAnnotation => ({
    id, type: 'road', label: `M${id}`, x: 0, y: 0, width: 4, height: 4, hangarId: null, ...over,
  });
  const withMarkers = (...annotations: LayoutAnnotation[]): StallLayoutData => ({ ...defaultLayout(), annotations });

  it('keeps every hangar and stall exactly where it was', () => {
    const d = defaultLayout();
    const r = resizeGround(d, { width: 80, height: 50, gridSize: 0.5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ground).toMatchObject({ width: 80, height: 50, gridSize: 0.5, unit: 'meter', exhibitionName: d.ground.exhibitionName });
    expect(r.value.hangars).toEqual(d.hangars);
    expect(r.value.stalls).toEqual(d.stalls);
  });

  it('moves items beyond the right/bottom edge with that edge; top/left and inside items stay', () => {
    const d = withMarkers(
      mark(1, { x: 62, y: 10, width: 6, height: 20 }), // road right of the ground (gap 2)
      mark(2, { x: 10, y: 43, width: 30, height: 6 }), // road below the ground (gap 3)
      mark(3, { x: -8, y: 10, width: 6, height: 20 }), // road left of the ground
      mark(4, { type: 'parking', x: 62, y: 43, width: 6, height: 6 }), // beyond the bottom-right corner
      mark(5, { type: 'entry', x: 56, y: 20, width: 4, height: 3 }), // gate on the right edge
      mark(6, { type: 'washroom', x: 50, y: 20, width: 4, height: 3 }), // inside, not on an edge
    );
    const r = resizeGround(d, { width: 70, height: 45, gridSize: 0.5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const at = (id: number) => r.value.annotations.find((a) => a.id === id)!;
    expect(at(1)).toMatchObject({ x: 72, y: 10 });
    expect(at(2)).toMatchObject({ x: 10, y: 48 });
    expect(at(3)).toMatchObject({ x: -8, y: 10 });
    expect(at(4)).toMatchObject({ x: 72, y: 48 });
    expect(at(5)).toMatchObject({ x: 66, y: 20 }); // still flush on the (new) right edge
    expect(at(6)).toBe(d.annotations[5]);
  });

  it('refuses a size that would cut off a hangar, naming it and the minimum size', () => {
    const r = resizeGround(defaultLayout(), { width: 45, height: 40, gridSize: 0.5 });
    expect(r).toMatchObject({ ok: false, field: 'width' });
    expect(!r.ok && r.error).toMatch(/Hangar C would be cut off — the ground must be at least 48 × 36 m/);
    const tooShort = resizeGround(defaultLayout(), { width: 60, height: 30, gridSize: 0.5 });
    expect(tooShort).toMatchObject({ ok: false, field: 'height' });
    expect(resizeGround(defaultLayout(), { width: 48, height: 36, gridSize: 0.5 }).ok).toBe(true);
  });

  it('refuses a size that would cut off a marker inside the ground', () => {
    const d = withMarkers(mark(1, { type: 'washroom', label: 'WC', x: 50, y: 30, width: 6, height: 6 }));
    const r = resizeGround(d, { width: 54, height: 40, gridSize: 0.5 });
    expect(!r.ok && r.error).toMatch(/WC would be cut off/);
  });

  it('refuses a grid coarser than the smallest stall can take, but allows a finer one', () => {
    // Demo stalls are 3 × 2 m, so the grid can be at most 1 m (minimum size = 2 grid steps).
    expect(resizeGround(defaultLayout(), { width: 60, height: 40, gridSize: 1 }).ok).toBe(true);
    const r = resizeGround(defaultLayout(), { width: 60, height: 40, gridSize: 1.5 });
    expect(r).toMatchObject({ ok: false, field: 'gridSize' });
    expect(!r.ok && r.error).toMatch(/at most 1 m/);
    expect(resizeGround(defaultLayout(), { width: 60, height: 40, gridSize: 0.25 }).ok).toBe(true);
  });

  it('refuses a shrink that would make two roads overlap', () => {
    const d = withMarkers(
      mark(1, { x: 62, y: 0, width: 6, height: 46 }), // right of the ground, running down past its bottom edge
      mark(2, { x: 40, y: 42, width: 20, height: 6 }), // below the ground, ending short of road 1
    );
    const r = resizeGround(d, { width: 50, height: 40, gridSize: 0.5 });
    expect(!r.ok && r.error).toMatch(/Roads "M1" and "M2" would overlap/);
  });
});

describe('hangarGaps (gap dimensions)', () => {
  const hangar = (id: number, x: number, y: number, width: number, height: number) => ({ id, name: `H${id}`, code: `H-${id}`, x, y, width, height });
  const describeGaps = (gaps: ReturnType<typeof hangarGaps>) =>
    gaps.map((g) => `${g.axis} ${g.from}→${g.to}${g.edge ? ' edge' : ''}`).sort();

  it('measures between neighbours (once per pair) and out to the ground edge where nothing is between', () => {
    // 60 × 40 ground: A and B side by side, C under A — the planner's default 3-hangar ground.
    const gaps = hangarGaps([hangar(1, 2, 2, 27, 17), hangar(2, 31, 2, 27, 17), hangar(3, 2, 21, 27, 17)], { width: 60, height: 40 });
    expect(describeGaps(gaps)).toEqual(
      [
        'x 29→31', // A ↔ B
        'y 19→21', // A ↕ C
        'x 0→2 edge', // A, C to the left edge
        'x 0→2 edge',
        'y 0→2 edge', // A, B to the top edge
        'y 0→2 edge',
        'x 58→60 edge', // B to the right edge
        'x 29→60 edge', // C to the right edge (nothing beside it)
        'y 19→40 edge', // B to the bottom edge (nothing under it)
        'y 38→40 edge', // C to the bottom edge
      ].sort(),
    );
  });

  it('places each line three-quarters along the shared span', () => {
    const [between] = hangarGaps([hangar(1, 0, 0, 10, 20), hangar(2, 12, 4, 10, 20)], { width: 22, height: 24 }).filter((g) => !g.edge);
    expect(between).toMatchObject({ axis: 'x', from: 10, to: 12, at: 4 + (20 - 4) * 0.75 });
  });

  it('skips touching hangars and hangars flush against an edge', () => {
    const gaps = hangarGaps([hangar(1, 0, 0, 10, 10), hangar(2, 10, 0, 10, 10)], { width: 20, height: 10 });
    expect(gaps).toEqual([]);
  });
});

describe('spaceHangars (Space hangars)', () => {
  // Demo seed: row 1 = Hangar A (x 2, 24 wide) + Hangar C (x 28); row 2 = Hangar B (y 20). Gaps are 2 m.
  const hangar = (id: number, x: number, y: number, width: number, height: number) => ({ id, name: `H${id}`, code: `H-${id}`, x, y, width, height });

  it('reads rows and the current gaps', () => {
    const d = defaultLayout();
    expect(hangarRows(d.hangars).map((r) => r.map((h) => h.code))).toEqual([['H-A', 'H-C'], ['H-B']]);
    expect(currentHangarSpacing(d.hangars)).toEqual({ gapX: 2, gapY: 2 });
    expect(currentHangarSpacing([d.hangars[0]!])).toEqual({ gapX: null, gapY: null });
  });

  it('slides hangars to the new gaps; the first in each row and the top row stay put; stalls are untouched', () => {
    const d = defaultLayout();
    const r = spaceHangars(d, { gapX: 6, gapY: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const at = (code: string) => r.value.hangars.find((h) => h.code === code)!;
    expect(at('H-A')).toMatchObject({ x: 2, y: 2 });
    expect(at('H-C')).toMatchObject({ x: 32, y: 2 }); // 2 + 24 + 6
    expect(at('H-B')).toMatchObject({ x: 2, y: 22 }); // row 1 bottom 18 + 4
    expect(r.value.stalls).toEqual(d.stalls); // hangar-relative, so they move with their hangar
    expect(r.value.annotations).toEqual(d.annotations);
  });

  it('keeps vertical offsets within a row and stacks rows below the tallest hangar', () => {
    const d: StallLayoutData = { ...defaultLayout(), hangars: [hangar(1, 0, 0, 10, 10), hangar(2, 15, 2, 10, 6), hangar(3, 0, 25, 10, 10)], stalls: [] };
    const r = spaceHangars(d, { gapX: 1, gapY: 3 });
    expect(r.ok && r.value.hangars.map((h) => [h.x, h.y])).toEqual([[0, 0], [11, 2], [0, 13]]);
  });

  it('refuses spacing that pushes a hangar past the ground edge, saying what size it needs', () => {
    const wide = spaceHangars(defaultLayout(), { gapX: 15, gapY: 2 });
    expect(wide).toMatchObject({ ok: false, field: 'gapX' });
    expect(!wide.ok && wide.error).toMatch(/Hangar C would go past the ground edge — this spacing needs 61 × 36 m and the ground is 60 × 40 m/);
    const tall = spaceHangars(defaultLayout(), { gapX: 2, gapY: 7 });
    expect(tall).toMatchObject({ ok: false, field: 'gapY' });
    expect(!tall.ok && tall.error).toMatch(/Hangar B/);
  });

  it('refuses landing a hangar on parking or a counter, but not one it already overlapped', () => {
    // Right of Hangar C now (C spans x 28–48); a 6 m gap moves C to 32–52, onto it.
    const parking: LayoutAnnotation = { id: 1, type: 'parking', label: 'Staff parking', x: 50, y: 4, width: 6, height: 4, hangarId: null };
    const r = spaceHangars({ ...defaultLayout(), annotations: [parking] }, { gapX: 6, gapY: 2 });
    expect(!r.ok && r.error).toMatch(/Hangar C would land on "Staff parking"/);
    const alreadyUnder = { ...parking, x: 40 }; // Hangar C (28–48) already covers it
    expect(spaceHangars({ ...defaultLayout(), annotations: [alreadyUnder] }, { gapX: 3, gapY: 2 }).ok).toBe(true);
  });

  it('rejects negative gaps', () => {
    expect(spaceHangars(defaultLayout(), { gapX: -1, gapY: 2 }).ok).toBe(false);
  });
});

describe('generateStalls', () => {
  it('fills rows × columns and numbers stalls with the prefix', () => {
    const data = { ...defaultLayout(), stalls: [] };
    const r = generateStalls(data, stallsForm());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stalls.map((s) => s.stallNo)).toEqual(['X-01', 'X-02', 'X-03', 'X-04', 'X-05', 'X-06']);
    expect(r.value.stalls[4]).toMatchObject({ x: 3.5, y: 3.5, area: 9, finalPrice: 1000 });
  });

  it('skips existing stalls and markers, and stops at the hangar edge', () => {
    const data = defaultLayout();
    data.annotations.push({ id: 1, type: 'entry', label: 'Gate', x: 0, y: 14, width: 3, height: 2, hangarId: 1 });
    const r = generateStalls(data, stallsForm({ rows: 10, columns: 10, stallWidth: 2, stallHeight: 2, gapX: 0, gapY: 0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.join(' ')).toMatch(/overlap an existing stall/);
    expect(r.warnings.join(' ')).toMatch(/overlap a marker/);
  });

  it('refuses duplicate stall numbers', () => {
    const r = generateStalls(defaultLayout(), stallsForm({ prefix: 'A', startNumber: 1 }));
    expect(r).toMatchObject({ ok: false, field: 'prefix' });
  });

  it('only sets cornerOrientation on Corner stalls', () => {
    const data = { ...defaultLayout(), stalls: [] };
    const plain = generateStalls(data, stallsForm({ rows: 1, columns: 1 }));
    const corner = generateStalls(data, stallsForm({ rows: 1, columns: 1, stallType: 'Corner', cornerOrientation: 'bottom-left' }));
    expect(plain.ok && plain.value.stalls[0]!.cornerOrientation).toBeUndefined();
    expect(corner.ok && corner.value.stalls[0]!.cornerOrientation).toBe('bottom-left');
  });

  it('estimates the max grid that fits', () => {
    expect(stallFitEstimate({ width: 24, height: 16 }, { stallWidth: 3, stallHeight: 3, gapX: 0.5, gapY: 0.5, startX: 1, startY: 1 })).toEqual({
      cols: 6,
      rows: 4,
      total: 24,
    });
  });
});

describe('selection tools', () => {
  const stalls = [mk({ id: 1, x: 0, y: 0 }), mk({ id: 2, x: 5, y: 1, width: 3 }), mk({ id: 3, x: 11, y: 4 })];
  const all = new Set([1, 2, 3]);

  it('aligns left/right/top/bottom/centres', () => {
    expect(alignStalls(stalls, all, 'left').map((s) => s.x)).toEqual([0, 0, 0]);
    expect(alignStalls(stalls, all, 'right').map((s) => s.x + s.width)).toEqual([13, 13, 13]);
    expect(alignStalls(stalls, all, 'bottom').map((s) => s.y + s.height)).toEqual([6, 6, 6]);
    expect(alignStalls(stalls, all, 'centerH').map((s) => s.x + s.width / 2)).toEqual([6.5, 6.5, 6.5]);
    expect(alignStalls(stalls, all, 'centerV').map((s) => s.y + s.height / 2)).toEqual([3, 3, 3]);
  });

  it('distributes with equal gaps and needs ≥3 stalls', () => {
    const r = distributeStalls(stalls, all, 'h');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.map((s) => s.x)).toEqual([0, 5, 11]);
    expect(distributeStalls(stalls, new Set([1, 2]), 'h').ok).toBe(false);
  });

  it('moves a block and clamps it inside the hangar', () => {
    const moved = moveStalls(stalls, new Set([3]), 100, -100, { width: 20, height: 10 });
    expect(moved[2]).toMatchObject({ x: 18, y: 0 });
  });

  it('duplicates next to the selection with fresh numbers, reset to available', () => {
    const data = defaultLayout();
    const hangar = data.hangars[0]!;
    const r = duplicateStalls(data.stalls, new Set([12]), hangar, 0.5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const copy = r.value.stalls.find((s) => s.id === r.value.newIds[0])!;
    expect(copy).toMatchObject({ stallNo: 'A-13', x: 15, y: 6.5, status: 'available', exhibitorName: null });
  });

  it('merges two adjacent available stalls into one', () => {
    const a = mk({ id: 1, stallNo: 'A', x: 0, y: 0 });
    const b = mk({ id: 2, stallNo: 'B', x: 2, y: 0 });
    const c = mergeCandidate([a, b], new Set([1, 2]));
    expect(c?.axis).toBe('h');
    const r = mergeStalls([a, b], c!);
    expect(r.ok && r.value.merged).toMatchObject({ stallNo: 'A+B', width: 4, height: 2, area: 8, basePrice: 200, finalPrice: 240 });
  });

  it('refuses to merge gapped, mismatched or booked stalls', () => {
    expect(mergeCandidate([mk({ id: 1 }), mk({ id: 2, x: 2.5 })], new Set([1, 2]))).toBeNull();
    expect(mergeCandidate([mk({ id: 1 }), mk({ id: 2, x: 2, height: 3 })], new Set([1, 2]))).toBeNull();
    expect(mergeCandidate([mk({ id: 1 }), mk({ id: 2, x: 2, status: 'booked' })], new Set([1, 2]))).toBeNull();
  });

  it('splits along either axis, halving prices', () => {
    const s = mk({ id: 5, stallNo: 'Q', width: 4, height: 3, basePrice: 101, finalPrice: 99 });
    const r = splitStall([s], 5, 'v', 0.5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.value.first, r.value.second].map((x) => [x.stallNo, x.x, x.width, x.basePrice, x.finalPrice])).toEqual([
      ['Q-A', 0, 2, 50.5, 49.5],
      ['Q-B', 2, 2, 50.5, 49.5],
    ]);
    const h = splitStall([s], 5, 'h', 0.5);
    expect(h.ok && [h.value.first.height, h.value.second.y]).toEqual([1.5, 1.5]);
  });

  it('will not split below the minimum size or non-available stalls', () => {
    expect(canSplitStall(mk({ width: 0.8 }), 'v', 0.5)).toBe(false);
    expect(canSplitStall(mk({ status: 'reserved' }), 'v', 0.5)).toBe(false);
  });
});

describe('hangar validation', () => {
  it('flags duplicates, overlap and stalls falling outside', () => {
    const data = defaultLayout();
    expect(validateHangarDraft(data, { name: 'Hangar A', code: 'NEW', x: 50, y: 30, width: 5, height: 5 }, null).name).toBeDefined();
    expect(validateHangarDraft(data, { name: 'N', code: 'N', x: 3, y: 3, width: 5, height: 5 }, null).x).toMatch(/overlaps/);
    expect(validateHangarDraft(data, { name: 'Hangar A', code: 'H-A', x: 2, y: 2, width: 10, height: 16 }, 1).width).toMatch(/outside/);
  });
});

describe('filters & bulk', () => {
  it('filters by hangar, status, type, price and search', () => {
    const data = defaultLayout();
    expect(filterStalls(data, { ...EMPTY_FILTERS, hangarId: 3, status: 'booked' }).map((s) => s.stallNo)).toEqual(['C-03', 'C-07', 'C-V1']);
    expect(filterStalls(data, { ...EMPTY_FILTERS, stallType: 'VIP' })).toHaveLength(2);
    expect(filterStalls(data, { ...EMPTY_FILTERS, priceMin: 60000 }).map((s) => s.stallNo)).toEqual(['A-P1', 'A-P2', 'C-V1', 'C-V2']);
    expect(filterStalls(data, { ...EMPTY_FILTERS, search: 'delta' }).map((s) => s.stallNo)).toEqual(['B-05']);
    expect(filterStalls(data, { ...EMPTY_FILTERS, search: 'hangar b' })).toHaveLength(15);
  });

  it('bulk status clears exhibitor for available/blocked only', () => {
    const s = [mk({ id: 1, status: 'reserved', exhibitorName: 'Z' })];
    expect(applyBulk(s, new Set([1]), { kind: 'status', status: 'booked' })[0]!.exhibitorName).toBe('Z');
    expect(applyBulk(s, new Set([1]), { kind: 'status', status: 'blocked' })[0]!.exhibitorName).toBeNull();
    expect(applyBulk(s, new Set([1]), { kind: 'price', finalPrice: 5 })[0]!.finalPrice).toBe(5);
    expect(applyBulk(s, new Set([1]), { kind: 'delete' })).toEqual([]);
  });
});
