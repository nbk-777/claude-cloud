// Control-wiring schematic: room thermostat terminals → wiring-centre zone input (L / N / signal)
// → zone actuator output pair → every actuator of that room in parallel, sitting on its valve on
// the manifold → boiler relay COM–NO → Ariston TA1.
// GENERIC model from the user's brief (core 1 = L, core 2 = N, core 3 = signal). Terminal names on
// the real Beok thermostat and the real wiring centre depend on the model — verify with their manuals.

import { ZONES, type AppConfig, type ZoneId } from '../model/types';
import { loopsOfZone, thermostatStatus, type SimState } from '../sim/engine';
import { ka } from '../i18n/ka';
import { ROOM_COLOR } from './util';
import { PIPE } from './palette';
import { ActuatorDevice, ThermostatDevice } from './devices';

interface Props {
  cfg: AppConfig;
  state: SimState;
  select: (id: string) => void;
  selected: string | null;
  setThermostat?: (z: ZoneId, patch: Partial<{ enabled: boolean; setpointC: number }>) => void;
}

const COL_W = 420;
const COL_X = (i: number) => 40 + i * COL_W;
const Y_TH_TERM = 222; // thermostat terminal row
const Y_IN = 352; // wiring-centre zone input terminals
const Y_OUT = 452; // wiring-centre zone output terminals
const Y_BUS = 540; // parallel distribution rails
const Y_BAR = 700; // manifold supply bar (valves)

function Term({ x, y, label, live, color, testid }: { x: number; y: number; label: string; live: boolean; color: string; testid?: string }) {
  return (
    <g data-testid={testid} data-live={live ? '1' : '0'}>
      <rect x={x - 22} y={y - 14} width={44} height={28} rx={4} fill={live ? '#fff9db' : '#fff'} stroke={color} strokeWidth={2} />
      <circle cx={x} cy={y - 4} r={4} fill="#adb5bd" stroke="#495057" />
      <text x={x} y={y + 11} fontSize={10} textAnchor="middle" fontWeight={700} className="lbl">{label}</text>
    </g>
  );
}

function Wire({ d, color, live, testid }: { d: string; color: string; live: boolean; testid?: string }) {
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={live ? 4.5 : 3} opacity={live ? 1 : 0.4} className={live ? 'cw-live' : ''} data-testid={testid} data-live={live ? '1' : '0'} strokeLinejoin="round" />
  );
}

export function ControlWiringDiagram({ cfg, state, select, selected, setThermostat }: Props) {
  const relay = state.controller.ta1Closed;
  return (
    <div className="cw-wrap">
      <h3>მართვის სქემა: თერმოსტატი → მართვის პანელი (გაყვანილობის ცენტრი) → აქტუატორი → სარქველი → ქვაბი</h3>
      <p className="small t-warn">
        ზოგადი მოდელი თქვენი აღწერით: 3-ძარღვიანი კაბელი — 1 = L (ყავისფერი), 2 = N (ლურჯი), 3 = სიგნალი (მწვანე). კლემების რეალური წარწერები Beok-ზე და ცენტრზე მოდელზეა დამოკიდებული —
        შეაერთებს კვალიფიციური ელექტრიკოსი მწარმოებლის ინსტრუქციით. TA1-ზე მხოლოდ მშრალი კონტაქტი, არასოდეს 230V.
      </p>
      <div className="tbl-scroll">
        <svg viewBox="0 0 2000 860" className="cw-svg" data-testid="cw-svg">
          <defs>
            <linearGradient id="cwbrass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f1d27a" />
              <stop offset="0.5" stopColor="#d4a93f" />
              <stop offset="1" stopColor="#9c7a26" />
            </linearGradient>
          </defs>

          {/* wiring centre board */}
          <g className={'comp' + (selected === 'controller' ? ' is-selected' : '')} data-click="controller" onClick={() => select('controller')}>
            <rect x={20} y={300} width={1960} height={190} rx={12} fill="#e6fcf5" stroke="#087f5b" strokeWidth={2.5} />
            <text x={30} y={320} fontSize={12} fontWeight={700} className="lbl">მართვის პანელი</text>
            <text x={1700} y={322} fontSize={11} className="lbl t-dim">Z5–Z8 — თავისუფალი</text>
          </g>

          {ZONES.map((z, i) => {
            const x0 = COL_X(i);
            const cx = x0 + COL_W / 2;
            const th = cfg.thermostats[z];
            const st = thermostatStatus(state, cfg, z);
            const sig = state.rooms[z].calling;
            const out = state.controller.zoneOut[z];
            const powered = true; // thermostat L/N come from the wiring centre (always present while it is powered)
            const loops = loopsOfZone(cfg, z);
            const n = Math.max(1, loops.length);
            const step = Math.min(50, (COL_W - 60) / n);
            const ax = (k: number) => cx - ((n - 1) * step) / 2 + k * step;
            const tL = cx - 60;
            const tN = cx;
            const tS = cx + 60;
            return (
              <g key={z} data-testid={`cw-zone-${z}`}>
                {/* room header */}
                <text x={cx} y={20} fontSize={14} textAnchor="middle" fontWeight={700} fill={ROOM_COLOR[z]}>
                  ზონა Z{i + 1} · {cfg.roomNames[z]}
                </text>
                {/* thermostat */}
                <g transform={`translate(${cx - 52},30) scale(0.52)`} className="comp" data-click={'thermostat:' + z} onClick={() => select('thermostat:' + z)}>
                  <ThermostatDevice
                    uid={`cw-${z}`}
                    airC={state.rooms[z].airC}
                    setpointC={th.setpointC}
                    enabled={th.enabled}
                    calling={sig}
                    sensorLost={state.faults.sensorLost[z]}
                    cloudOffline={state.faults.cloudOffline}
                    onPower={setThermostat ? () => setThermostat(z, { enabled: !th.enabled }) : undefined}
                    onMinus={setThermostat ? () => setThermostat(z, { setpointC: Math.max(5, th.setpointC - 0.5) }) : undefined}
                    onPlus={setThermostat ? () => setThermostat(z, { setpointC: Math.min(30, th.setpointC + 0.5) }) : undefined}
                  />
                </g>
                <text x={cx + 64} y={70} fontSize={11} className="lbl">{ka.status[st]}</text>
                {/* thermostat terminal block (back of the thermostat) */}
                <rect x={cx - 96} y={Y_TH_TERM - 26} width={192} height={46} rx={6} fill="#f1f3f5" stroke="#868e96" />
                <text x={cx - 92} y={Y_TH_TERM - 30} fontSize={10} className="lbl t-dim">თერმოსტატის უკანა კლემები (წარწერა მოდელზეა დამოკიდებული)</text>
                <Term x={tL} y={Y_TH_TERM} label="L" live={powered} color={PIPE.wireL} />
                <Term x={tN} y={Y_TH_TERM} label="N" live={powered} color={PIPE.wireN} />
                <Term x={tS} y={Y_TH_TERM} label="OUT" live={sig} color={PIPE.wireS} />
                {/* 3-core cable */}
                <Wire d={`M${tL},${Y_TH_TERM + 14} V${Y_IN - 14}`} color={PIPE.wireL} live={powered} />
                <Wire d={`M${tN},${Y_TH_TERM + 14} V${Y_IN - 14}`} color={PIPE.wireN} live={powered} />
                <Wire d={`M${tS},${Y_TH_TERM + 14} V${Y_IN - 14}`} color={PIPE.wireS} live={sig} testid={`cw-sig-${z}`} />
                <rect x={cx - 90} y={258} width={180} height={18} rx={9} fill="#fff" stroke="#adb5bd" />
                <text x={cx} y={271} fontSize={10} textAnchor="middle" className="lbl">3-ძარღვიანი კაბელი (უკვე დაგებული)</text>
                <text x={tS + 8} y={292} fontSize={10} className="lbl" fill={PIPE.wireS}>{sig ? '230V სიგნალი ●' : 'სიგნალი ○'}</text>
                {/* zone input terminals */}
                <text x={cx} y={Y_IN - 22} fontSize={10} textAnchor="middle" className="lbl t-dim">Z{i + 1} შესასვლელი</text>
                <Term x={tL} y={Y_IN} label="L" live={powered} color={PIPE.wireL} />
                <Term x={tN} y={Y_IN} label="N" live={powered} color={PIPE.wireN} />
                <Term x={tS} y={Y_IN} label="სიგნ." live={sig} color={PIPE.wireS} />
                {/* zone LED + internal link */}
                <circle cx={cx + 120} cy={402} r={9} fill={out ? '#f59f00' : '#dee2e6'} stroke="#495057" />
                <text x={cx + 134} y={406} fontSize={10} className="lbl">{out ? 'ზონა ON' : 'ზონა OFF'}</text>
                <path d={`M${tS},${Y_IN + 14} V400 H${cx + 20} V${Y_OUT - 14}`} fill="none" stroke="#868e96" strokeDasharray="4 4" />
                {/* zone output terminals */}
                <text x={cx} y={Y_OUT + 30} fontSize={10} textAnchor="middle" className="lbl t-dim">Z{i + 1} აქტუატორის წყვილი (230V)</text>
                <Term x={cx - 30} y={Y_OUT} label="A~ L" live={out} color={PIPE.wireL} testid={`cw-out-${z}`} />
                <Term x={cx + 30} y={Y_OUT} label="A~ N" live={out} color={PIPE.wireN} />
                {/* parallel rails */}
                <Wire d={`M${cx - 30},${Y_OUT + 14} V${Y_BUS} H${ax(0) - 8} M${cx - 30},${Y_BUS} H${ax(n - 1) - 8}`} color={PIPE.wireL} live={out} />
                <Wire d={`M${cx + 30},${Y_OUT + 14} V${Y_BUS + 14} H${ax(0) + 8} M${cx + 30},${Y_BUS + 14} H${ax(n - 1) + 8}`} color={PIPE.wireN} live={out} />
                <text x={ax(0) - 20} y={Y_BUS - 8} fontSize={10} className="lbl t-dim">პარალელურად →</text>
                {/* manifold bar segment */}
                <rect x={x0 + 14} y={Y_BAR} width={COL_W - 28} height={22} rx={10} fill="url(#cwbrass)" stroke="#8a6d1e" />
                {loops.length === 0 && <text x={cx} y={Y_BAR - 30} fontSize={12} textAnchor="middle" className="t-warn">⚠ კონტური არ არის მინიჭებული</text>}
                {loops.map((id, k) => {
                  const ls = state.loops[id];
                  const a = ls?.act;
                  const lc = cfg.loops.find((l) => l.id === id);
                  const x = ax(k);
                  return (
                    <g key={id} data-testid={`cw-act-${id}`} data-power={a?.cmd ? '1' : '0'}>
                      {/* drops from rails to the actuator cable */}
                      <Wire d={`M${x - 8},${Y_BUS} V${Y_BAR - 52}`} color={PIPE.wireL} live={!!a?.cmd} />
                      <Wire d={`M${x + 8},${Y_BUS + 14} V${Y_BAR - 48}`} color={PIPE.wireN} live={!!a?.cmd} />
                      <circle cx={x - 8} cy={Y_BUS} r={3} fill={PIPE.wireL} />
                      <circle cx={x + 8} cy={Y_BUS + 14} r={3} fill={PIPE.wireN} />
                      <g transform={`translate(${x},${Y_BAR}) scale(0.62)`}>
                        <ActuatorDevice x={0} y={0} pos={a?.pos ?? 0} cmd={!!a?.cmd} phase={a?.phase ?? 'closed'} selected={selected === 'actuator:' + id} onClick={() => select('actuator:' + id)} />
                      </g>
                      {/* loop pipe from the valve down to the floor */}
                      <line x1={x} y1={Y_BAR + 22} x2={x} y2={800} stroke={PIPE.flow} strokeWidth={6} opacity={ls?.flowing ? 1 : 0.3} className={ls?.flowing ? 'flow-anim ipipe2-flow' : ''} />
                      <text x={x} y={818} fontSize={11} textAnchor="middle" fontWeight={700} fill={lc?.room ? ROOM_COLOR[lc.room] : '#868e96'}>{id}</text>
                      <text x={x} y={832} fontSize={9} textAnchor="middle" className="lbl t-dim">{lc?.room && lc.room !== z ? cfg.roomNames[lc.room].slice(0, 6) : ''}</text>
                    </g>
                  );
                })}
                <text x={cx} y={852} fontSize={10} textAnchor="middle" className="lbl t-dim">
                  {loops.length} აქტ. · ≈{loops.length * 2}–{loops.length * 3} W · სარქველები მიწოდების კოლექტორზე
                </text>
              </g>
            );
          })}

          {/* power input */}
          <g className="comp" data-click="fuse" onClick={() => select('fuse')}>
            <rect x={1724} y={338} width={110} height={70} rx={6} fill="#fff" stroke="#495057" />
            <text x={1779} y={354} fontSize={10} textAnchor="middle" fontWeight={700} className="lbl">კვება 220V</text>
            <Term x={1748} y={384} label="L" live color={PIPE.wireL} />
            <Term x={1810} y={384} label="N" live color={PIPE.wireN} />
            <text x={1779} y={426} fontSize={10} textAnchor="middle" className="lbl">PE · ფუზი 15A</text>
          </g>
          <text x={1724} y={290} fontSize={10} className="lbl t-dim">← ქსელი (ელექტრიკოსი)</text>
          <path d="M1779,280 V338" stroke="#495057" strokeWidth={3} />

          {/* relay */}
          <g className={'comp' + (selected === 'relay' ? ' is-selected' : '')} data-click="relay" onClick={() => select('relay')}>
            <rect x={1850} y={338} width={120} height={120} rx={6} fill="#fff" stroke="#495057" />
            <text x={1910} y={354} fontSize={10} textAnchor="middle" fontWeight={700} className="lbl">ქვაბის რელე</text>
            <Term x={1876} y={384} label="NO" live={relay} color={PIPE.ta1} />
            <Term x={1940} y={384} label="COM" live={relay} color={PIPE.ta1} />
            <Term x={1908} y={430} label="NC" live={false} color="#adb5bd" />
            <text x={1910} y={474} fontSize={9} textAnchor="middle" className="lbl">NC — არ გამოიყენება</text>
          </g>
          <g className="comp" data-click="dip" onClick={() => select('dip')}>
            <rect x={1724} y={430} width={110} height={40} rx={6} fill="#fff3bf" stroke="#b08900" />
            <text x={1779} y={455} fontSize={10} textAnchor="middle" className="lbl">DIP {cfg.sim.relayDelayS / 60} წთ</text>
          </g>
          <g className="comp" data-click="pumpout" onClick={() => select('pumpout')}>
            <text x={1724} y={500} fontSize={10} className="lbl t-dim">ტუმბო L1/N1 — {cfg.sim.pumpOutputEnabled ? 'ჩართული' : 'არ გამოიყენება'}</text>
          </g>

          {/* relay → TA1 */}
          <Wire d="M1876,398 V560 H1880 V640" color={PIPE.ta1} live={relay} testid="cw-ta1" />
          <Wire d="M1940,398 V560 H1936 V640" color={PIPE.ta1} live={relay} />
          <g className={'comp' + (selected === 'terminals' ? ' is-selected' : '')} data-click="terminals" onClick={() => select('terminals')}>
            <rect x={1740} y={640} width={240} height={120} rx={10} fill="#fdfdfd" stroke="#adb5bd" strokeWidth={2} />
            <text x={1860} y={660} fontSize={12} textAnchor="middle" fontWeight={700} className="lbl">Ariston Genus ONE 24 · კლემები</text>
            {['BUS', 'FLOOR', 'SE'].map((t, k) => (
              <g key={t}>
                <rect x={1752 + k * 40} y={676} width={36} height={24} rx={3} fill="#fff" stroke="#868e96" />
                <text x={1770 + k * 40} y={692} fontSize={9} textAnchor="middle" className="lbl">{t}</text>
              </g>
            ))}
            <rect x={1872} y={672} width={96} height={32} rx={4} fill={relay ? '#ffd8a8' : '#fff'} stroke={PIPE.ta1} strokeWidth={2.5} />
            <text x={1920} y={692} fontSize={12} textAnchor="middle" fontWeight={800} className="lbl">TA1</text>
            <text x={1860} y={724} fontSize={10} textAnchor="middle" className="lbl">ქარხნული ჯამპერი მოხსნილი</text>
            <text x={1860} y={740} fontSize={10} textAnchor="middle" fill="#a33a00">მხოლოდ მშრალი კონტაქტი · 12V DC მხარე</text>
            <text x={1860} y={754} fontSize={10} textAnchor="middle" className="lbl">{relay ? 'დაკეტილი → ქვაბი ითხოვს გათბობას' : 'ღია → გათბობის მოთხოვნა არ არის'}</text>
          </g>
        </svg>
      </div>
      <ol className="cw-steps small">
        <li className={ZONES.some((z) => state.rooms[z].calling) ? 'on' : ''}>ოთახი ცივია → თერმოსტატი OUT კლემაზე აძლევს 230V სიგნალს (მწვანე ძარღვი) → ცენტრის Zn „სიგნ.“ შესასვლელი.</li>
        <li className={ZONES.some((z) => state.controller.zoneOut[z]) ? 'on' : ''}>ცენტრი რთავს Zn-ის აქტუატორის წყვილს (A~ L / A~ N) → ამ ოთახის ყველა აქტუატორი პარალელურად იღებს 230V-ს (ყავისფერი/ლურჯი).</li>
        <li className={Object.values(state.loops).some((l) => l.act.phase === 'opening') ? 'on' : ''}>აქტუატორი (NC) თბება და ≈3–5 წთ-ში ხსნის თავის სარქველს მიწოდების კოლექტორზე → ღერო მაღლა/მწვანე.</li>
        <li className={relay ? 'on' : ''}>DIP დაყოვნების შემდეგ რელეს COM–NO იკეტება → ორი ნარინჯისფერი სადენი → Ariston TA1.</li>
        <li className={state.boiler.mode === 'heating' ? 'on' : ''}>ქვაბი ირთვება; ცხელი წყალი მიდის მხოლოდ ღია სარქვლის კონტურებში.</li>
        <li>მიზანს რომ მიაღწევს: სიგნალი ქრება → ზონა ითიშება → აქტუატორები იხურება → (თუ სხვა ზონა არ ითხოვს) რელე იხსნება → ქვაბი ჩერდება.</li>
      </ol>
    </div>
  );
}
