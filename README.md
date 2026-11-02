# Underfloor-heating digital twin — interactive prototype (Georgian UI)

An interactive prototype of **one specific apartment**: about 74.3 m², 14 underfloor-heating loops, 4 room
thermostats, an Ariston Genus ONE 24 combi boiler on the left balcony, and an 8-zone wiring centre.
You can switch each room's heating on or off and change its setpoint, then **watch** the whole chain:

thermostat signal → wiring-centre zone → 230 V NC actuators warm up and open → DIP delay → relay COM–NO closes TA1 →
boiler pump and burner start → hot water flows only through open loops → screed warms → air warms →
setpoint reached → actuators close → relay opens → burner stops → pump overrun → floor keeps residual heat.

The UI is in Georgian. Code and comments are in English. The docs are in English and in Georgian ([docs/ka/](docs/ka/README.md)).

> **Prototype, not a design tool.** Every thermal number (losses, capacities, coupling, flows, kW, warm-up
> times) is a labelled *demo assumption*. Nothing here is a heat-loss calculation, a pump/boiler sizing,
> a safe setting, or an installation instruction. See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md).

**Live:** https://nbk-777.github.io/claude-cloud/

## Run

```bash
npm install
```

```bash
npm run dev          # http://localhost:5173
```

```bash
npm run build        # → dist/index.html (single self-contained file; opens from disk via file://)
```

```bash
npm run typecheck
```

```bash
npm test             # Vitest + React Testing Library
```

```bash
npm run build && npm run smoke   # headless Chromium smoke test + screenshots in e2e/screenshots/
```

```bash
npm run build && npm run smoke:3d   # 3D Balcony page check (WebGL via SwiftShader)
```

The smoke script loads `playwright` via `require`. It expects Playwright and Chromium to be installed
already, as they are in the build container. It is not listed in `package.json`.

## What's in it

| Area | Where |
|---|---|
| Plan view (hero): traced room geometry, two balconies, 14 serpentine loops, floor-warmth bloom, air tint, draggable manifold placeholder, thermostats, boiler cabinet, shower, hydraulic and wiring layers, zoom/pan, room focus | `src/ui/PlanView.tsx` |
| **Equipment & installation page**: the balcony boiler in its thermo-cabinet with valves, magnetic filter, condensate, flue (context), isolator; wall passage; manifold cabinet with actuators, flow meters, air vents; wiring centre; 4 thermostats; shower. Every part is named, and one colour code is used for flow/return/DHW/cold. Includes a terminal-to-terminal **control-wiring diagram** (thermostat → zone → actuators on valves → relay → TA1) and a "what connects to what / who installs it" table | `src/ui/InstallView.tsx`, `src/ui/ControlWiringDiagram.tsx` |
| **3D Balcony Installation** (`#balcony-3d`): interactive Three.js scene of the balcony boiler, the manifold directly below it, 14 actuators, the zone controller and 4 thermostats. It is driven by the existing simulation and includes camera presets, an inspector, an "Explain system" overlay and a conceptual "Connect components" mode. See [docs/BALCONY-3D.md](docs/BALCONY-3D.md) | `src/ui/balcony3d/`, `src/sim/connections.ts` |
| Boiler: front panel (LCD, knob, gauge, flame, TA1 terminal strip, A–E stubs) and an internal cutaway (HX/burner, pump, diverter, plate HX, flow switch, filter, vessel, safety valve, pressure sensor, filling, by-pass); A–I connections; shower | `src/ui/BoilerView.tsx` |
| Manifold close-up: brass bars, 14 actuators on the flow bar, flow meters and blue caps on the return bar, gauges, room brackets, command vs. simulated feedback | `src/ui/ManifoldView.tsx` |
| Wiring centre: 8 zones (L / N / signal in, actuator pair out), DIP 0/2/5 min, relay NO/COM/NC → TA1, pump L1/N1, fuse | `src/ui/WiringView.tsx` |
| Device illustrations (thermostat, actuator, flow meter, gauge, boiler front, shower) | `src/ui/devices.tsx` |
| Live command chain, thermostat widgets + heat-up chart, inspector, event log, scenarios | `src/ui/Panels.tsx`, `src/ui/App.tsx` |
| Loop mapping table, hall/wardrobe owner, room rename, JSON export/import, equipment, checklist, open items, sources | `src/ui/Pages.tsx` |
| Simulation engine (pure TypeScript, deterministic, 1 s fixed step) | `src/sim/engine.ts`, `params.ts`, `chain.ts`, `scenarios.ts` |
| Typed config, validation, versioned persistence | `src/model/config.ts`, `types.ts` |
| Plan geometry and loop layout generator | `src/model/plan.ts`, `loopGeometry.ts` |
| Sources, facts, equipment, checklist, inspector texts | `src/data/reference.ts` |

## Publish (GitHub Pages)

Push to the default branch (`claude/great-pasteur-vsm2si`). `.github/workflows/pages.yml` runs the typecheck, the tests and the build, then:
- commits the built `index.html` to **`main`**. `main` holds only the built app, which is what Pages serves in "Deploy from a branch: main" mode.
- also publishes a Pages artifact, used if Pages is switched to "GitHub Actions" mode.

Do not edit `main` by hand.

## Colour code

| Line | Colour |
|---|---|
| heating flow (A) | red |
| heating return (E) | blue |
| domestic hot water (B) | orange |
| cold water (D) | teal |
| gas (C) | yellow, context only |
| condensate (I) | grey |
| wires | brown L, blue N, green signal, orange relay→TA1 |

## Scenarios (sidebar buttons)

1. Living room only
2. All four rooms
3. One room reaches its setpoint (residual floor heat)
4. Everything stops (overrun)
5. Room sensor lost
6. Actuator does not open
7. App/cloud offline
8. Shower during heating (DHW priority)
9. Bathroom only (low load → short-cycling)
10. Floor safety trip (fault 116 style; DHW also stops)

## Docs (Georgian versions in [docs/ka/](docs/ka/README.md))

- [docs/RESEARCH.md](docs/RESEARCH.md): the sources I actually read, with page references
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md): user facts, manufacturer facts, assumptions, unverified items and conflicts
- [docs/SYSTEM-ARCHITECTURE.md](docs/SYSTEM-ARCHITECTURE.md)
- [docs/SIMULATION-MODEL.md](docs/SIMULATION-MODEL.md)
- [docs/INSTALLER-CHECKLIST.md](docs/INSTALLER-CHECKLIST.md)
