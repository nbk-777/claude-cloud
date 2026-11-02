import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig } from '../model/types';
import { Clock, createInitialState, step, syncLoops, type SimState } from '../sim/engine';

/**
 * Drives the pure simulation from requestAnimationFrame. The engine itself is frame-rate
 * independent: wall time × speed is converted to whole fixed sub-steps by Clock.
 */
export function useSimulation(cfg: AppConfig) {
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const stateRef = useRef<SimState>(createInitialState(cfg));
  const clockRef = useRef(new Clock(cfg.sim.speed));
  const [state, setState] = useState<SimState>(stateRef.current);
  const [paused, setPausedState] = useState(false);

  clockRef.current.speed = cfg.sim.speed;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(250, now - last);
      last = now;
      const n = clockRef.current.tick(dt);
      if (n > 0) {
        let s = syncLoops(stateRef.current, cfgRef.current);
        for (let i = 0; i < n; i++) s = step(s, cfgRef.current);
        stateRef.current = s;
        setState(s);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setPaused = useCallback((p: boolean) => {
    clockRef.current.paused = p;
    setPausedState(p);
  }, []);

  const replace = useCallback((s: SimState) => {
    stateRef.current = s;
    clockRef.current.reset();
    setState(s);
  }, []);

  const mutate = useCallback((f: (s: SimState) => void) => {
    const s = structuredClone(stateRef.current);
    f(s);
    stateRef.current = s;
    setState(s);
  }, []);

  const reset = useCallback(() => replace(createInitialState(cfgRef.current)), [replace]);

  return { state, paused, setPaused, replace, mutate, reset };
}
