import type { RoomId } from '../model/types';

export const ROOM_COLOR: Record<RoomId, string> = {
  living: '#d9480f',
  child: '#0b8a7a',
  main: '#6741d9',
  bath: '#1971c2',
  hall: '#b08900',
  wardrobe: '#7c5a46',
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function mix(c1: [number, number, number], c2: [number, number, number], t: number) {
  const k = clamp01(t);
  return `rgb(${Math.round(lerp(c1[0], c2[0], k))},${Math.round(lerp(c1[1], c2[1], k))},${Math.round(lerp(c1[2], c2[2], k))})`;
}

/** Air temperature tint: cold blue (≤16 °C) → neutral (20.5 °C) → warm orange (≥25 °C). */
export function airTint(c: number): string {
  const cold: [number, number, number] = [176, 205, 240];
  const neutral: [number, number, number] = [246, 242, 233];
  const warm: [number, number, number] = [250, 196, 150];
  return c < 20.5 ? mix(cold, neutral, (c - 16) / 4.5) : mix(neutral, warm, (c - 20.5) / 4.5);
}

/** Water temperature colour for pipes: cool blue → hot red. */
export function waterColor(c: number): string {
  return mix([70, 130, 220], [220, 40, 30], (c - 18) / 25);
}

/** 0..1 floor warmth for the bloom overlay. */
export const floorGlow = (c: number) => clamp01((c - 19) / 9);

export const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');

export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const pts = (p: { x: number; y: number }[]) => p.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(' ');
