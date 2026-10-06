import { rectsOverlap } from './geometry';
import { generateStalls, mergeCandidate, mergeStalls, splitStall, withOpenSide } from './layoutOps';
import { defaultLayout } from './seed';
import { planStallLayout, uncoveredLength, type GenerateStallsInput } from './stallLayout';
import type { Stall } from './types';

const hangar = { width: 24, height: 20 };
const base: GenerateStallsInput = {
  hangarId: 4,
  pattern: 'perimeter',
  rows: 3,
  columns: 4,
  prefix: 'D',
  startNumber: 1,
  sizePreset: '3×3',
  stallWidth: 3,
  stallHeight: 3,
  gapX: 0.5,
  gapY: 0.5,
  startX: 1,
  startY: 1,
  stallType: 'Standard',
  basePrice: 1000,
  cornerOrientation: 'top-right',
  isBillable: true,
  walls: ['top', 'right', 'left'],
  wallGap: 0,
  aisle: 3,
  islands: true,
  openSides: [],
};

describe('planStallLayout — perimeter (walls + islands)', () => {
  const plan = planStallLayout(hangar, base);
  const by = (zone: string) => plan.stalls.filter((s) => s.zone === zone);

  it('lines the chosen walls with contiguous stalls and leaves the bottom free', () => {
    expect(plan.counts).toMatchObject({ top: 8, right: 5, left: 5, bottom: 0, island: 6 });
    expect(by('top').map((s) => s.x)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(by('top').every((s) => s.y === 0 && s.height === 3)).toBe(true);
    expect(by('right').every((s) => s.x === 21 && s.width === 3)).toBe(true);
    expect(by('left').every((s) => s.x === 0)).toBe(true);
    // Side columns start below the top row (corners belong to the top row).
    expect(Math.min(...by('left').map((s) => s.y))).toBe(3);
  });

  it('opens each stall on its aisle side; boxed-in corner stalls stay walled', () => {
    const top = by('top');
    expect(top[0]!.openSides).toEqual([]);
    expect(top[7]!.openSides).toEqual([]);
    expect(top.slice(1, 7).every((s) => s.openSides.join() === 'bottom')).toBe(true);
    expect(by('left').every((s) => s.openSides.join() === 'right')).toBe(true);
    expect(by('right').every((s) => s.openSides.join() === 'left')).toBe(true);
  });

  it('builds a centred back-to-back island open on its outer sides and ends', () => {
    const island = by('island');
    expect(plan.islandCount).toBe(1);
    const xs = [...new Set(island.map((s) => s.x))].sort((a, b) => a - b);
    expect(xs).toEqual([9, 12]); // centred in the 12 m between aisles
    expect(Math.min(...island.map((s) => s.y))).toBe(6); // one aisle below the top row
    const leftCol = island.filter((s) => s.x === 9).sort((a, b) => a.y - b.y);
    expect(leftCol.map((s) => s.openSides.sort().join())).toEqual(['left,top', 'left', 'bottom,left']);
  });

  it('never overlaps and stays inside the hangar', () => {
    for (const s of plan.stalls) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.width).toBeLessThanOrEqual(24);
      expect(s.y + s.height).toBeLessThanOrEqual(20);
    }
    for (let i = 0; i < plan.stalls.length; i++)
      for (let j = i + 1; j < plan.stalls.length; j++) expect(rectsOverlap(plan.stalls[i]!, plan.stalls[j]!)).toBe(false);
  });

  it('respects the wall gap, wall choice, island toggle and aisle width', () => {
    const gap = planStallLayout(hangar, { ...base, wallGap: 1, islands: false });
    expect(gap.stalls.filter((s) => s.zone === 'top').every((s) => s.y === 1)).toBe(true);
    expect(gap.counts.top).toBe(7);
    const all = planStallLayout(hangar, { ...base, walls: ['top', 'right', 'bottom', 'left'] });
    expect(all.counts).toMatchObject({ top: 8, bottom: 8, left: 4, right: 4 });
    const onlyIslands = planStallLayout({ width: 30, height: 20 }, { ...base, walls: [], aisle: 2 });
    expect(onlyIslands.islandCount).toBe(3); // 26 m free ÷ (6 m island + 2 m aisle)
    expect(onlyIslands.counts.top).toBe(0);
  });

  it('opens rectangular stalls whose aisle side is only partly covered at a corner', () => {
    const wide = planStallLayout(hangar, { ...base, stallWidth: 4, stallHeight: 2, islands: false });
    // Corner stall 4 wide, left column only 2 deep → 2 m of its bottom faces the aisle.
    expect(wide.stalls.find((s) => s.zone === 'top' && s.x === 0)!.openSides).toEqual(['bottom']);
  });
});

describe('planStallLayout — grid', () => {
  it('keeps the original rows × columns behaviour and applies chosen open sides', () => {
    const plan = planStallLayout(hangar, { ...base, pattern: 'grid', rows: 2, columns: 3, openSides: ['bottom', 'top'] });
    expect(plan.stalls).toHaveLength(6);
    expect(plan.stalls[4]).toMatchObject({ x: 4.5, y: 4.5, openSides: ['bottom', 'top'] });
    const over = planStallLayout(hangar, { ...base, pattern: 'grid', rows: 10, columns: 1 });
    expect(over.overflowAt).toBe(5);
  });
});

describe('uncoveredLength', () => {
  it('measures how much of a side is not touched by neighbours', () => {
    const a = { x: 0, y: 0, width: 4, height: 2 };
    expect(uncoveredLength(a, 'bottom', [{ x: 0, y: 2, width: 3, height: 2 }])).toBe(1);
    expect(uncoveredLength(a, 'bottom', [{ x: 0, y: 2.5, width: 3, height: 2 }])).toBe(4);
    expect(uncoveredLength(a, 'right', [{ x: 4, y: -1, width: 1, height: 5 }])).toBe(0);
  });
});

describe('generateStalls with the perimeter pattern', () => {
  const withEmptyHangar = () => {
    const d = defaultLayout();
    d.hangars.push({ id: 4, name: 'Hangar D', code: 'H-D', x: 28, y: 18, width: 24, height: 20 });
    return d;
  };

  it('numbers clockwise and stores open sides on the stalls', () => {
    const r = generateStalls(withEmptyHangar(), base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gen = r.value.stalls.filter((s) => s.hangarId === 4);
    expect(gen).toHaveLength(24);
    expect(gen.slice(0, 3).map((s) => [s.stallNo, s.x, s.y])).toEqual([
      ['D-01', 0, 0],
      ['D-02', 3, 0],
      ['D-03', 6, 0],
    ]);
    expect(gen.find((s) => s.stallNo === 'D-09')).toMatchObject({ x: 21, y: 3, openSides: ['left'] }); // right wall, top first
    expect(gen.find((s) => s.stallNo === 'D-14')).toMatchObject({ x: 0, y: 15, openSides: ['right'] }); // left wall, bottom first
    expect(gen.find((s) => s.stallNo === 'D-01')!.openSides).toBeUndefined();
  });

  it('skips spots taken by existing stalls and markers', () => {
    const d = withEmptyHangar();
    d.annotations.push({ id: 1, type: 'washroom', label: 'WC', x: 0, y: 0, width: 4, height: 3, hangarId: 4 });
    const r = generateStalls(d, base);
    expect(r.ok && r.value.generatedIds.length).toBe(22);
    expect(r.ok && r.warnings.join()).toMatch(/2 stall\(s\) skipped/);
  });

  it('plain ported form fields still generate a grid (backwards compatible)', () => {
    const { pattern: _p, walls: _w, wallGap: _g, aisle: _a, islands: _i, openSides: _o, ...legacy } = base;
    const r = generateStalls(withEmptyHangar(), { ...legacy, rows: 1, columns: 2 });
    expect(r.ok && r.value.generatedIds.length).toBe(2);
  });
});

describe('open sides through edits', () => {
  const s = (over: Partial<Stall>): Stall => ({
    id: 1, hangarId: 1, stallNo: 'S', stallCode: 'S', stallType: 'Standard', x: 0, y: 0, width: 4, height: 2,
    area: 8, basePrice: 100, finalPrice: 100, status: 'available', exhibitorName: null, ...over,
  });

  it('toggles a side and drops an empty list', () => {
    const a = withOpenSide(s({}), 'left', true);
    expect(withOpenSide(a, 'top', true).openSides).toEqual(['top', 'left']);
    expect('openSides' in withOpenSide(a, 'left', false)).toBe(false);
  });

  it('split keeps outer openings and walls the new shared edge', () => {
    const r = splitStall([s({ openSides: ['top', 'right', 'bottom'] })], 1, 'v', 0.5);
    expect(r.ok && [r.value.first.openSides, r.value.second.openSides]).toEqual([
      ['top', 'bottom'],
      ['top', 'right', 'bottom'],
    ]);
  });

  it('merge combines openings of both halves', () => {
    const a = s({ id: 1, stallNo: 'A', width: 2, openSides: ['bottom', 'left'] });
    const b = s({ id: 2, stallNo: 'B', x: 2, width: 2, openSides: ['right'] });
    const r = mergeStalls([a, b], mergeCandidate([a, b], new Set([1, 2]))!);
    expect(r.ok && r.value.merged.openSides).toEqual(['right', 'bottom', 'left']);
  });
});
