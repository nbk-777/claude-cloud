// Generates an illustrative pipe layout for each loop: the room's floor is split into
// equal-area regions (one per loop assigned to that room) and a serpentine is drawn in each.
// Real pipe layout under the screed is UNKNOWN — this is a visual model only.

import { ROOM_GEOMETRY, rectArea, type Rect } from './plan';
import type { LoopAssignment, Point, RoomId } from './types';

/**
 * Split a sequence of rectangles into n parts of equal area. Each rect is consumed along its
 * longer axis, in order, so the result is deterministic.
 */
export function sliceRects(rects: Rect[], n: number): Rect[][] {
  if (n <= 0) return [];
  const total = rects.reduce((s, r) => s + rectArea(r), 0);
  const target = total / n;
  const out: Rect[][] = Array.from({ length: n }, () => []);
  let part = 0;
  let need = target;
  for (const r of rects) {
    const horizontal = r.w >= r.h; // slice along x when wide
    const len = horizontal ? r.w : r.h;
    const cross = horizontal ? r.h : r.w;
    let pos = 0;
    while (pos < len - 1e-9) {
      const avail = (len - pos) * cross;
      const takeArea = Math.min(avail, need);
      const takeLen = takeArea / cross;
      const piece: Rect = horizontal
        ? { x: r.x + pos, y: r.y, w: takeLen, h: r.h }
        : { x: r.x, y: r.y + pos, w: r.w, h: takeLen };
      if (takeLen > 1e-6) out[Math.min(part, n - 1)].push(piece);
      pos += takeLen;
      need -= takeArea;
      if (need <= 1e-9) {
        part += 1;
        need = target;
      }
    }
  }
  return out;
}

/** Serpentine polyline inside a rect (runs parallel to the longer side). */
export function serpentine(r: Rect, spacing = 0.22, margin = 0.12): Point[] {
  const pts: Point[] = [];
  const x0 = r.x + margin;
  const y0 = r.y + margin;
  const x1 = r.x + r.w - margin;
  const y1 = r.y + r.h - margin;
  if (x1 <= x0 || y1 <= y0) return [{ x: r.x + r.w / 2, y: r.y + r.h / 2 }];
  const vertical = r.h >= r.w; // runs go along y
  const span = vertical ? x1 - x0 : y1 - y0;
  const runs = Math.max(1, Math.floor(span / spacing) + 1);
  const step = runs > 1 ? span / (runs - 1) : 0;
  for (let i = 0; i < runs; i++) {
    const c = (vertical ? x0 : y0) + i * step;
    const a = i % 2 === 0;
    if (vertical) {
      pts.push({ x: c, y: a ? y0 : y1 }, { x: c, y: a ? y1 : y0 });
    } else {
      pts.push({ x: a ? x0 : x1, y: c }, { x: a ? x1 : x0, y: c });
    }
  }
  return pts;
}

export interface LoopShape {
  id: string;
  room: RoomId;
  regions: Rect[];
  /** pipe polyline(s), one per region */
  paths: Point[][];
  /** entry point (closest to manifold) used to draw the lead-in from the manifold */
  entry: Point;
  areaM2: number;
  centre: Point;
}

export function polylineLength(pts: Point[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

export function loopsByRoom(loops: LoopAssignment[]): Record<RoomId, string[]> {
  const res = { living: [], child: [], main: [], bath: [], hall: [], wardrobe: [] } as Record<RoomId, string[]>;
  for (const l of loops) if (l.room) res[l.room].push(l.id);
  for (const k of Object.keys(res) as RoomId[]) res[k].sort();
  return res;
}

export function buildLoopShapes(loops: LoopAssignment[], manifold: Point): Record<string, LoopShape> {
  const grouped = loopsByRoom(loops);
  const out: Record<string, LoopShape> = {};
  for (const room of Object.keys(grouped) as RoomId[]) {
    const ids = grouped[room];
    if (ids.length === 0) continue;
    const parts = sliceRects(ROOM_GEOMETRY[room].rects, ids.length);
    ids.forEach((id, i) => {
      const regions = parts[i];
      const paths = regions.map((r) => serpentine(r));
      const allPts = paths.flat();
      let entry = allPts[0];
      let best = Infinity;
      for (const p of allPts) {
        const d = Math.hypot(p.x - manifold.x, p.y - manifold.y);
        if (d < best) {
          best = d;
          entry = p;
        }
      }
      const areaM2 = regions.reduce((s, r) => s + rectArea(r), 0);
      const cx = regions.reduce((s, r) => s + (r.x + r.w / 2) * rectArea(r), 0) / Math.max(areaM2, 1e-9);
      const cy = regions.reduce((s, r) => s + (r.y + r.h / 2) * rectArea(r), 0) / Math.max(areaM2, 1e-9);
      out[id] = { id, room, regions, paths, entry, areaM2, centre: { x: cx, y: cy } };
    });
  }
  return out;
}
