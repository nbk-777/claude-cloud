import { LOOP_IDS, ZONES, controlZoneOf, type AppConfig, type RoomId } from '../model/types';
import type { SimState } from '../sim/engine';
import { ka } from '../i18n/ka';
import { ROOM_COLOR, fmt, waterColor } from './util';
import { ActuatorDevice, BoilerFrontDevice, FlowMeterDevice, GaugeDevice } from './devices';

interface Props {
  cfg: AppConfig;
  state: SimState;
  select: (id: string) => void;
  selected: string | null;
}

const X0 = 360;
const DX = 64;
const SUP_Y = 262;
const RET_Y = 430;
const portX = (i: number) => X0 + i * DX;

/**
 * Manifold close-up. Per the user's brief: actuators on the FLOW (supply) bar, blue manual caps
 * on the return bar; flow meters drawn on the return bar (position = assumption).
 */
export function ManifoldView({ cfg, state, select, selected }: Props) {
  const b = state.boiler;
  const heating = b.mode === 'heating' && b.pumpOn;
  const chFlow = b.pumpOn && b.diverter === 'CH' && Object.values(state.loops).some((l) => l.flowing);
  const hot = waterColor(b.flowC);
  const cool = waterColor(b.returnC);

  // brackets: consecutive ports belonging to the same room
  const runs: { room: RoomId | null; from: number; to: number }[] = [];
  LOOP_IDS.forEach((id, i) => {
    const room = cfg.loops.find((l) => l.id === id)?.room ?? null;
    const last = runs[runs.length - 1];
    if (last && last.room === room) last.to = i;
    else runs.push({ room, from: i, to: i });
  });

  return (
    <div className="view-wrap">
      <svg viewBox="0 0 1300 700" className="manifold-view" data-testid="manifold-view" data-heating={heating ? '1' : '0'}>
        <defs>
          <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1d27a" />
            <stop offset="0.5" stopColor="#d4a93f" />
            <stop offset="1" stopColor="#9c7a26" />
          </linearGradient>
        </defs>
        <text x={20} y={28} fontSize={18} fontWeight={700}>{ka.manifoldView.title}</text>
        <text x={20} y={48} fontSize={12} className="t-dim">{ka.manifoldView.actNote}</text>

        {/* boiler (compact) + feed pipes */}
        <g transform="translate(24,96) scale(0.62)">
          <BoilerFrontDevice mode={b.mode} flowC={b.flowC} burnerOn={b.burnerOn} chSetpointC={cfg.sim.chSetpointC} chRange={cfg.sim.chRange} ta1Closed={state.controller.ta1Closed} fault={!!b.fault} pumpOn={b.pumpOn} onPart={select} />
        </g>
        <g data-click="pipeA" onClick={() => select('pipeA')} className="comp">
          <polyline points={`54,328 54,600 270,600 270,${SUP_Y + 12} 318,${SUP_Y + 12}`} className={'xpipe' + (chFlow ? ' flow-anim xpipe-flow' : '')} stroke={chFlow ? hot : '#c9a3a0'} />
          <text x={60} y={620} fontSize={12}>A → მიწოდება {fmt(b.flowC)}°C</text>
        </g>
        <g data-click="pipeE" onClick={() => select('pipeE')} className="comp">
          <polyline points={`318,${RET_Y + 12} 250,${RET_Y + 12} 250,580 143,580 143,328`} className={'xpipe' + (chFlow ? ' flow-anim xpipe-flow' : '')} stroke={chFlow ? cool : '#a3b5c9'} />
          <text x={150} y={572} fontSize={12}>E ← დაბრუნება {fmt(b.returnC)}°C</text>
        </g>
        <text x={60} y={640} fontSize={11} className="t-dim">⋯ მილის მარშრუტი აივნიდან კოლექტორამდე უცნობია</text>

        {/* supply loop pipes (drawn first: they pass behind the return bar) */}
        {LOOP_IDS.map((id, i) => {
          const ls = state.loops[id];
          return (
            <line key={'s' + id} x1={portX(i) - 14} y1={SUP_Y + 24} x2={portX(i) - 14} y2={600} stroke={ls?.flowing ? hot : '#ced4da'} strokeWidth={8} className={ls?.flowing ? 'flow-anim port-flow' : ''} />
          );
        })}

        {/* supply bar */}
        <g data-click="manifold" onClick={() => select('manifold')} className="comp">
          <rect x={318} y={SUP_Y} width={930} height={24} rx={11} fill="url(#brass)" stroke="#8a6d1e" data-testid="supply-bar" />
          <rect x={318} y={SUP_Y} width={930} height={24} rx={11} fill="#e03131" opacity={heating ? 0.75 : 0} className="bar-tint" />
          <rect x={300} y={SUP_Y + 2} width={20} height={20} fill="#c92a2a" rx={3} />
          <text x={318} y={SUP_Y - 116} fontSize={12}>{ka.manifoldView.supply}</text>
          <text x={318} y={SUP_Y + 92} fontSize={10} className="t-dim">⚡ = ბრძანება (ძაბვა) · ასო = სიმ. მდგომარეობა · ▼ = ნაკადი L/წთ*</text>
        </g>
        <GaugeDevice x={1270} y={SUP_Y - 20} r={20} value={b.flowC} min={0} max={80} label="°C" unit={`${fmt(b.flowC)}°`} />

        {/* return bar */}
        <g data-click="manifold" onClick={() => select('manifold')} className="comp">
          <rect x={318} y={RET_Y} width={930} height={24} rx={11} fill="url(#brass)" stroke="#8a6d1e" data-testid="return-bar" />
          <rect x={318} y={RET_Y} width={930} height={24} rx={11} fill="#fd7e14" opacity={heating ? 0.75 : 0} className="bar-tint" />
          <rect x={300} y={RET_Y + 2} width={20} height={20} fill="#1971c2" rx={3} />
          <text x={318} y={RET_Y - 92} fontSize={11}>{ka.manifoldView.ret}</text>
        </g>
        <GaugeDevice x={1270} y={RET_Y + 52} r={20} value={b.returnC} min={0} max={80} label="°C" unit={`${fmt(b.returnC)}°`} />

        {LOOP_IDS.map((id, i) => {
          const lc = cfg.loops.find((l) => l.id === id)!;
          const ls = state.loops[id];
          const a = ls?.act ?? { cmd: false, pos: 0, phase: 'closed' as const, deadS: 0 };
          const x = portX(i);
          const color = lc.room ? ROOM_COLOR[lc.room] : '#999';
          const zone = controlZoneOf(lc.room, cfg.owners);
          const warming = a.cmd && a.deadS < cfg.sim.actuatorDelayS && a.pos < 1;
          return (
            <g key={id} className={`port-col phase-${a.phase}${ls?.flowing ? ' is-flowing' : ''}`} data-testid={`port-${id}`} data-phase={a.phase} data-cmd={a.cmd ? '1' : '0'}>
              <ActuatorDevice x={x - 14} y={SUP_Y} pos={a.pos} cmd={a.cmd} phase={a.phase} selected={selected === 'actuator:' + id} onClick={() => select('actuator:' + id)} testid={`act-${id}`} />
              {warming && <text x={x - 14} y={SUP_Y - 104} fontSize={9} textAnchor="middle" className="t-warn">თბება</text>}
              {/* return valve: flow meter on top, blue manual cap on the bar front */}
              <FlowMeterDevice x={x + 12} y={RET_Y} flowLpm={ls?.flowLpm ?? 0} />
              <circle cx={x + 12} cy={RET_Y + 12} r={8} fill="#1c7ed6" stroke="#0b4f8a" />
              <line x1={x + 12} y1={RET_Y + 24} x2={x + 12} y2={600} stroke={ls?.flowing ? cool : '#ced4da'} strokeWidth={8} className={ls?.flowing ? 'flow-anim port-flow' : ''} />
              {/* loop tag */}
              <g data-click={'loop:' + id} onClick={() => select('loop:' + id)} className="comp">
                <rect x={x - 26} y={604} width={52} height={22} rx={5} fill="#fff" stroke={color} strokeWidth={2} />
                <text x={x} y={620} fontSize={13} textAnchor="middle" fontWeight={700} fill={color}>
                  {id}
                </text>
              </g>
              <text x={x} y={SUP_Y + 50} fontSize={9} textAnchor="middle">
                {a.cmd ? '⚡' : '–'} {ka.phaseLetter[a.phase]}
              </text>
              <text x={x} y={SUP_Y + 64} fontSize={9} textAnchor="middle" className={a.phase === 'fault' ? 't-warn' : 't-dim'}>
                {ls?.flowing ? `▼ ${fmt(ls.flowLpm)}` : a.phase === 'fault' ? '✕ 0' : '—'}
              </text>
              <text x={x} y={SUP_Y + 78} fontSize={9} textAnchor="middle" className="t-dim">
                {zone ? `Z${ZONES.indexOf(zone) + 1}` : '—'}
              </text>
            </g>
          );
        })}

        {/* brackets grouping loops by room */}
        {runs.map((r) => {
          const x1 = portX(r.from) - 28;
          const x2 = portX(r.to) + 28;
          const c = r.room ? ROOM_COLOR[r.room] : '#999';
          return (
            <g key={r.from}>
              <path d={`M${x1},634 L${x1},644 L${x2},644 L${x2},634`} fill="none" stroke={c} strokeWidth={2.5} />
              <text x={(x1 + x2) / 2} y={662} fontSize={12} textAnchor="middle" fill={c} fontWeight={700}>
                {r.room ? cfg.roomNames[r.room] : ka.manifoldView.unassigned}
              </text>
            </g>
          );
        })}
        <text x={1248} y={690} fontSize={10} textAnchor="end" className="t-dim">{ka.manifoldView.flowIllu} · წნევა არ არის სიმულირებული (*)</text>
      </svg>
      <div className="view-notes">
        <p className="t-warn">{ka.manifoldView.note}</p>
        <p>
          ინდიკატორის ღერო აქტუატორზე: დაბალი/ნაცრისფერი = დახურული, მაღლა/მწვანე = ღია · წითელი წერტილი = ძაბვა მიწოდებულია · % = სიმ. გახსნა. C = დახურული · O↑ = იღება · O = ღია · C↓ = იხურება · F! = ბრძანება „გახსენი“, ნაკადი არ არის.
        </p>
      </div>
    </div>
  );
}
