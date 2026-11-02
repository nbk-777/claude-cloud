// "3D Balcony Installation" page. Renders the existing simulation state in a procedural
// Three.js scene; never runs a separate simulation.

import { useEffect, useMemo, useRef, useState } from 'react';
import { LOOP_IDS, ZONES, controlZoneOf, type AppConfig, type ZoneId } from '../../model/types';
import { loopsOfZone, thermostatStatus, type SimState } from '../../sim/engine';
import { DEMO } from '../../sim/params';
import { PORTS, ZONE_LABEL, assembledExample, connect, disconnect, portById, summarize, type Connection } from '../../sim/connections';
import { ROOM_COLOR, fmt } from '../util';
import type { CameraPreset, SceneApi, SceneSnapshot } from './scene';

interface Props {
  cfg: AppConfig;
  state: SimState;
  paused: boolean;
  setThermostat: (z: ZoneId, patch: Partial<{ enabled: boolean; setpointC: number }>) => void;
  connections: Connection[];
  setConnections: (c: Connection[]) => void;
  connectMode: boolean;
  setConnectMode: (on: boolean) => void;
}

const MODE_LABEL: Record<string, string> = { standby: 'STANDBY', heating: 'HEATING', dhw: 'HOT WATER', overrun: 'PUMP OVERRUN', fault: 'FAULT 116' };
const ZONE_VIEW_ORDER: ZoneId[] = ['living', 'bath', 'child', 'main'];

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function Balcony3DPage({ cfg, state, paused, setThermostat, connections, setConnections, connectMode, setConnectMode }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'nowebgl' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [fromPort, setFromPort] = useState('');
  const [toPort, setToPort] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const summary = useMemo(() => summarize(connections), [connections]);

  // latest values for the pick callback (scene is created once)
  const live = useRef({ connectMode, pending, connections });
  live.current = { connectMode, pending, connections };

  const tryConnect = (a: string, b: string) => {
    const r = connect(a, b, live.current.connections);
    setConnections(r.connections);
    setMsg(r.result.ok ? { ok: true, text: `Connected: ${portById(r.result.connection!.from)?.label} → ${portById(r.result.connection!.to)?.label}` } : { ok: false, text: r.result.reason ?? 'Not allowed.' });
  };

  const onPick = (id: string | null) => {
    if (id?.startsWith('port:') && live.current.connectMode) {
      const p = id.slice(5);
      const pend = live.current.pending;
      if (!pend) {
        setPending(p);
        setMsg({ ok: true, text: `Selected ${portById(p)?.label}. Now click the port to connect it to.` });
      } else {
        setPending(null);
        if (pend !== p) tryConnect(pend, p);
      }
      return;
    }
    if (id?.startsWith('ctx:') && live.current.connectMode) setMsg({ ok: false, text: 'Context only — not connectable here. Professional installation required.' });
    setSelected(id);
  };
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // create / dispose the scene
  useEffect(() => {
    if (!hasWebGL()) {
      setStatus('nowebgl');
      return;
    }
    let cancelled = false;
    let api: SceneApi | null = null;
    import('./scene')
      .then((mod) => {
        if (cancelled || !hostRef.current) return;
        api = mod.createBalconyScene(hostRef.current, (id) => onPickRef.current(id));
        apiRef.current = api;
        setStatus('ready');
      })
      .catch((e: unknown) => {
        setErrMsg(String(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
      api?.dispose();
      apiRef.current = null;
    };
  }, []);

  // snapshot of the EXISTING simulation for the scene
  const b = state.boiler;
  const snapshot: SceneSnapshot = {
    loops: LOOP_IDS.map((id) => {
      const lc = cfg.loops.find((l) => l.id === id);
      const ls = state.loops[id];
      return {
        id,
        zone: controlZoneOf(lc?.room ?? null, cfg.owners),
        color: lc?.room ? ROOM_COLOR[lc.room] : '#adb5bd',
        pos: ls?.act.pos ?? 0,
        cmd: !!ls?.act.cmd,
        phase: ls?.act.phase ?? 'closed',
        flowing: !!ls?.flowing && !state.faults.stuck[id],
        flowFrac: (ls?.flowLpm ?? 0) / DEMO.loopFlowLpm,
      };
    }),
    burnerOn: b.burnerOn,
    pumpOn: b.pumpOn,
    mode: b.mode,
    modeLabel: MODE_LABEL[b.mode] ?? b.mode,
    flowC: b.flowC,
    returnC: b.returnC,
    ta1: state.controller.ta1Closed,
    chFlow: b.pumpOn && b.diverter === 'CH' && Object.values(state.loops).some((l) => l.flowing),
    zoneOut: state.controller.zoneOut,
    thermostats: Object.fromEntries(
      ZONES.map((z) => [z, { label: ZONE_LABEL[z], air: state.rooms[z].airC, sp: cfg.thermostats[z].setpointC, enabled: cfg.thermostats[z].enabled, calling: state.rooms[z].calling }]),
    ) as SceneSnapshot['thermostats'],
    paused,
    speed: cfg.sim.speed,
    connectMode,
    summary,
    connections,
    pendingPort: pending,
  };
  useEffect(() => {
    apiRef.current?.update(snapshot);
  });

  const selZone: ZoneId | null = selected?.startsWith('thermostat:') ? (selected.slice(11) as ZoneId) : null;
  const selLoops = useMemo(() => (selZone ? loopsOfZone(cfg, selZone) : []), [selZone, cfg]);
  useEffect(() => {
    apiRef.current?.setSelection(selected, selLoops);
  }, [selected, selLoops, status]);
  useEffect(() => {
    apiRef.current?.setExplain(explain);
  }, [explain, status]);

  const cam = (p: CameraPreset) => apiRef.current?.setCamera(p);

  return (
    <div className="b3d" data-testid="balcony3d-page">
      <div className="b3d-head">
        <h2>3D Balcony Installation</h2>
        <p className="small">ქვაბი, კოლექტორი, აქტუატორები და მართვა 3D-ში · all values simulated / illustrative</p>
      </div>
      <div className="b3d-disclaimer" role="note">
        Illustrative prototype. It does not replace boiler controls, safety devices, frost protection, minimum-flow requirements, pump-overrun requirements,
        hydraulic design or professional commissioning. Dimensions are illustrative, not installation clearances, and nothing here states that a boiler is
        approved for balcony installation. No installation instructions are given.
      </div>

      <div className="b3d-grid">
        <div className="b3d-stage">
          <div className="b3d-toolbar">
            <span className="small">Camera:</span>
            {(
              [
                ['full', 'Full balcony'],
                ['boiler', 'Boiler'],
                ['manifold', 'Manifold'],
                ['controller', 'Controller'],
              ] as [CameraPreset, string][]
            ).map(([p, l]) => (
              <button key={p} onClick={() => cam(p)} data-testid={`cam-${p}`}>
                {l}
              </button>
            ))}
            <button onClick={() => cam('full')} data-testid="cam-reset">
              ⟲ Reset camera
            </button>
            <label className="check">
              <input type="checkbox" id="b3d-explain" checked={explain} onChange={(e) => setExplain(e.target.checked)} data-testid="explain-toggle" />
              Explain system
            </label>
            <label className="check">
              <input
                type="checkbox"
                id="b3d-connect"
                checked={connectMode}
                onChange={(e) => {
                  setConnectMode(e.target.checked);
                  setPending(null);
                  setMsg(null);
                }}
                data-testid="connect-toggle"
              />
              Connect components
            </label>
          </div>
          <div className="b3d-canvas" ref={hostRef} data-status={status} data-testid="b3d-canvas-host">
            {status === 'loading' && <div className="b3d-overlay">Loading 3D scene…</div>}
            {status === 'nowebgl' && (
              <div className="b3d-overlay" data-testid="no-webgl">
                WebGL is not available in this browser, so the 3D scene cannot be shown. The other pages still work.
              </div>
            )}
            {status === 'error' && <div className="b3d-overlay">The 3D scene failed to load: {errMsg}</div>}
            {explain && status === 'ready' && (
              <div className="b3d-legend">
                <span><i style={{ background: '#ff3b30' }} /> Supply (hot)</span>
                <span><i style={{ background: '#2f80ff' }} /> Return (cooler)</span>
                <span><i style={{ background: '#2f9e44' }} /> Control signal</span>
                <span><i style={{ background: '#e8711c' }} /> Boiler demand</span>
              </div>
            )}
          </div>
          <p className="small t-dim">Drag to orbit · scroll / pinch to zoom · right-drag or two-finger drag to pan · click a component to inspect it.</p>
        </div>

        <aside className="b3d-side">
          <section className="panel" data-testid="b3d-thermostats">
            <h3>Room thermostats (simulated)</h3>
            {ZONE_VIEW_ORDER.map((z) => {
              const th = cfg.thermostats[z];
              const st = thermostatStatus(state, cfg, z);
              return (
                <div key={z} className={'b3d-th' + (selected === 'thermostat:' + z ? ' sel' : '')}>
                  <button className="link" onClick={() => setSelected('thermostat:' + z)} style={{ color: ROOM_COLOR[z] }}>
                    <b>{ZONE_LABEL[z]}</b>
                  </button>
                  <span className="small">{fmt(state.rooms[z].airC)}°C</span>
                  <span className="b3d-sp">
                    <button aria-label={`${ZONE_LABEL[z]} −0.5`} onClick={() => setThermostat(z, { setpointC: Math.max(5, th.setpointC - 0.5) })} data-testid={`b3d-minus-${z}`}>
                      −
                    </button>
                    <b data-testid={`b3d-sp-${z}`}>{th.setpointC.toFixed(1)}</b>
                    <button aria-label={`${ZONE_LABEL[z]} +0.5`} onClick={() => setThermostat(z, { setpointC: Math.min(30, th.setpointC + 0.5) })} data-testid={`b3d-plus-${z}`}>
                      +
                    </button>
                  </span>
                  <button className={'power' + (th.enabled ? ' on' : '')} onClick={() => setThermostat(z, { enabled: !th.enabled })} data-testid={`b3d-power-${z}`} aria-pressed={th.enabled}>
                    {th.enabled ? 'On' : 'Off'}
                  </button>
                  <span className={`badge st-${st}`}>{st === 'calling' ? 'heat demand' : st === 'satisfied' ? 'satisfied' : st === 'off' ? 'off' : st === 'sensor_lost' ? 'sensor lost' : 'idle'}</span>
                </div>
              );
            })}
            <p className="small t-dim">
              Boiler: <b data-testid="b3d-boiler-mode">{MODE_LABEL[b.mode]}</b> · burner {b.burnerOn ? 'on' : 'off'} · pump {b.pumpOn ? 'on' : 'off'} · demand {state.controller.ta1Closed ? 'requested' : 'none'} (simulated)
            </p>
          </section>

          <Inspector id={selected} cfg={cfg} state={state} connectMode={connectMode} summary={summary} onClose={() => setSelected(null)} />

          {connectMode && (
            <section className="panel b3d-connect" data-testid="connect-panel">
              <h3>Connect components (conceptual)</h3>
              <p className="small">
                Click two port markers in the scene, or choose them below. While this mode is on, missing links change the simulation on this page. Gas, flue,
                pressure-relief and mains wiring cannot be connected: professional installation required.
              </p>
              <div className="b3d-row">
                <select value={fromPort} onChange={(e) => setFromPort(e.target.value)} aria-label="From port" data-testid="from-port">
                  <option value="">From port…</option>
                  {PORTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select value={toPort} onChange={(e) => setToPort(e.target.value)} aria-label="To port" data-testid="to-port">
                  <option value="">To port…</option>
                  {PORTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button className="primary" disabled={!fromPort || !toPort} onClick={() => tryConnect(fromPort, toPort)} data-testid="connect-btn">
                  Connect
                </button>
              </div>
              {msg && (
                <p className={msg.ok ? 't-ok small' : 't-warn small'} data-testid="connect-msg">
                  {msg.text}
                </p>
              )}
              <div className="b3d-row">
                <button onClick={() => { setConnections(assembledExample()); setMsg({ ok: true, text: 'Assembled example loaded.' }); }} data-testid="load-example">
                  Load assembled example
                </button>
                <button onClick={() => { setConnections([]); setPending(null); setMsg({ ok: true, text: 'All conceptual connections removed.' }); }} data-testid="reset-connections">
                  Reset connections
                </button>
              </div>
              <ul className="b3d-status small" data-testid="connect-status">
                <li className={summary.waterPath ? 'ok' : 'bad'}>
                  Water path: supply {summary.supply ? '✓' : '✗'} · return {summary.ret ? '✓' : '✗'} {summary.waterPath ? '' : '→ no flow can be shown'}
                </li>
                {ZONES.map((z) => (
                  <li key={z} className={summary.signal[z] && summary.power[z] ? 'ok' : 'bad'}>
                    {ZONE_LABEL[z]}: signal {summary.signal[z] ? '✓' : '✗'} · actuator power {summary.power[z] ? '✓' : '✗'}
                  </li>
                ))}
                <li className={summary.demandLink ? 'ok' : 'bad'}>Boiler demand link {summary.demandLink ? '✓' : '✗ → boiler request blocked'}</li>
              </ul>
              {connections.length > 0 && (
                <ul className="b3d-links small">
                  {connections.map((c) => (
                    <li key={c.from + c.to}>
                      {portById(c.from)?.label} → {portById(c.to)?.label}{' '}
                      <button className="icon" aria-label="Remove link" onClick={() => setConnections(disconnect(connections, c.from, c.to))}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small t-dim">Context only (not connectable): gas · flue · pressure-relief discharge · mains power — professional installation required.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Inspector({ id, cfg, state, connectMode, summary, onClose }: { id: string | null; cfg: AppConfig; state: SimState; connectMode: boolean; summary: ReturnType<typeof summarize>; onClose: () => void }) {
  const b = state.boiler;
  let name = '';
  let func = '';
  let st = '';
  if (!id) {
    return (
      <section className="panel" data-testid="b3d-inspector">
        <h3>Inspector</h3>
        <p className="small t-dim">Click the boiler, manifold, an actuator, the controller or a thermostat.</p>
      </section>
    );
  }
  const flowingCount = Object.values(state.loops).filter((l) => l.flowing).length;
  const openCount = Object.values(state.loops).filter((l) => l.act.pos >= 0.98).length;
  if (id === 'boiler') {
    name = 'Boiler — generic wall-hung combi (illustrative)';
    func = 'Heats the heating water (supply out, return in) when the demand input is closed. Represents the planned Ariston Genus ONE 24; the exact variant is unverified, so the model is generic and unbranded.';
    st = `${MODE_LABEL[b.mode]} · burner ${b.burnerOn ? 'ON' : 'off'} · pump ${b.pumpOn ? 'running' : 'stopped'} · flow ${fmt(b.flowC)}°C / return ${fmt(b.returnC)}°C · demand input ${state.controller.ta1Closed ? 'closed' : 'open'}${b.deadHead ? ' · no open flow path (burner blocked in simulation)' : ''}`;
  } else if (id === 'manifold' || id === 'pipe:supply' || id === 'pipe:return') {
    name = id === 'manifold' ? 'Supply & return manifold (14 loops)' : id === 'pipe:supply' ? 'Heating supply pipe (boiler → manifold)' : 'Heating return pipe (manifold → boiler)';
    func = 'Distributes heating water to 14 floor loops (supply bar, with actuators) and collects it back (return bar, with flow meters).';
    st = `${openCount}/14 actuators fully open · ${flowingCount} loops with flow · supply ${fmt(b.flowC)}°C / return ${fmt(b.returnC)}°C (simulated)${connectMode ? ` · water path ${summary.waterPath ? 'complete' : 'INCOMPLETE'}` : ''}`;
  } else if (id.startsWith('actuator:')) {
    const lid = id.slice(9);
    const lc = cfg.loops.find((l) => l.id === lid);
    const ls = state.loops[lid];
    const z = controlZoneOf(lc?.room ?? null, cfg.owners);
    name = `Thermal actuator ${lid}`;
    func = 'Normally-closed electrothermal actuator on the loop valve; opens when its zone output is energised (≈3–5 min, simulated).';
    st = `room ${lc?.room ? cfg.roomNames[lc.room] : 'unassigned'} · zone ${z ? ZONE_LABEL[z] : '—'} · command ${ls?.act.cmd ? 'OPEN' : 'close'} · position ${Math.round((ls?.act.pos ?? 0) * 100)}% (${ls?.act.phase}) · ${ls?.flowing ? `flow ${fmt(ls.flowLpm)} L/min*` : 'no flow'}`;
  } else if (id === 'controller') {
    name = 'Zone controller (wiring centre)';
    func = 'Receives the thermostat signals, powers each zone’s actuator group and, after its delay, closes the boiler-demand contact.';
    st = ZONES.map((z, i) => `Z${i + 1} ${ZONE_LABEL[z]}: ${state.controller.zoneOut[z] ? 'ON' : 'off'}`).join(' · ') + ` · boiler demand ${state.controller.ta1Closed ? 'ON' : 'off'} · delay ${cfg.sim.relayDelayS / 60} min`;
  } else if (id.startsWith('thermostat:')) {
    const z = id.slice(11) as ZoneId;
    name = `Room thermostat — ${ZONE_LABEL[z]}`;
    func = 'Measures room air temperature and calls for heat below its setpoint (hysteresis). Its zone’s actuators and loops are highlighted.';
    st = `${fmt(state.rooms[z].airC)}°C → setpoint ${cfg.thermostats[z].setpointC.toFixed(1)}°C · ${cfg.thermostats[z].enabled ? 'on' : 'off'} · ${state.rooms[z].calling ? 'calling for heat' : 'not calling'} · controls ${loopsOfZone(cfg, z).join(', ')}${connectMode ? ` · signal link ${summary.signal[z] ? 'connected' : 'DISCONNECTED (no demand)'}` : ''}`;
  } else if (id.startsWith('ctx:')) {
    const names: Record<string, string> = { 'ctx:gas': 'Gas supply', 'ctx:flue': 'Flue', 'ctx:prv': 'Pressure-relief discharge', 'ctx:mains': 'Mains power / isolator' };
    name = names[id] ?? id;
    func = 'Context only. Not part of this simulation and not connectable. Professional installation required.';
    st = '—';
  } else {
    name = id;
  }
  return (
    <section className="panel" data-testid="b3d-inspector">
      <h3>
        Inspector
        <button className="icon" onClick={onClose} aria-label="Close inspector">
          ✕
        </button>
      </h3>
      <p className="insp-name" data-testid="b3d-insp-name">
        <b>{name}</b>
      </p>
      <p className="small">{func}</p>
      <p className="small" data-testid="b3d-insp-state">
        <b>Simulated state:</b> {st}
      </p>
    </section>
  );
}
