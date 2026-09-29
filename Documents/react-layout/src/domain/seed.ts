/** Default demo layout (ported verbatim from the original planner's mock data). */
import type { ExhibitionGround, Hangar, Stall, StallLayoutData } from './types';

// ─── Ground ──────────────────────────────────────────────────────────────────
// 60m × 40m exhibition fairground, snaps to 0.5m grid

export const MOCK_GROUND: ExhibitionGround = {
  id: 1,
  exhibitionName: 'India Industrial Expo 2025',
  venueName: 'Bombay Exhibition Centre',
  unit: 'meter',
  width: 60,
  height: 40,
  gridSize: 0.5
};

// ─── Hangars ─────────────────────────────────────────────────────────────────
// Positions are in meters, relative to ground origin (0,0)
//  Hangar A  x=2  y=2   w=24  h=16  → occupies x:2–26, y:2–18
//  Hangar B  x=2  y=20  w=24  h=16  → occupies x:2–26, y:20–36  (2m gap below A)
//  Hangar C  x=28 y=2   w=20  h=14  → occupies x:28–48, y:2–16  (2m gap right of A)

export const MOCK_HANGARS: Hangar[] = [
  { id: 1, name: 'Hangar A', code: 'H-A', x: 2,  y: 2,  width: 24, height: 16 },
  { id: 2, name: 'Hangar B', code: 'H-B', x: 2,  y: 20, width: 24, height: 16 },
  { id: 3, name: 'Hangar C', code: 'H-C', x: 28, y: 2,  width: 20, height: 14 }
];

// ─── Stalls ───────────────────────────────────────────────────────────────────
// All x/y positions are RELATIVE to the containing hangar's origin.
// All dimensions are in meters.

// ── Hangar A (24m × 16m) ─────────────────────────────────────────────────────
// Standard grid: 3m × 2m, gapX=0.5m, gapY=0.5m, startX=1, startY=1.5
//   col x: 1, 4.5, 8, 11.5   (step = stallW + gapX = 3.5)
//   row y: 1.5, 4, 6.5        (step = stallH + gapY = 2.5)
const hangarAStalls: Stall[] = [
  // Row 0
  { id:  1, hangarId: 1, stallNo:'A-01', stallCode:'A-01', stallType:'Standard', x:1,    y:1.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  { id:  2, hangarId: 1, stallNo:'A-02', stallCode:'A-02', stallType:'Standard', x:4.5,  y:1.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'reserved',  exhibitorName:'Sunrise Technologies' },
  { id:  3, hangarId: 1, stallNo:'A-03', stallCode:'A-03', stallType:'Standard', x:8,    y:1.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'booked',    exhibitorName:'Green Agro Products' },
  { id:  4, hangarId: 1, stallNo:'A-04', stallCode:'A-04', stallType:'Standard', x:11.5, y:1.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  // Row 1
  { id:  5, hangarId: 1, stallNo:'A-05', stallCode:'A-05', stallType:'Standard', x:1,    y:4,   width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'blocked',   exhibitorName:null },
  { id:  6, hangarId: 1, stallNo:'A-06', stallCode:'A-06', stallType:'Standard', x:4.5,  y:4,   width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  { id:  7, hangarId: 1, stallNo:'A-07', stallCode:'A-07', stallType:'Standard', x:8,    y:4,   width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'reserved',  exhibitorName:'Bharat Textiles' },
  { id:  8, hangarId: 1, stallNo:'A-08', stallCode:'A-08', stallType:'Standard', x:11.5, y:4,   width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  // Row 2
  { id:  9, hangarId: 1, stallNo:'A-09', stallCode:'A-09', stallType:'Standard', x:1,    y:6.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  { id: 10, hangarId: 1, stallNo:'A-10', stallCode:'A-10', stallType:'Standard', x:4.5,  y:6.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  { id: 11, hangarId: 1, stallNo:'A-11', stallCode:'A-11', stallType:'Standard', x:8,    y:6.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  { id: 12, hangarId: 1, stallNo:'A-12', stallCode:'A-12', stallType:'Standard', x:11.5, y:6.5, width:3, height:2, area:6,  basePrice:25000, finalPrice:25000, status:'available', exhibitorName:null },
  // Premium 4m × 4m (right side of hangar)
  { id: 13, hangarId: 1, stallNo:'A-P1', stallCode:'A-P1', stallType:'Premium',  x:16,   y:1.5, width:4, height:4, area:16, basePrice:65000, finalPrice:65000, status:'available', exhibitorName:null },
  { id: 14, hangarId: 1, stallNo:'A-P2', stallCode:'A-P2', stallType:'Premium',  x:16,   y:6.5, width:4, height:4, area:16, basePrice:65000, finalPrice:65000, status:'booked',    exhibitorName:'Mega International Corp' },
  // Bottom large stalls 7m × 2m
  { id: 15, hangarId: 1, stallNo:'A-L1', stallCode:'A-L1', stallType:'Corner',   x:1,    y:11,  width:7, height:2, area:14, basePrice:48000, finalPrice:48000, status:'available', exhibitorName:null },
  { id: 16, hangarId: 1, stallNo:'A-L2', stallCode:'A-L2', stallType:'Corner',   x:9,    y:11,  width:7, height:2, area:14, basePrice:48000, finalPrice:48000, status:'blocked',   exhibitorName:null },
  { id: 17, hangarId: 1, stallNo:'A-L3', stallCode:'A-L3', stallType:'Corner',   x:17,   y:11,  width:6, height:2, area:12, basePrice:45000, finalPrice:45000, status:'available', exhibitorName:null }
];

// ── Hangar B (24m × 16m) ─────────────────────────────────────────────────────
// Standard grid: 2m × 3m, gapX=0.5m, gapY=0.5m, startX=1, startY=1
//   col x: 1, 3.5, 6, 8.5   (step = 2.5)
//   row y: 1, 4.5, 8         (step = 3.5)
const hangarBStalls: Stall[] = [
  // Row 0
  { id: 18, hangarId: 2, stallNo:'B-01', stallCode:'B-01', stallType:'Standard', x:1,    y:1,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  { id: 19, hangarId: 2, stallNo:'B-02', stallCode:'B-02', stallType:'Standard', x:3.5,  y:1,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  { id: 20, hangarId: 2, stallNo:'B-03', stallCode:'B-03', stallType:'Standard', x:6,    y:1,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'reserved',  exhibitorName:'National Crafts India' },
  { id: 21, hangarId: 2, stallNo:'B-04', stallCode:'B-04', stallType:'Standard', x:8.5,  y:1,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  // Row 1
  { id: 22, hangarId: 2, stallNo:'B-05', stallCode:'B-05', stallType:'Standard', x:1,    y:4.5, width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'booked',    exhibitorName:'Delta Industries' },
  { id: 23, hangarId: 2, stallNo:'B-06', stallCode:'B-06', stallType:'Standard', x:3.5,  y:4.5, width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  { id: 24, hangarId: 2, stallNo:'B-07', stallCode:'B-07', stallType:'Standard', x:6,    y:4.5, width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  { id: 25, hangarId: 2, stallNo:'B-08', stallCode:'B-08', stallType:'Standard', x:8.5,  y:4.5, width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'blocked',   exhibitorName:null },
  // Row 2
  { id: 26, hangarId: 2, stallNo:'B-09', stallCode:'B-09', stallType:'Standard', x:1,    y:8,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  { id: 27, hangarId: 2, stallNo:'B-10', stallCode:'B-10', stallType:'Standard', x:3.5,  y:8,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  { id: 28, hangarId: 2, stallNo:'B-11', stallCode:'B-11', stallType:'Standard', x:6,    y:8,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'reserved',  exhibitorName:'NovaTech Labs' },
  { id: 29, hangarId: 2, stallNo:'B-12', stallCode:'B-12', stallType:'Standard', x:8.5,  y:8,   width:2, height:3, area:6,  basePrice:24000, finalPrice:24000, status:'available', exhibitorName:null },
  // Large 6m × 3m right side
  { id: 30, hangarId: 2, stallNo:'B-L1', stallCode:'B-L1', stallType:'Premium',  x:15,   y:1,   width:6, height:3, area:18, basePrice:50000, finalPrice:50000, status:'reserved',  exhibitorName:'Grand Expo Ltd' },
  { id: 31, hangarId: 2, stallNo:'B-L2', stallCode:'B-L2', stallType:'Premium',  x:15,   y:5,   width:6, height:3, area:18, basePrice:50000, finalPrice:50000, status:'booked',    exhibitorName:'Flex Industries Ltd' },
  { id: 32, hangarId: 2, stallNo:'B-L3', stallCode:'B-L3', stallType:'Premium',  x:15,   y:9,   width:6, height:3, area:18, basePrice:50000, finalPrice:50000, status:'available', exhibitorName:null }
];

// ── Hangar C (20m × 14m) ─────────────────────────────────────────────────────
// Premium grid: 3m × 3m, gapX=0.5m, gapY=0.5m, startX=1, startY=1
//   col x: 1, 4.5, 8, 11.5  (step = 3.5)
//   row y: 1, 4.5            (step = 3.5)
const hangarCStalls: Stall[] = [
  // Row 0
  { id: 33, hangarId: 3, stallNo:'C-01', stallCode:'C-01', stallType:'Premium',  x:1,    y:1,   width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'available', exhibitorName:null },
  { id: 34, hangarId: 3, stallNo:'C-02', stallCode:'C-02', stallType:'Premium',  x:4.5,  y:1,   width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'reserved',  exhibitorName:'Artisan Guild' },
  { id: 35, hangarId: 3, stallNo:'C-03', stallCode:'C-03', stallType:'Premium',  x:8,    y:1,   width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'booked',    exhibitorName:'Jewel Craft Exports' },
  { id: 36, hangarId: 3, stallNo:'C-04', stallCode:'C-04', stallType:'Premium',  x:11.5, y:1,   width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'available', exhibitorName:null },
  // Row 1
  { id: 37, hangarId: 3, stallNo:'C-05', stallCode:'C-05', stallType:'Premium',  x:1,    y:4.5, width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'available', exhibitorName:null },
  { id: 38, hangarId: 3, stallNo:'C-06', stallCode:'C-06', stallType:'Premium',  x:4.5,  y:4.5, width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'blocked',   exhibitorName:null },
  { id: 39, hangarId: 3, stallNo:'C-07', stallCode:'C-07', stallType:'Premium',  x:8,    y:4.5, width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'booked',    exhibitorName:'Sunrise Traders' },
  { id: 40, hangarId: 3, stallNo:'C-08', stallCode:'C-08', stallType:'Premium',  x:11.5, y:4.5, width:3, height:3, area:9,  basePrice:45000, finalPrice:45000, status:'available', exhibitorName:null },
  // VIP 4m × 4m
  { id: 41, hangarId: 3, stallNo:'C-V1', stallCode:'C-V1', stallType:'VIP',      x:16,   y:1,   width:4, height:4, area:16, basePrice:80000, finalPrice:80000, status:'booked',    exhibitorName:'Royal Decor House' },
  { id: 42, hangarId: 3, stallNo:'C-V2', stallCode:'C-V2', stallType:'VIP',      x:16,   y:6.5, width:4, height:4, area:16, basePrice:80000, finalPrice:80000, status:'available', exhibitorName:null }
];

export const MOCK_STALLS: Stall[] = [
  ...hangarAStalls,
  ...hangarBStalls,
  ...hangarCStalls
];

export function defaultLayout(): StallLayoutData {
  return {
    ground: structuredClone(MOCK_GROUND),
    hangars: structuredClone(MOCK_HANGARS),
    stalls: structuredClone(MOCK_STALLS),
    annotations: [],
  };
}
