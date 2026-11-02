// "Equipment & installation" page: the balcony boiler with its connection kit, the wall
// passage, the manifold cabinet with actuators/flow meters, the wiring centre, the four room
// thermostats and the bathroom shower — one realistic, labelled scene with a fixed colour code.
// It shows WHAT connects to WHAT. It is not a gas/flue/condensate/electrical installation guide.

import type { ReactNode } from 'react';
import { LOOP_IDS, ZONES, type AppConfig, type ZoneId } from '../model/types';
import type { SimState } from '../sim/engine';
import { ka } from '../i18n/ka';
import { ROOM_COLOR, fmt } from './util';
import { PIPE } from './palette';
import { ControlWiringDiagram } from './ControlWiringDiagram';
import { ActuatorDevice, BoilerFrontDevice, FlowMeterDevice, GaugeDevice, ShowerDevice, ThermostatDevice } from './devices';

interface Props {
  cfg: AppConfig;
  state: SimState;
  select: (id: string) => void;
  selected: string | null;
  setThermostat: (z: ZoneId, patch: Partial<{ enabled: boolean; setpointC: number }>) => void;
  setShower: (on: boolean) => void;
}

type Pt = [number, number];
const pl = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

// boiler placement (front device is 240 × 392 local, scaled 1.15)
const BX = 150;
const BY = 150;
const BS = 1.15;
const stub = (localX: number): number => BX + localX * BS;
const STUB_Y = BY + 374 * BS; // bottom of the A–E stubs
const WALL_X = 640;

/** Ball valve with lever handle (handle colour = medium). */
function BallValve({ x, y, color, label, id, select, vertical = true }: { x: number; y: number; color: string; label?: string; id: string; select: (id: string) => void; vertical?: boolean }) {
  return (
    <g className="comp" data-click={id} onClick={() => select(id)} transform={`translate(${x},${y})`}>
      <rect x={vertical ? -9 : -14} y={vertical ? -14 : -9} width={vertical ? 18 : 28} height={vertical ? 28 : 18} rx={4} fill="url(#ibrass)" stroke="#8a6d1e" />
      <circle r={5} fill="#d4a93f" stroke="#8a6d1e" />
      <rect x={-3} y={-30} width={6} height={22} rx={2} fill={color} stroke="#495057" strokeWidth={0.6} transform={vertical ? 'rotate(90)' : ''} />
      {label && (
        <text x={vertical ? 14 : 0} y={vertical ? 4 : 26} fontSize={11} textAnchor={vertical ? 'start' : 'middle'} className="lbl">
          {label}
        </text>
      )}
    </g>
  );
}

/** Callout: leader line + label text with a white halo. */
function Callout({ x, y, tx, ty, children, anchor = 'start', n }: { x: number; y: number; tx: number; ty: number; children: ReactNode; anchor?: 'start' | 'end' | 'middle'; n?: number }) {
  return (
    <g className="callout" pointerEvents="none">
      <line x1={x} y1={y} x2={tx} y2={ty} stroke="#495057" strokeWidth={1} />
      <circle cx={x} cy={y} r={2.5} fill="#495057" />
      <text x={tx + (anchor === 'start' ? 4 : anchor === 'end' ? -4 : 0)} y={ty + 4} fontSize={12.5} textAnchor={anchor} className="lbl lbl-halo">
        {n !== undefined ? `${n}. ` : ''}
        {children}
      </text>
    </g>
  );
}

export function InstallView({ cfg, state, select, selected, setThermostat, setShower }: Props) {
  const b = state.boiler;
  const chFlow = b.pumpOn && b.diverter === 'CH' && Object.values(state.loops).some((l) => l.flowing);
  const dhwOn = b.mode === 'dhw';
  const showerOn = state.dhw.showerOn;
  const relay = state.controller.ta1Closed;
  const pipe = (active: boolean) => 'ipipe2' + (active ? ' flow-anim ipipe2-flow' : ' idle');
  const sel = (id: string) => (selected === id ? ' is-selected' : '');

  // manifold geometry (inside)
  const MX = 880;
  const MDX = 30;
  const SUP_Y = 520;
  const RET_Y = 640;
  const px = (i: number) => MX + 40 + i * MDX;
  const mEnd = px(13) + 40;

  // pipe routes
  const A: Pt[] = [[stub(48), STUB_Y], [stub(48), 760], [WALL_X, 760], [830, 760], [830, SUP_Y + 10], [MX, SUP_Y + 10]];
  const E: Pt[] = [[MX, RET_Y + 10], [850, RET_Y + 10], [850, 790], [WALL_X, 790], [stub(192), 790], [stub(192), STUB_Y]];
  const B: Pt[] = [[stub(84), STUB_Y], [stub(84), 820], [WALL_X, 820], [1590, 820], [1590, 760], [1618, 760]];
  const D_toBoiler: Pt[] = [[1760, 900], [1640, 900], [1640, 850], [WALL_X, 850], [stub(156), 850], [stub(156), STUB_Y]];
  const D_toShower: Pt[] = [[1640, 850], [1640, 790], [1670, 790], [1670, 760], [1648, 760]];
  const C: Pt[] = [[stub(120), STUB_Y], [stub(120), 905]];
  const I: Pt[] = [[BX + 30 * BS, BY + 330 * BS], [BX + 30 * BS, 700], [100, 700], [100, 905]];

  const ta1Pt: Pt = [BX + 186 * BS, BY + 309 * BS];

  return (
    <div className="view-wrap install" data-testid="install-view">
      <div className="install-head">
        <div className="pipe-legend" aria-label="ფერების კოდი">
          <span><i style={{ background: PIPE.flow }} /> გათბობის მიწოდება (A) — ცხელი</span>
          <span><i style={{ background: PIPE.ret }} /> გათბობის დაბრუნება (E) — გაცივებული</span>
          <span><i style={{ background: PIPE.dhw }} /> ცხელი სამომხმარებლო წყალი (B)</span>
          <span><i style={{ background: PIPE.cold }} /> ცივი წყალი (D)</span>
          <span><i style={{ background: PIPE.gas }} /> გაზი (C) — კონტექსტი</span>
          <span><i style={{ background: PIPE.cond }} /> კონდენსატი (I)</span>
          <span><i style={{ background: PIPE.wireS }} /> თერმოსტატის სიგნალი</span>
          <span><i style={{ background: PIPE.ta1 }} /> რელე → TA1</span>
          <span className="t-dim">მოძრავი ზოლები = ახლა მოედინება · მქრქალი = უმოქმედო</span>
        </div>
        <label className="check">
          <input type="checkbox" id="install-shower" checked={showerOn} onChange={(e) => setShower(e.target.checked)} data-testid="install-shower" />
          🚿 ცხელი წყლის მოხმარება (შხაპი)
        </label>
      </div>

      <svg viewBox="0 0 1800 960" className="install-svg" data-testid="install-svg" data-ch={chFlow ? '1' : '0'} data-dhw={dhwOn ? '1' : '0'}>
        <defs>
          <linearGradient id="ibrass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f1d27a" />
            <stop offset="0.5" stopColor="#d4a93f" />
            <stop offset="1" stopColor="#9c7a26" />
          </linearGradient>
          <pattern id="brick" width="40" height="20" patternUnits="userSpaceOnUse">
            <rect width="40" height="20" fill="#cfc4b0" />
            <path d="M0,10 H40 M20,0 V10 M0,10 V20 M40,10 V20" stroke="#b3a68d" strokeWidth="1.2" />
          </pattern>
          <pattern id="tiles" width="30" height="30" patternUnits="userSpaceOnUse">
            <rect width="30" height="30" fill="#eef4f8" />
            <path d="M0,0 H30 V30" fill="none" stroke="#d5e3ec" strokeWidth="1" />
          </pattern>
        </defs>

        {/* ── zones ─────────────────────────────────────────────── */}
        <rect x={0} y={0} width={WALL_X - 10} height={960} fill="#e7eef5" />
        <text x={16} y={28} fontSize={18} fontWeight={700} className="lbl">აივანი (გარეთ)</text>
        <text x={16} y={48} fontSize={12} className="lbl t-dim">გარე t° {cfg.sim.outdoorC}°C (სლაიდერი ქვემოთ)</text>
        <rect x={WALL_X + 30} y={0} width={1800 - WALL_X - 30} height={960} fill="#faf8f3" />
        <text x={WALL_X + 46} y={28} fontSize={18} fontWeight={700} className="lbl">ბინის შიგნით · ჰოლი (კოლექტორის ადგილი — დაშვება)</text>
        {/* wall */}
        <g className="comp" data-click="wallPass" onClick={() => select('wallPass')}>
          <rect x={WALL_X - 10} y={0} width={40} height={960} fill="url(#brick)" stroke="#8c7f66" />
          <text x={WALL_X + 10} y={480} fontSize={12} textAnchor="middle" transform={`rotate(-90 ${WALL_X + 10} 480)`} className="lbl">გარე კედელი · მილების/კაბელის გასასვლელი</text>
        </g>
        {/* floor */}
        <rect x={0} y={905} width={1800} height={55} fill="#d9d2c3" />

        {/* ── balcony: thermo-cabinet ─────────────────────────── */}
        <g className={'comp' + sel('cabinet')} data-click="cabinet" onClick={() => select('cabinet')}>
          <rect x={60} y={70} width={520} height={810} rx={8} fill="#f4f7fa" stroke="#3b5b78" strokeWidth={4} />
          <rect x={72} y={82} width={496} height={786} rx={4} fill="none" stroke="#c5d3df" strokeWidth={10} opacity={0.7} />
          {/* opened door */}
          <path d="M60,70 L20,100 L20,850 L60,880 Z" fill="#dfe7ee" stroke="#3b5b78" strokeWidth={3} />
          <rect x={30} y={440} width={8} height={40} rx={3} fill="#495057" />
        </g>
        <Callout x={40} y={240} tx={14} ty={66} anchor="start" n={1}>თერმო-კარადა</Callout>

        {/* flue (context only) */}
        <g className="comp" data-click="flue" onClick={() => select('flue')}>
          <rect x={BX + 100 * BS} y={20} width={44} height={BY - 20} fill="#ced4da" stroke="#868e96" />
          <rect x={BX + 100 * BS + 10} y={20} width={24} height={BY - 20} fill="#e9ecef" stroke="#adb5bd" />
          <text x={BX + 100 * BS + 52} y={50} fontSize={12} className="lbl">საკვამური — მხოლოდ კონტექსტი</text>
        </g>

        {/* electrical isolator (context) */}
        <g className="comp" data-click="isolator" onClick={() => select('isolator')}>
          <rect x={470} y={120} width={60} height={70} rx={6} fill="#fff" stroke="#868e96" />
          <rect x={490} y={140} width={20} height={30} rx={3} fill="#e03131" />
          <path d={`M500,190 L500,${BY + 20} L${BX + 236 * BS},${BY + 20}`} fill="none" stroke="#343a40" strokeWidth={3} />
        </g>
        <Callout x={500} y={190} tx={440} ty={214} anchor="start" n={2}>ჩამრთველი 230V</Callout>

        {/* boiler */}
        <g transform={`translate(${BX},${BY}) scale(${BS})`} className={sel('boiler')}>
          <BoilerFrontDevice mode={b.mode} flowC={b.flowC} burnerOn={b.burnerOn} chSetpointC={cfg.sim.chSetpointC} chRange={cfg.sim.chRange} ta1Closed={relay} fault={!!b.fault} pumpOn={b.pumpOn} onPart={select} />
        </g>
        <Callout x={BX + 236 * BS} y={BY + 110} tx={BX + 236 * BS + 18} ty={BY + 90} n={3}>
          ქვაბი Genus ONE 24
        </Callout>
        <Callout x={BX + 120 * BS} y={BY + 250 * BS} tx={BX + 236 * BS + 18} ty={BY + 262 * BS} n={4}>
          დისპლეი {Math.round(b.flowC)}°C · {ka.mode[b.mode]}
        </Callout>
        <Callout x={BX + 190 * BS} y={BY + 118 * BS} tx={BX + 236 * BS + 18} ty={BY + 150 * BS} n={5}>
          მანომეტრი*
        </Callout>
        <Callout x={BX + 200 * BS} y={BY + 309 * BS} tx={BX + 236 * BS + 18} ty={BY + 300 * BS} n={6}>
          კლემები · TA1
        </Callout>

        {/* pipe insulation on the balcony (under the pipes) */}
        <g pointerEvents="none" opacity={0.5}>
          {[A, E, B, D_toBoiler].map((p, i) => (
            <polyline key={i} points={pl(p.filter(([x]) => x <= WALL_X + 30))} fill="none" stroke="#adb5bd" strokeWidth={22} strokeLinejoin="round" />
          ))}
        </g>
        <Callout x={560} y={830} tx={300} ty={932} anchor="middle" n={7}>მილების თბოიზოლაცია (ყინვა — შესამოწმებელი)</Callout>

        {/* ── pipes ───────────────────────────────────────────── */}
        <g className={'comp' + sel('pipeC')} data-click="pipeC" onClick={() => select('pipeC')}>
          <polyline points={pl(C)} fill="none" stroke={PIPE.gas} strokeWidth={9} strokeDasharray="4 6" />
          <text x={stub(120) + 8} y={898} fontSize={11} className="lbl">C გაზი — კონტექსტი</text>
        </g>
        <g className={'comp' + sel('pipeI')} data-click="pipeI" onClick={() => select('pipeI')}>
          <polyline points={pl(I)} fill="none" stroke={PIPE.cond} strokeWidth={6} />
          <g transform="translate(100,760)">
            <path d="M-12,0 L12,0 L12,30 Q0,46 -12,30 Z" fill="#dee2e6" stroke="#495057" />
          </g>
          <text x={84} y={812} fontSize={12} fontWeight={600} className="lbl lbl-halo">11. კონდენსატი (I) → კანალიზაცია ❄</text>
        </g>
        <g className={'comp' + sel('pipeA')} data-click="pipeA" onClick={() => select('pipeA')}>
          <polyline points={pl(A)} className={pipe(chFlow)} stroke={PIPE.flow} data-testid="pipe-A" />
        </g>
        <g className={'comp' + sel('pipeE')} data-click="pipeE" onClick={() => select('pipeE')}>
          <polyline points={pl(E)} className={pipe(chFlow)} stroke={PIPE.ret} data-testid="pipe-E" />
        </g>
        <g className={'comp' + sel('pipeB')} data-click="pipeB" onClick={() => select('pipeB')}>
          <polyline points={pl(B)} className={pipe(dhwOn)} stroke={PIPE.dhw} data-testid="pipe-B" />
        </g>
        <g className={'comp' + sel('pipeD')} data-click="pipeD" onClick={() => select('pipeD')}>
          <polyline points={pl(D_toBoiler)} className={pipe(dhwOn)} stroke={PIPE.cold} data-testid="pipe-D" />
          <polyline points={pl(D_toShower)} className={pipe(showerOn)} stroke={PIPE.cold} />
        </g>
        {/* pipe tags with live temperatures */}
        <g className="pipe-tags" pointerEvents="none">
          <text x={WALL_X + 40} y={754} fontSize={12} fill={PIPE.flow} fontWeight={700} className="lbl-halo">A მიწოდება → {fmt(b.flowC)}°C</text>
          <text x={WALL_X + 40} y={784} fontSize={12} fill={PIPE.ret} fontWeight={700} className="lbl-halo">E დაბრუნება ← {fmt(b.returnC)}°C</text>
          <text x={WALL_X + 40} y={814} fontSize={12} fill={PIPE.dhw} fontWeight={700} className="lbl-halo">B ცხელი წყალი → {dhwOn ? `${fmt(state.dhw.outC)}°C` : 'უმოქმედო'}</text>
          <text x={WALL_X + 40} y={844} fontSize={12} fill={PIPE.cold} fontWeight={700} className="lbl-halo">D ცივი წყალი ← {cfg.sim.coldWaterC}°C</text>
        </g>

        {/* valves under the boiler */}
        <BallValve x={stub(48)} y={STUB_Y + 40} color="#e03131" id="valveA" select={select} />
        <BallValve x={stub(84)} y={STUB_Y + 40} color="#f76707" id="valveB" select={select} />
        <BallValve x={stub(120)} y={STUB_Y + 40} color="#f59f00" id="gasCock" select={select} />
        <BallValve x={stub(156)} y={STUB_Y + 40} color="#0c8599" id="coldValve" select={select} />
        <BallValve x={stub(192)} y={STUB_Y + 40} color="#1c7ed6" id="valveE" select={select} />
        <Callout x={stub(48)} y={STUB_Y + 40} tx={120} ty={STUB_Y + 90} anchor="start" n={8}>ჩამკეტი ონკანები (A B C D E)</Callout>
        {/* magnetic filter on return */}
        <g className="comp" data-click="magFilter" onClick={() => select('magFilter')}>
          <rect x={stub(192) - 16} y={705} width={32} height={50} rx={10} fill="#343a40" stroke="#000" />
          <rect x={stub(192) - 12} y={712} width={24} height={10} rx={3} fill="#868e96" />
        </g>
        <Callout x={stub(192) + 16} y={730} tx={470} ty={700} anchor="start" n={9}>მაგნიტური ფილტრი (არჩ.)</Callout>
        {/* safety discharge F */}
        <g className="comp" data-click="pipeF" onClick={() => select('pipeF')}>
          <polyline points={`${stub(212)},${STUB_Y - 20} ${stub(212) + 30},${STUB_Y - 20} ${stub(212) + 30},700`} fill="none" stroke={PIPE.safety} strokeWidth={5} />
          <path d={`M${stub(212) + 20},700 L${stub(212) + 40},700 L${stub(212) + 34},716 L${stub(212) + 26},716 Z`} fill="#dee2e6" stroke="#495057" />
        </g>
        <Callout x={stub(212) + 30} y={680} tx={470} ty={650} anchor="start" n={10}>F გამონადენი</Callout>

        {/* ── inside: wiring centre ──────────────────────────── */}
        <g className={'comp' + sel('controller')} data-click="controller" onClick={() => select('controller')} data-testid="install-wc">
          <rect x={820} y={110} width={520} height={190} rx={10} fill="#f8f9fa" stroke="#495057" strokeWidth={2} />
          <rect x={830} y={120} width={500} height={170} rx={6} fill="#e6fcf5" stroke="#087f5b" />
          {Array.from({ length: 8 }, (_, i) => {
            const z = ZONES[i];
            const on = !!z && state.controller.zoneOut[z];
            return (
              <g key={i}>
                <rect x={842 + i * 50} y={140} width={44} height={26} rx={3} fill={z ? '#fff' : '#f1f3f5'} stroke="#495057" />
                <text x={864 + i * 50} y={157} fontSize={10} textAnchor="middle" fontWeight={700} className="lbl">Z{i + 1}</text>
                <circle cx={864 + i * 50} cy={180} r={6} fill={on ? '#f59f00' : '#dee2e6'} stroke="#495057" />
                <rect x={846 + i * 50} y={250} width={36} height={22} rx={3} fill={on ? '#d3f9d8' : '#fff'} stroke="#495057" />
                <text x={864 + i * 50} y={265} fontSize={9} textAnchor="middle" className="lbl">A~ A~</text>
              </g>
            );
          })}
          <rect x={1250} y={140} width={70} height={60} rx={4} fill="#fff" stroke="#495057" />
          <text x={1285} y={156} fontSize={10} textAnchor="middle" fontWeight={700} className="lbl">რელე</text>
          <text x={1285} y={174} fontSize={9} textAnchor="middle" className="lbl">NO COM NC</text>
          <circle cx={1285} cy={188} r={6} fill={relay ? PIPE.ta1 : '#dee2e6'} stroke="#495057" data-testid="install-relay" data-closed={relay ? '1' : '0'} />
          <rect x={1250} y={210} width={70} height={30} rx={4} fill="#fff3bf" stroke="#b08900" />
          <text x={1285} y={229} fontSize={9} textAnchor="middle" className="lbl">DIP {cfg.sim.relayDelayS / 60} წთ</text>
          <text x={1285} y={268} fontSize={9} textAnchor="middle" className="lbl">L N PE · 15A</text>
        </g>
        <Callout x={1120} y={110} tx={1080} ty={88} anchor="middle" n={12}>გაყვანილობის ცენტრი (8 ზონა; Z1–Z4)</Callout>

        {/* relay → TA1 cable through the wall */}
        <polyline points={pl([[1285, 194], [1285, 104], [700, 104], [WALL_X + 10, 104], [560, 104], [560, ta1Pt[1]], [ta1Pt[0] + 6, ta1Pt[1]]])} fill="none" stroke={relay ? PIPE.ta1 : '#adb5bd'} strokeWidth={relay ? 4 : 3} strokeDasharray={relay ? '10 6' : '6 6'} className={relay ? 'flow-anim cable-px' : ''} data-testid="install-ta1-wire" />
        <text x={436} y={92} fontSize={11} className="lbl lbl-halo">რელე COM–NO → TA1</text>
        <text x={436} y={106} fontSize={10} className="lbl lbl-halo" fill="#a33a00">მშრალი კონტაქტი · არა 230V</text>

        {/* ── inside: manifold cabinet ───────────────────────── */}
        <g className={'comp' + sel('manifoldCab')} data-click="manifoldCab" onClick={() => select('manifoldCab')}>
          <rect x={MX - 30} y={360} width={mEnd - MX + 60} height={420} rx={6} fill="#ffffff" stroke="#868e96" strokeWidth={3} />
          <rect x={MX - 22} y={368} width={mEnd - MX + 44} height={404} rx={4} fill="#f8f9fa" stroke="#dee2e6" />
        </g>
        <Callout x={MX - 30} y={380} tx={MX - 40} ty={344} anchor="start" n={13}>კოლექტორის კარადა</Callout>
        {/* supply loop pipes behind the return bar */}
        {LOOP_IDS.map((id, i) => {
          const f = !!state.loops[id]?.flowing;
          return <line key={'s' + id} x1={px(i) - 7} y1={SUP_Y + 20} x2={px(i) - 7} y2={905} stroke={PIPE.flow} strokeWidth={5} opacity={f ? 1 : 0.3} className={f ? 'flow-anim ipipe2-flow' : ''} />;
        })}
        <g className="comp" data-click="manifold" onClick={() => select('manifold')}>
          <rect x={MX} y={SUP_Y} width={mEnd - MX} height={20} rx={9} fill="url(#ibrass)" stroke="#8a6d1e" />
          <rect x={MX} y={SUP_Y} width={mEnd - MX} height={20} rx={9} fill={PIPE.flow} opacity={chFlow ? 0.7 : 0} className="bar-tint" />
          <rect x={MX} y={RET_Y} width={mEnd - MX} height={20} rx={9} fill="url(#ibrass)" stroke="#8a6d1e" />
          <rect x={MX} y={RET_Y} width={mEnd - MX} height={20} rx={9} fill={PIPE.ret} opacity={chFlow ? 0.55 : 0} className="bar-tint" />
        </g>
        <BallValve x={MX - 4} y={SUP_Y + 10} color="#e03131" id="mfValveA" select={select} vertical={false} />
        <BallValve x={MX - 4} y={RET_Y + 10} color="#1c7ed6" id="mfValveE" select={select} vertical={false} />
        {/* air vent + drain at bar ends */}
        <g className="comp" data-click="airVent" onClick={() => select('airVent')}>
          {[SUP_Y, RET_Y].map((y) => (
            <g key={y}>
              <rect x={mEnd} y={y - 2} width={14} height={24} fill="url(#ibrass)" stroke="#8a6d1e" />
              <rect x={mEnd + 2} y={y - 16} width={10} height={14} rx={3} fill="#c0c0c0" stroke="#495057" />
              <rect x={mEnd + 14} y={y + 6} width={12} height={8} fill="#c0c0c0" stroke="#495057" />
            </g>
          ))}
        </g>
        <GaugeDevice x={MX + 14} y={SUP_Y - 30} r={15} value={b.flowC} min={0} max={80} label="°C" unit="" />
        <GaugeDevice x={MX + 14} y={RET_Y + 52} r={15} value={b.returnC} min={0} max={80} label="°C" unit="" />
        {LOOP_IDS.map((id, i) => {
          const ls = state.loops[id];
          const a = ls?.act;
          const room = cfg.loops.find((l) => l.id === id)?.room;
          return (
            <g key={id}>
              <g transform={`translate(${px(i) - 7},${SUP_Y}) scale(0.62)`}>
                <ActuatorDevice x={0} y={0} pos={a?.pos ?? 0} cmd={!!a?.cmd} phase={a?.phase ?? 'closed'} selected={selected === 'actuator:' + id} onClick={() => select('actuator:' + id)} />
              </g>
              <g transform={`translate(${px(i) + 8},${RET_Y}) scale(0.62)`}>
                <FlowMeterDevice x={0} y={0} flowLpm={ls?.flowLpm ?? 0} />
              </g>
              <circle cx={px(i) + 8} cy={RET_Y + 10} r={5} fill="#1c7ed6" stroke="#0b4f8a" />
              <line x1={px(i) + 8} y1={RET_Y + 20} x2={px(i) + 8} y2={905} stroke={PIPE.ret} strokeWidth={5} opacity={ls?.flowing ? 1 : 0.3} className={ls?.flowing ? 'flow-anim ipipe2-flow' : ''} />
              <text x={px(i)} y={735} fontSize={10} textAnchor="middle" fontWeight={700} fill={room ? ROOM_COLOR[room] : '#868e96'} className="lbl-halo">{id.slice(1)}</text>
            </g>
          );
        })}
        <Callout x={px(13) - 7} y={SUP_Y - 46} tx={mEnd + 26} ty={SUP_Y - 110} n={14}>აქტუატორები ×14</Callout>
        <Callout x={mEnd - 2} y={SUP_Y + 10} tx={mEnd + 30} ty={SUP_Y - 40} n={15}>მიწოდების ბარი</Callout>
        <Callout x={px(13) + 8} y={RET_Y - 30} tx={mEnd + 30} ty={RET_Y - 40} n={16}>ნაკადმზომები ×14</Callout>
        <Callout x={mEnd - 2} y={RET_Y + 10} tx={mEnd + 30} ty={RET_Y + 12} n={17}>დაბრუნების ბარი</Callout>
        <Callout x={mEnd + 7} y={SUP_Y - 12} tx={mEnd + 30} ty={SUP_Y + 30} n={18}>ჰაერის გამშვები</Callout>
        <Callout x={MX - 14} y={SUP_Y + 4} tx={672} ty={470} anchor="start" n={19}>ჩამკეტები</Callout>
        <text x={(MX + mEnd) / 2} y={898} fontSize={12} textAnchor="middle" className="lbl lbl-halo">↓ 14 კონტური იატაკში (მიწოდება წითელი / დაბრუნება ლურჯი)</text>

        {/* actuator cable bundle from wiring centre */}
        <path d={`M1040,272 C1040,330 ${(MX + mEnd) / 2},330 ${(MX + mEnd) / 2},${SUP_Y - 60}`} fill="none" stroke={PIPE.wireL} strokeWidth={4} opacity={ZONES.some((z) => state.controller.zoneOut[z]) ? 1 : 0.35} />
        <path d={`M1050,272 C1050,336 ${(MX + mEnd) / 2 + 10},336 ${(MX + mEnd) / 2 + 10},${SUP_Y - 60}`} fill="none" stroke={PIPE.wireN} strokeWidth={4} opacity={ZONES.some((z) => state.controller.zoneOut[z]) ? 1 : 0.35} />
        <text x={1070} y={330} fontSize={11} className="lbl lbl-halo">აქტუატორების კაბელები (ყავისფერი L / ლურჯი N)</text>

        {/* ── thermostats (in rooms) ─────────────────────────── */}
        <text x={1560} y={60} fontSize={14} fontWeight={700} className="lbl">თერმოსტატები (ოთახებში)</text>
        {ZONES.map((z, i) => {
          const tx = 1560 + (i % 2) * 118;
          const ty = 74 + Math.floor(i / 2) * 150;
          const th = cfg.thermostats[z];
          return (
            <g key={z} data-testid={`install-thermo-${z}`}>
              <g transform={`translate(${tx},${ty}) scale(0.52)`} className="comp" data-click={'thermostat:' + z} onClick={() => select('thermostat:' + z)}>
                <ThermostatDevice
                  uid={`inst-${z}`}
                  airC={state.rooms[z].airC}
                  setpointC={th.setpointC}
                  enabled={th.enabled}
                  calling={state.rooms[z].calling}
                  sensorLost={state.faults.sensorLost[z]}
                  cloudOffline={state.faults.cloudOffline}
                  onPower={() => setThermostat(z, { enabled: !th.enabled })}
                  onMinus={() => setThermostat(z, { setpointC: Math.max(5, th.setpointC - 0.5) })}
                  onPlus={() => setThermostat(z, { setpointC: Math.min(30, th.setpointC + 0.5) })}
                  testPrefix={`inst-${z}-`}
                />
              </g>
              <text x={tx + 52} y={ty + 126} fontSize={11} textAnchor="middle" fontWeight={700} fill={ROOM_COLOR[z]} className="lbl-halo">
                Z{i + 1} · {cfg.roomNames[z]}
              </text>
              {/* 3-core cable to the wiring centre */}
              <polyline points={pl([[tx, ty + 60], [1540 - i * 8, ty + 60], [1540 - i * 8, 150 + i * 4], [1350, 150 + i * 4]])} fill="none" stroke={PIPE.wireS} strokeWidth={state.rooms[z].calling ? 3.5 : 2} opacity={state.rooms[z].calling ? 1 : 0.4} strokeDasharray={state.rooms[z].calling ? '8 5' : ''} className={state.rooms[z].calling ? 'flow-anim cable-px' : ''} />
            </g>
          );
        })}
        <text x={1560} y={388} fontSize={10} className="lbl t-dim">ჰოლს/გარდერობს თერმოსტატი არ აქვს;</text>
        <text x={1560} y={402} fontSize={10} className="lbl t-dim">მიჰყვება: {cfg.roomNames[cfg.owners.hall]} / {cfg.roomNames[cfg.owners.wardrobe]}</text>
        <text x={1560} y={416} fontSize={10} className="lbl t-dim">კაბელი: L / N / სიგნალი (შესამოწმ.)</text>

        {/* ── bathroom: shower ──────────────────────────────── */}
        <g className={'comp' + sel('shower')} data-click="shower" onClick={() => select('shower')}>
          <rect x={1560} y={560} width={230} height={345} fill="url(#tiles)" stroke="#a5c8dc" />
          <text x={1570} y={580} fontSize={13} fontWeight={700} className="lbl">სააბაზანო</text>
          <g transform="translate(1632,600) scale(1.5)">
            <ShowerDevice on={showerOn} hot={state.dhw.kW > 0} />
          </g>
          {/* mixer */}
          <rect x={1614} y={750} width={40} height={22} rx={6} fill="#dee2e6" stroke="#495057" />
          <circle cx={1634} cy={761} r={7} fill="#fff" stroke="#495057" />
          <text x={1660} y={748} fontSize={10} className="lbl">შემრევი</text>
        </g>
        <Callout x={1670} y={640} tx={1690} ty={610} n={20}>შხაპი {showerOn ? (state.dhw.kW > 0 ? `${fmt(state.dhw.outC)}°C` : '— ცხელი არ არის') : ''}</Callout>
        <g className="comp" data-click="pipeD" onClick={() => select('pipeD')}>
          <rect x={1740} y={884} width={40} height={20} rx={3} fill={PIPE.cold} />
          <text x={1792} y={878} fontSize={10} textAnchor="end" className="lbl lbl-halo">წყალსადენი (ადგილი უცნობია)</text>
        </g>

        <text x={16} y={952} fontSize={11} className="lbl t-dim">მარშრუტები და ადგილები — დაშვება. ეს სქემა აჩვენებს რა რას უერთდება; ის არ არის გაზის, საკვამურის, კონდენსატის ან ელექტრო მონტაჟის ინსტრუქცია.</text>
      </svg>

      <ControlWiringDiagram cfg={cfg} state={state} select={select} selected={selected} setThermostat={setThermostat} />
      <ConnectionTable />
    </div>
  );
}

const CONNECTIONS: [string, string, string, string, string][] = [
  ['ქვაბი A (მიწოდება)', 'კოლექტორის მიწოდება', 'გათბობის წყალი — წითელი', 'სანტექნიკოსი', 'მარშრუტი/დიამეტრი უცნობია'],
  ['კოლექტორის დაბრუნება', 'ქვაბი E (დაბრუნება)', 'გათბობის წყალი — ლურჯი', 'სანტექნიკოსი', 'მაგნიტური ფილტრი — არჩ.'],
  ['ქვაბი B (ცსწ)', 'შხაპის შემრევი', 'ცხელი წყალი — ნარინჯისფერი', 'სანტექნიკოსი', 'სიგრძე/დაყოვნება, ყინვა'],
  ['წყალსადენი', 'ქვაბი D + შხაპის შემრევი', 'ცივი წყალი — ფირუზისფერი', 'სანტექნიკოსი', 'წნევა ≤ 6 ბარი [Ariston ინსტრ.]'],
  ['გაზის ქსელი', 'ქვაბი C', 'გაზი', 'მხოლოდ ავტორიზებული სპეციალისტი', 'აქ ინსტრუქცია არ არის'],
  ['ქვაბი I', 'კანალიზაცია', 'კონდენსატი', 'Ariston ტექნიკოსი', 'გაყინვის რისკი აივანზე'],
  ['ქვაბი (საკვამური)', 'გარეთ', 'წვის პროდუქტები', 'Ariston ტექნიკოსი', 'მხოლოდ კონტექსტი'],
  ['თერმოსტატი (×4)', 'ცენტრის ზონა Z1–Z4', '3-ძარღვი: L / N / სიგნალი', 'ელექტრიკოსი', 'ძარღვები და კლემები გადასამოწმებელი'],
  ['ცენტრის ზონის A~ წყვილი', 'ოთახის აქტუატორები (პარალელურად)', '230V', 'ელექტრიკოსი', 'ზონის დენის ლიმიტი'],
  ['ცენტრის რელე COM–NO', 'ქვაბის TA1', 'მშრალი კონტაქტი (12V DC მხარე)', 'ელექტრიკოსი + Ariston ტექნიკოსი', '230V არასოდეს TA1-ზე'],
  ['ქსელი 230V', 'ქვაბი / ცენტრი', 'ელკვება', 'ელექტრიკოსი', 'ორპოლუსა ჩამრთველი'],
];

function ConnectionTable() {
  return (
    <div className="conn-table">
      <h3>რა რას უერთდება და ვინ აკეთებს</h3>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>საიდან</th>
              <th>სად</th>
              <th>რა მიდის</th>
              <th>ვინ ამონტაჟებს</th>
              <th>შესამოწმებელი</th>
            </tr>
          </thead>
          <tbody>
            {CONNECTIONS.map((r) => (
              <tr key={r[0] + r[1]}>
                {r.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small t-dim">
        მონტაჟის თანმიმდევრობას და კლემების დონეზე შეერთებებს წყვეტს მონტაჟისტი მწარმოებლის ინსტრუქციის მიხედვით. ქვაბის მიერთება და ჯამპერის მოხსნა — Ariston-ის სერვისის ტექნიკოსი; ელექტროგაყვანილობა — კვალიფიციური ელექტრიკოსი.
      </p>
    </div>
  );
}

