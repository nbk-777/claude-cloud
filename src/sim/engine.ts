// Deterministic, UI-independent simulation of the apartment's underfloor-heating system.
// Pure functions: step(state, config) → new state. Fixed sub-step SUB_STEP_S (1 s).
// No combustion, gas, pressure-drop or pump-curve physics — see docs/SIMULATION-MODEL.md.

import { ROOM_GEOMETRY } from '../model/plan';
import { loopsByRoom } from '../model/loopGeometry';
import {
  ROOMS,
  ZONES,
  controlZoneOf,
  type AppConfig,
  type RoomId,
  type ZoneId,
} from '../model/types';
import { BOILER, DEMO, SUB_STEP_S, WATER_J_PER_LK } from './params';

export type ActPhase = 'closed' | 'opening' | 'open' | 'closing' | 'fault';
export type BoilerMode = 'standby' | 'heating' | 'dhw' | 'overrun' | 'fault';
export type ThermostatStatus = 'off' | 'idle' | 'calling' | 'satisfied' | 'sensor_lost';

export interface RoomState {
  airC: number;
  floorC: number;
  /** thermostat demand (zones only; followers mirror nothing here) */
  calling: boolean;
  lastSwitchS: number;
  /** instantaneous heat from water into this room's floor, W (illustrative) */
  heatW: number;
}

export interface ActuatorState {
  /** command from the zone controller (energised = true; NC actuator opens when energised) */
  cmd: boolean;
  /** seconds since last command change (thermal dead-time of the wax element) */
  deadS: number;
  /** simulated valve position 0..1 (real systems usually have NO such feedback) */
  pos: number;
  phase: ActPhase;
}

export interface LoopState {
  act: ActuatorState;
  flowing: boolean;
  flowLpm: number;
  heatW: number;
  returnC: number;
}

export interface BoilerState {
  mode: BoilerMode;
  burnerOn: boolean;
  burnerKW: number;
  pumpOn: boolean;
  diverter: 'CH' | 'DHW';
  flowC: number;
  returnC: number;
  antiCycleS: number;
  overrunS: number;
  burnerStarts: number;
  startTimes: number[];
  fault: null | '116';
  faultCount: number;
  /** load on the CH circuit lower than minimum modulation */
  lowLoad: boolean;
  shortCycling: boolean;
  /** pump running while no loop can pass water */
  deadHead: boolean;
  flameSeenS: number;
}

export interface ControllerState {
  zoneOut: Record<ZoneId, boolean>;
  zoneOnS: Record<ZoneId, number>;
  ta1Closed: boolean;
}

export interface DhwState {
  showerOn: boolean;
  flowLpm: number;
  outC: number;
  limited: boolean;
  kW: number;
  flowSwitch: boolean;
}

export interface Faults {
  sensorLost: Record<ZoneId, boolean>;
  stuck: Record<string, boolean>;
  cloudOffline: boolean;
}

export interface Sample {
  t: number;
  air: Record<RoomId, number>;
  floor: Record<RoomId, number>;
  sp: Record<ZoneId, number>;
  flowC: number;
  burnerKW: number;
}

export interface SimEvent {
  t: number;
  key: string;
  arg?: string;
}

export interface SimState {
  t: number;
  rooms: Record<RoomId, RoomState>;
  loops: Record<string, LoopState>;
  boiler: BoilerState;
  controller: ControllerState;
  dhw: DhwState;
  faults: Faults;
  history: Sample[];
  events: SimEvent[];
}

const zoneRecord = <T,>(f: (z: ZoneId) => T) =>
  Object.fromEntries(ZONES.map((z) => [z, f(z)])) as Record<ZoneId, T>;
const roomRecord = <T,>(f: (r: RoomId) => T) =>
  Object.fromEntries(ROOMS.map((r) => [r, f(r)])) as Record<RoomId, T>;

export function createInitialState(cfg: AppConfig): SimState {
  const loops: Record<string, LoopState> = {};
  for (const l of cfg.loops) {
    loops[l.id] = {
      act: { cmd: false, deadS: 1e6, pos: 0, phase: 'closed' },
      flowing: false,
      flowLpm: 0,
      heatW: 0,
      returnC: DEMO.initialFloorC,
    };
  }
  const s: SimState = {
    t: 0,
    rooms: roomRecord(() => ({
      airC: DEMO.initialAirC,
      floorC: DEMO.initialFloorC,
      calling: false,
      lastSwitchS: -1e9,
      heatW: 0,
    })),
    loops,
    boiler: {
      mode: 'standby',
      burnerOn: false,
      burnerKW: 0,
      pumpOn: false,
      diverter: 'CH',
      flowC: 20,
      returnC: 20,
      antiCycleS: 0,
      overrunS: 0,
      burnerStarts: 0,
      startTimes: [],
      fault: null,
      faultCount: 0,
      lowLoad: false,
      shortCycling: false,
      deadHead: false,
      flameSeenS: 0,
    },
    controller: { zoneOut: zoneRecord(() => false), zoneOnS: zoneRecord(() => 0), ta1Closed: false },
    dhw: { showerOn: false, flowLpm: 0, outC: cfg.sim.coldWaterC, limited: false, kW: 0, flowSwitch: false },
    faults: { sensorLost: zoneRecord(() => false), stuck: {}, cloudOffline: false },
    history: [],
    events: [],
  };
  s.history.push(sample(s, cfg));
  return s;
}

function sample(s: SimState, cfg: AppConfig): Sample {
  return {
    t: s.t,
    air: roomRecord((r) => s.rooms[r].airC),
    floor: roomRecord((r) => s.rooms[r].floorC),
    sp: zoneRecord((z) => cfg.thermostats[z].setpointC),
    flowC: s.boiler.flowC,
    burnerKW: s.boiler.burnerKW,
  };
}

function log(s: SimState, key: string, arg?: string) {
  s.events = [...s.events, { t: s.t, key, arg }].slice(-80);
}

export function thermostatStatus(s: SimState, cfg: AppConfig, z: ZoneId): ThermostatStatus {
  if (!cfg.thermostats[z].enabled) return 'off';
  if (s.faults.sensorLost[z]) return 'sensor_lost';
  if (s.rooms[z].calling) return 'calling';
  if (s.rooms[z].airC >= cfg.thermostats[z].setpointC) return 'satisfied';
  return 'idle';
}

/** Ensure loop states exist for every configured loop (after a re-mapping). */
export function syncLoops(s: SimState, cfg: AppConfig): SimState {
  const missing = cfg.loops.filter((l) => !s.loops[l.id]);
  if (missing.length === 0) return s;
  const n = structuredClone(s);
  for (const l of missing)
    n.loops[l.id] = { act: { cmd: false, deadS: 1e6, pos: 0, phase: 'closed' }, flowing: false, flowLpm: 0, heatW: 0, returnC: 20 };
  return n;
}

export function chLimits(cfg: AppConfig): readonly [number, number] {
  return cfg.sim.chRange === 'low' ? BOILER.lowRange : BOILER.highRange;
}

/** One fixed sub-step. Returns a NEW state; the input is not mutated. */
export function step(prev: SimState, cfg: AppConfig, dt: number = SUB_STEP_S): SimState {
  // Clone everything except the append-only arrays (copy-on-write below) for speed.
  const { history, events, ...rest } = prev;
  const s: SimState = { ...structuredClone(rest), history, events };
  s.t += dt;
  const sim = cfg.sim;

  // 1 ── thermostats (hysteresis + minimum on/off) ─────────────────────────
  for (const z of ZONES) {
    const room = s.rooms[z];
    const th = cfg.thermostats[z];
    const h = sim.hysteresisK / 2;
    const since = s.t - room.lastSwitchS;
    let next = room.calling;
    if (!th.enabled || s.faults.sensorLost[z]) next = false; // simulation-only policy: lost sensor → no demand
    else if (room.calling) {
      if (room.airC >= th.setpointC + h && since >= DEMO.thermostatMinOnS) next = false;
    } else if (room.airC <= th.setpointC - h && since >= DEMO.thermostatMinOffS) next = true;
    if (next !== room.calling) {
      room.calling = next;
      room.lastSwitchS = s.t;
      log(s, next ? 'ev.call' : 'ev.satisfied', z);
    }
  }

  // 2 ── zone controller ───────────────────────────────────────────────────
  // Boiler relay (COM–NO → TA1) closes after the wiring-centre DIP delay.
  const boilerCallDelay = sim.relayDelayS;
  for (const z of ZONES) {
    const out = s.rooms[z].calling;
    if (out !== s.controller.zoneOut[z]) log(s, out ? 'ev.zoneOn' : 'ev.zoneOff', z);
    s.controller.zoneOut[z] = out;
    s.controller.zoneOnS[z] = out ? s.controller.zoneOnS[z] + dt : 0;
  }
  // No end-switch feedback is modelled: the relay closes on a timer only.
  const ta1 = ZONES.some((z) => s.controller.zoneOut[z] && s.controller.zoneOnS[z] >= boilerCallDelay);
  if (ta1 !== s.controller.ta1Closed) log(s, ta1 ? 'ev.ta1Close' : 'ev.ta1Open');
  s.controller.ta1Closed = ta1;

  // 3 ── actuators (NC, thermal dead-time + linear travel) ─────────────────
  for (const l of cfg.loops) {
    const ls = s.loops[l.id];
    if (!ls) continue;
    const zone = controlZoneOf(l.room, cfg.owners);
    const cmd = zone ? s.controller.zoneOut[zone] : false;
    const a = ls.act;
    if (cmd !== a.cmd) {
      a.cmd = cmd;
      a.deadS = 0;
    } else a.deadS += dt;
    const stuck = !!s.faults.stuck[l.id];
    if (a.deadS >= sim.actuatorDelayS) {
      if (cmd && !stuck) a.pos = Math.min(1, a.pos + dt / sim.actuatorTravelS);
      if (!cmd) a.pos = Math.max(0, a.pos - dt / sim.actuatorTravelS);
    }
    if (stuck && a.pos > 0 && cmd) a.pos = Math.max(0, a.pos - dt / sim.actuatorTravelS);
    a.phase =
      stuck && cmd && a.deadS >= sim.actuatorDelayS
        ? 'fault'
        : cmd
          ? a.pos >= 1
            ? 'open'
            : 'opening'
          : a.pos <= 0
            ? 'closed'
            : 'closing';
  }

  // 4 ── boiler state machine ──────────────────────────────────────────────
  const b = s.boiler;
  const [chMin, chMax] = chLimits(cfg);
  const chSet = Math.min(chMax, Math.max(chMin, sim.chSetpointC));
  const openFrac = cfg.loops.reduce((acc, l) => {
    const ls = s.loops[l.id];
    return acc + (ls && !s.faults.stuck[l.id] ? ls.act.pos : 0);
  }, 0);
  const anyPath = openFrac > 0.05;

  // DHW request (flow switch needs ≥ min flow, manual: 2 L/min)
  const dhwReq = s.dhw.showerOn && sim.showerFlowLpm >= BOILER.dhwMinFlowLpm;
  s.dhw.flowSwitch = dhwReq;

  // floor safety thermostat on the FLOOR/TA2 input (fault 116 style)
  if (sim.floorSafetyInstalled) {
    if (!b.fault && b.flowC > sim.floorSafetyTripC) {
      b.fault = '116';
      b.faultCount += 1;
      b.overrunS = BOILER.pumpOverrunS;
      log(s, 'ev.fault116');
    } else if (b.fault && b.flowC < sim.floorSafetyTripC - DEMO.floorSafetyResetK) {
      b.fault = null;
      log(s, 'ev.faultReset');
    }
  } else if (b.fault) b.fault = null;

  const wasBurner = b.burnerOn;
  const prevMode = b.mode;
  b.deadHead = false;
  b.lowLoad = false;

  if (b.fault) {
    // fault 116: stops BOTH heating and DHW (manual p.15). Pump behaviour in fault: demo assumption.
    b.mode = 'fault';
    b.burnerOn = false;
    b.diverter = 'CH';
    b.overrunS = Math.max(0, b.overrunS - dt);
    b.pumpOn = b.overrunS > 0;
  } else if (dhwReq) {
    // typical combi behaviour: DHW priority via the diverter valve (confirm in manual for the variant)
    b.mode = 'dhw';
    b.diverter = 'DHW';
    b.pumpOn = true;
    b.burnerOn = true;
    b.overrunS = 0;
  } else if (s.controller.ta1Closed) {
    b.mode = 'heating';
    b.diverter = 'CH';
    b.pumpOn = true;
    b.overrunS = BOILER.pumpOverrunS;
    b.deadHead = !anyPath;
    if (b.deadHead) {
      // Simulation policy: burner is not fired into a circuit without a flow path.
      b.burnerOn = false;
    } else if (b.burnerOn) {
      if (b.flowC > chSet + DEMO.burnerBandK) {
        b.burnerOn = false;
        b.antiCycleS = BOILER.antiCycleS;
      }
    } else if (b.antiCycleS <= 0 && b.flowC < chSet - DEMO.burnerBandK) {
      b.burnerOn = true;
    }
  } else {
    b.burnerOn = false;
    b.diverter = 'CH';
    if (prevMode === 'heating' || prevMode === 'overrun' || prevMode === 'dhw') {
      if (prevMode === 'dhw') b.overrunS = 0;
      b.overrunS = Math.max(0, b.overrunS - dt);
      b.mode = b.overrunS > 0 ? 'overrun' : 'standby';
      b.pumpOn = b.overrunS > 0;
      if (b.mode === 'overrun' && !anyPath) b.deadHead = true;
    } else {
      b.mode = 'standby';
      b.pumpOn = false;
    }
  }
  if (b.antiCycleS > 0) b.antiCycleS = Math.max(0, b.antiCycleS - dt);
  if (b.burnerOn && !wasBurner) {
    b.burnerStarts += 1;
    b.startTimes.push(s.t);
    log(s, 'ev.burnerOn');
  }
  if (!b.burnerOn && wasBurner) log(s, 'ev.burnerOff');
  if (b.mode !== prevMode) log(s, 'ev.mode', b.mode);
  b.startTimes = b.startTimes.filter((t) => s.t - t <= 3600);
  b.shortCycling = b.startTimes.length >= DEMO.shortCycleStartsPerHour;
  if (b.burnerOn) b.flameSeenS += dt;

  // 5 ── hydraulics & heat into floors ─────────────────────────────────────
  const byRoom = loopsByRoom(cfg.loops);
  const chFeed = b.pumpOn && b.diverter === 'CH';
  let loopHeatTotal = 0;
  let retWeighted = 0;
  let flowTotal = 0;
  for (const r of ROOMS) s.rooms[r].heatW = 0;
  for (const l of cfg.loops) {
    const ls = s.loops[l.id];
    if (!ls) continue;
    const stuck = !!s.faults.stuck[l.id];
    const pos = stuck ? 0 : ls.act.pos;
    ls.flowing = chFeed && !!l.room && pos > 0.02;
    if (!ls.flowing || !l.room) {
      ls.flowLpm = 0;
      ls.heatW = 0;
      ls.returnC = l.room ? s.rooms[l.room].floorC : ls.returnC;
      continue;
    }
    const area = ROOM_GEOMETRY[l.room].planAreaM2 / Math.max(1, byRoom[l.room].length);
    const ua = DEMO.waterToFloorWPerM2K * area;
    const mcp = ((DEMO.loopFlowLpm * pos) / 60) * WATER_J_PER_LK; // W/K
    const dT = b.flowC - s.rooms[l.room].floorC;
    const q = (ua * dT) / (1 + ua / (2 * mcp));
    ls.flowLpm = DEMO.loopFlowLpm * pos;
    ls.heatW = q;
    ls.returnC = b.flowC - q / mcp;
    s.rooms[l.room].heatW += q;
    loopHeatTotal += q;
    retWeighted += ls.returnC * ls.flowLpm;
    flowTotal += ls.flowLpm;
  }
  b.returnC = flowTotal > 0 ? retWeighted / flowTotal : b.flowC;

  // burner power (heating mode): modulate toward setpoint, clamp to [min, max]
  const chMaxKW = cfg.sim.chRange === 'low' ? BOILER.chMaxKW_50_30 : BOILER.chMaxKW_80_60;
  const cw = (DEMO.boilerWaterL + openFrac * DEMO.loopWaterL) * WATER_J_PER_LK;
  if (b.mode === 'heating' && b.burnerOn) {
    const needW = loopHeatTotal + (cw * (chSet - b.flowC)) / DEMO.modulationTauS;
    b.burnerKW = Math.min(chMaxKW, Math.max(BOILER.chMinKW, needW / 1000));
  } else if (b.mode === 'dhw') {
    const dT = Math.max(1, sim.dhwSetpointC - sim.coldWaterC);
    const fullFlow = BOILER.dhwFlowConstant / dT;
    const flow = sim.showerFlowLpm;
    s.dhw.flowLpm = flow;
    s.dhw.limited = flow > fullFlow;
    s.dhw.outC = s.dhw.limited ? sim.coldWaterC + BOILER.dhwFlowConstant / flow : sim.dhwSetpointC;
    s.dhw.kW = Math.min(BOILER.dhwMaxKW, Math.max(BOILER.dhwMinKW, (flow * (s.dhw.outC - sim.coldWaterC) * WATER_J_PER_LK) / 60 / 1000));
    b.burnerKW = s.dhw.kW;
  } else b.burnerKW = 0;
  if (b.mode !== 'dhw') {
    s.dhw.flowLpm = s.dhw.showerOn ? sim.showerFlowLpm : 0;
    s.dhw.kW = 0;
    s.dhw.limited = false;
    s.dhw.outC = sim.coldWaterC; // no hot water (boiler not in DHW mode, e.g. fault 116)
  }
  b.lowLoad = b.mode === 'heating' && !b.deadHead && loopHeatTotal < BOILER.chMinKW * 1000;

  // primary water node (only heated by the burner in CH mode)
  const burnerToCh = b.mode === 'heating' && b.burnerOn ? b.burnerKW * 1000 : 0;
  const cabinetC = sim.outdoorC + DEMO.cabinetOverOutdoorK;
  const lossW = DEMO.primaryLossWPerK * (b.flowC - cabinetC);
  b.flowC += ((burnerToCh - loopHeatTotal - lossW) * dt) / cw;

  // 6 ── room thermal nodes (floor/screed + air) ───────────────────────────
  for (const r of ROOMS) {
    const room = s.rooms[r];
    const a = ROOM_GEOMETRY[r].planAreaM2;
    const fa = DEMO.floorToAirWPerM2K * a * (room.floorC - room.airC);
    const loss = DEMO.lossWPerM2K * a * (room.airC - sim.outdoorC);
    room.floorC += ((room.heatW - fa) * dt) / (DEMO.floorCapJPerM2K * a);
    room.airC += ((fa - loss) * dt) / (DEMO.airCapJPerM2K * a);
  }

  // 7 ── history ────────────────────────────────────────────────────────────
  if (Math.floor(s.t / DEMO.historyEveryS) !== Math.floor(prev.t / DEMO.historyEveryS)) {
    s.history = [...s.history, sample(s, cfg)].slice(-DEMO.historyLen);
  }
  return s;
}

/** Advance by `seconds` using fixed sub-steps (deterministic regardless of frame rate). */
export function runFor(state: SimState, cfg: AppConfig, seconds: number): SimState {
  let s = state;
  const n = Math.round(seconds / SUB_STEP_S);
  for (let i = 0; i < n; i++) s = step(s, cfg, SUB_STEP_S);
  return s;
}

/** Real-time driver helper: converts wall-clock ms × speed into whole sub-steps. */
export class Clock {
  private acc = 0;
  paused = false;
  constructor(public speed = 1) {}
  /** returns number of sub-steps to run for `realMs` of wall time (capped) */
  tick(realMs: number, maxSteps = 240): number {
    if (this.paused) return 0;
    this.acc += (realMs / 1000) * this.speed;
    const n = Math.floor(this.acc / SUB_STEP_S);
    this.acc -= n * SUB_STEP_S;
    return Math.min(n, maxSteps);
  }
  reset() {
    this.acc = 0;
  }
}

// ── derived helpers used by UI and tests ─────────────────────────────────────

export function roomKW(s: SimState, r: RoomId): number {
  return s.rooms[r].heatW / 1000;
}

export function loopsOfZone(cfg: AppConfig, z: ZoneId): string[] {
  return cfg.loops.filter((l) => controlZoneOf(l.room, cfg.owners) === z).map((l) => l.id);
}

export function aggregateDemand(s: SimState): ZoneId[] {
  return ZONES.filter((z) => s.controller.zoneOut[z]);
}
