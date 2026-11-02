# Research log

Access date for all sources: **2026-11-01**. A fact is attributed to a source only if I read it in the
downloaded document's text, which I extracted with `pdftotext`. Page numbers are **PDF page indices**.

## Sources actually read

### [GB] Ariston — *GENUS ONE Net, Installation and Servicing Instructions*, Country of destination GB/IE
- Publisher: Ariston Thermo UK Ltd. Document code 420010963800. PDF metadata: created 2018-12-05, modified 2019-11-05.
- Covers G.C.N. 47-116-93 (24 kW), 47-116-94 (30 kW) and 47-116-95 (35 kW).
- URL: https://www.appliancesdirect.co.uk/files/pdf/GenusOnenet24-Plus%20-%20Installation%20Manual.pdf.
  This is a **third-party retailer's copy**. library.ariston.co.uk returned only a JavaScript shell, so I could not extract text from it.
- I read all 76 pages as text.
- **Variant caveat:** the user's boiler is a "Genus ONE 24". It is unverified whether that is the
  GENUS ONE **NET** variant this manual describes.

| Fact used | PDF page |
|---|---|
| Connections legend: A CH flow, B DHW outlet, C gas, D cold inlet, E CH return, F safety-valve discharge, H drain, I condensate. **No "G" in this legend**; a filling loop is listed as an internal item | 14, 16 |
| The water-circuit diagram draws the bottom connections in the order A B C D E. The physical dimension drawing was not checked | 16 |
| Internal components: air relief valve, main HX, electrode, flow/return probes, gas valve, secondary HX, safety valve, **automatic by-pass**, drain valve, condensate trap, filling loop, CH filter, DHW flow switch, diverter valve, pressure gauge, pressure sensor, modulating pump with air release, expansion vessel, fan | 16 |
| Pump available-pressure graph (ΔT20 °C) exists. Only the axes are readable as text (0–600 mbar, 0–1200 l/h) | 15 |
| Underfloor heating: a floor safety thermostat is "possible but not necessary". On over-temperature the boiler stops **both DHW and heating** and shows code **1 16 "floor thermostat contact open"**, then restarts automatically when the thermostat closes. If no thermostat is fitted, protect the floor with a thermostatic valve or a by-pass | 15 |
| Terminals: BUS, FLOOR/TA2 (floor thermostat or room thermostat 2, **parameter 223**), SE (outdoor sensor), SOL, TA1 (room thermostat 1) | 24 |
| External control connections are **12 V DC**; use only controls with **voltage-free contacts** | 11 |
| Max working pressure 6 bar (water supply). Oxygen-barrier pipes (DIN 4726/4729) for underfloor heating. Magnetic filter suggested | 11 |
| Anti-cycling: param 236, 0–7 min, default 3. CH pump overrun: param 237, 0–15 min (16 = continuous), default 3 | 40 |
| Zone temperature range: param 420 (0 = 20–45 °C, 1 = 35–82 °C, default 1) | 41 |
| Anti-frost works only with correct system pressure, electrical supply and gas supply | 37 |
| Technical data (24 kW): CH 21.5/2.3 kW (80/60), 23.6/2.6 kW (50/30); DHW 24.9/2.4 kW; vessel 8 L, 1 bar; max heating pressure 3 bar; ranges 35/82 and 20/45 °C; DHW 12.8 L/min at ΔT 30; min DHW flow 2 L/min; DHW pressure 7.0/0.2 bar; **minimum ambient temperature for use +5 °C** | 66 |
| The error table on p.37 of this copy **does not list 116**. The code appears only in the p.15 text | 37 |

### [PL] Ariston — *GENUS One / GENUS One NET, instrukcje techniczne* (doc 420000428800)
- URL: https://ik.pl/pliki/ARISTON/143_1825_Genus_One-instalator_PL_1_1.pdf (third-party host). I read only the relevant parts.
- p.10: the installation site should stay above the temperature limit and **protect the boiler from direct
  exposure to atmospheric factors**. I did not find this sentence in the GB text. The same paragraph says the
  boiler is "designed to stand on the floor", which looks like a boilerplate error, so treat this page with care.
- p.11: the underfloor section uses an imperative ("install a safety thermostat"), unlike the GB wording ("possible but not necessary").
- p.28: the error list includes **1 16 "Termostat podłogowy otwarty"**.

### [FR] Ariston — *GENUS ONE+ notice technique* (420011290200 rev.00 12/2022)
- URL: https://images.selectra.info/fr-reno/notices/notice-ariston-genus-one-plus.pdf. This is a different product line (ONE+).
- Used only to cross-check the anti-frost preconditions: pressure, electrical supply, gas supply, and no safety lockout.

### [UH8] Heatmiser UH8 wiring centre manual (generic reference only; not the user's device)
- URL: https://itherme.com/wp-content/uploads/2024/09/3Heatmiser-UH8-Manual.pdf.
- Read: zone inputs L / N / S-L (230 V switched live from the thermostat); zone outputs L/N to actuators; the
  "Heat Enable" boiler output is volt-free; relay max 3 A and total 5 A resistive (UH8 only).

## Downloaded but not readable
- **Ambiente UB10 V2 data sheet**: the PDF is image-only and contains no text. I cite nothing from it.

## Not read
- The user's product pages (AliExpress, Alibaba, Made-in-China, underfloorheating.info). Every product
  property (Beok 220 V Wi-Fi / 3 A / Tuya; 230 V NC M30×1.5 2–3 W 3–5 min actuators; 8-zone centre with
  15 A fuse, NO/COM/NC relay, DIP delay, L1/N1 pump output) comes **from the user's description** and is unverified.

## Discrepancies noted
- The user gave a maximum DHW inlet pressure of 6 bar. The GB technical table gives DHW max/min 7.0/0.2 bar, and the "Water Supply" text gives 6 bar max working pressure.
- The user gave min output as ≈2.5–2.7 kW. The table gives 2.3 kW (80/60) and 2.6 kW (50/30). The simulation uses 2.6 kW.
- The 384/ΔT DHW flow model (12.8 × 30) and the 24.9 kW DHW maximum do not agree exactly (12.8 L/min × 30 K ≈ 26.8 kW). Both are used as given.
