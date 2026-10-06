import { cornerShapePoints, distanceToPolygonEdges, findFreeSpot, findOverlappingIds, isSelfIntersectingPolygon, pointInPolygon, rectsOverlap, snap } from './geometry';

describe('geometry', () => {
  it('snaps to the grid without float noise', () => {
    expect(snap(1.26, 0.5)).toBe(1.5);
    expect(snap(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(snap(7.3, 0)).toBe(7.3);
  });

  it('treats touching edges as non-overlapping', () => {
    const a = { x: 0, y: 0, width: 2, height: 2 };
    expect(rectsOverlap(a, { x: 2, y: 0, width: 2, height: 2 })).toBe(false);
    expect(rectsOverlap(a, { x: 1.9, y: 0, width: 2, height: 2 })).toBe(true);
  });

  it.each([
    ['top-right', [0, 0, 5.5, 0, 5.5, 4.5, 10, 4.5, 10, 10, 0, 10]],
    ['top-left', [4.5, 0, 10, 0, 10, 10, 0, 10, 0, 4.5, 4.5, 4.5]],
    ['bottom-right', [0, 0, 10, 0, 10, 5.5, 5.5, 5.5, 5.5, 10, 0, 10]],
    ['bottom-left', [0, 0, 10, 0, 10, 10, 4.5, 10, 4.5, 5.5, 0, 5.5]],
  ] as const)('builds the L-shaped corner polygon for %s', (orientation, expected) => {
    expect(cornerShapePoints(0, 0, 10, 10, orientation).map((n) => Math.round(n * 100) / 100)).toEqual(expected);
  });

  it('offsets corner points by the origin (ground scale uses hangar + stall offset)', () => {
    const local = cornerShapePoints(0, 0, 4, 2, 'bottom-left');
    const ground = cornerShapePoints(10, 20, 4, 2, 'bottom-left');
    const r = (n: number) => Math.round(n * 1e6) / 1e6;
    expect(ground.map((v, i) => r(v - (i % 2 === 0 ? 10 : 20)))).toEqual(local.map(r));
  });

  it('finds a free spot that avoids obstacles', () => {
    const spot = findFreeSpot(2, 2, { width: 10, height: 10 }, [{ x: 0, y: 0, width: 3, height: 3 }]);
    expect(spot.fits).toBe(true);
    expect(rectsOverlap({ ...spot, width: 2, height: 2 }, { x: 0, y: 0, width: 3, height: 3 })).toBe(false);
  });

  it('detects overlapping ids with sort-and-sweep', () => {
    const ids = findOverlappingIds([
      { id: 1, x: 0, y: 0, width: 2, height: 2 },
      { id: 2, x: 1, y: 1, width: 2, height: 2 },
      { id: 3, x: 5, y: 5, width: 1, height: 1 },
      { id: 4, x: 2, y: 5, width: 3, height: 1 },
    ]);
    expect([...ids].sort()).toEqual([1, 2]);
  });
});

describe('ground boundary polygon', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];

  it('passes a simple square and a triangle', () => {
    expect(isSelfIntersectingPolygon(square)).toBe(false);
    expect(isSelfIntersectingPolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }])).toBe(false);
  });

  it('flags a bowtie (edges crossing) as self-intersecting', () => {
    expect(isSelfIntersectingPolygon(bowtie)).toBe(true);
  });

  it('point-in-polygon for a square', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('distance to the nearest edge of a square', () => {
    expect(distanceToPolygonEdges({ x: 5, y: 2 }, square)).toBeCloseTo(2, 6);
    expect(distanceToPolygonEdges({ x: 1, y: 1 }, square)).toBeCloseTo(1, 6);
  });
});
