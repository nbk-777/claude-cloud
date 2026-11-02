import { ROOM_GEOMETRY } from '../model/plan';
import { loopsByRoom } from '../model/loopGeometry';
import { ZONES, controlZoneOf, isZone, type AppConfig, type RoomId, type ZoneId } from '../model/types';
import { commandChain, currentStepIndex } from '../sim/chain';
import { loopsOfZone, thermostatStatus, type SimState } from '../sim/engine';
import { BOILER } from '../sim/params';
import { ka } from '../i18n/ka';
import {
  INSPECTOR,
  actuatorEntry,
  loopEntry,
  roomEntry,
  thermostatEntry,
  type InspectorEntry,
} from '../data/reference';
import { ROOM_COLOR, fmt, fmtTime } from './util';
import { ThermostatDevice } from './devices';

// ── thermostat widget ────────────────────────────────────────────────────────

interface ThermoProps {
  z: ZoneId;
  cfg: AppConfig;
  state: SimState;
  setThermostat: (z: ZoneId, patch: Partial<{ enabled: boolean; setpointC: number }>) => void;
  compact?: boolean;
  onClose?: () => void;
  onFocus?: () => void;
}

export function ThermostatWidget({ z, cfg, state, setThermostat, compact, onClose, onFocus }: ThermoProps) {
  const th = cfg.thermostats[z];
  const st = thermostatStatus(state, cfg, z);
  const followers = (['hall', 'wardrobe'] as const).filter((f) => cfg.owners[f] === z);
  return (
    <div className={`thermo-widget thermo-${st}${compact ? ' compact' : ''}`} data-testid={`tw-${z}`} style={{ borderColor: ROOM_COLOR[z] }}>
      <div className="tw-head">
        <button className="link" onClick={onFocus} title={ka.controls.focus}>
          <strong>{cfg.roomNames[z]}</strong>
        </button>
        <span className={`badge st-${st}`} data-testid={`status-${z}`}>
          {st === 'calling' ? '🔥 ' : st === 'sensor_lost' ? '⚠ ' : st === 'off' ? '⏻ ' : st === 'satisfied' ? '✓ ' : '… '}
          {ka.status[st]}
        </span>
        {onClose && (
          <button className="icon" onClick={onClose} aria-label={ka.thermostat.close}>
            ✕
          </button>
        )}
      </div>
      <svg viewBox="0 0 200 212" className="thermo-svg" role="group" aria-label={`${cfg.roomNames[z]} — თერმოსტატი`}>
        <ThermostatDevice
          uid={`${z}${compact ? 'c' : 'p'}`}
          airC={state.rooms[z].airC}
          setpointC={th.setpointC}
          enabled={th.enabled}
          calling={state.rooms[z].calling}
          sensorLost={state.faults.sensorLost[z]}
          cloudOffline={state.faults.cloudOffline}
          onPower={() => setThermostat(z, { enabled: !th.enabled })}
          onMinus={() => setThermostat(z, { setpointC: Math.max(5, th.setpointC - 0.5) })}
          onPlus={() => setThermostat(z, { setpointC: Math.min(30, th.setpointC + 0.5) })}
          testPrefix={`tw-${z}-`}
        />
      </svg>
      <div className="small" data-testid={`sp-${z}`} hidden>{th.setpointC.toFixed(1)}</div>
      <div className="tw-foot">
        {ka.thermostat.floor} {fmt(state.rooms[z].floorC)}° · {fmt(state.rooms[z].heatW / 1000, 2)} kW <em>({ka.thermostat.illustrative})</em>
        {followers.length > 0 && <div className="t-dim">+ {followers.map((f) => cfg.roomNames[f]).join(', ')} მიჰყვება</div>}
        {state.faults.cloudOffline && <div className="t-warn">☁✕ ოფლაინ — ადგილობრივად მუშაობს</div>}
      </div>
      {!compact && (
        <>
          <HeatChart z={z} cfg={cfg} state={state} />
          <p className="small t-dim">Beok 220V Wi-Fi (დაგეგმილი, მე-2 შეტყობინება) · {ka.thermostat.positionAssumed}</p>
          <p className="small t-warn">{ka.thermostat.cableNote}</p>
        </>
      )}
    </div>
  );
}

// ── heat-up chart ────────────────────────────────────────────────────────────

export function HeatChart({ z, state }: { z: RoomId; cfg?: AppConfig; state: SimState }) {
  const h = state.history.slice(-240);
  const W = 300;
  const H = 120;
  if (h.length < 2) return <svg className="chart" viewBox={`0 0 ${W} ${H}`} />;
  const t0 = h[0].t;
  const t1 = h[h.length - 1].t;
  const vals = h.flatMap((s) => [s.air[z], s.floor[z], isZone(z) ? s.sp[z] : s.air[z]]);
  const lo = Math.floor(Math.min(...vals) - 0.5);
  const hi = Math.ceil(Math.max(...vals) + 0.5);
  const X = (t: number) => 30 + ((t - t0) / Math.max(1, t1 - t0)) * (W - 40);
  const Y = (v: number) => 10 + (1 - (v - lo) / Math.max(0.1, hi - lo)) * (H - 30);
  const line = (f: (s: (typeof h)[number]) => number) => h.map((s) => `${X(s.t).toFixed(1)},${Y(f(s)).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ka.thermostat.chart}>
      <text x={4} y={Y(hi) + 4} fontSize={9}>{hi}°</text>
      <text x={4} y={Y(lo) + 4} fontSize={9}>{lo}°</text>
      <line x1={30} y1={Y(lo)} x2={W - 10} y2={Y(lo)} stroke="#ccc" />
      {isZone(z) && <polyline points={line((s) => s.sp[z])} fill="none" stroke="#2b8a3e" strokeDasharray="4 3" strokeWidth={1.5} />}
      <polyline points={line((s) => s.floor[z])} fill="none" stroke="#e8590c" strokeWidth={2} />
      <polyline points={line((s) => s.air[z])} fill="none" stroke="#1971c2" strokeWidth={2} />
      <text x={30} y={H - 4} fontSize={9}>{fmtTime(t0)}</text>
      <text x={W - 10} y={H - 4} fontSize={9} textAnchor="end">{fmtTime(t1)}</text>
      <text x={W / 2} y={H - 4} fontSize={9} textAnchor="middle">
        <tspan fill="#1971c2">━ ჰაერი</tspan> <tspan fill="#e8590c">━ იატაკი</tspan> <tspan fill="#2b8a3e">┅ სასურველი</tspan>
      </text>
    </svg>
  );
}

// ── command chain ────────────────────────────────────────────────────────────

export function CommandChainPanel({ z, setZ, cfg, state }: { z: ZoneId; setZ: (z: ZoneId) => void; cfg: AppConfig; state: SimState }) {
  const chain = commandChain(state, cfg, z);
  const cur = currentStepIndex(chain);
  return (
    <section className="panel chain" data-testid="chain">
      <h3>{ka.chain.title}</h3>
      <div className="seg">
        {ZONES.map((q) => (
          <button key={q} className={q === z ? 'active' : ''} onClick={() => setZ(q)} style={{ borderColor: ROOM_COLOR[q] }}>
            {cfg.roomNames[q].split(' ')[0]}
          </button>
        ))}
      </div>
      <ol>
        {chain.map((c, i) => (
          <li key={c.id} className={`step st-${c.status}${i === cur ? ' current' : ''}`} data-status={c.status} data-step={c.id}>
            <span className="step-ic">{c.status === 'done' ? '✓' : c.status === 'active' ? '▶' : c.status === 'blocked' ? '✕' : '○'}</span>
            <span>{ka.chain.steps[c.id]}</span>
            <span className="step-st">{ka.chain.status[c.status]}</span>
          </li>
        ))}
      </ol>
      <div className="small t-dim">
        აქტუატორები: {loopsOfZone(cfg, z).map((id) => `${id}:${ka.phaseLetter[state.loops[id]?.act.phase ?? 'closed']}`).join(' ') || '—'}
      </div>
    </section>
  );
}

// ── status / warnings ────────────────────────────────────────────────────────

export function StatusStrip({ cfg, state }: { cfg: AppConfig; state: SimState }) {
  const b = state.boiler;
  return (
    <div className="status-strip" data-testid="status-strip">
      <span>{ka.controls.simTime}: <b data-testid="simtime">{fmtTime(state.t)}</b></span>
      <span className={`badge mode-${b.mode}`} data-testid="boiler-mode">ქვაბი: {ka.mode[b.mode]}</span>
      <span>სანთურა: {b.burnerOn ? '🔥' : '—'} {fmt(b.burnerKW)} kW*</span>
      <span>ტუმბო: {b.pumpOn ? '⟳' : '—'}</span>
      <span>მიწოდება {fmt(b.flowC)}° / დაბრ. {fmt(b.returnC)}°</span>
      <span>TA1: {state.controller.ta1Closed ? '● დაკეტ.' : '○ ღია'}</span>
      <span>ჩართვები: {b.burnerStarts} (1სთ: {b.startTimes.length})</span>
      <span className="t-dim">* საილუსტრაციო</span>
      {b.fault && <span className="warn-chip" data-testid="w-fault">{ka.warnings.fault116}</span>}
      {b.deadHead && <span className="warn-chip" data-testid="w-deadhead">{ka.warnings.deadHead}</span>}
      {b.shortCycling && <span className="warn-chip" data-testid="w-short">{ka.warnings.shortCycle} {b.startTimes.length}</span>}
      {b.lowLoad && !b.shortCycling && <span className="warn-chip soft">{ka.warnings.lowLoad}</span>}
      {state.faults.cloudOffline && <span className="warn-chip soft">{ka.warnings.cloud}</span>}
      {!cfg.mappingVerified && <span className="warn-chip soft">{ka.warnings.mappingDemo}</span>}
    </div>
  );
}

// ── inspector ────────────────────────────────────────────────────────────────

const TAG_LABEL: Record<string, string> = ka.tags as unknown as Record<string, string>;

export function resolveInspector(id: string, cfg: AppConfig): InspectorEntry | null {
  if (INSPECTOR[id]) return INSPECTOR[id];
  const [kind, key] = id.split(':');
  if (kind === 'thermostat' && isZone(key)) return thermostatEntry(cfg.roomNames[key], ZONES.indexOf(key) + 1);
  if (kind === 'room') {
    const r = key as RoomId;
    const z = controlZoneOf(r, cfg.owners);
    return roomEntry(cfg.roomNames[r], ROOM_GEOMETRY[r].planAreaM2, loopsByRoom(cfg.loops)[r], z ? `${cfg.roomNames[z]} (Z${ZONES.indexOf(z) + 1})` : '—');
  }
  if (kind === 'loop') {
    const l = cfg.loops.find((q) => q.id === key);
    return loopEntry(key, l?.room ? cfg.roomNames[l.room] : ka.manifoldView.unassigned, cfg.mappingVerified);
  }
  if (kind === 'actuator') return actuatorEntry(key);
  return null;
}

function liveState(id: string, cfg: AppConfig, s: SimState): string {
  const b = s.boiler;
  const [kind, key] = id.split(':');
  switch (kind) {
    case 'boiler':
    case 'hx':
      return `${ka.mode[b.mode]} · სანთურა ${b.burnerOn ? 'ON' : 'OFF'} ${fmt(b.burnerKW)} kW* · მიწოდება ${fmt(b.flowC)}°C · ჩართვები ${b.burnerStarts}`;
    case 'pump':
      return `ტუმბო ${b.pumpOn ? 'მუშაობს' : 'გაჩერებულია'}${b.mode === 'overrun' ? ' (დაყოვნებით)' : ''}${b.deadHead ? ' · ⚠ ნაკადის გზა არ არის' : ''}`;
    case 'diverter':
      return `პოზიცია: ${b.diverter === 'CH' ? 'გათბობა' : 'ცსწ'}`;
    case 'flowswitch':
    case 'shower':
      return `შხაპი ${s.dhw.showerOn ? 'ღიაა' : 'დახურულია'} · სენსორი ${s.dhw.flowSwitch ? 'ON' : 'OFF'} · ${s.dhw.kW > 0 ? `${fmt(s.dhw.outC)}°C, ${fmt(s.dhw.flowLpm)} ლ/წთ` : 'ცხელი წყალი არ მიეწოდება'}`;
    case 'terminals':
    case 'relay':
      return `TA1 ${s.controller.ta1Closed ? 'დაკეტილი (გამოძახება)' : 'ღია'}${b.fault ? ' · FLOOR ღია (116)' : ''}`;
    case 'floorstat':
      return cfg.sim.floorSafetyInstalled ? `დაყენებული · ზღვარი ${cfg.sim.floorSafetyTripC}°C (დემო) · ${b.fault ? 'ამოქმედდა' : 'დაკეტილი'}` : 'არ არის დაყენებული';
    case 'controller':
    case 'dip':
      return ZONES.map((z, i) => `Z${i + 1} ${s.controller.zoneOut[z] ? 'ON' : 'off'}`).join(' · ') + ` · რელე ${s.controller.ta1Closed ? 'COM–NO' : 'ღია'}`;
    case 'pumpout':
      return cfg.sim.pumpOutputEnabled ? 'ჩართულია (მომხმარებლის არჩევანი)' : 'არ გამოიყენება';
    case 'thermostat':
      if (isZone(key)) return `${ka.status[thermostatStatus(s, cfg, key)]} · ${fmt(s.rooms[key].airC)}° → ${cfg.thermostats[key].setpointC}°`;
      return '';
    case 'room': {
      const r = s.rooms[key as RoomId];
      return `ჰაერი ${fmt(r.airC)}° · იატაკი ${fmt(r.floorC)}° · ${fmt(r.heatW / 1000, 2)} kW*`;
    }
    case 'loop':
    case 'actuator': {
      const l = s.loops[key];
      if (!l) return '';
      return `ბრძანება ${l.act.cmd ? 'გახსენი' : 'დახურე'} · ${ka.phase[l.act.phase]} ${Math.round(l.act.pos * 100)}% · ${l.flowing ? `ნაკადი ${fmt(l.flowLpm)} ლ/წთ*, ${fmt(l.heatW)} W*` : 'ნაკადი არ არის'}`;
    }
    case 'pipeA':
    case 'pipeE':
      return `${fmt(kind === 'pipeA' ? b.flowC : b.returnC)}°C · ${b.pumpOn && b.diverter === 'CH' ? 'ნაკადი' : 'ნაკადი არ არის'}`;
    case 'pipeB':
      return s.dhw.kW > 0 ? `${fmt(s.dhw.outC)}°C` : 'უმოქმედო';
    case 'vessel':
      return `${BOILER.expansionVesselL} ლ · ${BOILER.vesselPrechargeBar} ბარი (წნევა არ არის სიმულირებული)`;
    default:
      return '—';
  }
}

export function InspectorPanel({ id, cfg, state, onClose }: { id: string | null; cfg: AppConfig; state: SimState; onClose: () => void }) {
  const e = id ? resolveInspector(id, cfg) : null;
  return (
    <section className="panel inspector" data-testid="inspector">
      <h3>
        {ka.inspector.title}
        {e && (
          <button className="icon" onClick={onClose} aria-label="დახურვა">
            ✕
          </button>
        )}
      </h3>
      {!e ? (
        <p className="t-dim small">{ka.inspector.hint}</p>
      ) : (
        <dl>
          <dt className="insp-name" data-testid="insp-name">{e.name}</dt>
          <dd>
            <span className={`tag tag-${e.tag}`}>{TAG_LABEL[e.tag] ?? e.tag}</span>
          </dd>
          <dt>{ka.inspector.func}</dt>
          <dd>{e.func}</dd>
          <dt>{ka.inspector.conn}</dt>
          <dd>{e.conn}</dd>
          <dt>{ka.inspector.state}</dt>
          <dd data-testid="insp-state">{liveState(id!, cfg, state)}</dd>
          <dt>{ka.inspector.why}</dt>
          <dd>{e.why}</dd>
          <dt>{ka.inspector.sources}</dt>
          <dd className="small">{e.sources}</dd>
          {e.checks.length > 0 && (
            <>
              <dt>{ka.inspector.checks}</dt>
              <dd>
                <ul>
                  {e.checks.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

export function EventLog({ state, cfg }: { state: SimState; cfg: AppConfig }) {
  const ev = state.events.slice(-12).reverse();
  return (
    <section className="panel log">
      <h3>{ka.log}</h3>
      <ul>
        {ev.map((e, i) => (
          <li key={i}>
            <code>{fmtTime(e.t)}</code> {e.arg && isZone(e.arg) ? cfg.roomNames[e.arg] + ': ' : ''}
            {ka.events[e.key] ?? e.key}
            {e.key === 'ev.mode' && e.arg ? ' ' + (ka.mode as Record<string, string>)[e.arg] : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
