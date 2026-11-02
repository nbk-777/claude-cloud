// Default configuration, validation, loop re-assignment and versioned persistence.

import { DEFAULT_MANIFOLD_POS } from './plan';
import {
  FOLLOWER_ROOMS,
  LOOP_COUNT,
  LOOP_IDS,
  ROOMS,
  ZONES,
  isRoom,
  isZone,
  type AppConfig,
  type LoopAssignment,
  type RoomId,
} from './types';

export const STORAGE_KEY = 'ufh-twin/config';
export const CONFIG_VERSION = 1 as const;

/**
 * Default (demo) allocation, roughly area-proportional (≈5.3 m² per loop):
 * Living 6, Main bedroom 3, Child 2, Bathroom 1, Hall 1, Wardrobe 1 = 14.
 */
export const DEFAULT_ALLOCATION: Record<RoomId, number> = {
  living: 6,
  main: 3,
  child: 2,
  bath: 1,
  hall: 1,
  wardrobe: 1,
};

/**
 * Alternative allocation from the user's second brief (living 5–6, large bedroom 3–4,
 * bathroom 2, child 2, wardrobe; hall not mentioned): 6/3/2/2/0/1 = 14.
 */
export const ALT_ALLOCATION: Record<RoomId, number> = {
  living: 6,
  main: 3,
  child: 2,
  bath: 2,
  hall: 0,
  wardrobe: 1,
};

export function defaultLoops(alloc: Record<RoomId, number> = DEFAULT_ALLOCATION): LoopAssignment[] {
  const order: RoomId[] = ['living', 'child', 'main', 'bath', 'hall', 'wardrobe'];
  const out: LoopAssignment[] = [];
  let i = 0;
  for (const room of order) {
    for (let k = 0; k < alloc[room]; k++) {
      out.push({ id: LOOP_IDS[i++], room, crossesInto: null, note: '' });
    }
  }
  return out;
}

export const DEFAULT_ROOM_NAMES: Record<RoomId, string> = {
  living: 'მისაღები',
  child: 'საბავშვო საძინებელი',
  main: 'მთავარი საძინებელი',
  bath: 'სააბაზანო',
  hall: 'ჰოლი',
  wardrobe: 'გარდერობი',
};

export function defaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    roomNames: { ...DEFAULT_ROOM_NAMES },
    thermostats: {
      living: { enabled: true, setpointC: 21 },
      child: { enabled: true, setpointC: 21 },
      main: { enabled: true, setpointC: 20 },
      bath: { enabled: true, setpointC: 23 },
    },
    loops: defaultLoops(),
    mappingVerified: false,
    owners: { hall: 'living', wardrobe: 'living' },
    manifoldPos: { ...DEFAULT_MANIFOLD_POS },
    display: {
      hydraulic: true,
      wiring: false,
      labels: true,
      optionalLayer: false,
      floorCutaway: true,
      floorFinishOpacity: 0.25,
      boilerCutaway: true,
    },
    sim: {
      speed: 30,
      outdoorC: 0,
      coldWaterC: 10,
      chRange: 'low',
      chSetpointC: 35,
      dhwSetpointC: 45,
      showerFlowLpm: 8,
      // user: actuator "opens in about 3–5 min" → 90 s dead time + 150 s travel = 4 min (assumption)
      actuatorDelayS: 90,
      actuatorTravelS: 150,
      // DIP options per user brief: 0 / 2 / 5 min. Default 5 min (> ≈4 min actuator opening).
      relayDelayS: 300,
      pumpOutputEnabled: false,
      hysteresisK: 0.4,
      floorSafetyInstalled: true,
      floorSafetyTripC: 55,
    },
  };
}

// ---------------------------------------------------------------- validation

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

export function validateLoops(loops: unknown): string[] {
  const errs: string[] = [];
  if (!Array.isArray(loops)) return ['loops: must be an array'];
  if (loops.length !== LOOP_COUNT) errs.push(`loops: expected exactly ${LOOP_COUNT}, got ${loops.length}`);
  const seen = new Set<string>();
  for (const l of loops) {
    if (!isObj(l)) {
      errs.push('loops: entry is not an object');
      continue;
    }
    const id = l.id;
    if (typeof id !== 'string' || !LOOP_IDS.includes(id)) errs.push(`loops: invalid id ${String(id)}`);
    else if (seen.has(id)) errs.push(`loops: duplicate id ${id} (a loop can belong to only one room)`);
    else seen.add(id);
    if (!(l.room === null || (typeof l.room === 'string' && isRoom(l.room)))) errs.push(`loops: ${String(id)} has invalid room`);
    if (!(l.crossesInto === null || (typeof l.crossesInto === 'string' && isRoom(l.crossesInto))))
      errs.push(`loops: ${String(id)} has invalid crossesInto`);
    if (l.crossesInto !== null && l.crossesInto === l.room) errs.push(`loops: ${String(id)} crossesInto equals its own room`);
    if (typeof l.note !== 'string') errs.push(`loops: ${String(id)} note must be a string`);
  }
  for (const id of LOOP_IDS) if (!seen.has(id) && errs.length === 0) errs.push(`loops: missing ${id}`);
  return errs;
}

export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['root: not an object'] };
  if (raw.version !== CONFIG_VERSION) errors.push(`version: expected ${CONFIG_VERSION}`);
  // room names
  if (!isObj(raw.roomNames)) errors.push('roomNames: missing');
  else
    for (const r of ROOMS) {
      const n = raw.roomNames[r];
      if (typeof n !== 'string' || n.trim().length === 0 || n.length > 60) errors.push(`roomNames.${r}: invalid`);
    }
  // thermostats
  if (!isObj(raw.thermostats)) errors.push('thermostats: missing');
  else
    for (const z of ZONES) {
      const t = raw.thermostats[z];
      if (!isObj(t) || !isBool(t.enabled) || !isNum(t.setpointC) || t.setpointC < 5 || t.setpointC > 30)
        errors.push(`thermostats.${z}: invalid (setpoint 5–30 °C)`);
    }
  errors.push(...validateLoops(raw.loops));
  if (!isBool(raw.mappingVerified)) errors.push('mappingVerified: must be boolean');
  if (!isObj(raw.owners)) errors.push('owners: missing');
  else
    for (const f of FOLLOWER_ROOMS) {
      const o = raw.owners[f];
      if (typeof o !== 'string' || !isZone(o)) errors.push(`owners.${f}: must be one of ${ZONES.join(',')}`);
    }
  if (!isObj(raw.manifoldPos) || !isNum(raw.manifoldPos.x) || !isNum(raw.manifoldPos.y)) errors.push('manifoldPos: invalid');
  if (!isObj(raw.display)) errors.push('display: missing');
  else {
    for (const k of ['hydraulic', 'wiring', 'labels', 'optionalLayer', 'floorCutaway', 'boilerCutaway'])
      if (!isBool(raw.display[k])) errors.push(`display.${k}: must be boolean`);
    const op = raw.display.floorFinishOpacity;
    if (!isNum(op) || op < 0 || op > 1) errors.push('display.floorFinishOpacity: 0..1');
  }
  if (!isObj(raw.sim)) errors.push('sim: missing');
  else {
    const s = raw.sim;
    const range = (k: string, lo: number, hi: number) => {
      if (!isNum(s[k]) || (s[k] as number) < lo || (s[k] as number) > hi) errors.push(`sim.${k}: ${lo}..${hi}`);
    };
    range('speed', 1, 60);
    range('outdoorC', -20, 20);
    range('coldWaterC', 2, 25);
    range('dhwSetpointC', 36, 60);
    range('showerFlowLpm', 0, 20);
    range('actuatorDelayS', 0, 600);
    range('actuatorTravelS', 10, 600);
    range('hysteresisK', 0.1, 2);
    range('relayDelayS', 0, 900);
    if (!isBool(s.pumpOutputEnabled)) errors.push('sim.pumpOutputEnabled: boolean');
    range('floorSafetyTripC', 35, 70);
    if (s.chRange !== 'low' && s.chRange !== 'high') errors.push('sim.chRange: low|high');
    else range('chSetpointC', s.chRange === 'low' ? 20 : 35, s.chRange === 'low' ? 45 : 82);
    if (!isBool(s.floorSafetyInstalled)) errors.push('sim.floorSafetyInstalled: boolean');
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------- loop editing

/** Reassign a loop to another room (or unassign). Inventory (14 unique ids) is preserved. */
export function reassignLoop(loops: LoopAssignment[], id: string, room: RoomId | null): LoopAssignment[] {
  if (!loops.some((l) => l.id === id)) throw new Error(`unknown loop ${id}`);
  return loops.map((l) =>
    l.id === id ? { ...l, room, crossesInto: l.crossesInto === room ? null : l.crossesInto } : { ...l },
  );
}

export function setLoopCrossing(loops: LoopAssignment[], id: string, crossesInto: RoomId | null): LoopAssignment[] {
  return loops.map((l) => (l.id === id ? { ...l, crossesInto: crossesInto === l.room ? null : crossesInto } : { ...l }));
}

/** "Clear assumed mapping": every loop becomes unassigned, verified flag is cleared. */
export function clearMapping(cfg: AppConfig): AppConfig {
  return {
    ...cfg,
    loops: cfg.loops.map((l) => ({ ...l, room: null, crossesInto: null })),
    mappingVerified: false,
  };
}

export function loopCountByRoom(loops: LoopAssignment[]): Record<RoomId, number> & { unassigned: number } {
  const res = { living: 0, child: 0, main: 0, bath: 0, hall: 0, wardrobe: 0, unassigned: 0 };
  for (const l of loops) {
    if (l.room) res[l.room] += 1;
    else res.unassigned += 1;
  }
  return res;
}

// ---------------------------------------------------------------- persistence

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function saveConfig(cfg: AppConfig, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* storage full / blocked — prototype keeps running in memory */
  }
}

export function loadConfig(storage: StorageLike | undefined = safeStorage()): AppConfig {
  if (!storage) return defaultConfig();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed: unknown = JSON.parse(raw);
    const v = validateConfig(parsed);
    return v.ok ? (parsed as AppConfig) : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export function exportConfig(cfg: AppConfig): string {
  return JSON.stringify(cfg, null, 2);
}

/**
 * Validated import. On any error the CURRENT config is returned unchanged together with the
 * error list — invalid input never overwrites existing data.
 */
export function importConfig(text: string, current: AppConfig): { config: AppConfig; ok: boolean; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { config: current, ok: false, errors: [`JSON: ${(e as Error).message}`] };
  }
  const v = validateConfig(parsed);
  if (!v.ok) return { config: current, ok: false, errors: v.errors };
  return { config: parsed as AppConfig, ok: true, errors: [] };
}

function safeStorage(): StorageLike | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* blocked */
  }
  return undefined;
}
