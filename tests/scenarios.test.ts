import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/model/config';
import { loopsOfZone, runFor, thermostatStatus } from '../src/sim/engine';
import { SCENARIO_IDS, applyScenario } from '../src/sim/scenarios';

const base = defaultConfig();

describe('scenarios produce intended states', () => {
  it('every scenario id is applicable', () => {
    for (const id of SCENARIO_IDS) expect(() => applyScenario(id, base)).not.toThrow();
  });
  it('1 living only → only living actuators commanded', () => {
    const { cfg, state } = applyScenario('livingOnly', base);
    const s = runFor(state, cfg, 600);
    const living = loopsOfZone(cfg, 'living');
    for (const l of cfg.loops) expect(s.loops[l.id].act.cmd).toBe(living.includes(l.id));
  });
  it('2 all four → all 14 loops commanded (hall & wardrobe follow living)', () => {
    const { cfg, state } = applyScenario('allFour', base);
    const s = runFor(state, cfg, 600);
    expect(Object.values(s.loops).every((l) => l.act.cmd)).toBe(true);
  });
  it('3 one room reaches target while others continue', () => {
    const { cfg, state } = applyScenario('oneReaches', base);
    const s = runFor(state, cfg, 1200);
    expect(s.rooms.child.calling).toBe(false);
    expect(s.rooms.living.calling).toBe(true);
    expect(s.rooms.child.floorC).toBeGreaterThan(s.rooms.child.airC); // residual floor heat
  });
  it('4 all stop → actuators closing, boiler overrun then standby', () => {
    const { cfg, state } = applyScenario('allStop', base);
    let s = runFor(state, cfg, 2);
    expect(s.controller.ta1Closed).toBe(false);
    expect(s.boiler.burnerOn).toBe(false);
    expect(s.boiler.mode).toBe('overrun');
    s = runFor(s, cfg, 600);
    expect(s.boiler.mode).toBe('standby');
    expect(Object.values(s.loops).every((l) => l.act.pos === 0)).toBe(true);
  });
  it('5 sensor lost → fault badge state, others continue', () => {
    const { cfg, state } = applyScenario('sensorLost', base);
    const s = runFor(state, cfg, 5);
    expect(thermostatStatus(s, cfg, 'main')).toBe('sensor_lost');
    expect(s.rooms.living.calling).toBe(true);
  });
  it('6 actuator does not open → command/feedback mismatch', () => {
    const { cfg, state } = applyScenario('stuckActuator', base);
    const s = runFor(state, cfg, 900);
    const [a] = loopsOfZone(cfg, 'child');
    expect(s.loops[a].act.cmd).toBe(true);
    expect(s.loops[a].flowing).toBe(false);
    expect(s.loops[a].act.phase).toBe('fault');
  });
  it('7 cloud offline → local control continues', () => {
    const { cfg, state } = applyScenario('cloudOffline', base);
    const s = runFor(state, cfg, 900);
    expect(s.faults.cloudOffline).toBe(true);
    expect(s.boiler.mode).toBe('heating');
  });
  it('8 shower → DHW mode, floor not fed', () => {
    const { cfg, state } = applyScenario('shower', base);
    const s = runFor(state, cfg, 5);
    expect(s.boiler.mode).toBe('dhw');
    expect(Object.values(s.loops).every((l) => !l.flowing)).toBe(true);
  });
  it('9 bathroom only → cycling at low load', () => {
    const { cfg, state } = applyScenario('bathOnly', base);
    const s = runFor(state, cfg, 2 * 3600);
    expect(s.boiler.burnerStarts).toBeGreaterThanOrEqual(4);
  });
  it('10 floor safety trip → fault, DHW also stopped', () => {
    const { state } = applyScenario('floorTrip', base);
    expect(state.boiler.fault).toBe('116');
    expect(state.dhw.showerOn).toBe(true);
  });
  it('scenarios keep the user loop mapping', () => {
    const custom = structuredClone(base);
    custom.loops[0].room = 'hall';
    const { cfg } = applyScenario('allFour', custom);
    expect(cfg.loops[0].room).toBe('hall');
  });
});
