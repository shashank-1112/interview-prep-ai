import { rectsOverlap } from './geometry';
import { duplicateHangar, findHangarSpot, nextHangarIdentity } from './layoutOps';
import { defaultLayout } from './seed';

describe('duplicateHangar', () => {
  it('copies a hangar at the same size into free space with the next letter', () => {
    const data = defaultLayout();
    const r = duplicateHangar(data, 1, { withContents: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { hangar } = r.value;
    expect(hangar).toMatchObject({ id: 4, name: 'Hangar D', code: 'H-D', width: 24, height: 16 });
    // Lands in the free block right of Hangar B / below Hangar C, inside the ground.
    expect(hangar).toMatchObject({ x: 28, y: 18 });
    for (const other of data.hangars) expect(rectsOverlap(hangar, other)).toBe(false);
    expect(r.value.data.stalls).toHaveLength(42);
  });

  it('prefers the spot right of the source when it is free', () => {
    const data = { ...defaultLayout(), hangars: [{ id: 1, name: 'Hall A', code: 'H-A', x: 2, y: 2, width: 10, height: 8 }], stalls: [] };
    const r = duplicateHangar(data, 1, { withContents: false });
    expect(r.ok && r.value.hangar).toMatchObject({ x: 14, y: 2, name: 'Hall B', code: 'H-B' });
  });

  it('with contents: copies stalls and markers, renumbers, and resets bookings', () => {
    const data = defaultLayout();
    data.annotations.push({ id: 1, type: 'entry', label: 'Gate', x: 0, y: 14, width: 3, height: 2, hangarId: 1 });
    const r = duplicateHangar(data, 1, { withContents: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const copies = r.value.data.stalls.filter((s) => s.hangarId === r.value.hangar.id);
    expect(r.value.stallCount).toBe(17);
    expect(copies.map((s) => s.stallNo).slice(0, 3)).toEqual(['D-01', 'D-02', 'D-03']);
    expect(copies.every((s) => s.stallCode === s.stallNo)).toBe(true);
    expect(copies.every((s) => s.status === 'available' && s.exhibitorName === null)).toBe(true);
    // Geometry, type and prices are kept; ids are fresh.
    const src = data.stalls.find((s) => s.stallNo === 'A-P2')!;
    expect(copies.find((s) => s.stallNo === 'D-P2')).toMatchObject({ x: src.x, y: src.y, width: src.width, stallType: 'Premium', finalPrice: src.finalPrice });
    expect(new Set(r.value.data.stalls.map((s) => s.id)).size).toBe(59);
    expect(r.value.data.annotations.filter((a) => a.hangarId === r.value.hangar.id)).toHaveLength(1);
    // Source is untouched.
    expect(r.value.data.stalls.filter((s) => s.hangarId === 1).find((s) => s.stallNo === 'A-02')!.status).toBe('reserved');
  });

  it('renames merged stall numbers part by part', () => {
    const data = defaultLayout();
    data.stalls = data.stalls.map((s) => (s.id === 1 ? { ...s, stallNo: 'A-01+A-02', stallCode: 'A-01+A-02' } : s));
    const r = duplicateHangar(data, 1, { withContents: true });
    expect(r.ok && r.value.data.stalls.some((s) => s.stallNo === 'D-01+D-02')).toBe(true);
  });

  it('fails cleanly when the ground has no room', () => {
    const data = defaultLayout();
    // Hangars fill the ground exactly: no room even when touching.
    data.ground = { ...data.ground, width: 48, height: 36 };
    const r = duplicateHangar(data, 1, { withContents: true });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('No free space') });
  });

  it('keeps clear of inside-ground markers but ignores outside ones', () => {
    const data = { ...defaultLayout(), hangars: [{ id: 1, name: 'Hall A', code: 'H-A', x: 2, y: 2, width: 10, height: 8 }], stalls: [] };
    data.annotations = [
      { id: 1, type: 'parking', label: 'P', x: 14, y: 2, width: 10, height: 8, hangarId: null },
      { id: 2, type: 'road', label: 'R', x: 0, y: -6, width: 60, height: 6, hangarId: null },
    ];
    const spot = findHangarSpot(data, data.hangars[0]!, 2);
    expect(spot).not.toBeNull();
    expect(rectsOverlap({ ...spot!, width: 10, height: 8 }, data.annotations[0]!)).toBe(false);
    expect(spot!.y).toBeGreaterThanOrEqual(0);
  });

  it('picks a unique identity even when letters are taken or names are custom', () => {
    const data = defaultLayout();
    data.hangars.push({ id: 4, name: 'Hangar D', code: 'H-X', x: 0, y: 0, width: 1, height: 1 });
    expect(nextHangarIdentity(data, data.hangars[0]!)).toMatchObject({ name: 'Hangar E', code: 'H-E' });
    expect(nextHangarIdentity(data, { name: 'Main Hall', code: 'MH' })).toMatchObject({ name: 'Main Hall A', code: 'MH-A' });
  });
});
