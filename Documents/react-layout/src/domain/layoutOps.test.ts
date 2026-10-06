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
  splitStall,
  stallFitEstimate,
  validateHangarDraft,
} from './layoutOps';
import type { GenerateGroundForm, GenerateStallsForm, Stall } from './types';

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
