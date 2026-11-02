// Simulation parameters.
// EVERY thermal / hydraulic number in DEMO is a "demo assumption" chosen to make the behaviour
// visible — it is NOT a heat-loss calculation, NOT a design value and NOT a safe setting.
// Numbers in BOILER come from the Ariston GENUS ONE NET 24 GB/IE installation manual
// (doc 420010963800) — see docs/RESEARCH.md for page references; variant still unverified.

export const BOILER = {
  /** Max CH output at 50/30 °C, kW — manual Technical Data p.66 (24 kW model). */
  chMaxKW_50_30: 23.6,
  /** Max CH output at 80/60 °C, kW — manual p.66. */
  chMaxKW_80_60: 21.5,
  /** Min output at 50/30 °C, kW — manual p.66 (2.3 kW at 80/60). */
  chMinKW: 2.6,
  /** DHW max output, kW — manual p.66. */
  dhwMaxKW: 24.9,
  /** DHW min output, kW — manual p.66. */
  dhwMinKW: 2.4,
  /** Specific DHW flow 12.8 L/min at ΔT 30 → model flow_max = 384/ΔT (user-specified model). */
  dhwFlowConstant: 384,
  /** Hot water minimum flow rate, L/min — manual p.66. */
  dhwMinFlowLpm: 2,
  /** CH temperature ranges — manual p.66 (low 20/45, high 35/82). */
  lowRange: [20, 45] as const,
  highRange: [35, 82] as const,
  /** Anti-cycling time default 3 min (param 236, 0–7 min) — manual parameter table. */
  antiCycleS: 180,
  /** CH pump overrun default 3 min (param 237, 0–15 min) — manual parameter table. */
  pumpOverrunS: 180,
  /** Expansion vessel 8 L, pre-charge 1 bar; max heating pressure 3 bar — manual p.66. */
  expansionVesselL: 8,
  vesselPrechargeBar: 1,
  safetyValveBar: 3,
};

export const DEMO = {
  /** Room heat-loss coefficient per m² floor, W/(m²·K) — demo assumption. */
  lossWPerM2K: 1.4,
  /** Air + furniture heat capacity per m² floor, J/(m²·K) — demo assumption. */
  airCapJPerM2K: 30_000,
  /** Screed/floor heat capacity per m², J/(m²·K) (≈40 mm screed) — demo assumption. */
  floorCapJPerM2K: 80_000,
  /** Floor surface → room air transfer, W/(m²·K) — demo assumption. */
  floorToAirWPerM2K: 10,
  /** Water → floor transfer per m² of loop coverage, W/(m²·K) — demo assumption. */
  waterToFloorWPerM2K: 10,
  /** Illustrative per-loop flow when fully open, L/min — NOT a design flow. */
  loopFlowLpm: 1.6,
  /** Water volume inside boiler + connecting pipes, L — demo assumption. */
  boilerWaterL: 5,
  /** Water volume per loop (≈ 80 m of 16 mm pipe) — demo assumption. */
  loopWaterL: 9,
  /** Heat loss of primary water to the thermo-cabinet, W/K — demo assumption. */
  primaryLossWPerK: 6,
  /** Cabinet air above outdoor temperature, K — demo assumption. */
  cabinetOverOutdoorK: 6,
  /** Boiler flow-temperature control band ±K around setpoint — demo assumption. */
  burnerBandK: 3,
  /** Flow-temperature controller time constant, s — demo assumption. */
  modulationTauS: 120,
  /** Thermostat minimum on / off time, s — demo assumption. */
  thermostatMinOnS: 120,
  thermostatMinOffS: 120,
  /** Floor safety thermostat auto-reset differential, K — demo assumption. */
  floorSafetyResetK: 5,
  /** Burner starts within the last hour that trigger the short-cycling notice — demo assumption. */
  shortCycleStartsPerHour: 4,
  /** History sampling interval, s. */
  historyEveryS: 30,
  /** History length (samples) → 6 h at 30 s. */
  historyLen: 720,
  /** Initial temperatures, °C — demo assumption. */
  initialAirC: 18,
  initialFloorC: 18,
};

/** Fixed integration sub-step (seconds). Requirement: ≤ 5 s. */
export const SUB_STEP_S = 1;

export const WATER_J_PER_LK = 4186;
