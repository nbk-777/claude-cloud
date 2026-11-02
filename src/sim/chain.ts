// Derives the "live command chain" (thermostat → controller → actuators → TA1 → boiler →
// loops → floor → air → stop) for one zone from the simulation state.

import type { AppConfig, ZoneId } from '../model/types';
import { loopsOfZone, type SimState } from './engine';

export type ChainStatus = 'pending' | 'active' | 'done' | 'blocked';

export interface ChainStep {
  id: 'call' | 'zone' | 'actuators' | 'ta1' | 'boiler' | 'water' | 'stop';
  status: ChainStatus;
}

export function commandChain(s: SimState, cfg: AppConfig, z: ZoneId): ChainStep[] {
  const loops = loopsOfZone(cfg, z);
  const calling = s.rooms[z].calling;
  const zoneOn = s.controller.zoneOut[z];
  const acts = loops.map((id) => s.loops[id]?.act).filter(Boolean);
  const anyOpen = acts.some((a) => a!.pos >= 1);
  const anyMoving = acts.some((a) => a!.phase === 'opening' || a!.phase === 'closing');
  const anyFault = acts.some((a) => a!.phase === 'fault');
  const anyPos = acts.some((a) => a!.pos > 0);
  const flowing = loops.some((id) => s.loops[id]?.flowing);
  const b = s.boiler;
  const boilerRun = b.mode === 'heating' && (b.burnerOn || b.pumpOn);
  const stopping = !calling && (anyPos || b.mode === 'overrun');

  const st = (cond: boolean, active: boolean, blocked = false): ChainStatus =>
    blocked ? 'blocked' : cond ? 'done' : active ? 'active' : 'pending';

  if (stopping) {
    return [
      { id: 'call', status: 'done' },
      { id: 'zone', status: 'done' },
      { id: 'actuators', status: 'done' },
      { id: 'ta1', status: 'done' },
      { id: 'boiler', status: 'done' },
      { id: 'water', status: 'done' },
      { id: 'stop', status: 'active' },
    ];
  }
  const thermostatDisabled = !cfg.thermostats[z].enabled || s.faults.sensorLost[z];
  return [
    { id: 'call', status: thermostatDisabled ? 'blocked' : calling ? 'done' : 'active' },
    { id: 'zone', status: st(zoneOn, false) },
    {
      id: 'actuators',
      status: anyFault && !anyOpen ? 'blocked' : st(anyOpen, zoneOn && (anyMoving || !anyOpen)),
    },
    { id: 'ta1', status: st(s.controller.ta1Closed && zoneOn, zoneOn && !s.controller.ta1Closed) },
    {
      id: 'boiler',
      status: b.fault || b.deadHead ? 'blocked' : st(boilerRun && zoneOn, s.controller.ta1Closed && zoneOn),
    },
    {
      id: 'water',
      status: b.mode === 'dhw' && zoneOn ? 'blocked' : flowing ? 'active' : 'pending',
    },
    { id: 'stop', status: !calling && !zoneOn && s.rooms[z].airC >= cfg.thermostats[z].setpointC ? 'done' : 'pending' },
  ];
}

/** Index of the step that is currently "in progress" (for highlighting). */
export function currentStepIndex(chain: ChainStep[]): number {
  const i = chain.findIndex((c) => c.status === 'active' || c.status === 'blocked');
  return i;
}
