# 3D Balcony Installation page

**Route:** tab **"3D Balcony Installation"**, or open the app with `#balcony-3d`, for example
`dist/index.html#balcony-3d` or `https://nbk-777.github.io/claude-cloud/#balcony-3d`.

The page is an interactive WebGL scene: Three.js 0.186.1 with OrbitControls and RoundedBoxGeometry from the Three.js examples.
All equipment is generated in code; there are no external models, textures or asset servers.
The scene renders the **existing** simulation state and never runs its own simulation.

> This is an illustrative prototype. It does not replace boiler controls, safety devices, frost protection,
> minimum-flow requirements, pump-overrun requirements, hydraulic design or professional commissioning.
> It gives no installation instructions and does not state that any boiler is approved for balcony installation.

## What the scene shows
- **Balcony:** an exterior wall with a balcony door, a side wall, a tiled floor (procedural texture), a railing with glass infill, and daylight from a hemisphere light plus a sun with shadows.
- **Boiler:** a generic wall-hung combi boiler, unbranded and labelled *illustrative*. The user's planned boiler is an Ariston Genus ONE 24, but the exact variant is unverified, so no brand or model-specific detail is drawn.
  - Front panel: a display with flow temperature, mode, pump and demand state; a flame window, where the flame is visible **only while the simulated burner is on**; a pump impeller that turns while the simulated pump runs; and a status LED.
- **Manifold:** **directly below the boiler**. The supply bar (upper) carries 14 valve bodies with thermal actuators. The return bar (lower) carries 14 flow meters, whose floats rise with simulated flow, and blue caps.
  - Below are 14 supply/return drop pairs going into a trunking box, with loop numbers and room-coloured tags. The route to the rooms is illustrative.
  - The boiler supply and return pipes have rounded bends, isolating valves and fittings.
- **Zone controller:** wall-mounted next to the manifold, with four zone LEDs and a boiler-demand LED. One cable runs to the actuator group and one to the boiler's demand input.
- **Room thermostats:** Living Room, Bathroom, Child's Bedroom, Main Bedroom. They are **shown together on one panel for illustration**; in reality each is in its own room. Their displays show air temperature, setpoint and a heat-demand flame.
- **Context-only infrastructure:** gas supply, flue, pressure-relief discharge, and mains power with an isolator. Each is labelled *"Professional installation required"*. None of these can be connected or changed.

## How the scene follows the simulation
| Scene element | Driven by (existing engine state) |
|---|---|
| Actuator pin height and colour; red power dot | `loops[id].act.pos`, `loops[id].act.cmd` |
| Flow particles in a loop's supply and return drops; flow-meter float | `loops[id].flowing` and `flowLpm`. Never shown for a stuck or disconnected path |
| Particles in the boiler↔manifold pipes | pump on, diverter on CH, and at least one loop flowing |
| Flame | `boiler.burnerOn` only |
| Pump impeller, boiler LED, display | `boiler.pumpOn`, `boiler.mode`, `boiler.flowC` |
| Controller zone LEDs and demand LED | `controller.zoneOut[z]`, `controller.ta1Closed` |
| Thermostat displays | room air temperature, setpoint, on/off and calling state |

The setpoint and on/off buttons on this page call the same config update as every other page.

## Interaction
- **Navigation:** orbit, zoom and pan (OrbitControls). Camera presets: Full balcony, Boiler, Manifold, Controller, plus **Reset camera**.
- **Inspecting:** click the boiler, manifold, pipes, any actuator, the controller, a thermostat or a context item. The inspector shows its function and current simulated state, and the selected object gets a highlight box.
- **Thermostat selection:** selecting a thermostat highlights the actuators and loops of its zone, including hall and wardrobe loops if they follow that zone.
- **Explain system:** an overlay showing the supply path (red), return path (blue), control signals (green, dashed) and boiler demand (orange, dashed).

## Connect components (conceptual)
Logic is in `src/sim/connections.ts`; tests are in `tests/connections.test.ts`.

**Ports:**
- boiler supply and return
- manifold supply and return
- 4 thermostat signal outputs
- 4 controller zone inputs
- 4 controller zone outputs
- 4 actuator groups
- controller demand output
- boiler demand input

**Validation:**
- The two ports must be compatible: water-out to water-in, signal-out to signal-in, power-out to power-in, demand-out to demand-in.
- Supply and return cannot be joined.
- Zone ports must belong to the same zone.
- Each port can be used only once.
- Gas, flue, pressure-relief and mains are always rejected with "professional installation required".

**Effect:** applied through optional `ConnectionOverrides` in the existing engine, and only while connect mode is on and this page is open.
- A missing thermostat link means the zone gets no demand.
- A missing zone output link means that zone's actuators stay closed.
- A missing demand link means no boiler request.
- An incomplete water path means no flow is shown, and the burner stays off because of the existing no-flow-path rule.

**Buttons:** "Load assembled example" (the full valid set) and "Reset connections" (removes all links).
With the assembled example loaded, the simulation is identical to the normal system; a unit test checks this.

## Illustrative dimensions (assumptions, not clearances)
| Item | Value used |
|---|---|
| Balcony | 3.2 m wide × 1.4 m deep; wall height 2.7 m; railing 1.06 m |
| Boiler | 0.40 × 0.70 × 0.30 m (W × H × D); bottom at 1.30 m |
| Manifold | supply bar centre 0.80 m, return bar 0.60 m; bars 0.84 m long; 14 ports at 50 mm |
| Bar / pipe size | bar Ø ≈ 34 mm; boiler pipes Ø 22 mm; loop drops Ø 16 mm |
| Controller | 0.36 × 0.22 × 0.06 m, centre at 0.86 m |
| Thermostats | 0.10 × 0.10 × 0.022 m, shown together at 1.45 m |

These numbers are chosen to read well on screen. They are not manufacturer dimensions, installation clearances, or a statement that the layout is permitted.

## Performance and robustness
- **Geometry:** shared geometries and materials are reused. `InstancedMesh` is used for the actuators, valve bodies, flow meters, drops, tags, highlight halos and flow particles.
- **Rendering:** the render loop reads the latest snapshot. Canvas textures (displays) are redrawn only when their values change, and connection lines are rebuilt only when the connections change.
- **Cleanup:** on leaving the page, all geometries, materials, textures and instanced meshes are disposed, along with the renderer and the controls.
- **Loading and fallback:** the page shows "Loading 3D scene…" while the scene module loads. If WebGL is unavailable, it shows a clear message and the other pages keep working.

## Verification
- `npm test`: 73 tests, including 13 for the connection and state logic.
- `npm run typecheck`, `npm run build`.
- `npm run smoke:3d`: headless Chromium with SwiftShader WebGL. It opens `#balcony-3d`, checks the canvas, setpoint buttons, active heating, thermostat-to-loops selection, connect mode (reset blocks the boiler request; incompatible ports rejected; compatible ports connect; the assembled example restores heating), and that the scene returns to standby when demand stops. It also checks for no console errors or warnings and saves screenshots to `e2e/screenshots/b3d-*.png`.
