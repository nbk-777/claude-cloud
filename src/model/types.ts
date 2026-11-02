// Core typed models shared by the simulation engine, persistence and UI.

export const ZONES = ['living', 'child', 'main', 'bath'] as const;
export type ZoneId = (typeof ZONES)[number];

export const ROOMS = ['living', 'child', 'main', 'bath', 'hall', 'wardrobe'] as const;
export type RoomId = (typeof ROOMS)[number];

/** Rooms that have floor loops but no thermostat of their own. */
export const FOLLOWER_ROOMS = ['hall', 'wardrobe'] as const;
export type FollowerRoomId = (typeof FOLLOWER_ROOMS)[number];

export const LOOP_COUNT = 14;
export const LOOP_IDS: readonly string[] = Array.from(
  { length: LOOP_COUNT },
  (_, i) => `L${String(i + 1).padStart(2, '0')}`,
);

export function isZone(r: string): r is ZoneId {
  return (ZONES as readonly string[]).includes(r);
}
export function isRoom(r: string): r is RoomId {
  return (ROOMS as readonly string[]).includes(r);
}

export interface LoopAssignment {
  id: string;
  /** null = unassigned (loop still exists in inventory, actuator not wired to any zone). */
  room: RoomId | null;
  /** Optional: the loop's pipe also passes through/heats another room. */
  crossesInto: RoomId | null;
  note: string;
}

export interface ThermostatSetting {
  enabled: boolean;
  setpointC: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface DisplaySettings {
  hydraulic: boolean;
  wiring: boolean;
  labels: boolean;
  optionalLayer: boolean;
  floorCutaway: boolean;
  /** 0..1 opacity of the floor-finish layer above the pipes (0 = fully cut away). */
  floorFinishOpacity: number;
  boilerCutaway: boolean;
}

export type ChRange = 'low' | 'high';

export interface SimSettings {
  speed: number;
  outdoorC: number;
  coldWaterC: number;
  chRange: ChRange;
  chSetpointC: number;
  dhwSetpointC: number;
  showerFlowLpm: number;
  actuatorDelayS: number;
  actuatorTravelS: number;
  /** Wiring-centre boiler-relay delay (DIP switches). Real DIP values unknown → assumption. */
  relayDelayS: number;
  /** Wiring-centre pump output L1/N1 — unused by default (boiler has its own pump). Visual only. */
  pumpOutputEnabled: boolean;
  hysteresisK: number;
  floorSafetyInstalled: boolean;
  floorSafetyTripC: number;
}

export interface AppConfig {
  version: 1;
  roomNames: Record<RoomId, string>;
  thermostats: Record<ZoneId, ThermostatSetting>;
  loops: LoopAssignment[];
  mappingVerified: boolean;
  owners: Record<FollowerRoomId, ZoneId>;
  manifoldPos: Point;
  display: DisplaySettings;
  sim: SimSettings;
}

/** Which thermostat zone drives a given room's actuators. */
export function controlZoneOf(room: RoomId | null, owners: Record<FollowerRoomId, ZoneId>): ZoneId | null {
  if (room === null) return null;
  if (isZone(room)) return room;
  return owners[room];
}
