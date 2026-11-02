import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadConfig, saveConfig } from '../model/config';
import { ROOMS, ZONES, type AppConfig, type Point, type RoomId, type ZoneId } from '../model/types';
import { chLimits } from '../sim/engine';
import { SCENARIO_IDS, applyScenario, type ScenarioId } from '../sim/scenarios';
import { ka } from '../i18n/ka';
import { DEFAULT_VIEW, PlanView, focusView, type ViewBox } from './PlanView';
import { BoilerView } from './BoilerView';
import { ManifoldView } from './ManifoldView';
import { WiringView } from './WiringView';
import { InstallView } from './InstallView';
import { CommandChainPanel, EventLog, InspectorPanel, StatusStrip, ThermostatWidget } from './Panels';
import { ChecklistPage, EquipmentPage, MappingPage, OpenItemsPage, SourcesPage } from './Pages';
import { useSimulation } from './useSimulation';
import { Balcony3DPage } from './balcony3d/Balcony3DPage';
import { assembledExample, toOverrides, type Connection } from '../sim/connections';

type Tab = 'plan' | 'install' | 'balcony3d' | 'boiler' | 'manifold' | 'wiring' | 'mapping' | 'equipment' | 'checklist' | 'open' | 'sources';
const TABS: Tab[] = ['plan', 'install', 'balcony3d', 'boiler', 'manifold', 'wiring', 'mapping', 'equipment', 'checklist', 'open', 'sources'];
const SPEEDS = [1, 5, 15, 30, 60];

export function App({ initial }: { initial?: AppConfig }) {
  const [cfg, setCfgRaw] = useState<AppConfig>(() => initial ?? loadConfig());
  const setCfg = useCallback((c: AppConfig) => setCfgRaw(c), []);
  useEffect(() => saveConfig(cfg), [cfg]);
  const [tab, setTab] = useState<Tab>(() => (typeof location !== 'undefined' && location.hash === '#balcony-3d' ? 'balcony3d' : 'plan'));
  // conceptual connections (3D page): applied to the simulation only while that page is open
  const [connections, setConnections] = useState<Connection[]>(() => assembledExample());
  const [connectMode, setConnectMode] = useState(false);
  const overrides = useMemo(() => (tab === 'balcony3d' && connectMode ? toOverrides(connections) : undefined), [tab, connectMode, connections]);
  const sim = useSimulation(cfg, overrides);
  const { state } = sim;
  useEffect(() => {
    try {
      if (tab === 'balcony3d') history.replaceState(null, '', '#balcony-3d');
      else if (location.hash === '#balcony-3d') history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* ignore */
    }
  }, [tab]);
  const [view, setView] = useState<ViewBox>(DEFAULT_VIEW);
  const [selected, setSelected] = useState<string | null>(null);
  const [openThermo, setOpenThermo] = useState<ZoneId | null>(null);
  const [chainZone, setChainZone] = useState<ZoneId>('living');
  const [scenario, setScenario] = useState<ScenarioId | null>(null);

  const setThermostat = (z: ZoneId, patch: Partial<{ enabled: boolean; setpointC: number }>) =>
    setCfg({ ...cfg, thermostats: { ...cfg.thermostats, [z]: { ...cfg.thermostats[z], ...patch } } });
  const setSim = (patch: Partial<AppConfig['sim']>) => setCfg({ ...cfg, sim: { ...cfg.sim, ...patch } });
  const setDisp = (patch: Partial<AppConfig['display']>) => setCfg({ ...cfg, display: { ...cfg.display, ...patch } });

  const runScenario = (id: ScenarioId) => {
    const r = applyScenario(id, cfg);
    setCfg(r.cfg);
    sim.replace(r.state);
    setChainZone(r.focus);
    setScenario(id);
    setTab('plan');
  };
  const resetSim = () => {
    if (scenario) runScenario(scenario);
    else sim.reset();
  };
  const select = (id: string) => {
    setSelected(id);
    const [k, v] = id.split(':');
    if (k === 'thermostat' && (ZONES as readonly string[]).includes(v)) setChainZone(v as ZoneId);
  };
  const [lo, hi] = chLimits(cfg);

  return (
    <div className={'app' + (sim.paused ? ' paused' : '')} data-testid="app" data-paused={sim.paused ? '1' : '0'}>
      <header>
        <div>
          <h1>{ka.appTitle}</h1>
          <p className="sub">{ka.appSubtitle}</p>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
              {ka.tabs[t]}
            </button>
          ))}
        </nav>
      </header>
      <div className="banner">⚠ {ka.assumptionsBanner}</div>
      <div className="banner warn" data-testid="cabinet-warning">⚠ {ka.warnings.cabinet}</div>
      <StatusStrip cfg={cfg} state={state} />

      <main className={tab === 'plan' || tab === 'install' || tab === 'boiler' || tab === 'manifold' || tab === 'wiring' ? 'with-side' : ''}>
        <div className="stage">
          {tab === 'plan' && (
            <>
              <div className="toolbar">
                <button onClick={() => setView({ ...view, x: view.x + view.w * 0.1, y: view.y + view.h * 0.1, w: view.w * 0.8, h: view.h * 0.8 })}>＋ {ka.controls.zoomIn}</button>
                <button onClick={() => setView({ ...view, x: view.x - view.w * 0.125, y: view.y - view.h * 0.125, w: view.w * 1.25, h: view.h * 1.25 })}>－ {ka.controls.zoomOut}</button>
                <button onClick={() => setView(DEFAULT_VIEW)}>⟲ {ka.controls.resetView}</button>
                <select value="" onChange={(e) => e.target.value && setView(focusView(e.target.value as RoomId))} aria-label={ka.controls.focus}>
                  <option value="">{ka.controls.focus}…</option>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>
                      {cfg.roomNames[r]}
                    </option>
                  ))}
                </select>
                <button onClick={() => setTab('manifold')}>{ka.tabs.manifold} ⤢</button>
                <button onClick={() => setTab('boiler')}>{ka.tabs.boiler} ⤢</button>
                <span className="layers">
                  {ka.controls.layers}:
                  {(
                    [
                      ['hydraulic', ka.controls.hydraulic],
                      ['wiring', ka.controls.wiring],
                      ['labels', ka.controls.labels],
                      ['optionalLayer', ka.controls.optional],
                      ['floorCutaway', ka.controls.floorCut],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="check">
                      <input type="checkbox" checked={cfg.display[k]} onChange={(e) => setDisp({ [k]: e.target.checked })} data-testid={`layer-${k}`} />
                      {label}
                    </label>
                  ))}
                  <label className="check">
                    {ka.controls.floorFinish}
                    <input type="range" min={0} max={1} step={0.05} value={cfg.display.floorFinishOpacity} onChange={(e) => setDisp({ floorFinishOpacity: +e.target.value })} />
                  </label>
                </span>
              </div>
              <div className="plan-wrap">
                <PlanView
                  cfg={cfg}
                  state={state}
                  view={view}
                  setView={setView}
                  onManifoldMove={(p: Point) => setCfg({ ...cfg, manifoldPos: p })}
                  select={select}
                  selected={selected}
                  openThermostat={(z) => setOpenThermo(z)}
                  setThermostat={setThermostat}
                />
                {openThermo && (
                  <div className="popover" data-testid="thermo-popover">
                    <ThermostatWidget z={openThermo} cfg={cfg} state={state} setThermostat={setThermostat} onClose={() => setOpenThermo(null)} onFocus={() => setView(focusView(openThermo))} />
                  </div>
                )}
                <Legend />
              </div>
            </>
          )}
          {tab === 'boiler' && (
            <>
              <div className="toolbar">
                <label className="check">
                  <input type="checkbox" checked={cfg.display.boilerCutaway} onChange={(e) => setDisp({ boilerCutaway: e.target.checked })} />
                  {ka.controls.boilerCut}
                </label>
              </div>
              <BoilerView cfg={cfg} state={state} select={select} selected={selected} />
            </>
          )}
          {tab === 'install' && (
            <InstallView
              cfg={cfg}
              state={state}
              select={select}
              selected={selected}
              setThermostat={setThermostat}
              setShower={(on) => sim.mutate((s) => { s.dhw.showerOn = on; })}
            />
          )}
          {tab === 'balcony3d' && (
            <Balcony3DPage
              cfg={cfg}
              state={state}
              paused={sim.paused}
              setThermostat={setThermostat}
              setChSetpoint={(v) => setSim({ chSetpointC: v })}
              connections={connections}
              setConnections={setConnections}
              connectMode={connectMode}
              setConnectMode={setConnectMode}
            />
          )}
          {tab === 'manifold' && <ManifoldView cfg={cfg} state={state} select={select} selected={selected} />}
          {tab === 'wiring' && <WiringView cfg={cfg} state={state} select={select} selected={selected} />}
          {tab === 'mapping' && <MappingPage cfg={cfg} setCfg={setCfg} />}
          {tab === 'equipment' && <EquipmentPage />}
          {tab === 'checklist' && <ChecklistPage />}
          {tab === 'open' && <OpenItemsPage />}
          {tab === 'sources' && <SourcesPage />}

          {/* thermostats strip */}
          <section className="thermo-strip">
            {ZONES.map((z) => (
              <ThermostatWidget key={z} z={z} cfg={cfg} state={state} setThermostat={setThermostat} compact onFocus={() => { setTab('plan'); setView(focusView(z)); setChainZone(z); }} />
            ))}
          </section>
        </div>

        <aside className="side">
          <CommandChainPanel z={chainZone} setZ={setChainZone} cfg={cfg} state={state} />
          <InspectorPanel id={selected} cfg={cfg} state={state} onClose={() => setSelected(null)} />
          <section className="panel scenarios">
            <h3>{ka.scenarios.title}</h3>
            <div className="scen-grid">
              {SCENARIO_IDS.map((id, i) => (
                <button key={id} className={scenario === id ? 'active' : ''} title={ka.scenarios[id][1]} onClick={() => runScenario(id)} data-testid={`scen-${id}`}>
                  {i + 1}. {ka.scenarios[id][0]}
                </button>
              ))}
            </div>
            {scenario && <p className="small scen-desc" data-testid="scen-desc">{ka.scenarios[scenario][1]}</p>}
          </section>
          <EventLog state={state} cfg={cfg} />
        </aside>
      </main>

      <footer className="controls">
        <button onClick={() => sim.setPaused(!sim.paused)} data-testid="pause" className="primary">
          {sim.paused ? `▶ ${ka.controls.resume}` : `⏸ ${ka.controls.pause}`}
        </button>
        <label>
          {ka.controls.speed} {cfg.sim.speed}×
          <input type="range" min={1} max={60} step={1} value={cfg.sim.speed} onChange={(e) => setSim({ speed: +e.target.value })} data-testid="speed" list="speed-marks" />
          <datalist id="speed-marks">
            {SPEEDS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label>
          {ka.controls.relayDelay}
          <select value={cfg.sim.relayDelayS} onChange={(e) => setSim({ relayDelayS: +e.target.value })} data-testid="relay-delay">
            {[0, 120, 300].map((v) => (
              <option key={v} value={v}>
                {v / 60} წთ
              </option>
            ))}
            {![0, 120, 300].includes(cfg.sim.relayDelayS) && <option value={cfg.sim.relayDelayS}>{cfg.sim.relayDelayS} წმ</option>}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={cfg.display.wiring} onChange={(e) => setDisp({ wiring: e.target.checked })} data-testid="wires-toggle" />
          სადენები
        </label>
        <button onClick={resetSim} data-testid="reset">⟲ {ka.controls.reset}</button>
        <label>
          {ka.controls.outdoor} {cfg.sim.outdoorC}°C
          <input type="range" min={-15} max={15} step={1} value={cfg.sim.outdoorC} onChange={(e) => setSim({ outdoorC: +e.target.value })} />
        </label>
        <label>
          {ka.controls.cold} {cfg.sim.coldWaterC}°C
          <input type="range" min={3} max={20} step={1} value={cfg.sim.coldWaterC} onChange={(e) => setSim({ coldWaterC: +e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={state.dhw.showerOn} onChange={(e) => sim.mutate((s) => { s.dhw.showerOn = e.target.checked; })} data-testid="shower" />
          🚿 {ka.controls.shower}
        </label>
        <label>
          {ka.controls.showerFlow} {cfg.sim.showerFlowLpm} L/წთ
          <input type="range" min={0} max={16} step={0.5} value={cfg.sim.showerFlowLpm} onChange={(e) => setSim({ showerFlowLpm: +e.target.value })} />
        </label>
        <label>
          {ka.controls.dhwSet} {cfg.sim.dhwSetpointC}°C
          <input type="range" min={36} max={60} step={1} value={cfg.sim.dhwSetpointC} onChange={(e) => setSim({ dhwSetpointC: +e.target.value })} />
        </label>
        <details>
          <summary>{ka.controls.boilerSettings} · {ka.controls.demoAssumption}</summary>
          <div className="details-grid">
            <label>
              {ka.controls.chRange}
              <select
                value={cfg.sim.chRange}
                onChange={(e) => {
                  const r = e.target.value as 'low' | 'high';
                  setSim({ chRange: r, chSetpointC: r === 'low' ? 35 : 60 });
                }}
              >
                <option value="low">{ka.controls.chLow}</option>
                <option value="high">{ka.controls.chHigh}</option>
              </select>
            </label>
            <label>
              {ka.controls.chSet} {cfg.sim.chSetpointC}°C
              <input type="range" min={lo} max={hi} step={1} value={cfg.sim.chSetpointC} onChange={(e) => setSim({ chSetpointC: +e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={cfg.sim.floorSafetyInstalled} onChange={(e) => setSim({ floorSafetyInstalled: e.target.checked })} />
              {ka.controls.floorSafety}
            </label>
            <label>
              {ka.controls.trip} {cfg.sim.floorSafetyTripC}°C
              <input type="range" min={40} max={65} step={1} value={cfg.sim.floorSafetyTripC} onChange={(e) => setSim({ floorSafetyTripC: +e.target.value })} />
            </label>
            <label>
              {ka.controls.actDelay} {cfg.sim.actuatorDelayS} წმ
              <input type="range" min={0} max={300} step={10} value={cfg.sim.actuatorDelayS} onChange={(e) => setSim({ actuatorDelayS: +e.target.value })} />
            </label>
            <label>
              {ka.controls.actTravel} {cfg.sim.actuatorTravelS} წმ
              <input type="range" min={30} max={300} step={10} value={cfg.sim.actuatorTravelS} onChange={(e) => setSim({ actuatorTravelS: +e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={cfg.sim.pumpOutputEnabled} onChange={(e) => setSim({ pumpOutputEnabled: e.target.checked })} />
              {ka.controls.pumpOut}
            </label>
            <label className="check">
              <input type="checkbox" checked={state.faults.cloudOffline} onChange={(e) => sim.mutate((s) => { s.faults.cloudOffline = e.target.checked; })} />
              ☁ აპი/ღრუბელი ოფლაინ
            </label>
          </div>
        </details>
      </footer>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label={ka.legend.title}>
      <b>{ka.legend.title}</b>
      <span><i className="sw sw-flow" /> {ka.legend.flow}</span>
      <span><i className="sw sw-ret" /> {ka.legend.ret}</span>
      <span><i className="sw sw-dhw" /> {ka.legend.dhw}</span>
      <span><i className="sw sw-cold" /> {ka.legend.cold}</span>
      <span><i className="sw sw-wire" /> {ka.legend.wire}</span>
      <span><i className="sw sw-dash" /> {ka.legend.unknown}</span>
      <span>▶ {ka.legend.loopFlow}</span>
      <span>{ka.legend.noFlow}</span>
      <span><i className="sw sw-air" /> {ka.legend.air}</span>
      <span><i className="sw sw-glow" /> {ka.legend.floor}</span>
      <span>🔥 ითხოვს · ✓ დაკმაყოფ. · ⏻ გამორთ. · ⚠ სენსორი · ნარინჯისფერი წყვეტილი კონტური = ზონა ჩართულია</span>
    </div>
  );
}
