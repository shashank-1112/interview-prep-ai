/** Regression tests for the second verification pass. */
import { defaultLayout } from '../domain/seed';
import { duplicateHangar, defaultHangarGap, findHangarSpot, nextHangarIdentity } from '../domain/layoutOps';
import { isOutsideGround, placeBesideGround, siteBounds, validateGroundAnnotationRect } from '../domain/site';
import { rectsOverlap } from '../domain/geometry';
import { MemoryLayoutRepository } from '../repository/memoryRepository';
import { saveAnnotation, setAnnotationRect, setHangarRect, updateHangar, type AnnotationDraft } from './actions';
import { resetLayoutStore, useLayoutStore } from './layoutStore';

const st = () => useLayoutStore.getState();
const draft = (over: Partial<AnnotationDraft>): AnnotationDraft => ({
  type: 'parking', label: '', width: 10, height: 3, placement: 'inside', side: 'top', gap: 0, ...over,
});

beforeEach(async () => {
  resetLayoutStore();
  await st().init(new MemoryLayoutRepository(defaultLayout()));
});

describe('inside parking / counters never land on a hangar', () => {
  it('reports "no free space" instead of committing on top of hangars', () => {
    const err = saveAnnotation(null, null, draft({ type: 'washroom', width: 12, height: 25 }));
    expect(err).toMatch(/No free space inside the ground/);
    expect(st().data!.annotations).toHaveLength(0);
  });

  it('finds real free strips with a grid-step search', () => {
    expect(saveAnnotation(null, null, draft({ type: 'gift-counter', width: 8, height: 25 }))).toBeNull();
    const a = st().data!.annotations[0]!;
    for (const h of st().data!.hangars) expect(rectsOverlap(a, h)).toBe(false);
  });

  it('an edit that would cover a hangar re-places the item instead', () => {
    saveAnnotation(null, null, draft({}));
    expect(saveAnnotation(null, 1, draft({ width: 40, height: 10 }))).toMatch(/No free space/);
    const a = st().data!.annotations[0]!;
    expect(a.width).toBe(10); // unchanged
  });

  it('no-op edits do not warn about phantom overlaps', async () => {
    const sonner = await import('sonner');
    const warn = vi.spyOn(sonner.toast, 'warning');
    saveAnnotation(null, null, draft({ type: 'ticketing', width: 2, height: 2 }));
    setAnnotationRect(1, { x: 26, y: 5, width: 2, height: 2 }); // flush between Hangar A and C
    saveAnnotation(null, 1, draft({ type: 'ticketing', width: 2, height: 2, label: 'Tickets' }));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('overlaps another item'));
    warn.mockRestore();
  });

  it('hangars with a legacy overlap can still be renamed and nudged', () => {
    st().commit((d) => ({ ...d, annotations: [{ id: 1, type: 'parking', label: 'Old lot', x: 4, y: 4, width: 5, height: 5, hangarId: null }] }));
    expect(updateHangar(1, { name: 'Hall A', code: 'H-A', x: 2, y: 2, width: 24, height: 16 })).toBeNull();
    const h = st().data!.hangars.find((x) => x.id === 1)!;
    expect(setHangarRect(1, { ...h, x: 1 })).toBe(true);
  });
});

describe('outside placement precision & reach', () => {
  it('a flush top road with a many-decimal width stays outside the ground', () => {
    saveAnnotation(null, null, draft({ type: 'road', placement: 'outside', width: 60, height: 19.68504 }));
    const r = st().data!.annotations[0]!;
    expect(isOutsideGround(r, st().data!.ground)).toBe(true);
    expect(validateGroundAnnotationRect('road', { ...r, x: r.x + 1 }, st().data!.ground, siteBounds(st().data!.ground, st().data!.annotations))).toBeNull();
  });

  it('pushes past a very deep existing item instead of overlapping it', () => {
    const deep = { x: 0, y: -100, width: 60, height: 100 };
    const p = placeBesideGround('top', 3, 2, 0, { width: 60, height: 40 }, [deep]);
    expect(p.fits).toBe(true);
    expect(p.y + 2).toBeLessThanOrEqual(-100);
  });
});

describe('duplicate hangar hardening', () => {
  it('infers the gap from the layout (feet grounds spaced 2 ft apart still duplicate)', () => {
    const d = defaultLayout();
    d.ground = { ...d.ground, unit: 'feet', width: 200, height: 130, gridSize: 1 };
    d.hangars = [
      { id: 1, name: 'Hangar A', code: 'H-A', x: 2, y: 2, width: 97, height: 62 },
      { id: 2, name: 'Hangar B', code: 'H-B', x: 101, y: 2, width: 97, height: 62 },
      { id: 3, name: 'Hangar C', code: 'H-C', x: 2, y: 66, width: 97, height: 62 },
    ];
    d.stalls = [];
    expect(defaultHangarGap(d)).toBe(2);
    const r = duplicateHangar(d, 3, { withContents: false });
    expect(r.ok && r.value.hangar).toMatchObject({ x: 101, y: 66 });
  });

  it('never rounds the gap down to zero on a coarse grid', () => {
    const d = defaultLayout();
    d.ground = { ...d.ground, gridSize: 5 };
    expect(defaultHangarGap(d)).toBe(5);
  });

  it('keeps copied stall numbers unique and handles "$" in codes', () => {
    const d = defaultLayout();
    d.stalls = d.stalls.map((s) => (s.stallNo === 'A-P1' ? { ...s, stallNo: 'D-01', stallCode: 'D-01' } : s));
    const r = duplicateHangar(d, 1, { withContents: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nos = r.value.data.stalls.filter((s) => s.hangarId === r.value.hangar.id).map((s) => s.stallNo);
    expect(new Set(nos).size).toBe(nos.length);
    const dollar = defaultLayout();
    dollar.hangars[0] = { ...dollar.hangars[0]!, code: 'H-A' };
    dollar.hangars.push({ id: 9, name: 'Money $', code: 'M$-A', x: 50, y: 30, width: 5, height: 5 });
    expect(nextHangarIdentity(dollar, dollar.hangars[3]!).code).toBe('M$-B');
  });

  it('does not treat long capitalised names as a letter suffix', () => {
    const d = defaultLayout();
    expect(nextHangarIdentity(d, { name: 'NORTH', code: 'N' }).name).toBe('NORTH A');
    expect(nextHangarIdentity(d, { name: 'VIP LOUNGE', code: 'VL' }).name).toBe('VIP LOUNGE A');
    expect(nextHangarIdentity(d, { name: 'Hall AB', code: 'H-AB' }).name).toBe('Hall D');
  });

  it('treats markers flush with / straddling the ground edge as obstacles', () => {
    const d = defaultLayout();
    d.ground = { ...d.ground, width: 60.3 };
    d.hangars = [{ id: 1, name: 'Hangar A', code: 'H-A', x: 2, y: 2, width: 27, height: 16 }];
    d.annotations = [{ id: 1, type: 'washroom', label: 'WC', x: 56.7, y: 4, width: 3.6, height: 3, hangarId: null }];
    const spot = findHangarSpot(d, d.hangars[0]!, 2);
    expect(spot && rectsOverlap({ ...spot, width: 27, height: 16 }, d.annotations[0]!)).toBe(false);
  });
});
