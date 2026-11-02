// Conceptual "Connect components" model for the 3D Balcony page.
// Educational only: it decides which simulated paths exist (water, thermostat signal, actuator
// power, boiler demand) and turns them into ConnectionOverrides for the existing engine.
// Gas, flue, pressure-relief and mains wiring are NOT connectable here (context only).

import { ZONES, type ZoneId } from '../model/types';
import type { ConnectionOverrides } from './engine';

export type PortKind = 'water-out' | 'water-in' | 'signal-out' | 'signal-in' | 'power-out' | 'power-in' | 'demand-out' | 'demand-in';
export type LinkType = 'water-supply' | 'water-return' | 'signal' | 'actuator-power' | 'demand';

export interface Port {
  id: string;
  label: string;
  kind: PortKind;
  /** zone the port belongs to (thermostat, controller zone in/out, actuator group) */
  zone?: ZoneId;
  /** which water line the port belongs to */
  line?: 'supply' | 'return';
}

export interface Connection {
  from: string;
  to: string;
  type: LinkType;
}

const Z_LABEL: Record<ZoneId, string> = { living: 'Living Room', bath: 'Bathroom', child: "Child's Bedroom", main: 'Main Bedroom' };
export const ZONE_LABEL = Z_LABEL;

export const PORTS: Port[] = [
  { id: 'boiler.supply', label: 'Boiler — heating supply (out)', kind: 'water-out', line: 'supply' },
  { id: 'boiler.return', label: 'Boiler — heating return (in)', kind: 'water-in', line: 'return' },
  { id: 'manifold.supply', label: 'Manifold — supply bar (in)', kind: 'water-in', line: 'supply' },
  { id: 'manifold.return', label: 'Manifold — return bar (out)', kind: 'water-out', line: 'return' },
  ...ZONES.map((z): Port => ({ id: `thermostat.${z}`, label: `Thermostat — ${Z_LABEL[z]} (signal out)`, kind: 'signal-out', zone: z })),
  ...ZONES.map((z, i): Port => ({ id: `controller.in.${z}`, label: `Controller — zone ${i + 1} input (${Z_LABEL[z]})`, kind: 'signal-in', zone: z })),
  ...ZONES.map((z, i): Port => ({ id: `controller.out.${z}`, label: `Controller — zone ${i + 1} actuator output`, kind: 'power-out', zone: z })),
  ...ZONES.map((z): Port => ({ id: `actuators.${z}`, label: `Actuator group — ${Z_LABEL[z]}`, kind: 'power-in', zone: z })),
  { id: 'controller.demand', label: 'Controller — boiler demand output', kind: 'demand-out' },
  { id: 'boiler.demand', label: 'Boiler — demand input (room-thermostat input)', kind: 'demand-in' },
];

/** Context-only infrastructure. Shown in the scene, never connectable. */
export const CONTEXT_ONLY = ['gas', 'flue', 'pressure-relief', 'mains-power'] as const;

const PORT_BY_ID = new Map(PORTS.map((p) => [p.id, p]));
export const portById = (id: string) => PORT_BY_ID.get(id);

const PAIRS: Record<string, { to: PortKind; type: LinkType }> = {
  'water-out': { to: 'water-in', type: 'water-supply' },
  'signal-out': { to: 'signal-in', type: 'signal' },
  'power-out': { to: 'power-in', type: 'actuator-power' },
  'demand-out': { to: 'demand-in', type: 'demand' },
};

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  connection?: Connection;
}

/**
 * Validate a proposed link. Order of the two ports does not matter.
 * Rules: compatible kinds only; same water line; same zone for zone ports; each port used once;
 * context-only infrastructure is never connectable.
 */
export function validateConnection(a: string, b: string, existing: Connection[]): ValidationResult {
  if ((CONTEXT_ONLY as readonly string[]).some((c) => a.startsWith(c) || b.startsWith(c)))
    return { ok: false, reason: 'Gas, flue, pressure-relief and mains wiring are context only — professional installation required.' };
  const pa = portById(a);
  const pb = portById(b);
  if (!pa || !pb) return { ok: false, reason: 'Unknown port.' };
  if (a === b) return { ok: false, reason: 'A port cannot be connected to itself.' };
  // orient: from = output side
  let from = pa;
  let to = pb;
  if (!PAIRS[from.kind]) {
    from = pb;
    to = pa;
  }
  const rule = PAIRS[from.kind];
  if (!rule || rule.to !== to.kind) return { ok: false, reason: `Incompatible ports: ${pa.label} ↔ ${pb.label}.` };
  if (rule.type === 'water-supply' && from.line !== to.line)
    return { ok: false, reason: 'Incompatible ports: supply and return lines cannot be joined.' };
  if (from.zone && to.zone && from.zone !== to.zone)
    return { ok: false, reason: `Wrong zone: ${from.label} belongs to ${Z_LABEL[from.zone]}, not ${Z_LABEL[to.zone]}.` };
  if (existing.some((c) => c.from === from.id || c.to === from.id || c.from === to.id || c.to === to.id))
    return { ok: false, reason: 'One of these ports is already connected. Remove the existing link first.' };
  const type: LinkType = rule.type === 'water-supply' && from.line === 'return' ? 'water-return' : rule.type;
  return { ok: true, connection: { from: from.id, to: to.id, type } };
}

export function connect(a: string, b: string, existing: Connection[]): { connections: Connection[]; result: ValidationResult } {
  const result = validateConnection(a, b, existing);
  return { connections: result.ok && result.connection ? [...existing, result.connection] : existing, result };
}

export function disconnect(existing: Connection[], from: string, to: string): Connection[] {
  return existing.filter((c) => !(c.from === from && c.to === to));
}

/** The complete, valid conceptual assembly. */
export function assembledExample(): Connection[] {
  let c: Connection[] = [];
  const add = (a: string, b: string) => {
    c = connect(a, b, c).connections;
  };
  add('boiler.supply', 'manifold.supply');
  add('manifold.return', 'boiler.return');
  for (const z of ZONES) {
    add(`thermostat.${z}`, `controller.in.${z}`);
    add(`controller.out.${z}`, `actuators.${z}`);
  }
  add('controller.demand', 'boiler.demand');
  return c;
}

const has = (c: Connection[], from: string, to: string) => c.some((x) => x.from === from && x.to === to);

export interface ConnectionSummary {
  supply: boolean;
  ret: boolean;
  waterPath: boolean;
  signal: Record<ZoneId, boolean>;
  power: Record<ZoneId, boolean>;
  demandLink: boolean;
  complete: boolean;
}

export function summarize(c: Connection[]): ConnectionSummary {
  const supply = has(c, 'boiler.supply', 'manifold.supply');
  const ret = has(c, 'manifold.return', 'boiler.return');
  const signal = Object.fromEntries(ZONES.map((z) => [z, has(c, `thermostat.${z}`, `controller.in.${z}`)])) as Record<ZoneId, boolean>;
  const power = Object.fromEntries(ZONES.map((z) => [z, has(c, `controller.out.${z}`, `actuators.${z}`)])) as Record<ZoneId, boolean>;
  const demandLink = has(c, 'controller.demand', 'boiler.demand');
  const waterPath = supply && ret;
  const complete = waterPath && demandLink && ZONES.every((z) => signal[z] && power[z]);
  return { supply, ret, waterPath, signal, power, demandLink, complete };
}

/** Engine overrides for the current conceptual connections. */
export function toOverrides(c: Connection[]): ConnectionOverrides {
  const s = summarize(c);
  return { signal: s.signal, actuatorPower: s.power, demandLink: s.demandLink, waterPath: s.waterPath };
}
