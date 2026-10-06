import {
  activeBoundary,
  allowedAnnotationTypes,
  atGap,
  gapFromGround,
  outsideReach,
  formatLength,
  formatSize,
  groundLocation,
  inferSide,
  isOutsideGround,
  lengthAndDepth,
  orientSize,
  parkingCapacity,
  placeBesideGround,
  placementRule,
  setbackViolation,
  siteBounds,
  siteMargin,
  validateGroundAnnotationRect,
} from './site';
import type { LayoutAnnotation } from './types';

const g = { width: 60, height: 40 };
const site = siteBounds(g);
const annot = (over: Partial<LayoutAnnotation>): LayoutAnnotation => ({ id: 1, type: 'road', label: 'R', x: 0, y: -6, width: 60, height: 6, hangarId: null, ...over });

describe('placement rules', () => {
  it('roads are outside-only, parking/ticketing either, the rest inside', () => {
    expect(placementRule('road')).toBe('outside');
    expect(placementRule('parking')).toBe('either');
    expect(placementRule('ticketing')).toBe('either');
    expect(placementRule('entry')).toBe('inside');
    expect(placementRule('walking')).toBe('inside');
  });

  it('roads and parking are ground-level only', () => {
    expect(allowedAnnotationTypes('hangar')).not.toContain('road');
    expect(allowedAnnotationTypes('hangar')).not.toContain('parking');
    expect(allowedAnnotationTypes('hangar')).toContain('ticketing');
    expect(allowedAnnotationTypes('ground')).toEqual(expect.arrayContaining(['road', 'parking']));
  });
});

describe('site bounds', () => {
  it('surrounds the ground by a margin', () => {
    expect(siteMargin(g)).toBe(18);
    expect(site).toEqual({ x: -18, y: -18, width: 96, height: 76 });
    expect(siteMargin({ width: 10, height: 10 })).toBe(15);
  });

  it('grows to include annotations already stored further out, ignoring hangar-scoped ones', () => {
    const far = annot({ id: 2, x: -40, y: 0, width: 5, height: 5 });
    const inHangar = annot({ id: 3, x: -100, y: 0, width: 5, height: 5, hangarId: 1 });
    expect(siteBounds(g, [far, inHangar]).x).toBe(-40);
  });
});

describe('ground location', () => {
  it('treats touching the edge as outside', () => {
    expect(isOutsideGround({ x: 0, y: -6, width: 60, height: 6 }, g)).toBe(true);
    expect(isOutsideGround({ x: 0, y: -5.5, width: 60, height: 6 }, g)).toBe(false);
  });

  it('classifies inside / outside / straddling', () => {
    expect(groundLocation({ x: 1, y: 1, width: 3, height: 2 }, g)).toBe('inside');
    expect(groundLocation({ x: 61, y: 1, width: 3, height: 2 }, g)).toBe('outside');
    expect(groundLocation({ x: 58, y: 1, width: 4, height: 2 }, g)).toBe('straddling');
  });

  it.each([
    [{ x: 0, y: -6, width: 60, height: 6 }, 'top'],
    [{ x: 5, y: 42, width: 20, height: 10 }, 'bottom'],
    [{ x: -3, y: 19, width: 3, height: 2 }, 'left'],
    [{ x: 62, y: 14, width: 20, height: 12 }, 'right'],
    [{ x: 70, y: -5, width: 3, height: 3 }, 'right'], // corner: further beyond the right edge than the top
  ] as const)('infers the side of %o as %s', (r, side) => {
    expect(inferSide(r, g)).toBe(side);
  });

  it('has no side for inside rects', () => {
    expect(inferSide({ x: 1, y: 1, width: 3, height: 2 }, g)).toBeNull();
  });
});

describe('validateGroundAnnotationRect', () => {
  it('rejects a road on the ground, accepts it beside the ground', () => {
    expect(validateGroundAnnotationRect('road', { x: 0, y: 2, width: 60, height: 6 }, g, site)).toMatch(/outside the ground/);
    expect(validateGroundAnnotationRect('road', { x: 0, y: -6, width: 60, height: 6 }, g, site)).toBeNull();
  });

  it('accepts parking fully inside or fully outside, not across the edge', () => {
    expect(validateGroundAnnotationRect('parking', { x: 5, y: 5, width: 10, height: 10 }, g, site)).toBeNull();
    expect(validateGroundAnnotationRect('parking', { x: 62, y: 5, width: 10, height: 10 }, g, site)).toBeNull();
    expect(validateGroundAnnotationRect('parking', { x: 55, y: 5, width: 10, height: 10 }, g, site)).toMatch(/not across/);
  });

  it('keeps inside-only markers on the ground and everything within the site', () => {
    expect(validateGroundAnnotationRect('entry', { x: -3, y: 5, width: 3, height: 2 }, g, site)).toMatch(/inside the ground/);
    expect(validateGroundAnnotationRect('road', { x: 0, y: -30, width: 60, height: 6 }, g, site)).toMatch(/site area/);
  });
});

describe('placeBesideGround', () => {
  it('treats counters like the ticketing counter', () => {
    expect(placementRule('gift-counter')).toBe('either');
    expect(placementRule('washroom')).toBe('either');
    expect(allowedAnnotationTypes('hangar')).toEqual(expect.arrayContaining(['gift-counter', 'washroom']));
    expect(validateGroundAnnotationRect('washroom', { x: 58, y: 5, width: 4, height: 3 }, g, site)).toMatch(/Washrooms must be fully inside or fully outside/);
    expect(validateGroundAnnotationRect('gift-counter', { x: -3, y: 5, width: 3, height: 2 }, g, site)).toBeNull();
  });

  it('lays a full-length road flush against the chosen side', () => {
    expect(placeBesideGround('top', 60, 6, 0, g, [])).toEqual({ x: 0, y: -6, fits: true });
    expect(placeBesideGround('bottom', 60, 6, 1, g, [])).toEqual({ x: 0, y: 41, fits: true });
    expect(placeBesideGround('left', 6, 40, 0, g, [])).toEqual({ x: -6, y: 0, fits: true });
    expect(placeBesideGround('right', 6, 40, 2, g, [])).toEqual({ x: 62, y: 0, fits: true });
  });

  it('centres shorter items along the side', () => {
    expect(placeBesideGround('right', 20, 12, 0, g, [])).toEqual({ x: 60, y: 14, fits: true });
  });

  it('slides along, then outward, to clear existing items', () => {
    const road = { x: 0, y: -6, width: 60, height: 6 };
    // Parking on top has to go beyond the road.
    const p = placeBesideGround('top', 20, 10, 0, g, [road]);
    expect(p.fits).toBe(true);
    expect(p.y + 10).toBeLessThanOrEqual(-6);
    // A second parking lot on the right slides along the side past the first.
    const first = { x: 60, y: 14, width: 20, height: 12 };
    const q = placeBesideGround('right', 20, 12, 0, g, [first]);
    expect(q).toMatchObject({ x: 60, fits: true });
    expect(Math.abs(q.y - 14)).toBeGreaterThanOrEqual(12);
  });

  it('searches past every obstacle on the side, however deep (a spot beyond them always fits)', () => {
    const wall = { x: -500, y: -500, width: 1100, height: 500 };
    const p = placeBesideGround('top', 60, 6, 0, g, [wall]);
    expect(p.fits).toBe(true);
    expect(p.y + 6).toBeLessThanOrEqual(-500);
  });

  it('never slides an item round the corner of the side (review: corner-slide)', () => {
    const big = { width: 100, height: 60 };
    const road = { x: 0, y: -6, width: 100, height: 6 };
    const p = placeBesideGround('top', 20, 12, 0, big, [road]);
    expect(p.fits).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + 20).toBeLessThanOrEqual(100);
    expect(p.y + 12).toBeLessThanOrEqual(-6);
    expect(inferSide({ ...p, width: 20, height: 12 }, big)).toBe('top');
    const rightRoad = { x: 100, y: 0, width: 6, height: 60 };
    const q = placeBesideGround('right', 20, 12, 0, big, [rightRoad]);
    expect(inferSide({ ...q, width: 20, height: 12 }, big)).toBe('right');
    expect(q.x).toBe(106);
  });

  it('pushes out past existing items beyond the default margin (review: outward-capped)', () => {
    const parking = { x: 60, y: 14, width: 20, height: 12 };
    const road = placeBesideGround('right', 6, 40, 0, g, [parking]);
    expect(road).toEqual({ x: 80, y: 0, fits: true });
    const topRoad = { x: 0, y: -6, width: 60, height: 6 };
    const lot = placeBesideGround('top', 40, 25, 0, g, [topRoad]);
    expect(lot).toMatchObject({ y: -31, fits: true });
    const second = placeBesideGround('top', 60, 10, 0, g, [topRoad]);
    expect(second).toEqual({ x: 0, y: -16, fits: true });
  });

  it('keeps positions on the grid', () => {
    const p = placeBesideGround('bottom', 7, 3, 0.5, g, [], 0.5);
    expect([p.x % 0.5, p.y % 0.5]).toEqual([0, 0]);
  });
});

describe('measurements', () => {
  it('orients length/depth by side and back', () => {
    expect(orientSize('top', 60, 6)).toEqual({ width: 60, height: 6 });
    expect(orientSize('left', 40, 6)).toEqual({ width: 6, height: 40 });
    expect(lengthAndDepth('left', { width: 6, height: 40 })).toEqual({ length: 40, depth: 6 });
  });

  it('formats lengths with units and no float noise', () => {
    expect(formatLength(24, 'meter')).toBe('24 m');
    expect(formatLength(0.1 + 0.2, 'feet')).toBe('0.3 ft');
    expect(formatSize(3, 2.5, 'meter')).toBe('3 × 2.5 m');
  });

  it('estimates parking capacity at ~25 m² per car', () => {
    expect(parkingCapacity(20, 12, 'meter')).toBe(9);
    expect(parkingCapacity(100, 50, 'meter')).toBe(200);
    expect(parkingCapacity(65.6, 39.4, 'feet')).toBe(9);
  });
});

describe('gap helpers & reach', () => {
  it('moves an outside rect to a new gap keeping its along position', () => {
    const r = { x: 12, y: -6, width: 20, height: 6 };
    expect(atGap(r, 'top', 5, g)).toEqual({ ...r, y: -11 });
    expect(gapFromGround(atGap(r, 'top', 5, g), 'top', g)).toBe(5);
    expect(atGap({ x: 64, y: 3, width: 20, height: 12 }, 'right', 0, g).x).toBe(60);
  });

  it('chains outside items hugging a side to find how far out they reach', () => {
    const items = [
      annot({ id: 1, x: 0, y: -6, width: 60, height: 6 }), // road flush on top
      annot({ id: 2, type: 'parking', x: 20, y: -18, width: 20, height: 12 }), // beyond the road
      annot({ id: 3, type: 'parking', x: 0, y: -60, width: 10, height: 5 }), // far away, not chained
      annot({ id: 4, type: 'ticketing', x: -3, y: 19, width: 3, height: 2 }),
    ];
    expect(outsideReach(items, g, 1)).toEqual({ top: 18, bottom: 0, left: 3, right: 0 });
  });
});

describe('ground boundary and setback', () => {
  it('falls back to the rectangle corners when no custom boundary is set', () => {
    expect(activeBoundary(g)).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 0, y: 40 },
    ]);
  });

  it('uses the custom boundary when one is set', () => {
    const boundary = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 30, y: 40 }];
    expect(activeBoundary({ ...g, boundary })).toBe(boundary);
  });

  it('ignores a boundary with fewer than 3 points', () => {
    expect(activeBoundary({ ...g, boundary: [{ x: 0, y: 0 }] })).toHaveLength(4);
  });

  it('setback: no violation when setbackDistance is unset or zero', () => {
    const hugsEdge = { x: 0, y: 0, width: 5, height: 5 };
    expect(setbackViolation(hugsEdge, g)).toBe(false);
    expect(setbackViolation(hugsEdge, { ...g, setbackDistance: 0 })).toBe(false);
  });

  it('setback: flags a hangar too close to the boundary, not one safely inside', () => {
    const gWithSetback = { ...g, setbackDistance: 3 };
    expect(setbackViolation({ x: 0, y: 0, width: 5, height: 5 }, gWithSetback)).toBe(true);
    expect(setbackViolation({ x: 10, y: 10, width: 5, height: 5 }, gWithSetback)).toBe(false);
  });
});
