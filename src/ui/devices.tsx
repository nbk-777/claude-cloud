// Detailed SVG device illustrations (generic shapes, not product artwork).
// Every component renders a <g> in local pixel coordinates so it can be embedded in any view
// (scaled down on the plan, full size in close-ups).

import type { ReactNode } from 'react';
import type { ActPhase, BoilerMode } from '../sim/engine';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// ── room thermostat ─────────────────────────────────────────────────────────

export interface ThermostatDeviceProps {
  uid: string;
  airC: number;
  setpointC: number;
  enabled: boolean;
  calling: boolean;
  sensorLost: boolean;
  cloudOffline: boolean;
  onPower?: () => void;
  onMinus?: () => void;
  onPlus?: () => void;
  testPrefix?: string;
}

/** Wall-mounted rounded-square smart thermostat. Local size 200 × 210. */
export function ThermostatDevice(p: ThermostatDeviceProps) {
  const on = p.enabled;
  const lcd = on ? '#0b2a5b' : '#05080d';
  const glow = '#bfe3ff';
  const stop = (f?: () => void) => (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    f?.();
  };
  return (
    <g className={`dev-thermostat${on ? ' is-on' : ' is-off'}${p.calling ? ' is-calling' : ''}`} data-lcd={on ? 'on' : 'off'} data-testid={p.testPrefix ? `${p.testPrefix}lcd` : undefined}>
      <defs>
        <linearGradient id={`tb-${p.uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9ecef" />
        </linearGradient>
      </defs>
      <rect x={4} y={6} width={192} height={202} rx={30} fill="#000" opacity={0.12} />
      <rect x={2} y={2} width={192} height={202} rx={30} fill={`url(#tb-${p.uid})`} stroke="#c3c9d0" strokeWidth={2} />
      <rect x={12} y={12} width={172} height={182} rx={22} fill="none" stroke="#dee2e6" strokeWidth={2} />
      {/* LCD */}
      <rect x={26} y={26} width={144} height={100} rx={8} fill={lcd} stroke="#1b1f24" strokeWidth={3} />
      {on && (
        <g>
          {/* wifi */}
          <g transform="translate(40,44)" opacity={p.cloudOffline ? 0.35 : 1}>
            <path d="M-9,-2 Q0,-11 9,-2" fill="none" stroke={glow} strokeWidth={2} />
            <path d="M-5.5,1.5 Q0,-4 5.5,1.5" fill="none" stroke={glow} strokeWidth={2} />
            <circle cx={0} cy={5} r={2} fill={glow} />
            {p.cloudOffline && <line x1={-10} y1={8} x2={10} y2={-10} stroke="#ff8787" strokeWidth={2.2} />}
          </g>
          {/* flame */}
          <path
            d="M155,52 C146,46 149,38 154,32 C155,38 160,38 158,30 C166,37 166,48 160,52 Z"
            fill={p.calling ? '#ff922b' : '#24406b'}
            stroke={p.calling ? '#ffd43b' : 'none'}
            className={p.calling ? 'lcd-flame lit' : 'lcd-flame'}
          />
          <text x={98} y={92} textAnchor="middle" fontSize={40} fontWeight={700} fill={glow} fontFamily="monospace">
            {p.sensorLost ? '--.-' : p.airC.toFixed(1)}
          </text>
          <text x={150} y={78} fontSize={12} fill={glow}>°C</text>
          <text x={34} y={116} fontSize={11} fill={glow} fontFamily="monospace">SET {p.setpointC.toFixed(1)}°</text>
          <text x={164} y={116} fontSize={10} fill={p.calling ? '#ffd8a8' : glow} textAnchor="end">
            {p.sensorLost ? 'Er სენს.' : p.calling ? 'გათბობა' : 'მოლოდინი'}
          </text>
        </g>
      )}
      {/* buttons */}
      <Btn x={58} y={162} label="⏻" active={on} onClick={stop(p.onPower)} testid={p.testPrefix ? `${p.testPrefix}power` : undefined} aria="ჩართვა/გამორთვა" />
      <Btn x={98} y={162} label="−" onClick={stop(p.onMinus)} testid={p.testPrefix ? `${p.testPrefix}minus` : undefined} aria="−0.5 °C" />
      <Btn x={138} y={162} label="+" onClick={stop(p.onPlus)} testid={p.testPrefix ? `${p.testPrefix}plus` : undefined} aria="+0.5 °C" />
    </g>
  );
}

function Btn({ x, y, label, onClick, active, testid, aria }: { x: number; y: number; label: string; onClick: (e: { stopPropagation: () => void }) => void; active?: boolean; testid?: string; aria: string }) {
  return (
    <g className="dev-btn" onClick={onClick} data-testid={testid} role="button" aria-label={aria} tabIndex={0}>
      <circle cx={x} cy={y + 2} r={15} fill="#000" opacity={0.12} />
      <circle cx={x} cy={y} r={15} fill="#f8f9fa" stroke="#adb5bd" strokeWidth={1.5} />
      <text x={x} y={y + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill={active ? '#2b8a3e' : '#343a40'}>
        {label}
      </text>
    </g>
  );
}

// ── thermal actuator (230V NC, M30×1.5) ─────────────────────────────────────

export interface ActuatorDeviceProps {
  x: number;
  y: number; // point where the valve body sits on the bar (bottom-centre)
  pos: number;
  cmd: boolean;
  phase: ActPhase;
  selected?: boolean;
  onClick?: () => void;
  testid?: string;
}

/** White cylinder with cap, blue ring, label, 2-wire cable, brass body, rising indicator pin. */
export function ActuatorDevice({ x, y, pos, cmd, phase, selected, onClick, testid }: ActuatorDeviceProps) {
  const p = clamp01(pos);
  const pinH = 3 + 11 * p;
  const pinCol = p >= 0.98 ? '#2f9e44' : p > 0.02 ? `rgb(${Math.round(173 - 126 * p)},${Math.round(181 - 23 * p)},${Math.round(189 - 121 * p)})` : '#adb5bd';
  return (
    <g transform={`translate(${x},${y})`} className={`dev-actuator act-${phase}${selected ? ' is-selected' : ''}`} onClick={onClick} data-testid={testid} data-pos={p.toFixed(2)} data-power={cmd ? '1' : '0'} role="button" tabIndex={0}>
      {/* 2-wire cable */}
      <path d="M-14,-46 C-30,-46 -30,-30 -34,-12" fill="none" stroke="#8d5524" strokeWidth={2.4} className={cmd ? 'cable-live' : ''} />
      <path d="M-14,-42 C-26,-42 -26,-28 -29,-12" fill="none" stroke="#1c7ed6" strokeWidth={2.4} className={cmd ? 'cable-live' : ''} />
      {/* brass valve body / M30×1.5 nut */}
      <rect x={-17} y={-15} width={34} height={15} rx={2} fill="#d4a93f" stroke="#8a6d1e" />
      {[-11, -5, 1, 7].map((k) => (
        <line key={k} x1={k} y1={-15} x2={k + 3} y2={0} stroke="#a8842c" strokeWidth={1} />
      ))}
      {/* white body */}
      <rect x={-15} y={-64} width={30} height={50} rx={5} fill="#fdfdfd" stroke="#adb5bd" strokeWidth={1.4} />
      <rect x={-15} y={-27} width={30} height={6} fill="#1c7ed6" />
      <text x={0} y={-36} fontSize={6.3} textAnchor="middle" fill="#495057" fontWeight={700}>230V NC</text>
      {/* cap */}
      <rect x={-12} y={-72} width={24} height={10} rx={5} fill="#f1f3f5" stroke="#adb5bd" />
      {/* indicator pin */}
      <rect x={-3} y={-72 - pinH} width={6} height={pinH} rx={2} fill={pinCol} stroke="#495057" strokeWidth={0.6} className="act-pin" />
      {/* power dot */}
      <circle cx={9} cy={-55} r={3} fill={cmd ? '#e03131' : '#dee2e6'} stroke="#868e96" strokeWidth={0.5} />
      {phase === 'fault' && (
        <text x={0} y={-48} fontSize={11} textAnchor="middle" fill="#c92a2a" fontWeight={800}>!</text>
      )}
      <text x={0} y={-90} fontSize={8} textAnchor="middle" fill="#343a40" className="act-pct">{Math.round(p * 100)}%</text>
      {selected && <rect x={-20} y={-100} width={40} height={102} rx={6} fill="none" stroke="#e8590c" strokeWidth={2} />}
    </g>
  );
}

// ── flow meter ──────────────────────────────────────────────────────────────

/** Transparent tube with red float (rises with flow) and red cap. Bottom-centre at (x,y). */
export function FlowMeterDevice({ x, y, flowLpm, maxLpm = 2 }: { x: number; y: number; flowLpm: number; maxLpm?: number }) {
  const f = clamp01(flowLpm / maxLpm);
  return (
    <g transform={`translate(${x},${y})`} className="dev-flowmeter" data-float={f.toFixed(2)}>
      <rect x={-8} y={-10} width={16} height={10} fill="#d4a93f" stroke="#8a6d1e" />
      <rect x={-6} y={-66} width={12} height={56} rx={3} fill="rgba(208,235,255,0.55)" stroke="#74c0fc" />
      {[0, 1, 2, 3, 4].map((k) => (
        <line key={k} x1={3} y1={-16 - k * 11} x2={6} y2={-16 - k * 11} stroke="#1971c2" strokeWidth={0.8} />
      ))}
      <rect x={-4} y={-20 - 40 * f} width={8} height={7} rx={1.5} fill="#e03131" className="float" />
      <rect x={-7.5} y={-74} width={15} height={9} rx={2} fill="#e03131" stroke="#a61e1e" />
    </g>
  );
}

// ── dial gauge ──────────────────────────────────────────────────────────────

export function GaugeDevice({ x, y, r = 22, value, min, max, label, unit }: { x: number; y: number; r?: number; value: number; min: number; max: number; label: string; unit: string }) {
  const a = -225 + 270 * clamp01((value - min) / (max - min));
  const rad = (d: number) => (d * Math.PI) / 180;
  return (
    <g transform={`translate(${x},${y})`} className="dev-gauge">
      <circle r={r + 3} fill="#d4a93f" stroke="#8a6d1e" />
      <circle r={r} fill="#fff" stroke="#868e96" />
      {Array.from({ length: 10 }, (_, i) => -225 + i * 30).map((d) => (
        <line key={d} x1={Math.cos(rad(d)) * (r - 2)} y1={Math.sin(rad(d)) * (r - 2)} x2={Math.cos(rad(d)) * (r - 6)} y2={Math.sin(rad(d)) * (r - 6)} stroke="#495057" strokeWidth={1} />
      ))}
      <line x1={0} y1={0} x2={Math.cos(rad(a)) * (r - 5)} y2={Math.sin(rad(a)) * (r - 5)} stroke="#c92a2a" strokeWidth={2} />
      <circle r={2.5} fill="#343a40" />
      <text y={r * 0.55} fontSize={r * 0.32} textAnchor="middle" fill="#343a40">{label}</text>
      <text y={r + 14} fontSize={10} textAnchor="middle" fill="#343a40">{unit}</text>
    </g>
  );
}

// ── boiler front panel ──────────────────────────────────────────────────────

export interface BoilerFrontProps {
  mode: BoilerMode;
  flowC: number;
  burnerOn: boolean;
  chSetpointC: number;
  chRange: 'low' | 'high';
  ta1Closed: boolean;
  fault: boolean;
  pumpOn: boolean;
  onPart?: (id: string) => void;
}

const MODE_LCD: Record<BoilerMode, string> = { standby: 'მოლოდინი', heating: 'გათბობა', dhw: 'ცხ. წყალი', overrun: 'ტუმბო', fault: 'ERR 116' };

/** Wall-hung combi boiler, front view. Local size 240 × 380 (incl. bottom pipe stubs). */
export function BoilerFrontDevice(p: BoilerFrontProps) {
  const part = (id: string) => ({ 'data-click': id, onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); p.onPart?.(id); }, role: 'button' as const, className: 'comp' });
  const [lo, hi] = p.chRange === 'low' ? [20, 45] : [35, 82];
  const knobA = -135 + 270 * clamp01((p.chSetpointC - lo) / (hi - lo));
  return (
    <g className={`dev-boiler mode-${p.mode}`} data-testid="boiler-front" data-burner={p.burnerOn ? '1' : '0'}>
      {/* bottom pipe stubs A–E */}
      {[
        ['A', 48, '#e03131'],
        ['B', 84, '#f76707'],
        ['C', 120, '#fab005'],
        ['D', 156, '#0c8599'],
        ['E', 192, '#4c8de0'],
      ].map(([k, x, c]) => (
        <g key={k as string} {...part('pipe' + k)}>
          <rect x={(x as number) - 6} y={330} width={12} height={44} fill={c as string} stroke="#495057" />
          <rect x={(x as number) - 9} y={340} width={18} height={8} fill="#d4a93f" stroke="#8a6d1e" />
          <text x={x as number} y={392} fontSize={12} textAnchor="middle" fontWeight={700}>{k}</text>
        </g>
      ))}
      <g {...part('boiler')}>
        <rect x={4} y={6} width={236} height={330} rx={16} fill="#000" opacity={0.12} />
        <rect x={0} y={0} width={236} height={330} rx={16} fill="#fdfdfd" stroke="#adb5bd" strokeWidth={2} />
        <rect x={0} y={0} width={14} height={330} rx={8} fill="#f1f3f5" />
        <text x={24} y={36} fontSize={21} fontWeight={800} letterSpacing={2} fill="#1c3d5a">ARISTON</text>
        <text x={24} y={54} fontSize={11} fill="#495057" letterSpacing={1}>GENUS ONE 24</text>
      </g>
      {/* flame window */}
      <g {...part('hx')}>
        <rect x={84} y={84} width={68} height={70} rx={10} fill="#212529" stroke="#868e96" />
        <path d="M104,146 C92,130 102,116 112,102 C112,114 120,116 118,100 C134,114 136,134 128,146 Z" fill={p.burnerOn ? '#ff922b' : '#343a40'} stroke={p.burnerOn ? '#ffd43b' : '#495057'} className={p.burnerOn ? 'boiler-flame lit' : 'boiler-flame'} />
        {p.burnerOn && <path d="M112,146 C106,138 110,130 116,122 C118,132 124,134 122,146 Z" fill="#4dabf7" opacity={0.9} />}
      </g>
      {/* pressure gauge (pressure is not simulated) */}
      <g {...part('pressure')}>
        <GaugeDevice x={190} y={118} r={22} value={1.5} min={0} max={4} label="bar" unit="1.5* ბარი" />
      </g>
      {/* control panel */}
      <rect x={14} y={212} width={208} height={78} rx={10} fill="#e9ecef" stroke="#ced4da" />
      <g {...part('boiler')}>
        <rect x={24} y={222} width={118} height={56} rx={6} fill="#0b2a5b" stroke="#1b1f24" strokeWidth={2} />
        <text x={34} y={256} fontSize={26} fontWeight={700} fill="#bfe3ff" fontFamily="monospace">{Math.round(p.flowC)}°</text>
        <text x={34} y={272} fontSize={10} fill={p.fault ? '#ff8787' : '#bfe3ff'}>{MODE_LCD[p.mode]}</text>
        <path d="M126,250 C120,246 122,240 125,236 C126,240 129,240 128,235 C133,240 133,247 129,250 Z" fill={p.burnerOn ? '#ff922b' : '#24406b'} />
        {p.pumpOn && <text x={124} y={272} fontSize={10} fill="#bfe3ff">⟳</text>}
      </g>
      <g className="knob" aria-label="t° სახელური">
        <circle cx={182} cy={250} r={22} fill="#f8f9fa" stroke="#868e96" strokeWidth={2} />
        <circle cx={182} cy={250} r={16} fill="#fff" stroke="#ced4da" />
        <line x1={182} y1={250} x2={182 + Math.cos(((knobA - 90) * Math.PI) / 180) * 14} y2={250 + Math.sin(((knobA - 90) * Math.PI) / 180) * 14} stroke="#e03131" strokeWidth={3} strokeLinecap="round" />
        <text x={182} y={284} fontSize={9} textAnchor="middle">{p.chSetpointC}°</text>
      </g>
      {/* terminal strip */}
      <g {...part('terminals')} data-testid="boiler-terminals">
        <rect x={18} y={298} width={200} height={30} rx={4} fill="#f8f9fa" stroke="#868e96" />
        {[
          ['BUS', 24, false],
          ['FLOOR/TA2', 64, p.fault],
          ['SE', 124, false],
          ['TA1', 160, p.ta1Closed],
        ].map(([k, x, on]) => (
          <g key={k as string}>
            <rect x={x as number} y={302} width={k === 'FLOOR/TA2' ? 56 : k === 'TA1' ? 52 : 34} height={14} rx={2} fill={k === 'TA1' ? (on ? '#ffd8a8' : '#fff') : k === 'FLOOR/TA2' && on ? '#ffc9c9' : '#fff'} stroke={k === 'TA1' ? '#e8590c' : '#868e96'} strokeWidth={k === 'TA1' ? 2 : 1} />
            <text x={(x as number) + 3} y={313} fontSize={8} fontWeight={700}>{k as string}</text>
          </g>
        ))}
        <circle cx={198} cy={309} r={2.2} fill="#495057" />
        <circle cx={206} cy={309} r={2.2} fill="#495057" />
        <text x={118} y={325} fontSize={7.5} textAnchor="middle" fill="#a33a00">TA1 = მშრალი კონტაქტი · ჯამპერი მოხსნილი · არა 230V</text>
      </g>
    </g>
  );
}

// ── shower ──────────────────────────────────────────────────────────────────

export function ShowerDevice({ on, hot, children }: { on: boolean; hot: boolean; children?: ReactNode }) {
  const water = hot ? '#f76707' : '#0c8599';
  return (
    <g className={`dev-shower${on ? ' is-on' : ''}`} data-testid="shower-device" data-on={on ? '1' : '0'}>
      <path d="M0,60 L0,0 L30,0 L30,12" fill="none" stroke="#adb5bd" strokeWidth={5} strokeLinecap="round" />
      <path d="M14,12 L46,12 L40,22 L20,22 Z" fill="#dee2e6" stroke="#868e96" />
      {[18, 24, 30, 36, 42].map((dx, i) =>
        on ? (
          <line key={dx} x1={dx - 2} y1={26} x2={dx - 6} y2={64} stroke={water} strokeWidth={2} strokeDasharray="5 6" className="drops" style={{ animationDelay: `${i * 0.1}s` }} />
        ) : null,
      )}
      <rect x={-8} y={60} width={16} height={22} rx={3} fill="#e9ecef" stroke="#868e96" />
      <circle cx={0} cy={71} r={5} fill="#fff" stroke="#495057" />
      {children}
    </g>
  );
}
