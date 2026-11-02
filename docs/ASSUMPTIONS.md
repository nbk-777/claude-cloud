# Facts, assumptions and open items

The same lists appear in the app on the **"წყაროები და დაშვებები"** (sources and assumptions) and
**"ღია საკითხები"** (open items) tabs. Their single source of truth is `src/data/reference.ts`.

## User facts
**First brief:**
- The pipes are already laid and the floor is fully covered.
- 14 flow+return pairs arrive at the manifold location → treated as 14 loops. This needs on-site confirmation.
- Room areas are taken from the plan: 32.04 living, 10.26 child, 16.01 main bedroom, 5.48 bath, 7.11 hall, 3.40 wardrobe.
- 4 thermostats: living, child, main bedroom, bathroom.
- 3-core cables are laid from those 4 rooms.
- The hall and wardrobe have loops but no thermostat.
- Boiler: Ariston Genus ONE 24, on the left balcony, in a thermo-cabinet.
- The manifold has not been bought and its position is unknown.
- DHW is needed at the bathroom shower, and each room must be controlled independently.

**Second brief:**
- Thermostats: Beok 220 V Wi-Fi, 3 A, Tuya. **Not installed yet.**
- Actuators: 230 V, NC, M30×1.5, ≈2–3 W, open in ≈3–5 min.
- Wiring centre: 8 zones (L / N / signal / actuator pair), 15 A fuse, relay NO/COM/NC, DIP delay, pump L1/N1, PE.
- Manifold: actuators on the flow bar, manual caps on the return bar, flow meters.
- TA1: factory jumper removed, dry contact only, never 230 V.

**Third brief:** detailed device illustrations and DIP 0 / 2 / 5 min.

## Conflicts between briefs (shown in Open items)
- **Areas.** The plan gives living 32.04, main bedroom 16.01, bath 5.48, child 10.26, hall 7.11. The second brief gives 30 / 21 / 10 / 9 and does not mention the hall. **The model uses the plan.**
- **Thermostats.** The first brief says they "exist"; the second says "not installed yet". The model treats them as planned Beok units.
- **Bathroom loops.** The first brief gives 1, the second gives 2.
  - Default allocation: 6/3/2/1/1/1 (living/main/child/bath/hall/wardrobe).
  - Alternative: 6/3/2/2/0/1, one click away on the mapping page.

## Prototype assumptions
- Room names (renameable).
- Hall outline: approximated with 3 rectangles. The drawn area is ≈7.2 m² against 7.11 m² on the plan. The child room depth of 3.80 m is derived as 10.26 / 2.70.
- All device positions and all pipe and cable routes. They are not on the plan and are drawn dashed as "route unknown".
- Loop serpentine shapes, each room split into equal-area loop regions.
- 3-core cable functions: core 1 = L, core 2 = N, core 3 = signal. This is a generic model; verify it.
- Actuator timing: 90 s thermal dead time + 150 s linear travel ≈ 4 min. The same delay is used for closing.
- The wiring-centre relay closes after the DIP delay. Default is 5 min so the boiler is not called before the actuators are open. No end-switch feedback is modelled.
- DHW priority via the diverter: typical combi behaviour, to be confirmed for this variant.
- If the app or cloud goes offline, local control continues. This is an assumption about this architecture.
- A lost sensor means no demand from that room. This is a simulation-only policy and not a universally safe rule.
- With no open flow path, the simulation does not fire the burner. The real boiler behaviour is unknown, and the manual lists an internal automatic by-pass whose adequacy is unverified.
- Pump behaviour during fault 116 (3 min overrun) is a demo assumption.
- Floor safety thermostat: trips at 55 °C, resets with a 5 K differential. Demo values.
- All values in `DEMO` in `src/sim/params.ts`.

## Open items / required professional checks
See [INSTALLER-CHECKLIST.md](INSTALLER-CHECKLIST.md). In short:
- Loop→room mapping.
- Cable cores.
- Thermostat terminal labels.
- Per-zone current limit of the wiring centre (living zone: 6 actuators + hall + wardrobe = 8 actuators, ≈16–24 W steady-state; inrush is unknown).
- That the relay is a dry contact before connecting it to TA1 (the manual says 12 V DC, volt-free only).
- DIP values.
- Mixing unit, external pump and by-pass needs; boiler pump adequacy for 14 loops; system volume vs. the 8 L vessel.
- Thermo-cabinet: frost, condensate, ventilation and flue (the manual gives +5 °C minimum ambient).
- Exact boiler variant and GC number.
- Electrical work by a qualified electrician. Boiler connections by an Ariston service technician.
