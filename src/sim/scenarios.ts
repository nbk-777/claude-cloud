// Scenario presets. Each scenario derives a config + an initial simulation state from the
// user's current config (loop mapping, owners, manifold position are kept).

import { ZONES, type AppConfig, type ZoneId } from '../model/types';
import { createInitialState, loopsOfZone, runFor, type SimState } from './engine';

export const SCENARIO_IDS = [
  'livingOnly',
  'allFour',
  'oneReaches',
  'allStop',
  'sensorLost',
  'stuckActuator',
  'cloudOffline',
  'shower',
  'bathOnly',
  'floorTrip',
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioResult {
  cfg: AppConfig;
  state: SimState;
  focus: ZoneId;
}

const DEFAULT_SP: Record<ZoneId, number> = { living: 21, child: 21, main: 20, bath: 23 };

function withThermostats(cfg: AppConfig, enabled: ZoneId[], sp: Partial<Record<ZoneId, number>> = {}): AppConfig {
  const thermostats = { ...cfg.thermostats };
  for (const z of ZONES)
    thermostats[z] = { enabled: enabled.includes(z), setpointC: sp[z] ?? DEFAULT_SP[z] };
  return {
    ...cfg,
    thermostats,
    sim: { ...cfg.sim, chRange: 'low', chSetpointC: 35, floorSafetyInstalled: true, floorSafetyTripC: 55 },
  };
}

export function applyScenario(id: ScenarioId, base: AppConfig): ScenarioResult {
  switch (id) {
    case 'livingOnly': {
      const cfg = withThermostats(base, ['living']);
      return { cfg, state: createInitialState(cfg), focus: 'living' };
    }
    case 'allFour': {
      const cfg = withThermostats(base, [...ZONES]);
      return { cfg, state: createInitialState(cfg), focus: 'living' };
    }
    case 'oneReaches': {
      const cfg = withThermostats(base, [...ZONES]);
      const s = createInitialState(cfg);
      // child's room starts almost at target with a warm screed (demo initial condition)
      s.rooms.child.airC = 20.9;
      s.rooms.child.floorC = 24.5;
      return { cfg, state: s, focus: 'child' };
    }
    case 'allStop': {
      const on = withThermostats(base, [...ZONES]);
      let s = createInitialState(on);
      s = runFor(s, on, 45 * 60);
      const cfg = withThermostats(base, []);
      return { cfg, state: s, focus: 'living' };
    }
    case 'sensorLost': {
      const cfg = withThermostats(base, [...ZONES]);
      let s = createInitialState(cfg);
      s = runFor(s, cfg, 10 * 60);
      s.faults.sensorLost.main = true;
      return { cfg, state: s, focus: 'main' };
    }
    case 'stuckActuator': {
      const cfg = withThermostats(base, ['child']);
      const s = createInitialState(cfg);
      const childLoops = loopsOfZone(cfg, 'child');
      if (childLoops[0]) s.faults.stuck[childLoops[0]] = true;
      return { cfg, state: s, focus: 'child' };
    }
    case 'cloudOffline': {
      const cfg = withThermostats(base, [...ZONES]);
      const s = createInitialState(cfg);
      s.faults.cloudOffline = true;
      return { cfg, state: s, focus: 'living' };
    }
    case 'shower': {
      const cfg = withThermostats(base, [...ZONES]);
      let s = createInitialState(cfg);
      s = runFor(s, cfg, 30 * 60);
      s.dhw.showerOn = true;
      return { cfg, state: s, focus: 'bath' };
    }
    case 'bathOnly': {
      const cfg = withThermostats(base, ['bath'], { bath: 24 });
      return { cfg, state: createInitialState(cfg), focus: 'bath' };
    }
    case 'floorTrip': {
      const c0 = withThermostats(base, ['living']);
      const cfg: AppConfig = {
        ...c0,
        sim: { ...c0.sim, chRange: 'high', chSetpointC: 70, floorSafetyInstalled: true, floorSafetyTripC: 55 },
      };
      let s = createInitialState(cfg);
      // run until the safety thermostat opens (bounded), then a shower is requested
      for (let i = 0; i < 90 && !s.boiler.fault; i++) s = runFor(s, cfg, 60);
      s.dhw.showerOn = true;
      return { cfg, state: s, focus: 'living' };
    }
  }
}
