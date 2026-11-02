import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { defaultConfig } from '../src/model/config';
import type { AppConfig, ZoneId } from '../src/model/types';
import { createInitialState, loopsOfZone, runFor } from '../src/sim/engine';
import { ManifoldView } from '../src/ui/ManifoldView';
import { PlanView, DEFAULT_VIEW } from '../src/ui/PlanView';
import { ThermostatWidget } from '../src/ui/Panels';
import { WiringView } from '../src/ui/WiringView';
import { BoilerView } from '../src/ui/BoilerView';
import { App } from '../src/ui/App';

function only(zones: ZoneId[]): AppConfig {
  const c = defaultConfig();
  for (const z of Object.keys(c.thermostats) as ZoneId[]) c.thermostats[z].enabled = zones.includes(z);
  return c;
}

describe('scene reflects simulation state', () => {
  it('plan: only flowing loops get the is-flowing class', () => {
    const cfg = only(['child']);
    const s = runFor(createInitialState(cfg), cfg, 900);
    const { container } = render(
      <PlanView cfg={cfg} state={s} view={DEFAULT_VIEW} setView={() => {}} onManifoldMove={() => {}} select={() => {}} selected={null} openThermostat={() => {}} />,
    );
    const child = loopsOfZone(cfg, 'child');
    const flowing = [...container.querySelectorAll('.loop.is-flowing')].map((e) => e.getAttribute('data-testid'));
    expect(flowing.sort()).toEqual(child.map((id) => `loop-${id}`).sort());
  });

  it('manifold: actuator phase / power dot / pin follow the state; stuck → fault', () => {
    const cfg = only(['child']);
    let s = createInitialState(cfg);
    const [a, b] = loopsOfZone(cfg, 'child');
    s.faults.stuck[a] = true;
    s = runFor(s, cfg, 900);
    render(<ManifoldView cfg={cfg} state={s} select={() => {}} selected={null} />);
    expect(screen.getByTestId(`port-${a}`).getAttribute('data-phase')).toBe('fault');
    expect(screen.getByTestId(`port-${b}`).getAttribute('data-phase')).toBe('open');
    expect(screen.getByTestId(`act-${b}`).getAttribute('data-pos')).toBe('1.00');
    expect(screen.getByTestId(`act-${b}`).getAttribute('data-power')).toBe('1');
    expect(screen.getByTestId('port-L01').getAttribute('data-phase')).toBe('closed');
    expect(screen.getByTestId('act-L01').getAttribute('data-power')).toBe('0');
    expect(screen.getByTestId('manifold-view').getAttribute('data-heating')).toBe('1');
  });

  it('wiring centre: zone output, signal core and relay reflect state', () => {
    const cfg = only(['living']);
    const s = runFor(createInitialState(cfg), cfg, cfg.sim.relayDelayS + 5);
    render(<WiringView cfg={cfg} state={s} select={() => {}} selected={null} />);
    expect(screen.getByTestId('zone-1').getAttribute('data-out')).toBe('1');
    expect(screen.getByTestId('zone-2').getAttribute('data-out')).toBe('0');
    expect(screen.getByTestId('sig-living').getAttribute('data-live')).toBe('1');
    expect(screen.getByTestId('relay').getAttribute('data-closed')).toBe('1');
    expect(screen.getByTestId('ta1-wire').getAttribute('class')).toContain('ta1-closed');
  });

  it('boiler view: DHW mode moves the diverter and lights the burner', () => {
    const cfg = only([]);
    let s = createInitialState(cfg);
    s.dhw.showerOn = true;
    s = runFor(s, cfg, 2);
    render(<BoilerView cfg={cfg} state={s} select={() => {}} selected={null} />);
    expect(screen.getByTestId('diverter').getAttribute('data-pos')).toBe('DHW');
    expect(screen.getByTestId('boiler-front').getAttribute('data-burner')).toBe('1');
    expect(screen.getByTestId('shower-device').getAttribute('data-on')).toBe('1');
  });
});

describe('thermostat widget buttons', () => {
  it('power / minus / plus call setThermostat; LCD dark when off', () => {
    const cfg = defaultConfig();
    const s = createInitialState(cfg);
    const set = vi.fn();
    const { rerender } = render(<ThermostatWidget z="living" cfg={cfg} state={s} setThermostat={set} />);
    fireEvent.click(screen.getByTestId('tw-living-plus'));
    expect(set).toHaveBeenLastCalledWith('living', { setpointC: 21.5 });
    fireEvent.click(screen.getByTestId('tw-living-minus'));
    expect(set).toHaveBeenLastCalledWith('living', { setpointC: 20.5 });
    fireEvent.click(screen.getByTestId('tw-living-power'));
    expect(set).toHaveBeenLastCalledWith('living', { enabled: false });
    expect(screen.getByTestId('tw-living-lcd').getAttribute('data-lcd')).toBe('on');
    const off = structuredClone(cfg);
    off.thermostats.living.enabled = false;
    rerender(<ThermostatWidget z="living" cfg={off} state={s} setThermostat={set} />);
    expect(screen.getByTestId('tw-living-lcd').getAttribute('data-lcd')).toBe('off');
  });
});

describe('app shell', () => {
  it('renders all tabs and 4 thermostat widgets', () => {
    render(<App initial={defaultConfig()} />);
    expect(screen.getAllByTestId(/^tw-(living|child|main|bath)$/)).toHaveLength(4);
    for (const t of ['boiler', 'manifold', 'wiring', 'mapping', 'equipment', 'checklist', 'open', 'sources', 'plan']) {
      fireEvent.click(screen.getByTestId(`tab-${t}`));
    }
    fireEvent.click(screen.getByTestId('tab-open'));
    expect(within(screen.getByTestId('open-items')).getAllByRole('listitem').length).toBeGreaterThan(5);
  });
  it('clicking + on a thermostat changes the persisted setpoint', () => {
    render(<App initial={defaultConfig()} />);
    const w = screen.getByTestId('tw-child');
    fireEvent.click(within(w).getByTestId('tw-child-plus'));
    expect(within(w).getByTestId('sp-child').textContent).toBe('21.5');
    expect(JSON.parse(localStorage.getItem('ufh-twin/config')!).thermostats.child.setpointC).toBe(21.5);
  });
});

import { InstallView } from '../src/ui/InstallView';

describe('installation page', () => {
  it('pipes animate only for the active medium; thermostats are operable', () => {
    const cfg = only(['living']);
    let s = runFor(createInitialState(cfg), cfg, cfg.sim.relayDelayS + 60);
    const set = vi.fn();
    const { rerender } = render(<InstallView cfg={cfg} state={s} select={() => {}} selected={null} setThermostat={set} setShower={() => {}} />);
    expect(screen.getByTestId('install-svg').getAttribute('data-ch')).toBe('1');
    expect(screen.getByTestId('pipe-A').getAttribute('class')).toContain('ipipe2-flow');
    expect(screen.getByTestId('pipe-B').getAttribute('class')).toContain('idle');
    expect(screen.getByTestId('install-relay').getAttribute('data-closed')).toBe('1');
    fireEvent.click(screen.getByTestId('inst-child-plus'));
    expect(set).toHaveBeenLastCalledWith('child', { setpointC: 21.5 });
    s.dhw.showerOn = true;
    s = runFor(s, cfg, 2);
    rerender(<InstallView cfg={cfg} state={s} select={() => {}} selected={null} setThermostat={set} setShower={() => {}} />);
    expect(screen.getByTestId('pipe-B').getAttribute('class')).toContain('ipipe2-flow');
    expect(screen.getByTestId('pipe-A').getAttribute('class')).toContain('idle');
  });
});

import { ControlWiringDiagram } from '../src/ui/ControlWiringDiagram';

describe('control wiring diagram', () => {
  it('signal, zone output, each actuator and TA1 follow the state', () => {
    const cfg = only(['child']);
    const s = runFor(createInitialState(cfg), cfg, cfg.sim.relayDelayS + 5);
    render(<ControlWiringDiagram cfg={cfg} state={s} select={() => {}} selected={null} />);
    expect(screen.getByTestId('cw-sig-child').getAttribute('data-live')).toBe('1');
    expect(screen.getByTestId('cw-sig-living').getAttribute('data-live')).toBe('0');
    expect(screen.getByTestId('cw-out-child').getAttribute('data-live')).toBe('1');
    for (const id of loopsOfZone(cfg, 'child')) expect(screen.getByTestId(`cw-act-${id}`).getAttribute('data-power')).toBe('1');
    expect(screen.getByTestId('cw-act-L01').getAttribute('data-power')).toBe('0');
    expect(screen.getByTestId('cw-ta1').getAttribute('data-live')).toBe('1');
  });
});
