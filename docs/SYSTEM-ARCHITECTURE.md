# System architecture (as modelled)

## Hydraulics
```
Ariston Genus ONE 24 (internal pump + 8 L vessel + 3 bar safety valve + diverter + auto by-pass)
  A (CH flow) ──► supply bar ─► [valve + 230V NC actuator] ×14 ─► loops L01…L14 ─► return bar (caps, flow meters) ──► E (CH return)
  D (cold) ──► flow switch ─► plate HX ─► B (DHW) ──► bathroom shower
  C gas, F safety discharge, H drain, I condensate: context only
```
- The base scene has no external pump, mixing valve, hydraulic separator or buffer. These are shown only
  in the optional layer, labelled "may be required depending on hydraulic design".
- The boiler LOW range (20–45 °C) is the default for the floor circuit.

## Control
```
Beok thermostat (room)  ─3-core: L, N, signal─►  wiring-centre zone Zn (n = 1..4 of 8)
Zn actuator pair (230 V) ─► all actuators of that room in parallel (+ hall / wardrobe on the owner zone)
any zone on for ≥ DIP delay (0/2/5 min) ─► relay COM–NO closes ─► Ariston TA1 (dry contact, 12 V DC side)
pump output L1/N1 unused (boiler pump)
FLOOR/TA2 optional floor safety thermostat (param 223 = 0)
```
- Zones: Z1 living, Z2 child, Z3 main bedroom, Z4 bathroom. The hall and wardrobe follow a selectable
  owner zone (default: living).
- An unassigned loop has no actuator wiring, so its NC valve stays closed.
- Nothing confirms flow: a commanded-open actuator does not report its position, and the relay
  closes on a timer.

## Software
```
src/model   typed config, plan geometry, loop layout, validation, persistence (localStorage v1, JSON export/import)
src/sim     pure deterministic engine (step/runFor/Clock), command-chain derivation, scenarios
src/ui      React + SVG views; useSimulation drives the engine from requestAnimationFrame
src/data    sources, manual facts, equipment, checklist, inspector texts, open items
src/i18n    Georgian strings
```
- The UI never mutates engine state directly, except for scenario-level faults and the shower toggle (via `mutate`).
- The flow animation is CSS. A `.paused` root class pauses every animation.
- The build is a single self-contained `dist/index.html` (vite-plugin-singlefile), so the app opens from disk with no network.
