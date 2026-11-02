// Plan geometry traced from the supplied floor-plan image.
// Units: metres. Origin = inner top-left corner of the living room; x → right, y → down.
// Balconies have negative y. Dimensions that are printed on the plan are used directly;
// positions that had to be estimated from pixel proportions are listed in PLAN_ASSUMPTIONS.

import type { Point, RoomId, ZoneId } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomGeometry {
  id: RoomId;
  /** Floor area printed on the plan (m²). */
  planAreaM2: number;
  /** Axis-aligned rectangles whose union is the room's heated floor. */
  rects: Rect[];
  labelAt: Point;
}

export const rectArea = (r: Rect) => r.w * r.h;
export const roomDrawnArea = (g: RoomGeometry) => g.rects.reduce((s, r) => s + rectArea(r), 0);

export const ROOM_GEOMETRY: Record<RoomId, RoomGeometry> = {
  // 4.27 × 7.20 (printed) + 0.40 × 3.25 niche (printed) = 30.74 + 1.30 = 32.04 m² ✓
  living: {
    id: 'living',
    planAreaM2: 32.04,
    rects: [
      { x: 0, y: 0, w: 4.27, h: 7.2 },
      { x: 4.27, y: 0, w: 0.4, h: 3.25 },
    ],
    labelAt: { x: 2.1, y: 4.2 },
  },
  // 2.70 (printed) × 3.80 (derived: 10.26 / 2.70) = 10.26 m² ✓
  child: {
    id: 'child',
    planAreaM2: 10.26,
    rects: [{ x: 4.77, y: 0, w: 2.7, h: 3.8 }],
    labelAt: { x: 6.12, y: 1.25 },
  },
  // 3.14 × 5.10 (both printed) = 16.01 m² ✓
  main: {
    id: 'main',
    planAreaM2: 16.01,
    rects: [{ x: 7.6, y: 0, w: 3.14, h: 5.1 }],
    labelAt: { x: 9.17, y: 1.25 },
  },
  // 2.74 × 2.00 (both printed) = 5.48 m² ✓
  bath: {
    id: 'bath',
    planAreaM2: 5.48,
    rects: [{ x: 6.1, y: 5.2, w: 2.74, h: 2.0 }],
    labelAt: { x: 7.47, y: 6.05 },
  },
  // 1.70 × 2.00 (both printed) = 3.40 m² ✓
  wardrobe: {
    id: 'wardrobe',
    planAreaM2: 3.4,
    rects: [{ x: 9.04, y: 5.2, w: 1.7, h: 2.0 }],
    labelAt: { x: 9.89, y: 6.05 },
  },
  // Hall outline is irregular (hatched area). Approximated from the 3.20 / 1.30 / 1.20 / 0.40
  // dimensions; drawn area ≈ 7.2 m² vs. printed 7.11 m² (see PLAN_ASSUMPTIONS).
  hall: {
    id: 'hall',
    planAreaM2: 7.11,
    rects: [
      { x: 4.27, y: 3.9, w: 3.25, h: 1.2 },
      { x: 4.67, y: 5.1, w: 1.33, h: 2.1 },
      { x: 4.27, y: 5.85, w: 0.4, h: 1.35 },
    ],
    labelAt: { x: 5.2, y: 4.55 },
  },
};

export interface Opening {
  /** wall segment that is open (door / balcony door) */
  a: Point;
  b: Point;
  kind: 'door' | 'balcony-door' | 'entrance' | 'sliding';
}

export const OUTER_WALL = 0.25;

export const BALCONIES: { id: 'left' | 'right'; rect: Rect }[] = [
  { id: 'left', rect: { x: -0.3, y: -1.65, w: 5.05, h: 1.45 } },
  { id: 'right', rect: { x: 4.87, y: -1.65, w: 6.12, h: 1.45 } },
];

/** Interior wall centre-lines (thin walls) drawn on top of room fills. */
export const INTERIOR_WALLS: [Point, Point][] = [
  // living | hall / niche boundary (with 1.20 opening drawn as gap)
  [{ x: 4.27, y: 3.25 }, { x: 4.27, y: 3.95 }],
  [{ x: 4.27, y: 5.15 }, { x: 4.27, y: 7.2 }],
  // niche | child
  [{ x: 4.72, y: 0 }, { x: 4.72, y: 3.85 }],
  // niche bottom
  [{ x: 4.27, y: 3.27 }, { x: 4.72, y: 3.27 }],
  // child bottom (door gap 6.55-7.43)
  [{ x: 4.27, y: 3.85 }, { x: 6.55, y: 3.85 }],
  // child | main
  [{ x: 7.55, y: 0 }, { x: 7.55, y: 3.95 }],
  // main left lower stub (door gap 3.95-4.85)
  [{ x: 7.55, y: 4.85 }, { x: 7.55, y: 5.15 }],
  // bath / wardrobe top (bath door gap 6.12-7.0, wardrobe sliding gap 9.4-10.4)
  [{ x: 7.0, y: 5.15 }, { x: 9.4, y: 5.15 }],
  [{ x: 10.4, y: 5.15 }, { x: 10.74, y: 5.15 }],
  // hall | bath
  [{ x: 6.05, y: 5.15 }, { x: 6.05, y: 7.2 }],
  // bath | wardrobe (with small duct)
  [{ x: 8.94, y: 5.15 }, { x: 8.94, y: 7.2 }],
];

export const OPENINGS: Opening[] = [
  { a: { x: 0.65, y: 0 }, b: { x: 1.85, y: 0 }, kind: 'balcony-door' },
  { a: { x: 2.4, y: 0 }, b: { x: 4.0, y: 0 }, kind: 'balcony-door' },
  { a: { x: 5.0, y: 0 }, b: { x: 5.9, y: 0 }, kind: 'balcony-door' },
  { a: { x: 7.8, y: 0 }, b: { x: 9.6, y: 0 }, kind: 'balcony-door' },
  { a: { x: 4.27, y: 3.95 }, b: { x: 4.27, y: 5.15 }, kind: 'door' },
  { a: { x: 6.55, y: 3.85 }, b: { x: 7.43, y: 3.85 }, kind: 'door' },
  { a: { x: 7.55, y: 3.95 }, b: { x: 7.55, y: 4.83 }, kind: 'door' },
  { a: { x: 6.12, y: 5.15 }, b: { x: 7.0, y: 5.15 }, kind: 'door' },
  { a: { x: 9.4, y: 5.15 }, b: { x: 10.4, y: 5.15 }, kind: 'sliding' },
  { a: { x: 4.75, y: 7.2 }, b: { x: 5.65, y: 7.2 }, kind: 'entrance' },
];

/** Structural columns (tan blocks on the plan). */
export const COLUMNS: Rect[] = [
  { x: 4.27, y: 5.12, w: 0.42, h: 0.72 },
  { x: 4.3, y: -0.2, w: 0.65, h: 0.55 },
  { x: -0.45, y: 5.12, w: 0.45, h: 0.75 },
  { x: -0.45, y: -0.2, w: 0.45, h: 0.6 },
];

export const PLAN_BOUNDS: Rect = { x: -0.55, y: -1.85, w: 11.6, h: 9.35 };

/** Default positions of devices. All are ASSUMED (not shown on the plan). */
export const THERMOSTAT_POS: Record<ZoneId, Point> = {
  living: { x: 4.05, y: 2.3 },
  child: { x: 6.25, y: 3.62 },
  main: { x: 7.8, y: 3.55 },
  bath: { x: 6.3, y: 6.35 },
};

export const BOILER_CABINET: Rect = { x: 0.05, y: -1.58, w: 0.95, h: 1.25 };
export const BOILER_PORT: Point = { x: 0.52, y: -0.36 };
export const SHOWER_POS: Point = { x: 8.35, y: 6.75 };
export const DEFAULT_MANIFOLD_POS: Point = { x: 5.35, y: 4.08 };
export const CONTROLLER_OFFSET: Point = { x: 1.05, y: 0 };

export const PLAN_ASSUMPTIONS: string[] = [
  'plan.hallApprox',
  'plan.childHeight',
  'plan.devicePositions',
  'plan.routes',
  'plan.balcony',
];

/** Point-in-room hit test (used for loop-crossing visuals and tests). */
export function roomAt(p: Point): RoomId | null {
  for (const g of Object.values(ROOM_GEOMETRY)) {
    for (const r of g.rects) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return g.id;
    }
  }
  return null;
}

export function roomBBox(id: RoomId): Rect {
  const rs = ROOM_GEOMETRY[id].rects;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
