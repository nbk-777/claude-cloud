import { useMemo, useRef, useState, type PointerEvent as RPE, type WheelEvent as RWE } from 'react';
import {
  BALCONIES,
  BOILER_CABINET,
  BOILER_PORT,
  COLUMNS,
  CONTROLLER_OFFSET,
  INTERIOR_WALLS,
  OPENINGS,
  PLAN_BOUNDS,
  ROOM_GEOMETRY,
  SHOWER_POS,
  THERMOSTAT_POS,
  roomBBox,
} from '../model/plan';
import { buildLoopShapes, loopsByRoom } from '../model/loopGeometry';
import { ROOMS, ZONES, controlZoneOf, type AppConfig, type Point, type RoomId, type ZoneId } from '../model/types';
import { thermostatStatus, type SimState } from '../sim/engine';
import { ka } from '../i18n/ka';
import { ROOM_COLOR, airTint, floorGlow, fmt, pts, waterColor } from './util';
import { BoilerFrontDevice, ShowerDevice, ThermostatDevice } from './devices';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const DEFAULT_VIEW: ViewBox = { ...PLAN_BOUNDS };

interface Props {
  cfg: AppConfig;
  state: SimState;
  view: ViewBox;
  setView: (v: ViewBox) => void;
  onManifoldMove: (p: Point) => void;
  select: (id: string) => void;
  selected: string | null;
  openThermostat: (z: ZoneId) => void;
  setThermostat?: (z: ZoneId, patch: Partial<{ enabled: boolean; setpointC: number }>) => void;
}

const T = 0.16; // base text size (m)

export function focusView(r: RoomId): ViewBox {
  const b = roomBBox(r);
  const pad = 0.8;
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

export function PlanView({ cfg, state, view, setView, onManifoldMove, select, selected, openThermostat, setThermostat }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<null | { kind: 'pan' | 'manifold'; sx: number; sy: number; v: ViewBox; moved: boolean }>(null);
  const [dragPos, setDragPos] = useState<Point | null>(null);
  const mf = dragPos ?? cfg.manifoldPos;
  const shapes = useMemo(() => buildLoopShapes(cfg.loops, cfg.manifoldPos), [cfg.loops, cfg.manifoldPos]);
  const grouped = useMemo(() => loopsByRoom(cfg.loops), [cfg.loops]);
  const ctrl = { x: mf.x + CONTROLLER_OFFSET.x, y: mf.y + CONTROLLER_OFFSET.y };
  const b = state.boiler;
  const d = cfg.display;
  const hot = waterColor(b.flowC);
  const cool = waterColor(b.returnC);

  const toWorld = (cx: number, cy: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    // preserveAspectRatio xMidYMid meet
    const s = Math.min(r.width / view.w, r.height / view.h);
    const ox = (r.width - view.w * s) / 2;
    const oy = (r.height - view.h * s) / 2;
    return { x: view.x + (cx - r.left - ox) / s, y: view.y + (cy - r.top - oy) / s };
  };

  const onWheel = (e: RWE<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY);
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const w = Math.min(PLAN_BOUNDS.w * 2, Math.max(1.5, view.w * k));
    const h = (w / view.w) * view.h;
    setView({ x: p.x - ((p.x - view.x) * w) / view.w, y: p.y - ((p.y - view.y) * h) / view.h, w, h });
  };
  const onDown = (e: RPE<SVGSVGElement>) => {
    const target = e.target as Element;
    const isManifold = !!target.closest('[data-drag="manifold"]');
    if (!isManifold && target.closest('[data-click]')) return;
    drag.current = { kind: isManifold ? 'manifold' : 'pan', sx: e.clientX, sy: e.clientY, v: view, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPE<SVGSVGElement>) => {
    const dr = drag.current;
    if (!dr) return;
    if (Math.abs(e.clientX - dr.sx) + Math.abs(e.clientY - dr.sy) > 3) dr.moved = true;
    if (dr.kind === 'pan') {
      const r = svgRef.current!.getBoundingClientRect();
      const s = Math.min(r.width / view.w, r.height / view.h);
      setView({ ...dr.v, x: dr.v.x - (e.clientX - dr.sx) / s, y: dr.v.y - (e.clientY - dr.sy) / s });
    } else {
      const p = toWorld(e.clientX, e.clientY);
      const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      setDragPos({ x: cl(p.x, 0.2, 10.4), y: cl(p.y, 0.2, 7.0) });
    }
  };
  const onUp = () => {
    const dr = drag.current;
    drag.current = null;
    if (dr?.kind === 'manifold') {
      if (dragPos) onManifoldMove(dragPos);
      else select('manifold');
      setDragPos(null);
    }
  };

  const sel = (id: string) => (selected === id ? ' is-selected' : '');
  const click = (id: string) => ({ 'data-click': id, onClick: () => select(id), role: 'button', tabIndex: 0 });

  // trunk routes (all ASSUMED; route unknown)
  const port = (dx: number) => ({ x: BOILER_PORT.x + dx, y: BOILER_PORT.y });
  const trunk = (dx: number, lane: number, end: Point): Point[] => [
    port(dx),
    { x: port(dx).x, y: -0.12 + lane },
    { x: 4.4 + lane, y: -0.12 + lane },
    { x: 4.4 + lane, y: end.y - 0.05 + lane },
    { x: end.x, y: end.y - 0.05 + lane },
  ];
  const flowRoute = trunk(-0.27, 0, { x: mf.x - 0.3, y: mf.y });
  const retRoute = trunk(0.26, 0.08, { x: mf.x - 0.3, y: mf.y + 0.16 });
  const dhwRoute: Point[] = [port(-0.12), { x: port(-0.12).x, y: -0.28 }, { x: 4.33, y: -0.28 }, { x: 4.33, y: 4.98 }, { x: 6.55, y: 4.98 }, { x: 6.55, y: 5.6 }, { x: SHOWER_POS.x, y: 5.6 }, SHOWER_POS];
  const coldRoute: Point[] = [{ x: -0.5, y: -0.95 }, { x: port(0.12).x, y: -0.95 }, port(0.12)];
  const chFlow = b.pumpOn && b.diverter === 'CH' && Object.values(state.loops).some((l) => l.flowing);
  const dhwOn = b.mode === 'dhw';

  return (
    <svg
      ref={svgRef}
      className="plan"
      data-testid="plan"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      aria-label="ბინის გეგმა"
    >
      <defs>
        <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.28" />
        </filter>
        <pattern id="hatch" width="0.2" height="0.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="0.2" stroke="#9a8f7a" strokeWidth="0.02" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>

      {/* balconies */}
      {BALCONIES.map((bal) => (
        <g key={bal.id}>
          <rect x={bal.rect.x} y={bal.rect.y} width={bal.rect.w} height={bal.rect.h} className="balcony" />
          <text x={bal.rect.x + bal.rect.w - 0.15} y={bal.rect.y + 0.3} className="t-dim" fontSize={T} textAnchor="end">
            {bal.id === 'left' ? ka.plan.leftBalcony : ka.plan.rightBalcony}
          </text>
        </g>
      ))}

      {/* outer shell */}
      <rect x={-0.3} y={-0.2} width={11.3} height={7.65} className="shell" />

      {/* rooms: air tint + floor bloom */}
      {ROOMS.map((r) => {
        const g = ROOM_GEOMETRY[r];
        const rs = state.rooms[r];
        const calling = (r === 'hall' || r === 'wardrobe')
          ? state.controller.zoneOut[cfg.owners[r]]
          : state.controller.zoneOut[r as ZoneId];
        return (
          <g key={r} className={`room room-${r}${calling ? ' is-calling' : ''}${sel('room:' + r)}`} {...click('room:' + r)} data-air={rs.airC.toFixed(2)}>
            {g.rects.map((rc, i) => (
              <rect key={i} x={rc.x} y={rc.y} width={rc.w} height={rc.h} fill={airTint(rs.airC)} className="room-fill" />
            ))}
            {r === 'hall' && g.rects.map((rc, i) => <rect key={'h' + i} x={rc.x} y={rc.y} width={rc.w} height={rc.h} fill="url(#hatch)" opacity={0.35} pointerEvents="none" />)}
            {calling && g.rects.map((rc, i) => <rect key={'c' + i} x={rc.x + 0.06} y={rc.y + 0.06} width={rc.w - 0.12} height={rc.h - 0.12} className="call-outline" pointerEvents="none" />)}
          </g>
        );
      })}

      {/* floor warmth bloom per loop region (separate from air tint) */}
      {d.floorCutaway && (
        <g filter="url(#bloom)" pointerEvents="none" className="bloom">
          {Object.values(shapes).map((sh) =>
            sh.regions.map((rc, i) => (
              <rect key={sh.id + i} x={rc.x + 0.1} y={rc.y + 0.1} width={Math.max(0, rc.w - 0.2)} height={Math.max(0, rc.h - 0.2)} fill="#ff7a1a" opacity={0.6 * floorGlow(state.rooms[sh.room].floorC)} />
            )),
          )}
        </g>
      )}

      {/* pipes in the floor (cutaway) */}
      {d.floorCutaway &&
        Object.values(shapes).map((sh) => {
          const ls = state.loops[sh.id];
          const flowing = !!ls?.flowing;
          const loopCfg = cfg.loops.find((l) => l.id === sh.id)!;
          const path = sh.paths.flat();
          const phase = ls?.act.phase ?? 'closed';
          return (
            <g key={sh.id} className={`loop loop-${sh.id}${flowing ? ' is-flowing' : ''} phase-${phase}${sel('loop:' + sh.id)}`} data-testid={`loop-${sh.id}`} {...click('loop:' + sh.id)}>
              <polyline points={pts(path)} className="loop-pipe" stroke={ROOM_COLOR[sh.room]} />
              {flowing && <polyline points={pts(path)} className="loop-flow flow-anim" stroke={waterColor(b.flowC)} />}
              {d.labels && (
                <g className="loop-label">
                  <rect x={sh.centre.x - 0.24} y={sh.centre.y - 0.13} width={0.48} height={0.24} rx={0.05} fill="white" stroke={ROOM_COLOR[sh.room]} strokeWidth={0.02} />
                  <text x={sh.centre.x} y={sh.centre.y + 0.05} fontSize={0.14} textAnchor="middle" fill={ROOM_COLOR[sh.room]} fontWeight={700}>
                    {sh.id}
                    {flowing ? ' ▶' : phase === 'fault' ? ' ✕' : ''}
                  </text>
                </g>
              )}
              {loopCfg.crossesInto && (
                <text x={sh.centre.x} y={sh.centre.y + 0.32} fontSize={0.12} textAnchor="middle" className="t-warn">
                  {ka.plan.crosses} {cfg.roomNames[loopCfg.crossesInto]}
                </text>
              )}
            </g>
          );
        })}

      {/* floor finish layer (transparency control) */}
      <g pointerEvents="none">
        {ROOMS.map((r) =>
          ROOM_GEOMETRY[r].rects.map((rc, i) => (
            <rect key={r + i} x={rc.x} y={rc.y} width={rc.w} height={rc.h} fill="#efe6d6" opacity={d.floorCutaway ? d.floorFinishOpacity : 1} />
          )),
        )}
      </g>

      {/* walls, columns, openings */}
      <g className="walls" pointerEvents="none">
        <rect x={-0.3} y={-0.2} width={11.3} height={7.65} fill="none" stroke="#3b3a36" strokeWidth={0.22} />
        {INTERIOR_WALLS.map(([a, c], i) => (
          <line key={i} x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke="#3b3a36" strokeWidth={0.1} strokeLinecap="square" />
        ))}
        {COLUMNS.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} fill="#d8cdb4" stroke="#3b3a36" strokeWidth={0.03} />
        ))}
        {OPENINGS.map((o, i) => (
          <line key={i} x1={o.a.x} y1={o.a.y} x2={o.b.x} y2={o.b.y} stroke={o.kind === 'balcony-door' ? '#9cc3e6' : '#f7f3ea'} strokeWidth={o.kind === 'balcony-door' ? 0.12 : 0.26} />
        ))}
        <text x={5.2} y={7.62} fontSize={0.14} textAnchor="middle" className="t-dim">{ka.plan.entrance} ↑</text>
      </g>

      {/* room labels */}
      {ROOMS.map((r) => {
        const g = ROOM_GEOMETRY[r];
        const rs = state.rooms[r];
        const ownerZone = controlZoneOf(r, cfg.owners);
        const follower = r === 'hall' || r === 'wardrobe';
        return (
          <g key={r} className="room-label" pointerEvents="none">
            <text x={g.labelAt.x} y={g.labelAt.y} fontSize={0.2} textAnchor="middle" fontWeight={700} fill="#222">{cfg.roomNames[r]}</text>
            <text x={g.labelAt.x} y={g.labelAt.y + 0.24} fontSize={0.15} textAnchor="middle" fill="#a61e1e">{g.planAreaM2.toFixed(2)} მ²</text>
            <text x={g.labelAt.x} y={g.labelAt.y + 0.46} fontSize={0.14} textAnchor="middle" fill="#333">
              ჰაერი {fmt(rs.airC)}° · იატაკი {fmt(rs.floorC)}° · {fmt(rs.heatW / 1000, 2)} kW*
            </text>
            {follower && ownerZone && (
              <text x={g.labelAt.x} y={g.labelAt.y + 0.66} fontSize={0.13} textAnchor="middle" className="t-warn">
                {ka.rooms.noThermostat} · {ka.rooms.controlledBy} {cfg.roomNames[ownerZone]}
              </text>
            )}
            {grouped[r].length === 0 && (
              <text x={g.labelAt.x} y={g.labelAt.y + 0.86} fontSize={0.13} textAnchor="middle" className="t-warn">⚠ {ka.rooms.noLoops}</text>
            )}
          </g>
        );
      })}

      {/* hydraulic layer: trunks + lead-ins */}
      {d.hydraulic && (
        <g className="hydraulic">
          {Object.values(shapes).map((sh) => {
            const path = sh.paths.flat();
            const flowing = !!state.loops[sh.id]?.flowing;
            const start = path[0];
            const end = path[path.length - 1];
            const sx = mf.x - 0.38 + (parseInt(sh.id.slice(1), 10) - 1) * 0.055;
            return (
              <g key={sh.id} pointerEvents="none" opacity={flowing ? 0.95 : 0.35}>
                <polyline points={pts([{ x: sx, y: mf.y - 0.1 }, { x: sx, y: start.y }, start])} className={`lead${flowing ? ' flow-anim lead-flow' : ''}`} stroke={flowing ? hot : '#c47a6a'} />
                <polyline points={pts([end, { x: sx + 0.02, y: end.y }, { x: sx + 0.02, y: mf.y + 0.1 }])} className={`lead lead-ret${flowing ? ' flow-anim lead-flow' : ''}`} stroke={flowing ? cool : '#7a9cc4'} />
              </g>
            );
          })}
          <g {...click('pipeA')} className={'trunk' + sel('pipeA')}>
            <polyline points={pts(flowRoute)} className={`trunk-line${chFlow ? ' flow-anim trunk-flow' : ''}`} stroke={chFlow ? hot : '#c86a5a'} markerEnd="url(#arrow)" />
          </g>
          <g {...click('pipeE')} className={'trunk' + sel('pipeE')}>
            <polyline points={pts([...retRoute].reverse())} className={`trunk-line${chFlow ? ' flow-anim trunk-flow' : ''}`} stroke={chFlow ? cool : '#6a8cc8'} markerEnd="url(#arrow)" />
          </g>
          <g {...click('pipeB')} className={'trunk dhw' + sel('pipeB')}>
            <polyline points={pts(dhwRoute)} className={`trunk-line dhw-line${dhwOn ? ' flow-anim trunk-flow' : ''}`} stroke={dhwOn ? '#ff3b8d' : '#e9a3c2'} markerEnd="url(#arrow)" />
          </g>
          <g {...click('pipeD')} className={'trunk' + sel('pipeD')}>
            <polyline points={pts(coldRoute)} className={`trunk-line${dhwOn ? ' flow-anim trunk-flow' : ''}`} stroke="#3aa0ff" markerEnd="url(#arrow)" />
            <text x={-0.5} y={-1.02} fontSize={0.12} className="t-dim">{ka.plan.mains}</text>
          </g>
          <text x={2.4} y={-0.36} fontSize={0.12} className="t-dim" textAnchor="middle">⋯ {ka.plan.routeUnknown}</text>
        </g>
      )}

      {/* optional design layer */}
      {d.optionalLayer && (
        <g className="optional" {...click('optMix')}>
          <rect x={mf.x - 0.55} y={mf.y + 0.35} width={1.1} height={0.38} className="opt-box" />
          <text x={mf.x} y={mf.y + 0.5} fontSize={0.1} textAnchor="middle">შერევის კვანძი / გარე ტუმბო?</text>
          <text x={mf.x} y={mf.y + 0.64} fontSize={0.09} textAnchor="middle" className="t-dim">შეიძლება საჭირო იყოს — პროექტით</text>
        </g>
      )}

      {/* control-wire layer */}
      {d.wiring && (
        <g className="wiring" pointerEvents="none">
          {ZONES.map((z, i) => {
            const p = THERMOSTAT_POS[z];
            const live = state.controller.zoneOut[z];
            return (
              <g key={z}>
                <polyline points={pts([p, { x: p.x, y: ctrl.y - 0.3 - i * 0.06 }, { x: ctrl.x, y: ctrl.y - 0.3 - i * 0.06 }, ctrl])} className={`wire${live ? ' wire-live flow-anim' : ''}`} />
                <text x={(p.x + ctrl.x) / 2} y={ctrl.y - 0.33 - i * 0.06} fontSize={0.08} textAnchor="middle" className="t-wire">3×: L / N / S → Z{i + 1}</text>
              </g>
            );
          })}
          <polyline points={pts([ctrl, { x: ctrl.x, y: mf.y + 0.02 }, { x: mf.x + 0.45, y: mf.y + 0.02 }])} className={`wire${ZONES.some((z) => state.controller.zoneOut[z]) ? ' wire-live flow-anim' : ''}`} />
          <polyline points={pts([ctrl, { x: ctrl.x, y: -0.05 }, { x: BOILER_PORT.x + 0.4, y: -0.05 }, { x: BOILER_PORT.x + 0.4, y: BOILER_PORT.y - 0.15 }])} className={`wire wire-ta1${state.controller.ta1Closed ? ' wire-live ta1-closed flow-anim' : ''}`} />
          <text x={2.4} y={-0.0} fontSize={0.1} textAnchor="middle" className="t-wire">COM–NO → TA1 (მშრალი კონტაქტი; მარშრუტი უცნობია)</text>
          <text x={ctrl.x + 0.3} y={ctrl.y + 0.45} fontSize={0.09} className="t-wire">{ka.thermostat.cableNote.slice(0, 60)}…</text>
        </g>
      )}

      {/* boiler cabinet */}
      <g {...click('boiler')} className={'boiler-icon' + sel('boiler') + (b.burnerOn ? ' burner-on' : '')} data-testid="plan-boiler" data-mode={b.mode}>
        <rect x={BOILER_CABINET.x} y={BOILER_CABINET.y} width={BOILER_CABINET.w} height={BOILER_CABINET.h} className="cabinet" />
        <g transform={`translate(${BOILER_CABINET.x + 0.15},${BOILER_CABINET.y + 0.06}) scale(0.0028)`}>
          <BoilerFrontDevice mode={b.mode} flowC={b.flowC} burnerOn={b.burnerOn} chSetpointC={cfg.sim.chSetpointC} chRange={cfg.sim.chRange} ta1Closed={state.controller.ta1Closed} fault={!!b.fault} pumpOn={b.pumpOn} />
        </g>
        <text x={BOILER_CABINET.x + BOILER_CABINET.w + 0.08} y={BOILER_CABINET.y + 0.25} fontSize={0.11}>Genus ONE 24 · {ka.mode[b.mode]} · {fmt(b.flowC)}°C · {fmt(b.burnerKW)} kW*</text>
        <text x={BOILER_CABINET.x + BOILER_CABINET.w + 0.08} y={BOILER_CABINET.y + 0.42} fontSize={0.1} className="t-warn">⚠ თერმო-კარადა: ღია საკითხი</text>
      </g>

      {/* shower */}
      <g {...click('shower')} className={'shower' + sel('shower') + (state.dhw.showerOn ? ' on' : '')}>
        <rect x={SHOWER_POS.x - 0.32} y={SHOWER_POS.y - 0.42} width={0.62} height={0.62} rx={0.04} className="shower-tray" />
        <g transform={`translate(${SHOWER_POS.x - 0.12},${SHOWER_POS.y - 0.4}) scale(0.0065)`}>
          <ShowerDevice on={state.dhw.showerOn} hot={state.dhw.kW > 0} />
        </g>
        {state.dhw.showerOn && (
          <text x={SHOWER_POS.x} y={SHOWER_POS.y - 0.5} fontSize={0.11} textAnchor="middle" className={state.dhw.kW > 0 ? 't-hot' : 't-warn'}>
            {state.dhw.kW > 0 ? `${fmt(state.dhw.outC)}°C · ${fmt(state.dhw.flowLpm)} L/წთ` : 'ცხელი წყალი არ არის'}
          </text>
        )}
      </g>

      {/* manifold (draggable placeholder) + controller */}
      <g data-drag="manifold" className={'manifold-icon' + sel('manifold')} data-testid="plan-manifold" style={{ cursor: 'grab' }}>
        <rect x={mf.x - 0.45} y={mf.y - 0.14} width={0.9} height={0.28} className="manifold-box" />
        <line x1={mf.x - 0.4} y1={mf.y - 0.05} x2={mf.x + 0.4} y2={mf.y - 0.05} stroke={hot} strokeWidth={0.05} />
        <line x1={mf.x - 0.4} y1={mf.y + 0.06} x2={mf.x + 0.4} y2={mf.y + 0.06} stroke={cool} strokeWidth={0.05} />
        <text x={mf.x} y={mf.y - 0.2} fontSize={0.11} textAnchor="middle" fontWeight={700}>კოლექტორი ⇕⇔ (?)</text>
      </g>
      <g {...click('controller')} className={'controller-icon' + sel('controller')}>
        <rect x={ctrl.x - 0.25} y={ctrl.y - 0.15} width={0.5} height={0.3} className="controller-box" />
        <text x={ctrl.x} y={ctrl.y + 0.04} fontSize={0.09} textAnchor="middle">8-ზონა</text>
        <circle cx={ctrl.x + 0.19} cy={ctrl.y - 0.09} r={0.035} fill={state.controller.ta1Closed ? '#2b8a3e' : '#adb5bd'} />
      </g>

      {/* thermostats */}
      {ZONES.map((z) => {
        const p = THERMOSTAT_POS[z];
        const st = thermostatStatus(state, cfg, z);
        return (
          <g
            key={z}
            className={`thermo thermo-${st}${sel('thermostat:' + z)}`}
            data-testid={`thermo-${z}`}
            data-click={'thermostat:' + z}
            role="button"
            tabIndex={0}
            aria-label={`${cfg.roomNames[z]} თერმოსტატი`}
            onClick={() => {
              select('thermostat:' + z);
              openThermostat(z);
            }}
          >
            <rect x={p.x - 0.29} y={p.y - 0.3} width={0.58} height={0.61} rx={0.1} className="thermo-body" />
            <g transform={`translate(${p.x - 0.25},${p.y - 0.265}) scale(0.0025)`}>
              <ThermostatDevice
                uid={`plan-${z}`}
                airC={state.rooms[z].airC}
                setpointC={cfg.thermostats[z].setpointC}
                enabled={cfg.thermostats[z].enabled}
                calling={state.rooms[z].calling}
                sensorLost={state.faults.sensorLost[z]}
                cloudOffline={state.faults.cloudOffline}
                onPower={setThermostat ? () => setThermostat(z, { enabled: !cfg.thermostats[z].enabled }) : undefined}
                onMinus={setThermostat ? () => setThermostat(z, { setpointC: Math.max(5, cfg.thermostats[z].setpointC - 0.5) }) : undefined}
                onPlus={setThermostat ? () => setThermostat(z, { setpointC: Math.min(30, cfg.thermostats[z].setpointC + 0.5) }) : undefined}
              />
            </g>
            <text x={p.x} y={p.y + 0.42} fontSize={0.1} textAnchor="middle" className="thermo-cap">{ka.status[st]}</text>
          </g>
        );
      })}
    </svg>
  );
}
