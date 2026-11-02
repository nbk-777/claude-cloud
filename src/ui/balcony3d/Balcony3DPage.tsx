// "3D აივნის ინსტალაცია" page. Renders the existing simulation state in a procedural
// Three.js scene; never runs a separate simulation. UI text is Georgian.

import { useEffect, useMemo, useRef, useState } from 'react';
import { LOOP_IDS, ZONES, controlZoneOf, type AppConfig, type ZoneId } from '../../model/types';
import { chLimits, loopsOfZone, thermostatStatus, type SimState } from '../../sim/engine';
import { DEMO } from '../../sim/params';
import { PORTS, ZONE_LABEL, assembledExample, connect, disconnect, portById, summarize, type Connection } from '../../sim/connections';
import { ROOM_COLOR, fmt } from '../util';
import type { CameraPreset, SceneApi, SceneSnapshot } from './scene';

interface Props {
  cfg: AppConfig;
  state: SimState;
  paused: boolean;
  setThermostat: (z: ZoneId, patch: Partial<{ enabled: boolean; setpointC: number }>) => void;
  setChSetpoint: (v: number) => void;
  connections: Connection[];
  setConnections: (c: Connection[]) => void;
  connectMode: boolean;
  setConnectMode: (on: boolean) => void;
}

const MODE_LABEL: Record<string, string> = { standby: 'მოლოდინი', heating: 'გათბობა', dhw: 'ცხელი წყალი', overrun: 'ტუმბოს დაყოვნება', fault: 'ხარვეზი 116' };
const STATUS_LABEL: Record<string, string> = { calling: 'ითხოვს სითბოს', satisfied: 'მიზანს მიაღწია', off: 'გამორთული', sensor_lost: 'სენსორი დაკარგულია', idle: 'მოლოდინი' };
const ZONE_VIEW_ORDER: ZoneId[] = ['living', 'child', 'main', 'bath']; // = controller zones Z1..Z4
const CAMS: [CameraPreset, string][] = [
  ['full', 'მთელი აივანი'],
  ['boiler', 'ქვაბი'],
  ['manifold', 'კოლექტორი'],
  ['controller', 'კონტროლერი'],
  ['thermostats', 'თერმოსტატები'],
];

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export function Balcony3DPage({ cfg, state, paused, setThermostat, setChSetpoint, connections, setConnections, connectMode, setConnectMode }: Props) {
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
  const [toast, setToast] = useState('');
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const toggleController = (open: boolean) => {
    setCtrlOpen(open);
    apiRef.current?.setControllerOpen(open);
    apiRef.current?.setCamera(open ? 'controllerInside' : 'controller');
    if (open) setSelected('controller');
  };
  const summary = useMemo(() => summarize(connections), [connections]);
  const [chMin, chMax] = chLimits(cfg);

  // latest values for the scene's pick callback (the scene is created once)
  const live = useRef({ connectMode, pending, connections, cfg });
  live.current = { connectMode, pending, connections, cfg };

  const tryConnect = (a: string, b: string) => {
    const r = connect(a, b, live.current.connections);
    setConnections(r.connections);
    setMsg(r.result.ok ? { ok: true, text: `შეერთდა: ${portById(r.result.connection!.from)?.label} → ${portById(r.result.connection!.to)?.label}` } : { ok: false, text: r.result.reason ?? 'დაუშვებელია.' });
  };

  const onPick = (id: string | null) => {
    const c = live.current.cfg;
    // functional buttons drawn on the 3D devices
    if (id?.startsWith('tbtn:')) {
      const [, z, act] = id.split(':') as [string, ZoneId, string];
      const th = c.thermostats[z];
      if (act === 'power') setThermostat(z, { enabled: !th.enabled });
      if (act === 'minus') setThermostat(z, { setpointC: Math.max(5, th.setpointC - 0.5) });
      if (act === 'plus') setThermostat(z, { setpointC: Math.min(30, th.setpointC + 0.5) });
      const after = act === 'power' ? (th.enabled ? 'გამოირთო' : 'ჩაირთო') : `სასურველი ${(act === 'minus' ? Math.max(5, th.setpointC - 0.5) : Math.min(30, th.setpointC + 0.5)).toFixed(1)}°C`;
      setToast(`${c.roomNames[z]}: ${after}`);
      setSelected('thermostat:' + z);
      return;
    }
    if (id === 'bbtn:minus' || id === 'bbtn:plus') {
      const [lo, hi] = chLimits(c);
      const v = Math.min(hi, Math.max(lo, c.sim.chSetpointC + (id === 'bbtn:plus' ? 1 : -1)));
      setChSetpoint(v);
      setToast(`ქვაბი: მიწოდების სასურველი t° ${v}°C (დიაპაზონი ${lo}–${hi}°C)`);
      setSelected('boiler');
      return;
    }
    if (id?.startsWith('port:') && live.current.connectMode) {
      const p = id.slice(5);
      const pend = live.current.pending;
      if (!pend) {
        setPending(p);
        setMsg({ ok: true, text: `არჩეულია: ${portById(p)?.label}. ახლა დააწკაპუნეთ მეორე პორტზე.` });
      } else {
        setPending(null);
        if (pend !== p) tryConnect(pend, p);
      }
      return;
    }
    // tapping a thermostat from far away zooms in so its buttons are easy to press
    if (id?.startsWith('thermostat:') && (apiRef.current?.cameraDistanceTo(-1.03, 1.45, 0) ?? 0) > 0.8) apiRef.current?.focusThermostat(id.slice(11) as ZoneId);
    if (id?.startsWith('ctx:') && live.current.connectMode) setMsg({ ok: false, text: 'მხოლოდ კონტექსტია — აქ არ ერთდება. საჭიროა პროფესიონალური მონტაჟი.' });
    setSelected(id);
  };
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

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
        api = mod.createBalconyScene(hostRef.current, (id) => onPickRef.current(id), live.current.cfg.roomNames);
        apiRef.current = api;
        // automation hook (used by e2e/balcony3d.mjs to click the 3D buttons)
        (window as unknown as { __balcony3d?: unknown }).__balcony3d = { buttonScreenPos: (bid: string) => apiRef.current?.buttonScreenPos(bid) ?? null };
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
      ZONES.map((z) => [z, { label: cfg.roomNames[z], air: state.rooms[z].airC, sp: cfg.thermostats[z].setpointC, enabled: cfg.thermostats[z].enabled, calling: state.rooms[z].calling }]),
    ) as SceneSnapshot['thermostats'],
    paused,
    speed: cfg.sim.speed,
    chSetpoint: cfg.sim.chSetpointC,
    relayDelayS: cfg.sim.relayDelayS,
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
        <h2>3D აივნის ინსტალაცია</h2>
        <p className="small">ქვაბი, კოლექტორი, აქტუატორები, კონტროლერი და თერმოსტატები 3D-ში · ყველა მნიშვნელობა სიმულირებული / საილუსტრაციოა</p>
      </div>
      <div className="b3d-disclaimer" role="note">
        საილუსტრაციო პროტოტიპი. ის არ ცვლის ქვაბის მართვას, დამცავ მოწყობილობებს, ყინვისგან დაცვას, მინიმალური ნაკადის და ტუმბოს დაყოვნების მოთხოვნებს,
        ჰიდრავლიკურ პროექტს ან პროფესიონალურ გაშვებას. ზომები საილუსტრაციოა და არ არის მონტაჟის მანძილები; არ არის ნათქვამი, რომ ქვაბის აივანზე დაყენება
        დაშვებულია. მონტაჟის ინსტრუქცია აქ არ არის.
      </div>

      <div className="b3d-grid">
        <div className="b3d-stage">
          <div className="b3d-toolbar">
            <span className="small">კამერა:</span>
            {CAMS.map(([p, l]) => (
              <button key={p} onClick={() => cam(p)} data-testid={`cam-${p}`}>
                {l}
              </button>
            ))}
            <button onClick={() => cam('full')} data-testid="cam-reset">
              ⟲ კამერის აღდგენა
            </button>
            <button className={ctrlOpen ? 'primary' : ''} onClick={() => toggleController(!ctrlOpen)} data-testid="ctrl-open" aria-pressed={ctrlOpen}>
              {ctrlOpen ? '▣ კონტროლერის დახურვა' : '▢ კონტროლერის გახსნა'}
            </button>
            <label className="check">
              <input type="checkbox" id="b3d-explain" checked={explain} onChange={(e) => setExplain(e.target.checked)} data-testid="explain-toggle" />
              სისტემის ახსნა
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
              კომპონენტების შეერთება
            </label>
          </div>
          <div className="b3d-canvas" ref={hostRef} data-status={status} data-testid="b3d-canvas-host">
            {status === 'loading' && <div className="b3d-overlay">3D სცენა იტვირთება…</div>}
            {status === 'nowebgl' && (
              <div className="b3d-overlay" data-testid="no-webgl">
                ამ ბრაუზერში WebGL მიუწვდომელია, ამიტომ 3D სცენა ვერ ჩანს. დანარჩენი გვერდები მუშაობს.
              </div>
            )}
            {status === 'error' && <div className="b3d-overlay">3D სცენა ვერ ჩაიტვირთა: {errMsg}</div>}
            {toast && (
              <div className="b3d-toast" data-testid="b3d-toast" role="status">
                {toast}
              </div>
            )}
            {ctrlOpen && status === 'ready' && (
              <div className="b3d-legend b3d-legend-top" data-testid="ctrl-legend">
                <span><i style={{ background: '#8d5524' }} /> L (ყავისფერი)</span>
                <span><i style={{ background: '#1c7ed6' }} /> N (ლურჯი)</span>
                <span><i style={{ background: '#2f9e44' }} /> სიგნალი (მწვანე)</span>
                <span><i style={{ background: '#e8711c' }} /> რელე → ქვაბი</span>
                <span>ნათება = ძაბვა / სიგნალი არის</span>
              </div>
            )}
            {explain && status === 'ready' && (
              <div className="b3d-legend">
                <span><i style={{ background: '#ff3b30' }} /> მიწოდება (ცხელი)</span>
                <span><i style={{ background: '#2f80ff' }} /> დაბრუნება (გაცივებული)</span>
                <span><i style={{ background: '#2f9e44' }} /> მართვის სიგნალი</span>
                <span><i style={{ background: '#e8711c' }} /> ქვაბის მოთხოვნა</span>
              </div>
            )}
          </div>
          <p className="small t-dim">
            თითით/მაუსით გადაათრიეთ — ბრუნვა · ორი თითი ან ბორბალი — მასშტაბი · მარჯვენა ღილაკი ან ორი თითით გადატანა — გადაადგილება · დააჭირეთ კომპონენტს — ინფორმაცია.
            <b> სცენაში თერმოსტატების ⏻ / − / + და ქვაბის − / + ღილაკები მუშაობს.</b>
          </p>
        </div>

        <aside className="b3d-side">
          <section className="panel" data-testid="b3d-thermostats">
            <h3>ოთახის თერმოსტატები (სიმულაცია)</h3>
            {ZONE_VIEW_ORDER.map((z) => {
              const th = cfg.thermostats[z];
              const st = thermostatStatus(state, cfg, z);
              return (
                <div key={z} className={'b3d-th' + (selected === 'thermostat:' + z ? ' sel' : '')}>
                  <button className="link" onClick={() => setSelected('thermostat:' + z)} style={{ color: ROOM_COLOR[z] }} data-testid={`b3d-name-${z}`}>
                    <b>{cfg.roomNames[z]}</b>
                  </button>
                  <span className="small">{fmt(state.rooms[z].airC)}°C</span>
                  <span className="b3d-sp">
                    <button aria-label={`${cfg.roomNames[z]} −0.5°C`} onClick={() => setThermostat(z, { setpointC: Math.max(5, th.setpointC - 0.5) })} data-testid={`b3d-minus-${z}`}>
                      −
                    </button>
                    <b data-testid={`b3d-sp-${z}`}>{th.setpointC.toFixed(1)}</b>
                    <button aria-label={`${cfg.roomNames[z]} +0.5°C`} onClick={() => setThermostat(z, { setpointC: Math.min(30, th.setpointC + 0.5) })} data-testid={`b3d-plus-${z}`}>
                      +
                    </button>
                  </span>
                  <button className={'power' + (th.enabled ? ' on' : '')} onClick={() => setThermostat(z, { enabled: !th.enabled })} data-testid={`b3d-power-${z}`} aria-pressed={th.enabled}>
                    {th.enabled ? 'ჩართ.' : 'გამორთ.'}
                  </button>
                  <span className={`badge st-${st}`}>{STATUS_LABEL[st] ?? st}</span>
                </div>
              );
            })}
            <div className="b3d-boilerctl">
              <span className="small">ქვაბის მიწოდების სასურველი t°:</span>
              <span className="b3d-sp">
                <button aria-label="ქვაბი −1°C" onClick={() => setChSetpoint(Math.max(chMin, cfg.sim.chSetpointC - 1))} data-testid="b3d-ch-minus">
                  −
                </button>
                <b data-testid="b3d-ch">{cfg.sim.chSetpointC}°C</b>
                <button aria-label="ქვაბი +1°C" onClick={() => setChSetpoint(Math.min(chMax, cfg.sim.chSetpointC + 1))} data-testid="b3d-ch-plus">
                  +
                </button>
              </span>
              <span className="small t-dim">
                ({chMin}–{chMax}°C)
              </span>
            </div>
            <p className="small t-dim">
              ქვაბი: <b data-testid="b3d-boiler-mode">{MODE_LABEL[b.mode]}</b> · სანთურა {b.burnerOn ? 'ანთია' : 'ჩამქრალია'} · ტუმბო {b.pumpOn ? 'მუშაობს' : 'გაჩერებულია'} · მოთხოვნა{' '}
              {state.controller.ta1Closed ? 'არის' : 'არ არის'} (სიმულაცია)
            </p>
          </section>

          <Inspector id={selected} cfg={cfg} state={state} connectMode={connectMode} summary={summary} onClose={() => setSelected(null)} ctrlOpen={ctrlOpen} toggleController={toggleController} />

          {connectMode && (
            <section className="panel b3d-connect" data-testid="connect-panel">
              <h3>კომპონენტების შეერთება (კონცეპტუალური)</h3>
              <p className="small">
                დააჭირეთ სცენაში ორ პორტის მარკერს, ან აირჩიეთ ქვემოთ. სანამ ეს რეჟიმი ჩართულია, ამ გვერდზე გამოტოვებული კავშირები სიმულაციას ცვლის. გაზი, საკვამური,
                დამცავი სარქველი და ქსელის კვება არ ერთდება — საჭიროა პროფესიონალური მონტაჟი.
              </p>
              <div className="b3d-row">
                <select value={fromPort} onChange={(e) => setFromPort(e.target.value)} aria-label="საიდან" data-testid="from-port">
                  <option value="">საიდან…</option>
                  {PORTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <select value={toPort} onChange={(e) => setToPort(e.target.value)} aria-label="სად" data-testid="to-port">
                  <option value="">სად…</option>
                  {PORTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button className="primary" disabled={!fromPort || !toPort} onClick={() => tryConnect(fromPort, toPort)} data-testid="connect-btn">
                  შეერთება
                </button>
              </div>
              {msg && (
                <p className={msg.ok ? 't-ok small' : 't-warn small'} data-testid="connect-msg">
                  {msg.text}
                </p>
              )}
              <div className="b3d-row">
                <button
                  onClick={() => {
                    setConnections(assembledExample());
                    setMsg({ ok: true, text: 'აწყობილი მაგალითი ჩაიტვირთა.' });
                  }}
                  data-testid="load-example"
                >
                  აწყობილი მაგალითის ჩატვირთვა
                </button>
                <button
                  onClick={() => {
                    setConnections([]);
                    setPending(null);
                    setMsg({ ok: true, text: 'ყველა კონცეპტუალური კავშირი წაიშალა.' });
                  }}
                  data-testid="reset-connections"
                >
                  კავშირების გასუფთავება
                </button>
              </div>
              <ul className="b3d-status small" data-testid="connect-status">
                <li className={summary.waterPath ? 'ok' : 'bad'}>
                  წყლის გზა: მიწოდება {summary.supply ? '✓' : '✗'} · დაბრუნება {summary.ret ? '✓' : '✗'} {summary.waterPath ? '' : '→ ნაკადი ვერ გამოჩნდება'}
                </li>
                {ZONES.map((z) => (
                  <li key={z} className={summary.signal[z] && summary.power[z] ? 'ok' : 'bad'}>
                    {ZONE_LABEL[z]}: სიგნალი {summary.signal[z] ? '✓' : '✗'} · აქტუატორების კვება {summary.power[z] ? '✓' : '✗'}
                  </li>
                ))}
                <li className={summary.demandLink ? 'ok' : 'bad'}>ქვაბის მოთხოვნის კავშირი {summary.demandLink ? '✓' : '✗ → ქვაბი არ ირთვება'}</li>
              </ul>
              {connections.length > 0 && (
                <ul className="b3d-links small">
                  {connections.map((c) => (
                    <li key={c.from + c.to}>
                      {portById(c.from)?.label} → {portById(c.to)?.label}{' '}
                      <button className="icon" aria-label="კავშირის წაშლა" onClick={() => setConnections(disconnect(connections, c.from, c.to))}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small t-dim">მხოლოდ კონტექსტი (არ ერთდება): გაზი · საკვამური · დამცავი სარქვლის გამონადენი · ქსელის კვება — საჭიროა პროფესიონალური მონტაჟი.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Inspector({
  id,
  cfg,
  state,
  connectMode,
  summary,
  onClose,
  ctrlOpen,
  toggleController,
}: {
  id: string | null;
  cfg: AppConfig;
  state: SimState;
  connectMode: boolean;
  summary: ReturnType<typeof summarize>;
  onClose: () => void;
  ctrlOpen: boolean;
  toggleController: (open: boolean) => void;
}) {
  const b = state.boiler;
  let name = '';
  let func = '';
  let st = '';
  if (!id) {
    return (
      <section className="panel" data-testid="b3d-inspector">
        <h3>ინსპექტორი</h3>
        <p className="small t-dim">დააჭირეთ ქვაბს, კოლექტორს, აქტუატორს, კონტროლერს ან თერმოსტატს.</p>
      </section>
    );
  }
  const flowingCount = Object.values(state.loops).filter((l) => l.flowing).length;
  const openCount = Object.values(state.loops).filter((l) => l.act.pos >= 0.98).length;
  if (id === 'boiler') {
    name = 'ქვაბი — ზოგადი კედლის კომბი (საილუსტრაციო)';
    func = 'აცხელებს გათბობის წყალს (მიწოდება გამოდის, დაბრუნება შედის), როცა მოთხოვნის შესასვლელი დაკეტილია. წარმოადგენს დაგეგმილ Ariston Genus ONE 24-ს; ზუსტი ვარიანტი დაუდასტურებელია, ამიტომ მოდელი ზოგადია, ბრენდის გარეშე. წინა პანელზე − / + ცვლის მიწოდების სასურველ t°-ს.';
    st = `${MODE_LABEL[b.mode]} · სანთურა ${b.burnerOn ? 'ანთია' : 'ჩამქრალია'} · ტუმბო ${b.pumpOn ? 'მუშაობს' : 'გაჩერებულია'} · მიწოდება ${fmt(b.flowC)}°C / დაბრუნება ${fmt(b.returnC)}°C · სასურველი ${cfg.sim.chSetpointC}°C · მოთხოვნა ${state.controller.ta1Closed ? 'დაკეტილია' : 'ღიაა'}${b.deadHead ? ' · ნაკადის გზა არ არის (სიმულაციაში სანთურა დაბლოკილია)' : ''}`;
  } else if (id === 'manifold' || id === 'pipe:supply' || id === 'pipe:return') {
    name = id === 'manifold' ? 'მიწოდების და დაბრუნების კოლექტორი (14 კონტური)' : id === 'pipe:supply' ? 'გათბობის მიწოდების მილი (ქვაბი → კოლექტორი)' : 'გათბობის დაბრუნების მილი (კოლექტორი → ქვაბი)';
    func = 'ანაწილებს გათბობის წყალს 14 იატაკის კონტურზე (მიწოდების ბარი, აქტუატორებით) და აგროვებს უკან (დაბრუნების ბარი, ნაკადმზომებით).';
    st = `${openCount}/14 აქტუატორი სრულად ღიაა · ${flowingCount} კონტურში ნაკადია · მიწოდება ${fmt(b.flowC)}°C / დაბრუნება ${fmt(b.returnC)}°C (სიმულაცია)${connectMode ? ` · წყლის გზა ${summary.waterPath ? 'სრულია' : 'არასრულია'}` : ''}`;
  } else if (id.startsWith('actuator:')) {
    const lid = id.slice(9);
    const lc = cfg.loops.find((l) => l.id === lid);
    const ls = state.loops[lid];
    const z = controlZoneOf(lc?.room ?? null, cfg.owners);
    name = `თბური აქტუატორი ${lid}`;
    func = 'ჩვეულებრივ დახურული (NC) ელექტროთერმული აქტუატორი კონტურის სარქველზე; იღება, როცა მისი ზონის გამოსავალს ძაბვა მიეწოდება (≈3–5 წთ, სიმულაცია).';
    st = `ოთახი ${lc?.room ? cfg.roomNames[lc.room] : 'მიუნიჭებელი'} · ზონა ${z ? cfg.roomNames[z] : '—'} · ბრძანება ${ls?.act.cmd ? 'გახსენი' : 'დახურე'} · გახსნა ${Math.round((ls?.act.pos ?? 0) * 100)}% · ${ls?.flowing ? `ნაკადი ${fmt(ls.flowLpm)} ლ/წთ*` : 'ნაკადი არ არის'}`;
  } else if (id === 'controller') {
    name = 'ზონის კონტროლერი (გაყვანილობის ცენტრი)';
    func = 'იღებს თერმოსტატების სიგნალს, აძლევს ძაბვას თითოეული ზონის აქტუატორებს და დაყოვნების შემდეგ კეტავს ქვაბის მოთხოვნის კონტაქტს.';
    st = ZONES.map((z, i) => `Z${i + 1} ${cfg.roomNames[z]}: ${state.controller.zoneOut[z] ? 'ჩართ.' : 'გამორთ.'}`).join(' · ') + ` · ქვაბის მოთხოვნა ${state.controller.ta1Closed ? 'ჩართ.' : 'გამორთ.'} · დაყოვნება ${cfg.sim.relayDelayS / 60} წთ`;
  } else if (id.startsWith('ctrl:') || id.startsWith('tcable:') || id.startsWith('acable:') || id === 'duct') {
    const zoneNo = (z: ZoneId) => ['living', 'child', 'main', 'bath'].indexOf(z) + 1;
    const [kind, sub] = [id.split(':')[0] + ':' + (id.split(':')[1] ?? ''), id.split(':')[2] as ZoneId | undefined];
    const z = (sub ?? (id.split(':')[1] as ZoneId)) as ZoneId;
    if (kind === 'ctrl:zin') {
      name = `ზონა Z${zoneNo(z)} — შესასვლელი კლემები (L / N / სიგნალი)`;
      func = `აქ შედის ${cfg.roomNames[z]}-ის თერმოსტატის 3-ძარღვიანი კაბელი: ყავისფერი L და ლურჯი N კვებავს თერმოსტატს, მწვანე „სიგნალი“ მოდის თერმოსტატიდან, როცა ოთახი სითბოს ითხოვს (ზოგადი მოდელი — კლემების წარწერები მოდელზეა დამოკიდებული).`;
      st = `სიგნალი ${state.rooms[z].calling && cfg.thermostats[z].enabled ? 'არის (ითხოვს სითბოს)' : 'არ არის'}${connectMode ? ` · კავშირი ${summary.signal[z] ? 'შეერთებულია' : 'გათიშულია'}` : ''}`;
    } else if (kind === 'ctrl:zout') {
      name = `ზონა Z${zoneNo(z)} — აქტუატორების გამოსავალი (A~ L / A~ N)`;
      func = 'ზონის ჩართვისას აქ 230V ჩნდება და პარალელურად კვებავს ამ ზონის ყველა აქტუატორს.';
      st = `${state.controller.zoneOut[z] ? 'ძაბვა არის (ზონა ჩართულია)' : 'ძაბვა არ არის'} · აქტუატორები: ${loopsOfZone(cfg, z).join(', ')}`;
    } else if (kind === 'ctrl:led') {
      name = `ზონა Z${zoneNo(z)} — სტატუსის LED`;
      func = 'ანთია, როცა ზონის გამოსავალი ჩართულია.';
      st = state.controller.zoneOut[z] ? 'ანთია' : 'ჩამქრალია';
    } else if (id === 'ctrl:relay') {
      name = 'ქვაბის რელე (NO / COM / NC)';
      func = 'რომელიმე ზონის მოთხოვნისას, DIP დაყოვნების შემდეგ, COM–NO იკეტება — ეს მშრალი კონტაქტი ორი ნარინჯისფერი სადენით მიდის ქვაბის მოთხოვნის კლემაზე. NC არ გამოიყენება. ქვაბის კლემაზე 230V არასოდეს.';
      st = state.controller.ta1Closed ? 'COM–NO დაკეტილია → ქვაბი ითხოვს გათბობას' : 'ღიაა → მოთხოვნა არ არის';
    } else if (id === 'ctrl:dip') {
      name = 'DIP გადამრთველები — რელეს დაყოვნება';
      func = 'აყოვნებს ქვაბის ჩართვას, რომ აქტუატორებმა მოასწრონ გახსნა (0 / 2 / 5 წთ; ბერკეტების რუკა საილუსტრაციოა).';
      st = `${cfg.sim.relayDelayS / 60} წთ`;
    } else if (id === 'ctrl:fuse') {
      name = 'ფუზი 15A';
      func = 'იცავს კონტროლერს და მის გამოსავლებს (მომხმარებლის აღწერით).';
      st = 'მთელია (სიმულაციაში არ იწვება)';
    } else if (id === 'ctrl:power') {
      name = 'კვების კლემები L / N / PE (220V)';
      func = 'კონტროლერის ქსელის კვება — მხოლოდ კონტექსტი. საჭიროა პროფესიონალური (ელექტრიკოსის) მონტაჟი.';
      st = 'კვება არის (სიმულაცია)';
    } else if (id === 'ctrl:pump') {
      name = 'ტუმბოს გამოსავალი L1 / N1';
      func = 'გარე ტუმბოსთვის. აქ არ გამოიყენება — ქვაბს საკუთარი ტუმბო აქვს.';
      st = cfg.sim.pumpOutputEnabled ? 'ჩართულია პარამეტრებში' : 'არ გამოიყენება';
    } else if (id === 'ctrl:spare') {
      name = 'თავისუფალი ზონა (Z5–Z8)';
      func = 'ამ ბინაში 8-დან მხოლოდ 4 ზონა გამოიყენება.';
      st = '—';
    } else if (kind.startsWith('tcable')) {
      name = `${cfg.roomNames[z]}-ის თერმოსტატის კაბელი (3 ძარღვი) → Z${zoneNo(z)}`;
      func = 'თერმოსტატიდან საკაბელო არხით მიდის კონტროლერის ზედა სალნიკამდე, შიგნით ძარღვები უერთდება Z-ის L / N / სიგნალის კლემებს. ძარღვების რეალური ფუნქცია გადასამოწმებელია.';
      st = `სიგნალი ${state.rooms[z].calling && cfg.thermostats[z].enabled ? 'გადის (მწვანე ნათება)' : 'არ გადის'}${connectMode ? ` · ${summary.signal[z] ? 'შეერთებულია' : 'გათიშულია — მოთხოვნა ვერ გადის'}` : ''}`;
    } else if (kind.startsWith('acable')) {
      name = `Z${zoneNo(z)} აქტუატორების კაბელები (${cfg.roomNames[z]})`;
      func = 'კონტროლერის ქვედა სალნიკიდან არხით მიდის ამ ზონის თითოეულ აქტუატორამდე (პარალელურად).';
      st = `${state.controller.zoneOut[z] ? 'ძაბვა არის' : 'ძაბვა არ არის'}${connectMode ? ` · ${summary.power[z] ? 'შეერთებულია' : 'გათიშულია — აქტუატორები დახურული რჩება'}` : ''}`;
    } else {
      name = 'საკაბელო არხი';
      func = 'კაბელების გასატარებელი არხი კედელზე (საილუსტრაციო; გამჭვირვალედ ნაჩვენები).';
      st = '—';
    }
  } else if (id.startsWith('thermostat:')) {
    const z = id.slice(11) as ZoneId;
    name = `ოთახის თერმოსტატი — ${cfg.roomNames[z]}`;
    func = 'ზომავს ოთახის ჰაერის t°-ს და სასურველზე დაბლა ითხოვს სითბოს (ჰისტერეზისით). მისი ზონის აქტუატორები და კონტურები მონიშნულია. სცენაში ⏻ / − / + ღილაკები მუშაობს.';
    st = `${fmt(state.rooms[z].airC)}°C → სასურველი ${cfg.thermostats[z].setpointC.toFixed(1)}°C · ${cfg.thermostats[z].enabled ? 'ჩართულია' : 'გამორთულია'} · ${state.rooms[z].calling ? 'ითხოვს სითბოს' : 'არ ითხოვს'} · მართავს: ${loopsOfZone(cfg, z).join(', ')}${connectMode ? ` · სიგნალის კავშირი ${summary.signal[z] ? 'შეერთებულია' : 'გათიშულია (მოთხოვნა არ გადის)'}` : ''}`;
  } else if (id.startsWith('ctx:')) {
    const names: Record<string, string> = { 'ctx:gas': 'გაზის მიწოდება', 'ctx:flue': 'საკვამური', 'ctx:prv': 'დამცავი სარქვლის გამონადენი', 'ctx:mains': 'ქსელის კვება / ჩამრთველი' };
    name = names[id] ?? id;
    func = 'მხოლოდ კონტექსტი. არ არის სიმულაციის ნაწილი და არ ერთდება. საჭიროა პროფესიონალური მონტაჟი.';
    st = '—';
  } else {
    name = id;
  }
  return (
    <section className="panel" data-testid="b3d-inspector">
      <h3>
        ინსპექტორი
        <button className="icon" onClick={onClose} aria-label="ინსპექტორის დახურვა">
          ✕
        </button>
      </h3>
      <p className="insp-name" data-testid="b3d-insp-name">
        <b>{name}</b>
      </p>
      <p className="small">{func}</p>
      <p className="small" data-testid="b3d-insp-state">
        <b>სიმულირებული მდგომარეობა:</b> {st}
      </p>
      {(id === 'controller' || id.startsWith('ctrl:')) && (
        <button className="primary" onClick={() => toggleController(!ctrlOpen)} data-testid="insp-ctrl-open">
          {ctrlOpen ? 'კონტროლერის დახურვა' : 'კონტროლერის გახსნა — შიგნით ნახვა'}
        </button>
      )}
    </section>
  );
}
