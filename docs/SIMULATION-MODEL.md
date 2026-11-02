# Simulation model

The engine lives in `src/sim/engine.ts`. Parameters are in `src/sim/params.ts`: `BOILER` holds
values from the manual, and `DEMO` holds **demo assumptions** only.

- **Time:** fixed sub-step of 1 s; speed 1×–60×.
- **Clock:** converts wall time × speed into whole steps, so results do not depend on frame rate.
- **Determinism:** `step(state, cfg)` is pure and returns a new state. `runFor(state, cfg, s)` runs `s` steps.
- **Pause and reset:** pause stops step generation; reset recreates the initial state, or reapplies the current scenario.

## Step order
1. **Thermostats.** Hysteresis ±h/2 (default h = 0.4 K) and a 120 s minimum on/off time. A thermostat that is OFF or has a lost sensor sends no demand.
2. **Wiring centre.** Each zone output follows its thermostat's demand. The relay (TA1) closes once any zone has been on for at least `relayDelayS` (DIP: 0, 120 or 300 s).
3. **Actuators.** NC. After a command change, a thermal dead time (`actuatorDelayS`) passes, then position moves linearly over `actuatorTravelS`. A stuck actuator stays at 0 and shows `fault` once the dead time has elapsed.
   Phases: closed / opening / open / closing / fault.
4. **Boiler state machine:** standby / heating / dhw / overrun / fault.
   - **Floor safety (optional).** If flow temperature exceeds the trip temperature, the boiler goes to fault `116`. Burner off, no DHW, pump overrun 3 min. It auto-resets 5 K below the trip temperature.
   - **DHW.** Starts when the shower flow is at least 2 L/min. The diverter moves to DHW, the burner runs, and the floor loops get no water.
     - Full-temperature flow limit: `384/ΔT` L/min. Above that flow, outlet temperature = cold + 384/flow.
     - DHW power is clamped to 2.4–24.9 kW.
   - **Heating** (TA1 closed). The pump runs.
     - If no loop is open (Σpos < 0.05), a **dead-head** warning shows and the burner is not fired.
     - The burner switches on when flow temperature drops below setpoint − 3 K and switches off above setpoint + 3 K. After switching off, the **anti-cycle** time (180 s, param 236 default) applies.
     - Modulation is `need = Σloop heat + C·(set − T)/120 s`, clamped to [2.6, 23.6] kW at 50/30. The high range uses 21.5 kW.
   - **Overrun.** After TA1 opens, the pump runs for 180 s (param 237 default), then the boiler goes to standby.
   - **Flags:** `lowLoad` (Σ loop heat < 2.6 kW) and `shortCycling` (≥ 4 burner starts in the last hour).
5. **Loops.** A loop is flowing when the pump is on, the diverter is on CH, the loop is assigned to a room, the actuator position is above 0.02, and the actuator is not stuck.
   - Loop area = plan room area / number of loops in that room. `UA = DEMO.waterToFloorWPerM2K × area` (10 W/m²K).
   - Flow = 1.6 L/min × pos (illustrative).
   - Heat to the floor: `Q = UA(T_flow − T_floor)/(1 + UA/(2ṁc))`. Return temperature = `T_flow − Q/ṁc`.
   - Primary water node capacity: (5 L + Σpos·9 L)·4186 J/K. It loses 6 W/K to the cabinet, which sits at outdoor + 6 K.
6. **Rooms.** Two nodes per room:
   - Floor node: 80 kJ/m²K.
   - Air node: 30 kJ/m²K.
   - Floor→air transfer: 10 W/m²K.
   - Loss to outdoors: 1.4 W/m²K × (T_air − T_out).
   - Not modelled: heat exchange between rooms, solar gains, ventilation, losses to neighbours.
7. **History.** One sample every 30 s; the last 6 h are kept.

## Not modelled (deliberately)
- Combustion, gas use and flue.
- Pressures, pump curve, pressure drop, balancing, loop lengths. The model makes **no pump-adequacy claim**.
- Real heat loss and real warm-up times.
- Electrical loads and inrush current.

## Tests
- `tests/engine.test.ts`: zone isolation, owner following, hysteresis, OFF → close after the delay, dead time and travel, stuck actuator, dead-head, relay delay, anti-cycle, short-cycling, overrun, DHW priority and flow limit, minimum DHW flow, floor trip stopping DHW, sensor loss, determinism, clock, immutability, thermal mass, command chain.
- `tests/scenarios.test.ts`: every scenario produces its intended state.
- `tests/config.test.ts`: exactly 14 unique loops, allocation, no duplicates, reassignment, persistence, import validation.
- `tests/ui.test.tsx`: the scene reflects simulation state (loop and actuator classes and attributes, wiring, boiler); thermostat buttons work; the app shell renders.
