import { defaultLayout } from '../domain/seed';
import { MemoryLayoutRepository } from '../repository/memoryRepository';
import { saveAnnotation, setAnnotationRect, toggleStallOpenSide, validateAnnotation, type AnnotationDraft } from './actions';
import { resetLayoutStore, useLayoutStore } from './layoutStore';

const st = () => useLayoutStore.getState();
const annots = () => st().data!.annotations;
const draft = (over: Partial<AnnotationDraft>): AnnotationDraft => ({
  type: 'road',
  label: '',
  width: 60,
  height: 6,
  placement: 'outside',
  side: 'top',
  gap: 0,
  ...over,
});

beforeEach(async () => {
  resetLayoutStore();
  await st().init(new MemoryLayoutRepository(defaultLayout()));
});

describe('roads & parking', () => {
  it('adds a road flush beside the chosen side, outside the ground', () => {
    saveAnnotation(null, null, draft({ label: 'Main Road' }));
    expect(annots()[0]).toMatchObject({ type: 'road', label: 'Main Road', x: 0, y: -6, width: 60, height: 6, hangarId: null });
    expect(st().groundSelection).toEqual({ kind: 'annotation', id: 1 });
  });

  it('defaults an empty label to the type name', () => {
    saveAnnotation(null, null, draft({ type: 'parking', width: 20, height: 12, side: 'right' }));
    expect(annots()[0]).toMatchObject({ label: 'Parking Area', x: 60, y: 14 });
  });

  it('places inside parking on free ground, clear of hangars', () => {
    saveAnnotation(null, null, draft({ type: 'parking', placement: 'inside', width: 10, height: 3 }));
    const p = annots()[0]!;
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(60);
    expect(p.y + p.height).toBeLessThanOrEqual(40);
    for (const h of st().data!.hangars) {
      const overlap = !(p.x + p.width <= h.x || h.x + h.width <= p.x || p.y + p.height <= h.y || h.y + h.height <= p.y);
      expect(overlap).toBe(false);
    }
  });

  it('puts a ticket counter outside when asked, inside otherwise', () => {
    saveAnnotation(null, null, draft({ type: 'ticketing', width: 3, height: 2, placement: 'outside', side: 'left' }));
    saveAnnotation(null, null, draft({ type: 'ticketing', width: 3, height: 2, placement: 'inside' }));
    const [out, inside] = annots();
    expect(out!.x + out!.width).toBeLessThanOrEqual(0);
    expect(inside!.x).toBeGreaterThanOrEqual(0);
  });

  it('editing a top road keeps the edge that faces the ground', () => {
    saveAnnotation(null, null, draft({}));
    saveAnnotation(null, 1, draft({ width: 70, height: 8 }));
    expect(annots()[0]).toMatchObject({ x: 0, y: -8, width: 70, height: 8 });
  });

  it('moving a road to another side re-places it', () => {
    saveAnnotation(null, null, draft({}));
    saveAnnotation(null, 1, draft({ side: 'left', width: 6, height: 40 }));
    expect(annots()[0]).toMatchObject({ x: -6, y: 0, width: 6, height: 40 });
  });

  it('rejects dropping a road onto the ground and keeps state unchanged', () => {
    saveAnnotation(null, null, draft({}));
    const before = st().data;
    expect(setAnnotationRect(1, { x: 0, y: 10, width: 60, height: 6 })).toBe(false);
    expect(st().data).toBe(before);
    expect(setAnnotationRect(1, { x: 0, y: 40, width: 60, height: 6 })).toBe(true);
    expect(annots()[0]!.y).toBe(40);
  });

  it('rejects roads/parking inside a hangar and oversize items', () => {
    expect(validateAnnotation(1, draft({ width: 3, height: 2 })).type).toMatch(/ground level/);
    expect(validateAnnotation(null, draft({ width: 500 })).width).toMatch(/site area/);
    expect(validateAnnotation(null, draft({ type: 'parking', placement: 'inside', width: 61, height: 5 })).width).toMatch(/the ground/);
  });

  it('adding and moving roads is undoable', () => {
    saveAnnotation(null, null, draft({}));
    setAnnotationRect(1, { x: 0, y: 40, width: 60, height: 6 });
    st().undo();
    expect(annots()[0]!.y).toBe(-6);
    st().undo();
    expect(annots()).toHaveLength(0);
  });
});

describe('dimension preference', () => {
  it('toggles and persists showDimensions', () => {
    expect(st().showDimensions).toBe(true);
    st().setShowDimensions(false);
    expect(st().showDimensions).toBe(false);
    expect(JSON.parse(localStorage.getItem('gs_stall_layout_prefs')!)).toEqual({ showDimensions: false });
    st().setShowDimensions(true);
  });
});

describe('duplicateHangar command', () => {
  it('is one undoable step and selects the copy', async () => {
    const { duplicateHangar } = await import('./actions');
    expect(duplicateHangar(1, true)).toBe(true);
    expect(st().data!.hangars).toHaveLength(4);
    expect(st().data!.stalls).toHaveLength(59);
    expect(st().groundSelection).toEqual({ kind: 'hangar', id: 4 });
    st().undo();
    expect(st().data!.hangars).toHaveLength(3);
    expect(st().data!.stalls).toHaveLength(42);
  });
});

describe('review regressions', () => {
  it('editing the gap of an outside item moves it (keeps its along-side position)', () => {
    saveAnnotation(null, null, draft({}));
    saveAnnotation(null, 1, draft({ gap: 5 }));
    expect(annots()[0]).toMatchObject({ x: 0, y: -11 });
    saveAnnotation(null, null, draft({ type: 'parking', width: 20, height: 12, side: 'right', gap: 4 }));
    expect(annots()[1]).toMatchObject({ x: 64, y: 14 });
    saveAnnotation(null, 2, draft({ type: 'parking', width: 20, height: 12, side: 'right', gap: 0 }));
    expect(annots()[1]).toMatchObject({ x: 60, y: 14 });
  });

  it('a new road beside existing parking goes beyond it instead of on top of it', () => {
    saveAnnotation(null, null, draft({ type: 'parking', width: 20, height: 12, side: 'right' }));
    saveAnnotation(null, null, draft({ width: 6, height: 40, side: 'right' }));
    expect(annots()[1]).toMatchObject({ x: 80, y: 0 });
  });

  it('warns (and keeps position) when a form resize makes a road overlap items beyond it', async () => {
    const sonner = await import('sonner');
    const warn = vi.spyOn(sonner.toast, 'warning');
    saveAnnotation(null, null, draft({}));
    saveAnnotation(null, null, draft({ type: 'parking', width: 20, height: 12, side: 'top' }));
    expect(annots()[1]!.y).toBe(-18);
    saveAnnotation(null, 1, draft({ height: 9 }));
    expect(annots()[0]).toMatchObject({ y: -9, height: 9 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('now overlaps another item'));
    warn.mockRestore();
  });

  it('resizing an outside item past the old site edge keeps its position', () => {
    saveAnnotation(null, null, draft({ type: 'parking', width: 20, height: 12, side: 'right' }));
    expect(setAnnotationRect(1, { x: 60, y: 0, width: 20, height: 12 })).toBe(true);
    saveAnnotation(null, 1, draft({ type: 'parking', width: 24, height: 12, side: 'right' }));
    expect(annots()[0]).toMatchObject({ x: 60, y: 0, width: 24 });
  });

  it('keeps inside parking/counters and hangars from overlapping each other', async () => {
    const { addHangar, setHangarRect } = await import('./actions');
    saveAnnotation(null, null, draft({ type: 'parking', placement: 'inside', width: 10, height: 3 }));
    const lot = annots()[0]!;
    expect(addHangar({ name: 'Hangar Z', code: 'H-Z', x: lot.x, y: lot.y, width: 5, height: 3 })?.x).toMatch(/Overlaps "Parking Area"/);
    const c = st().data!.hangars.find((h) => h.id === 3)!;
    expect(setHangarRect(3, { ...c, x: lot.x, y: lot.y })).toBe(false);
    expect(setAnnotationRect(lot.id, { ...lot, x: 3, y: 3 })).toBe(false); // onto Hangar A
  });
});

describe('gift counter & washroom', () => {
  it('behave like the ticketing counter: inside or outside at ground level, allowed in hangars', () => {
    saveAnnotation(null, null, draft({ type: 'gift-counter', label: '', width: 3, height: 2, placement: 'outside', side: 'bottom' }));
    saveAnnotation(null, null, draft({ type: 'washroom', label: '', width: 4, height: 3, placement: 'inside' }));
    const [gift, wash] = annots();
    expect(gift).toMatchObject({ type: 'gift-counter', label: 'Gift Counter', y: 40 });
    expect(wash).toMatchObject({ type: 'washroom', label: 'Washroom' });
    expect(wash!.x).toBeGreaterThanOrEqual(0);
    expect(validateAnnotation(1, draft({ type: 'washroom', width: 4, height: 3, placement: 'inside' }))).toEqual({});
    saveAnnotation(1, null, draft({ type: 'washroom', width: 4, height: 3, placement: 'inside' }));
    expect(annots()[2]).toMatchObject({ type: 'washroom', hangarId: 1 });
    expect(setAnnotationRect(gift!.id, { ...gift!, y: 39 })).toBe(false); // straddling the edge
    expect(setAnnotationRect(gift!.id, { ...gift!, y: 38 })).toBe(true); // fully inside, flush with the edge
  });
});

describe('toggleStallOpenSide', () => {
  it('opens a side on all selected stalls, walls it when all are open, and is undoable', () => {
    const find = (id: number) => st().data!.stalls.find((s) => s.id === id)!;
    toggleStallOpenSide([1], 'bottom');
    expect(find(1).openSides).toEqual(['bottom']);
    toggleStallOpenSide([1, 2], 'bottom'); // mixed → open on both
    expect([find(1).openSides, find(2).openSides]).toEqual([['bottom'], ['bottom']]);
    toggleStallOpenSide([1, 2], 'bottom'); // all open → walled
    expect(find(1).openSides).toBeUndefined();
    st().undo();
    expect(find(2).openSides).toEqual(['bottom']);
  });
});

describe('prefs', () => {
  it('ignores a null / malformed prefs value instead of crashing on import', async () => {
    localStorage.setItem('gs_stall_layout_prefs', 'null');
    vi.resetModules();
    const mod = await import('./layoutStore');
    expect(mod.useLayoutStore.getState().showDimensions).toBe(true);
    localStorage.setItem('gs_stall_layout_prefs', '{"showDimensions":"yes"}');
    vi.resetModules();
    expect((await import('./layoutStore')).useLayoutStore.getState().showDimensions).toBe(true);
    localStorage.removeItem('gs_stall_layout_prefs');
  });
});

