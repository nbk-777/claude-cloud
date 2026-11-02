import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/model/config';
import type { AppConfig, ZoneId } from '../src/model/types';
import { createInitialState, loopsOfZone, runFor } from '../src/sim/engine';
import {
  assembledExample,
  connect,
  disconnect,
  summarize,
  toOverrides,
  validateConnection,
  type Connection,
} from '../src/sim/connections';

function only(zones: ZoneId[]): AppConfig {
  const c = defaultConfig();
  for (const z of Object.keys(c.thermostats) as ZoneId[]) c.thermostats[z].enabled = zones.includes(z);
  return c;
}

describe('connection validation', () => {
  it('accepts compatible links in either order and orients them', () => {
    const r = validateConnection('manifold.supply', 'boiler.supply', []);
    expect(r.ok).toBe(true);
    expect(r.connection).toEqual({ from: 'boiler.supply', to: 'manifold.supply', type: 'water-supply' });
    expect(validateConnection('manifold.return', 'boiler.return', []).connection?.type).toBe('water-return');
  });
  it('rejects incompatible kinds', () => {
    expect(validateConnection('thermostat.living', 'manifold.supply', []).ok).toBe(false);
    expect(validateConnection('boiler.supply', 'boiler.demand', []).ok).toBe(false);
    expect(validateConnection('controller.out.living', 'controller.in.living', []).ok).toBe(false);
  });
  it('rejects supply↔return crossing', () => {
    const r = validateConnection('boiler.supply', 'boiler.return', []);
    expect(r.ok).toBe(false);
    expect(validateConnection('manifold.return', 'manifold.supply', []).ok).toBe(false);
  });
  it('rejects wrong zone', () => {
    const r = validateConnection('thermostat.living', 'controller.in.bath', []);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/არასწორი ზონა/);
  });
  it('rejects re-using a port', () => {
    const c: Connection[] = connect('boiler.supply', 'manifold.supply', []).connections;
    expect(validateConnection('boiler.supply', 'manifold.supply', c).ok).toBe(false);
  });
  it('never connects safety-critical infrastructure', () => {
    for (const p of ['gas', 'flue', 'pressure-relief', 'mains-power']) {
      const r = validateConnection(p, 'boiler.supply', []);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/პროფესიონალური მონტაჟი/);
    }
  });
  it('assembled example is complete; reset and disconnect work', () => {
    const c = assembledExample();
    expect(c).toHaveLength(11);
    expect(summarize(c).complete).toBe(true);
    expect(summarize([]).complete).toBe(false);
    const d = disconnect(c, 'controller.demand', 'boiler.demand');
    expect(summarize(d).demandLink).toBe(false);
  });
});

describe('connections drive the existing simulation', () => {
  it('assembled example behaves exactly like the normal system', () => {
    const cfg = only(['living']);
    const a = runFor(createInitialState(cfg), cfg, 1200);
    const b = runFor(createInitialState(cfg), cfg, 1200, toOverrides(assembledExample()));
    expect(b).toEqual(a);
  });
  it('disconnected thermostat signal cannot create heat demand', () => {
    const cfg = only(['living']);
    const c = disconnect(assembledExample(), 'thermostat.living', 'controller.in.living');
    const s = runFor(createInitialState(cfg), cfg, 900, toOverrides(c));
    expect(s.rooms.living.calling).toBe(true); // the thermostat itself still calls
    expect(s.controller.zoneOut.living).toBe(false);
    expect(s.controller.ta1Closed).toBe(false);
    expect(Object.values(s.loops).every((l) => !l.act.cmd && !l.flowing)).toBe(true);
  });
  it('missing actuator power keeps that zone closed', () => {
    const cfg = only(['child']);
    const c = disconnect(assembledExample(), 'controller.out.child', 'actuators.child');
    const s = runFor(createInitialState(cfg), cfg, 900, toOverrides(c));
    for (const id of loopsOfZone(cfg, 'child')) expect(s.loops[id].act.pos).toBe(0);
  });
  it('missing boiler-demand link prevents the boiler request', () => {
    const cfg = only(['living']);
    const c = disconnect(assembledExample(), 'controller.demand', 'boiler.demand');
    const s = runFor(createInitialState(cfg), cfg, 900, toOverrides(c));
    expect(s.controller.zoneOut.living).toBe(true);
    expect(s.controller.ta1Closed).toBe(false);
    expect(s.boiler.burnerOn).toBe(false);
    expect(s.boiler.mode).toBe('standby');
  });
  it('incomplete water path prevents flow and blocks the burner', () => {
    const cfg = only(['living']);
    const c = disconnect(assembledExample(), 'manifold.return', 'boiler.return');
    const s = runFor(createInitialState(cfg), cfg, 900, toOverrides(c));
    expect(s.controller.ta1Closed).toBe(true);
    expect(Object.values(s.loops).every((l) => !l.flowing)).toBe(true);
    expect(s.boiler.deadHead).toBe(true);
    expect(s.boiler.burnerOn).toBe(false);
  });
  it('demand stops → returns to standby', () => {
    const cfg = only(['living']);
    const ov = toOverrides(assembledExample());
    let s = runFor(createInitialState(cfg), cfg, 900, ov);
    expect(s.boiler.mode).toBe('heating');
    s = runFor(s, only([]), 600, ov);
    expect(s.boiler.mode).toBe('standby');
    expect(Object.values(s.loops).every((l) => l.act.pos === 0 && !l.flowing)).toBe(true);
  });
});
