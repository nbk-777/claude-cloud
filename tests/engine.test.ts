import { describe, expect, it } from 'vitest';
import { defaultConfig, reassignLoop } from '../src/model/config';
import type { AppConfig, ZoneId } from '../src/model/types';
import {
  Clock,
  aggregateDemand,
  createInitialState,
  loopsOfZone,
  runFor,
  step,
  thermostatStatus,
} from '../src/sim/engine';
import { BOILER } from '../src/sim/params';
import { commandChain } from '../src/sim/chain';

function only(zones: ZoneId[], base: AppConfig = defaultConfig()): AppConfig {
  const c = structuredClone(base);
  for (const z of Object.keys(c.thermostats) as ZoneId[]) c.thermostats[z].enabled = zones.includes(z);
  return c;
}

describe('thermostat & zone control', () => {
  it('room demand drives only its own actuators', () => {
    const cfg = only(['child']);
    const s = runFor(createInitialState(cfg), cfg, 400);
    const childLoops = loopsOfZone(cfg, 'child');
    for (const l of cfg.loops) {
      const commanded = s.loops[l.id].act.cmd;
      expect(commanded).toBe(childLoops.includes(l.id));
    }
    expect(aggregateDemand(s)).toEqual(['child']);
  });

  it('hall & wardrobe loops follow the selected owner', () => {
    const cfg = only(['main']);
    cfg.owners = { hall: 'main', wardrobe: 'living' };
    const s = runFor(createInitialState(cfg), cfg, 10);
    const hall = cfg.loops.find((l) => l.room === 'hall')!.id;
    const wardrobe = cfg.loops.find((l) => l.room === 'wardrobe')!.id;
    expect(s.loops[hall].act.cmd).toBe(true);
    expect(s.loops[wardrobe].act.cmd).toBe(false);
  });

  it('unassigned loop is never commanded', () => {
    const cfg = only(['living']);
    cfg.loops = reassignLoop(cfg.loops, 'L01', null);
    const s = runFor(createInitialState(cfg), cfg, 600);
    expect(s.loops.L01.act.cmd).toBe(false);
    expect(s.loops.L01.flowing).toBe(false);
  });

  it('hysteresis: stops calling above setpoint + h/2 and status reflects it', () => {
    const cfg = only(['living']);
    let s = createInitialState(cfg);
    s = step(s, cfg);
    expect(s.rooms.living.calling).toBe(true);
    expect(thermostatStatus(s, cfg, 'living')).toBe('calling');
    s.rooms.living.airC = 21.1; // inside band → still calling
    s.rooms.living.lastSwitchS = -1000;
    s = step(s, cfg);
    expect(s.rooms.living.calling).toBe(true);
    s.rooms.living.airC = 21.3; // above sp + 0.2
    s = step(s, cfg);
    expect(s.rooms.living.calling).toBe(false);
    expect(thermostatStatus(s, cfg, 'living')).toBe('satisfied');
  });

  it('turning a thermostat OFF closes that room’s actuators after the delay while others keep running', () => {
    const cfg = only(['living', 'child']);
    let s = runFor(createInitialState(cfg), cfg, 900);
    const living = loopsOfZone(cfg, 'living');
    const child = loopsOfZone(cfg, 'child');
    expect(s.loops[child[0]].act.pos).toBe(1);
    const off = structuredClone(cfg);
    off.thermostats.child.enabled = false;
    s = runFor(s, off, cfg.sim.actuatorDelayS - 5);
    expect(s.loops[child[0]].act.phase).toBe('closing');
    expect(s.loops[child[0]].act.pos).toBe(1); // still in thermal dead time
    s = runFor(s, off, cfg.sim.actuatorTravelS + 10);
    expect(s.loops[child[0]].act.pos).toBe(0);
    expect(s.loops[child[0]].act.phase).toBe('closed');
    expect(s.loops[living[0]].act.phase).toBe('open');
  });
});

describe('actuators', () => {
  it('respects dead-time then linear travel', () => {
    const cfg = only(['bath']);
    const id = loopsOfZone(cfg, 'bath')[0];
    let s = runFor(createInitialState(cfg), cfg, cfg.sim.actuatorDelayS - 1);
    expect(s.loops[id].act.pos).toBe(0);
    expect(s.loops[id].act.phase).toBe('opening');
    s = runFor(s, cfg, cfg.sim.actuatorTravelS / 2 + 2);
    expect(s.loops[id].act.pos).toBeGreaterThan(0.45);
    expect(s.loops[id].act.pos).toBeLessThan(0.55);
    s = runFor(s, cfg, cfg.sim.actuatorTravelS);
    expect(s.loops[id].act.pos).toBe(1);
    expect(s.loops[id].act.phase).toBe('open');
  });

  it('stuck actuator: commanded open, no flow, fault phase', () => {
    const cfg = only(['child']);
    const [a, b] = loopsOfZone(cfg, 'child');
    let s = createInitialState(cfg);
    s.faults.stuck[a] = true;
    s = runFor(s, cfg, 900);
    expect(s.loops[a].act.cmd).toBe(true);
    expect(s.loops[a].act.phase).toBe('fault');
    expect(s.loops[a].flowing).toBe(false);
    expect(s.loops[a].heatW).toBe(0);
    expect(s.loops[b].flowing).toBe(true);
  });

  it('all loops of the only calling zone stuck → TA1 still closes (no feedback) → dead-head flagged, burner blocked', () => {
    const cfg = only(['bath']);
    const id = loopsOfZone(cfg, 'bath')[0];
    let s = createInitialState(cfg);
    s.faults.stuck[id] = true;
    s = runFor(s, cfg, 600);
    expect(s.controller.ta1Closed).toBe(true);
    expect(s.boiler.pumpOn).toBe(true);
    expect(s.boiler.deadHead).toBe(true);
    expect(s.boiler.burnerOn).toBe(false);
  });
});

describe('boiler', () => {
  it('TA1 (relay COM–NO) closes only after the DIP relay delay; boiler then fires', () => {
    const cfg = only(['living']);
    const d = cfg.sim.relayDelayS;
    let s = runFor(createInitialState(cfg), cfg, d - 5);
    expect(s.controller.ta1Closed).toBe(false);
    expect(s.boiler.burnerOn).toBe(false);
    s = runFor(s, cfg, 10);
    expect(s.controller.ta1Closed).toBe(true);
    // with default delays the first loop is fully open by the time the relay closes
    expect(s.loops[loopsOfZone(cfg, 'living')[0]].act.pos).toBe(1);
    expect(s.boiler.mode).toBe('heating');
    expect(s.boiler.burnerOn).toBe(true);
    expect(s.boiler.burnerKW).toBeGreaterThanOrEqual(BOILER.chMinKW);
    expect(s.boiler.burnerKW).toBeLessThanOrEqual(BOILER.chMaxKW_50_30);
  });

  it('low range clamps flow setpoint and water reaches loops only when open', () => {
    const cfg = only(['living']);
    cfg.sim.chSetpointC = 45;
    const s = runFor(createInitialState(cfg), cfg, 3600);
    expect(s.boiler.flowC).toBeLessThan(45 + 4);
    const living = loopsOfZone(cfg, 'living');
    for (const l of cfg.loops) expect(s.loops[l.id].flowing).toBe(living.includes(l.id));
  });

  it('anti-cycling: burner stays off for the anti-cycle time after a stop', () => {
    const cfg = only(['bath']);
    let s = createInitialState(cfg);
    let offAt = -1;
    for (let i = 0; i < 4 * 3600 && offAt < 0; i++) {
      const prev = s;
      s = step(s, cfg);
      if (prev.boiler.burnerOn && !s.boiler.burnerOn && s.boiler.mode === 'heating') offAt = s.t;
    }
    expect(offAt).toBeGreaterThan(0);
    for (let i = 0; i < BOILER.antiCycleS - 2; i++) {
      s = step(s, cfg);
      expect(s.boiler.burnerOn).toBe(false);
    }
  });

  it('low demand (bathroom only) → low-load and short-cycling flags', () => {
    const cfg = only(['bath']);
    cfg.thermostats.bath.setpointC = 24;
    const s = runFor(createInitialState(cfg), cfg, 2 * 3600);
    expect(s.boiler.burnerStarts).toBeGreaterThanOrEqual(4);
    expect(s.boiler.shortCycling).toBe(true);
  });

  it('pump overrun after demand ends, then standby', () => {
    const cfg = only(['living']);
    let s = runFor(createInitialState(cfg), cfg, 900);
    expect(s.boiler.mode).toBe('heating');
    const off = only([]);
    s = step(s, off);
    expect(s.controller.ta1Closed).toBe(false);
    expect(s.boiler.burnerOn).toBe(false);
    expect(s.boiler.mode).toBe('overrun');
    expect(s.boiler.pumpOn).toBe(true);
    s = runFor(s, off, BOILER.pumpOverrunS + 2);
    expect(s.boiler.mode).toBe('standby');
    expect(s.boiler.pumpOn).toBe(false);
  });

  it('DHW priority pauses floor feed and respects the 384/ΔT flow limit', () => {
    const cfg = only(['living']);
    let s = runFor(createInitialState(cfg), cfg, 1200);
    expect(Object.values(s.loops).some((l) => l.flowing)).toBe(true);
    s.dhw.showerOn = true;
    s = step(s, cfg);
    expect(s.boiler.mode).toBe('dhw');
    expect(s.boiler.diverter).toBe('DHW');
    expect(Object.values(s.loops).every((l) => !l.flowing)).toBe(true);
    // within limit: ΔT 35 → full flow ≈ 10.97 L/min; 8 L/min reaches setpoint
    expect(s.dhw.limited).toBe(false);
    expect(s.dhw.outC).toBeCloseTo(cfg.sim.dhwSetpointC, 5);
    const big = structuredClone(cfg);
    big.sim.showerFlowLpm = 16;
    s = step(s, big);
    expect(s.dhw.limited).toBe(true);
    expect(s.dhw.outC).toBeCloseTo(big.sim.coldWaterC + 384 / 16, 5);
    expect(s.dhw.kW).toBeLessThanOrEqual(BOILER.dhwMaxKW);
    s.dhw.showerOn = false;
    s = step(s, cfg);
    expect(s.boiler.mode).toBe('heating');
  });

  it('shower below minimum DHW flow does not trigger DHW', () => {
    const cfg = only([]);
    cfg.sim.showerFlowLpm = 1.5;
    let s = createInitialState(cfg);
    s.dhw.showerOn = true;
    s = step(s, cfg);
    expect(s.boiler.mode).toBe('standby');
  });

  it('floor-safety trip stops heating AND DHW (fault 116 style)', () => {
    const cfg = only(['living']);
    cfg.sim.chRange = 'high';
    cfg.sim.chSetpointC = 70;
    let s = createInitialState(cfg);
    for (let i = 0; i < 7200 && !s.boiler.fault; i++) s = step(s, cfg);
    expect(s.boiler.fault).toBe('116');
    s.dhw.showerOn = true;
    s = step(s, cfg);
    expect(s.boiler.mode).toBe('fault');
    expect(s.boiler.burnerOn).toBe(false);
    expect(s.dhw.kW).toBe(0);
    expect(s.dhw.outC).toBe(cfg.sim.coldWaterC);
  });

  it('sensor failure → sensor_lost status, demand dropped', () => {
    const cfg = only(['main']);
    let s = runFor(createInitialState(cfg), cfg, 60);
    expect(s.rooms.main.calling).toBe(true);
    s.faults.sensorLost.main = true;
    s = step(s, cfg);
    expect(thermostatStatus(s, cfg, 'main')).toBe('sensor_lost');
    expect(s.rooms.main.calling).toBe(false);
  });
});

describe('determinism & time', () => {
  it('same inputs → identical state', () => {
    const cfg = defaultConfig();
    const a = runFor(createInitialState(cfg), cfg, 3000);
    const b = runFor(createInitialState(cfg), cfg, 3000);
    expect(a).toEqual(b);
  });
  it('clock: speed scales steps; pause yields none; equal sim time → equal state', () => {
    const c1 = new Clock(1);
    const c60 = new Clock(60);
    let n1 = 0;
    for (let i = 0; i < 60; i++) n1 += c1.tick(1000);
    const n60 = c60.tick(1000);
    expect(n1).toBe(60);
    expect(n60).toBe(60);
    c60.paused = true;
    expect(c60.tick(1000)).toBe(0);
  });
  it('step does not mutate input', () => {
    const cfg = defaultConfig();
    const s0 = createInitialState(cfg);
    const copy = structuredClone(s0);
    step(s0, cfg);
    expect(s0).toEqual(copy);
  });
  it('floors warm before air and keep heat after stop (thermal mass)', () => {
    const cfg = only(['living']);
    let s = runFor(createInitialState(cfg), cfg, 3600);
    expect(s.rooms.living.floorC).toBeGreaterThan(s.rooms.living.airC);
    const floorAtStop = s.rooms.living.floorC;
    s = runFor(s, only([]), 1800);
    expect(s.rooms.living.floorC).toBeGreaterThan(s.rooms.living.airC);
    expect(s.rooms.living.floorC).toBeLessThan(floorAtStop);
  });
  it('command chain reports progressing steps', () => {
    const cfg = only(['living']);
    let s = runFor(createInitialState(cfg), cfg, 30);
    let ch = commandChain(s, cfg, 'living');
    expect(ch[0].status).toBe('done');
    expect(ch[2].status).toBe('active');
    s = runFor(s, cfg, 600);
    ch = commandChain(s, cfg, 'living');
    expect(ch.find((c) => c.id === 'water')!.status).toBe('active');
  });
});
