import { describe, expect, it } from 'vitest';
import {
  ALT_ALLOCATION,
  clearMapping,
  defaultConfig,
  defaultLoops,
  exportConfig,
  importConfig,
  loadConfig,
  loopCountByRoom,
  reassignLoop,
  saveConfig,
  validateConfig,
  validateLoops,
  STORAGE_KEY,
  type StorageLike,
} from '../src/model/config';
import { LOOP_COUNT, LOOP_IDS, ZONES, controlZoneOf } from '../src/model/types';
import { ROOM_GEOMETRY, roomDrawnArea } from '../src/model/plan';
import { buildLoopShapes, sliceRects } from '../src/model/loopGeometry';

function memStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('rooms & thermostats', () => {
  it('has exactly 4 thermostat rooms', () => {
    expect(ZONES).toEqual(['living', 'child', 'main', 'bath']);
    expect(Object.keys(defaultConfig().thermostats).sort()).toEqual([...ZONES].sort());
  });
  it('plan areas match printed areas (hall approximated within 3%)', () => {
    for (const g of Object.values(ROOM_GEOMETRY)) {
      const tol = g.id === 'hall' ? 0.03 : 0.005;
      expect(Math.abs(roomDrawnArea(g) - g.planAreaM2) / g.planAreaM2).toBeLessThan(tol);
    }
    const total = Object.values(ROOM_GEOMETRY).reduce((s, g) => s + g.planAreaM2, 0);
    expect(total).toBeCloseTo(74.3, 1);
  });
});

describe('loop inventory', () => {
  it('has exactly 14 unique loops', () => {
    const loops = defaultLoops();
    expect(loops).toHaveLength(LOOP_COUNT);
    expect(new Set(loops.map((l) => l.id)).size).toBe(14);
    expect(loops.map((l) => l.id)).toEqual(LOOP_IDS);
  });
  it('default allocation covers every loop exactly once, area-proportional', () => {
    const c = loopCountByRoom(defaultLoops());
    expect(c).toEqual({ living: 6, main: 3, child: 2, bath: 1, hall: 1, wardrobe: 1, unassigned: 0 });
  });
  it('a loop cannot belong to two rooms (duplicate ids rejected)', () => {
    const loops = defaultLoops();
    const dup = [...loops.slice(0, 13), { ...loops[0], room: 'bath' as const }];
    expect(validateLoops(dup).join(' ')).toMatch(/duplicate/);
  });
  it('rejects 13 or 15 loops', () => {
    expect(validateLoops(defaultLoops().slice(0, 13)).length).toBeGreaterThan(0);
    expect(validateLoops([...defaultLoops(), { id: 'L15', room: null, crossesInto: null, note: '' }]).length).toBeGreaterThan(0);
  });
  it('reassignment and unassignment preserve inventory', () => {
    let loops = reassignLoop(defaultLoops(), 'L01', 'hall');
    loops = reassignLoop(loops, 'L02', null);
    expect(loops).toHaveLength(14);
    expect(validateLoops(loops)).toEqual([]);
    const c = loopCountByRoom(loops);
    expect(c.living).toBe(4);
    expect(c.hall).toBe(2);
    expect(c.unassigned).toBe(1);
  });
  it('alternative allocation (second brief) also totals 14 unique loops', () => {
    const loops = defaultLoops(ALT_ALLOCATION);
    expect(validateLoops(loops)).toEqual([]);
    expect(loopCountByRoom(loops)).toMatchObject({ bath: 2, hall: 0, unassigned: 0 });
  });
  it('clear mapping unassigns all loops but keeps 14', () => {
    const c = clearMapping({ ...defaultConfig(), mappingVerified: true });
    expect(c.loops).toHaveLength(14);
    expect(c.loops.every((l) => l.room === null)).toBe(true);
    expect(c.mappingVerified).toBe(false);
  });
  it('hall / wardrobe follow the selected owner zone', () => {
    expect(controlZoneOf('hall', { hall: 'living', wardrobe: 'main' })).toBe('living');
    expect(controlZoneOf('wardrobe', { hall: 'living', wardrobe: 'main' })).toBe('main');
    expect(controlZoneOf(null, { hall: 'living', wardrobe: 'main' })).toBeNull();
  });
  it('loop geometry splits each room into equal areas', () => {
    const parts = sliceRects(ROOM_GEOMETRY.living.rects, 6);
    const areas = parts.map((p) => p.reduce((s, r) => s + r.w * r.h, 0));
    for (const a of areas) expect(a).toBeCloseTo(roomDrawnArea(ROOM_GEOMETRY.living) / 6, 6);
    const shapes = buildLoopShapes(defaultLoops(), { x: 5, y: 4 });
    expect(Object.keys(shapes)).toHaveLength(14);
  });
});

describe('persistence', () => {
  it('default config validates', () => {
    expect(validateConfig(defaultConfig())).toEqual({ ok: true, errors: [] });
  });
  it('saves and loads versioned config', () => {
    const st = memStorage();
    const c = defaultConfig();
    c.thermostats.living.setpointC = 22.5;
    saveConfig(c, st);
    expect(JSON.parse(st.data[STORAGE_KEY]).version).toBe(1);
    expect(loadConfig(st).thermostats.living.setpointC).toBe(22.5);
  });
  it('corrupt storage falls back to defaults', () => {
    const st = memStorage();
    st.setItem(STORAGE_KEY, '{nope');
    expect(loadConfig(st)).toEqual(defaultConfig());
  });
  it('invalid import does not overwrite existing data', () => {
    const current = defaultConfig();
    current.thermostats.bath.setpointC = 24;
    const bad = JSON.parse(exportConfig(defaultConfig()));
    bad.loops = bad.loops.slice(0, 10);
    const r = importConfig(JSON.stringify(bad), current);
    expect(r.ok).toBe(false);
    expect(r.config).toBe(current);
    expect(r.config.thermostats.bath.setpointC).toBe(24);
    const r2 = importConfig('not json', current);
    expect(r2.ok).toBe(false);
    expect(r2.config).toBe(current);
  });
  it('valid import round-trips', () => {
    const c = defaultConfig();
    c.owners.wardrobe = 'main';
    const r = importConfig(exportConfig(c), defaultConfig());
    expect(r.ok).toBe(true);
    expect(r.config.owners.wardrobe).toBe('main');
  });
  it('rejects out-of-range CH setpoint for low range', () => {
    const c = defaultConfig();
    c.sim.chSetpointC = 60;
    expect(validateConfig(c).ok).toBe(false);
  });
});
