// Imperative Three.js scene for the "3D Balcony Installation" page.
// All equipment is procedural (no external models/assets). All dimensions are ILLUSTRATIVE
// (see docs/BALCONY-3D.md) — they are not installation clearances.
// The scene never runs its own simulation: it only renders SceneSnapshot values derived from the
// app's existing engine state.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ZoneId } from '../../model/types';
import type { Connection, ConnectionSummary } from '../../sim/connections';

export const ZONE_ORDER: ZoneId[] = ['living', 'bath', 'child', 'main'];

export interface LoopView {
  id: string;
  zone: ZoneId | null;
  color: string;
  pos: number;
  cmd: boolean;
  phase: string;
  flowing: boolean;
  flowFrac: number;
}

export interface ThermoView {
  label: string;
  air: number;
  sp: number;
  enabled: boolean;
  calling: boolean;
}

export interface SceneSnapshot {
  loops: LoopView[];
  burnerOn: boolean;
  pumpOn: boolean;
  mode: string;
  modeLabel: string;
  flowC: number;
  returnC: number;
  ta1: boolean;
  chFlow: boolean;
  zoneOut: Record<ZoneId, boolean>;
  thermostats: Record<ZoneId, ThermoView>;
  paused: boolean;
  speed: number;
  connectMode: boolean;
  summary: ConnectionSummary;
  connections: Connection[];
  pendingPort: string | null;
}

export type CameraPreset = 'full' | 'boiler' | 'manifold' | 'controller';

export interface SceneApi {
  update(s: SceneSnapshot): void;
  setSelection(id: string | null, loopIds: string[]): void;
  setCamera(p: CameraPreset): void;
  setExplain(on: boolean): void;
  dispose(): void;
}

// ── illustrative layout (metres) ─────────────────────────────────────────────
const BAL_W = 3.2; // balcony width
const BAL_D = 1.4; // balcony depth
const WALL_H = 2.7;
const BOILER = { w: 0.4, h: 0.7, d: 0.3, x: 0, y: 1.65, z: 0.15 };
const SUP_Y = 0.8; // supply bar centre
const RET_Y = 0.6; // return bar centre
const SUP_Z = 0.13;
const RET_Z = 0.08;
const BAR_R = 0.017;
const PORT_X = (i: number) => -0.325 + i * 0.05;
const DUCT_TOP = 0.27;
const CTRL = { x: 0.82, y: 0.86, z: 0.035, w: 0.36, h: 0.22, d: 0.06 };
const THERMO_X: Record<ZoneId, number> = { living: -1.36, bath: -1.14, child: -0.92, main: -0.7 };
const THERMO_Y = 1.45;

export const PORT_POS: Record<string, [number, number, number]> = {
  'boiler.supply': [-0.12, 1.29, SUP_Z],
  'boiler.return': [0.12, 1.29, RET_Z],
  'manifold.supply': [-0.43, SUP_Y, SUP_Z],
  'manifold.return': [0.43, RET_Y, RET_Z],
  'controller.demand': [CTRL.x + 0.15, CTRL.y, CTRL.z + 0.04],
  'boiler.demand': [0.17, 1.34, 0.31],
};
ZONE_ORDER.forEach((z, i) => {
  PORT_POS[`thermostat.${z}`] = [THERMO_X[z], THERMO_Y - 0.08, 0.03];
  PORT_POS[`controller.in.${z}`] = [CTRL.x - 0.12 + i * 0.06, CTRL.y + 0.08, CTRL.z + 0.04];
  PORT_POS[`controller.out.${z}`] = [CTRL.x - 0.12 + i * 0.06, CTRL.y - 0.08, CTRL.z + 0.04];
});

const CONTEXT_POS: Record<string, [number, number, number]> = {
  'ctx:gas': [0.0, 1.16, 0.2],
  'ctx:flue': [0.0, 2.14, 0.15],
  'ctx:prv': [0.2, 1.06, 0.12],
  'ctx:mains': [0.42, 1.86, 0.03],
};

const CAMERAS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  full: { pos: [1.75, 2.15, 2.75], target: [-0.1, 1.05, 0.2] },
  boiler: { pos: [0.55, 1.8, 1.15], target: [0, 1.6, 0.15] },
  manifold: { pos: [0.35, 0.95, 1.0], target: [0, 0.66, 0.1] },
  controller: { pos: [1.25, 1.05, 0.85], target: [0.8, 0.85, 0.03] },
};

// ── helpers ─────────────────────────────────────────────────────────────────

function roundedPath(points: THREE.Vector3[], r: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let cur = points[0].clone();
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (i < points.length - 1) {
      const next = points[i + 1];
      const dIn = p.clone().sub(cur).normalize();
      const dOut = next.clone().sub(p).normalize();
      const rr = Math.min(r, p.distanceTo(cur) / 2, next.distanceTo(p) / 2);
      const a = p.clone().addScaledVector(dIn, -rr);
      const b = p.clone().addScaledVector(dOut, rr);
      if (a.distanceTo(cur) > 1e-6) path.add(new THREE.LineCurve3(cur, a));
      path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b));
      cur = b;
    } else path.add(new THREE.LineCurve3(cur, p.clone()));
  }
  return path;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function textCanvas(lines: { text: string; size: number; color: string; weight?: number }[], w: number, h: number, bg: string | null, pad = 10): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  let y = pad;
  for (const l of lines) {
    g.font = `${l.weight ?? 600} ${l.size}px system-ui, sans-serif`;
    g.fillStyle = l.color;
    g.textBaseline = 'top';
    g.fillText(l.text, pad, y);
    y += l.size * 1.2;
  }
  return c;
}

// ── scene ───────────────────────────────────────────────────────────────────

export function createBalconyScene(container: HTMLElement, onPick: (id: string | null) => void): SceneApi {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('data-testid', 'balcony-canvas');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe3f2');
  scene.fog = new THREE.Fog('#cfe3f2', 8, 20);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 60);
  camera.position.set(...CAMERAS.full.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...CAMERAS.full.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.25;
  controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.update();

  // daylight
  scene.add(new THREE.HemisphereLight('#eef6ff', '#c2b8a6', 1.25));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(2.5, 4.5, 4.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -2.5;
  sun.shadow.camera.right = 2.5;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -0.5;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 12;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(sun);

  // ── materials (shared) ──
  const M = {
    wall: track(new THREE.MeshStandardMaterial({ color: '#ebe5d9', roughness: 0.95 })),
    wallSide: track(new THREE.MeshStandardMaterial({ color: '#e2dbcd', roughness: 0.95 })),
    rail: track(new THREE.MeshStandardMaterial({ color: '#3b4048', metalness: 0.6, roughness: 0.4 })),
    glass: track(new THREE.MeshStandardMaterial({ color: '#bcd7e6', transparent: true, opacity: 0.22, roughness: 0.1 })),
    boiler: track(new THREE.MeshStandardMaterial({ color: '#f5f6f7', roughness: 0.45 })),
    dark: track(new THREE.MeshStandardMaterial({ color: '#23272d', roughness: 0.6 })),
    brass: track(new THREE.MeshStandardMaterial({ color: '#c9a14a', metalness: 0.85, roughness: 0.35 })),
    chrome: track(new THREE.MeshStandardMaterial({ color: '#d7dadf', metalness: 0.9, roughness: 0.25 })),
    supply: track(new THREE.MeshStandardMaterial({ color: '#b8553b', metalness: 0.55, roughness: 0.38, transparent: true })),
    ret: track(new THREE.MeshStandardMaterial({ color: '#3f6fb5', metalness: 0.4, roughness: 0.45, transparent: true })),
    white: track(new THREE.MeshStandardMaterial({ color: '#fbfbfb', roughness: 0.55 })),
    blue: track(new THREE.MeshStandardMaterial({ color: '#1c7ed6', roughness: 0.5 })),
    red: track(new THREE.MeshStandardMaterial({ color: '#d6332a', roughness: 0.5 })),
    gas: track(new THREE.MeshStandardMaterial({ color: '#e9b824', roughness: 0.5 })),
    grey: track(new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.6 })),
    duct: track(new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.7 })),
    plastic: track(new THREE.MeshStandardMaterial({ color: '#f3f3f1', roughness: 0.6 })),
    cable: track(new THREE.MeshStandardMaterial({ color: '#5c5f66', roughness: 0.7, transparent: true })),
    demandCable: track(new THREE.MeshStandardMaterial({ color: '#e8711c', roughness: 0.6, transparent: true })),
    flowmeter: track(new THREE.MeshStandardMaterial({ color: '#d0ebff', transparent: true, opacity: 0.45, roughness: 0.1 })),
    flame: track(new THREE.MeshBasicMaterial({ color: '#ff8c1a' })),
    flameCore: track(new THREE.MeshBasicMaterial({ color: '#4dabf7' })),
    particleHot: track(new THREE.MeshBasicMaterial({ color: '#ff5a36' })),
    particleCold: track(new THREE.MeshBasicMaterial({ color: '#4aa3ff' })),
    halo: track(new THREE.MeshBasicMaterial({ color: '#ffd43b' })),
  };

  // floor tiles texture (procedural)
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tileCanvas.height = 256;
  {
    const g = tileCanvas.getContext('2d')!;
    g.fillStyle = '#c9c2b6';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const shade = 196 + ((i + j) % 2) * 8;
        g.fillStyle = `rgb(${shade},${shade - 6},${shade - 16})`;
        g.fillRect(i * 128 + 2, j * 128 + 2, 124, 124);
      }
  }
  const tileTex = track(new THREE.CanvasTexture(tileCanvas));
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
  tileTex.repeat.set(BAL_W / 0.6, BAL_D / 0.6);
  tileTex.colorSpace = THREE.SRGBColorSpace;
  const floorMat = track(new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.85 }));

  // ── shared geometries ──
  const G = {
    cyl: track(new THREE.CylinderGeometry(1, 1, 1, 16)),
    cylLow: track(new THREE.CylinderGeometry(1, 1, 1, 10)),
    sphere: track(new THREE.SphereGeometry(1, 12, 10)),
    box: track(new THREE.BoxGeometry(1, 1, 1)),
    torus: track(new THREE.TorusGeometry(1, 0.12, 8, 24)),
  };

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number] = [1, 1, 1], rot?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const pickables: THREE.Object3D[] = [];
  const setPick = (o: THREE.Object3D, id: string) => {
    o.traverse((c) => (c.userData.pick = id));
    pickables.push(o);
    return o;
  };

  // label sprites
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);
  const makeLabel = (text: string, pos: [number, number, number], opts: { size?: number; color?: string; bg?: string; sub?: string } = {}) => {
    const lines = [{ text, size: 30, color: opts.color ?? '#1f2328', weight: 700 }];
    if (opts.sub) lines.push({ text: opts.sub, size: 22, color: '#a33a00', weight: 600 });
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = '700 30px system-ui, sans-serif';
    let w = ctx.measureText(text).width;
    if (opts.sub) {
      ctx.font = '600 22px system-ui, sans-serif';
      w = Math.max(w, ctx.measureText(opts.sub).width);
    }
    const cw = Math.ceil(w + 24);
    const ch = opts.sub ? 82 : 52;
    const tex = track(new THREE.CanvasTexture(textCanvas(lines, cw, ch, opts.bg ?? 'rgba(255,255,255,0.88)', 10)));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = track(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const s = new THREE.Sprite(mat);
    const k = ((opts.size ?? 0.05) * 1.7) / 52;
    s.scale.set(cw * k, ch * k, 1);
    s.position.set(...pos);
    s.renderOrder = 10;
    labelGroup.add(s);
    return s;
  };

  // ── architecture ──
  const floor = mesh(G.box, floorMat, [0, -0.05, BAL_D / 2], [BAL_W, 0.1, BAL_D]);
  floor.castShadow = false;
  scene.add(floor);
  const wall = mesh(G.box, M.wall, [0, WALL_H / 2, -0.1], [BAL_W + 0.3, WALL_H, 0.2]);
  scene.add(wall);
  scene.add(mesh(G.box, M.wallSide, [-BAL_W / 2 - 0.08, WALL_H / 2, BAL_D / 2 - 0.1], [0.16, WALL_H, BAL_D + 0.2]));
  // ceiling slab edge (upper balcony) for framing
  const slab = mesh(G.box, M.wallSide, [0, WALL_H + 0.08, BAL_D / 2 - 0.05], [BAL_W + 0.3, 0.16, BAL_D + 0.3]);
  slab.castShadow = false;
  scene.add(slab);
  // balcony door frame (context)
  scene.add(mesh(G.box, M.dark, [1.15, 1.05, 0.005], [0.85, 2.1, 0.02]));
  scene.add(mesh(G.box, M.glass, [1.15, 1.08, 0.02], [0.75, 1.95, 0.01]));
  // railing
  const railGroup = new THREE.Group();
  for (let x = -BAL_W / 2; x <= BAL_W / 2 + 1e-6; x += 0.4) railGroup.add(mesh(G.cylLow, M.rail, [x, 0.53, BAL_D], [0.018, 1.06, 0.018]));
  railGroup.add(mesh(G.cylLow, M.rail, [0, 1.06, BAL_D], [0.025, BAL_W, 0.025], [0, 0, Math.PI / 2]));
  railGroup.add(mesh(G.cylLow, M.rail, [0, 0.12, BAL_D], [0.015, BAL_W, 0.015], [0, 0, Math.PI / 2]));
  railGroup.add(mesh(G.box, M.glass, [0, 0.58, BAL_D], [BAL_W, 0.9, 0.012]));
  railGroup.add(mesh(G.cylLow, M.rail, [BAL_W / 2, 1.06, BAL_D / 2], [0.025, BAL_D, 0.025], [Math.PI / 2, 0, 0]));
  scene.add(railGroup);

  // ── boiler (generic, illustrative) ──
  const boilerGroup = new THREE.Group();
  const bodyGeo = track(new RoundedBoxGeometry(BOILER.w, BOILER.h, BOILER.d, 4, 0.025));
  boilerGroup.add(mesh(bodyGeo, M.boiler, [BOILER.x, BOILER.y, BOILER.z]));
  const front = BOILER.z + BOILER.d / 2 + 0.002;
  // flame window
  boilerGroup.add(mesh(G.cylLow, M.dark, [0, 1.77, front], [0.05, 0.004, 0.05], [Math.PI / 2, 0, 0]));
  const flame = new THREE.Group();
  const flameOuter = mesh(track(new THREE.ConeGeometry(0.022, 0.07, 14)), M.flame, [0, 1.775, front + 0.006]);
  const flameInner = mesh(track(new THREE.ConeGeometry(0.01, 0.035, 10)), M.flameCore, [0, 1.76, front + 0.009]);
  flameOuter.castShadow = flameInner.castShadow = false;
  flame.add(flameOuter, flameInner);
  flame.visible = false;
  boilerGroup.add(flame);
  // control panel band
  boilerGroup.add(mesh(G.box, M.plastic, [0, 1.42, front - 0.001], [0.36, 0.12, 0.004]));
  // LCD (canvas texture)
  const lcdCanvas = document.createElement('canvas');
  lcdCanvas.width = 256;
  lcdCanvas.height = 128;
  const lcdTex = track(new THREE.CanvasTexture(lcdCanvas));
  lcdTex.colorSpace = THREE.SRGBColorSpace;
  const lcd = new THREE.Mesh(track(new THREE.PlaneGeometry(0.15, 0.075)), track(new THREE.MeshBasicMaterial({ map: lcdTex })));
  lcd.position.set(-0.07, 1.42, front + 0.002);
  boilerGroup.add(lcd);
  // knob + status LED
  boilerGroup.add(mesh(G.cyl, M.chrome, [0.08, 1.42, front + 0.006], [0.022, 0.012, 0.022], [Math.PI / 2, 0, 0]));
  const ledMat = track(new THREE.MeshStandardMaterial({ color: '#555', emissive: '#000' }));
  boilerGroup.add(mesh(G.sphere, ledMat, [0.15, 1.45, front + 0.004], [0.007, 0.007, 0.007]));
  // pump indicator (impeller)
  boilerGroup.add(mesh(G.cylLow, M.dark, [0.14, 1.395, front + 0.003], [0.018, 0.003, 0.018], [Math.PI / 2, 0, 0]));
  const impeller = new THREE.Group();
  impeller.position.set(0.14, 1.395, front + 0.006);
  impeller.add(mesh(G.box, M.blue, [0, 0, 0], [0.03, 0.006, 0.002]), mesh(G.box, M.blue, [0, 0, 0], [0.006, 0.03, 0.002]));
  boilerGroup.add(impeller);
  // bottom cover + stubs (illustrative)
  boilerGroup.add(mesh(G.box, M.grey, [0, BOILER.y - BOILER.h / 2 + 0.01, BOILER.z], [0.36, 0.02, 0.24]));
  [-0.12, -0.06, 0, 0.06, 0.12].forEach((x) => boilerGroup.add(mesh(G.cyl, M.brass, [x, 1.285, x === -0.12 ? SUP_Z : x === 0.12 ? RET_Z : 0.13], [0.011, 0.03, 0.011])));
  // demand terminal marker (front bottom-right)
  boilerGroup.add(mesh(G.box, M.dark, [0.13, 1.335, front], [0.07, 0.025, 0.004]));
  setPick(boilerGroup, 'boiler');
  scene.add(boilerGroup);
  makeLabel('Boiler (generic, illustrative)', [0, 2.07, 0.35], { size: 0.05 });

  // ── context-only infrastructure ──
  const ctx = new THREE.Group();
  const gasPipe = new THREE.Mesh(track(new THREE.TubeGeometry(roundedPath([v3(0, 1.28, 0.13), v3(0, 1.12, 0.13), v3(0, 1.12, -0.05)], 0.04), 30, 0.008, 10)), M.gas);
  gasPipe.castShadow = true;
  ctx.add(setPick(gasPipe, 'ctx:gas'));
  ctx.add(setPick(mesh(G.box, M.gas, [0.0, 1.18, 0.13], [0.04, 0.008, 0.008]), 'ctx:gas'));
  const flue = new THREE.Mesh(track(new THREE.TubeGeometry(roundedPath([v3(0, 2.0, 0.15), v3(0, 2.3, 0.15), v3(0, 2.3, -0.12)], 0.08), 30, 0.05, 16)), M.white);
  flue.castShadow = true;
  ctx.add(setPick(flue, 'ctx:flue'));
  const prv = new THREE.Mesh(track(new THREE.TubeGeometry(roundedPath([v3(0.06, 1.28, 0.2), v3(0.06, 1.2, 0.2), v3(0.2, 1.2, 0.2), v3(0.2, 1.08, 0.2)], 0.03), 30, 0.005, 8)), M.grey);
  ctx.add(setPick(prv, 'ctx:prv'));
  ctx.add(setPick(mesh(track(new THREE.ConeGeometry(0.02, 0.04, 12, 1, true)), M.grey, [0.2, 1.06, 0.2], [1, 1, 1], [Math.PI, 0, 0]), 'ctx:prv'));
  ctx.add(setPick(mesh(G.box, M.white, [0.42, 1.86, 0.03], [0.08, 0.1, 0.04]), 'ctx:mains'));
  ctx.add(setPick(mesh(G.box, M.red, [0.42, 1.86, 0.052], [0.02, 0.035, 0.006]), 'ctx:mains'));
  const mainsCable = new THREE.Mesh(track(new THREE.TubeGeometry(roundedPath([v3(0.42, 1.8, 0.03), v3(0.42, 1.72, 0.03), v3(0.2, 1.72, 0.03)], 0.03), 20, 0.004, 6)), M.cable);
  ctx.add(setPick(mainsCable, 'ctx:mains'));
  scene.add(ctx);
  makeLabel('Gas — context only', [-0.32, 1.17, 0.3], { size: 0.032, sub: 'Professional installation required' });
  makeLabel('Flue — context only', [0.2, 2.42, 0.2], { size: 0.032, sub: 'Professional installation required' });
  makeLabel('Pressure-relief discharge', [0.66, 1.2, 0.12], { size: 0.03, sub: 'Professional installation required' });
  makeLabel('Mains power', [0.6, 1.97, 0.06], { size: 0.03, sub: 'Professional installation required' });

  // ── boiler ↔ manifold pipes ──
  const supplyPts = [v3(-0.12, 1.27, SUP_Z), v3(-0.12, 1.02, SUP_Z), v3(-0.5, 1.02, SUP_Z), v3(-0.5, SUP_Y, SUP_Z), v3(-0.42, SUP_Y, SUP_Z)];
  const returnPts = [v3(0.42, RET_Y, RET_Z), v3(0.5, RET_Y, RET_Z), v3(0.5, 1.0, RET_Z), v3(0.12, 1.0, RET_Z), v3(0.12, 1.27, RET_Z)];
  const supplyPath = roundedPath(supplyPts, 0.05);
  const returnPath = roundedPath(returnPts, 0.05);
  const supplyMat = M.supply;
  const returnMat = M.ret;
  const supplyPipe = new THREE.Mesh(track(new THREE.TubeGeometry(supplyPath, 80, 0.011, 12)), supplyMat);
  const returnPipe = new THREE.Mesh(track(new THREE.TubeGeometry(returnPath, 80, 0.011, 12)), returnMat);
  supplyPipe.castShadow = returnPipe.castShadow = true;
  scene.add(setPick(supplyPipe, 'pipe:supply'), setPick(returnPipe, 'pipe:return'));
  // isolating valves (brass bodies with lever handles)
  const valve = (x: number, y: number, z: number, handle: THREE.Material, id: string) => {
    const g = new THREE.Group();
    g.add(mesh(G.cyl, M.brass, [x, y, z], [0.016, 0.04, 0.016]));
    g.add(mesh(G.box, handle, [x + 0.025, y + 0.005, z + 0.02], [0.05, 0.008, 0.012]));
    scene.add(setPick(g, id));
  };
  valve(-0.12, 1.15, SUP_Z, M.red, 'pipe:supply');
  valve(0.12, 1.15, RET_Z, M.blue, 'pipe:return');
  // fittings at pipe ends
  [[-0.12, 1.255, SUP_Z], [0.12, 1.255, RET_Z]].forEach((p) => scene.add(mesh(G.cyl, M.brass, p as [number, number, number], [0.014, 0.014, 0.014])));

  // ── manifold (directly below the boiler) ──
  const manifold = new THREE.Group();
  const bar = (y: number, z: number) => manifold.add(mesh(G.cyl, M.brass, [0, y, z], [BAR_R, 0.84, BAR_R], [0, 0, Math.PI / 2]));
  bar(SUP_Y, SUP_Z);
  bar(RET_Y, RET_Z);
  // end fittings: air vent + drain on the far ends
  manifold.add(mesh(G.cyl, M.chrome, [0.44, SUP_Y, SUP_Z], [0.014, 0.03, 0.014], [0, 0, Math.PI / 2]));
  manifold.add(mesh(G.cyl, M.chrome, [0.46, SUP_Y + 0.02, SUP_Z], [0.006, 0.03, 0.006]));
  manifold.add(mesh(G.cyl, M.chrome, [-0.44, RET_Y, RET_Z], [0.014, 0.03, 0.014], [0, 0, Math.PI / 2]));
  // wall brackets
  [-0.36, 0.36].forEach((x) => {
    manifold.add(mesh(G.box, M.grey, [x, (SUP_Y + RET_Y) / 2, 0.02], [0.03, 0.32, 0.01]));
    manifold.add(mesh(G.box, M.grey, [x, SUP_Y, (SUP_Z + 0.02) / 2], [0.025, 0.012, SUP_Z]));
    manifold.add(mesh(G.box, M.grey, [x, RET_Y, (RET_Z + 0.02) / 2], [0.025, 0.012, RET_Z]));
  });
  setPick(manifold, 'manifold');
  scene.add(manifold);
  // floor-loop trunking (pipes continue through the wall to the rooms — route illustrative)
  scene.add(setPick(mesh(G.box, M.duct, [0, DUCT_TOP / 2, 0.1], [0.82, DUCT_TOP, 0.18]), 'manifold'));
  makeLabel('14 floor-loop pairs → rooms (route illustrative)', [0, 0.2, 0.32], { size: 0.03 });
  makeLabel('Manifold (supply above, return below)', [-0.62, 0.9, 0.2], { size: 0.035 });

  // instanced per-port parts
  const N = 14;
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, count = N) => {
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
    return im;
  };
  const tmp = new THREE.Object3D();
  const setInst = (im: THREE.InstancedMesh, i: number, pos: [number, number, number], scale: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
    tmp.position.set(...pos);
    tmp.scale.set(...scale);
    tmp.rotation.set(...rot);
    tmp.updateMatrix();
    im.setMatrixAt(i, tmp.matrix);
  };
  const valveBodies = mk(G.cyl, M.brass);
  const actBodies = mk(G.cyl, M.white);
  const actRings = mk(G.cyl, M.blue);
  const actCaps = mk(G.cyl, M.plastic);
  const actPins = mk(G.cylLow, track(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })));
  const actDots = mk(G.sphere, track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#000000', roughness: 0.4 })));
  const dropSup = mk(G.cylLow, track(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.3, roughness: 0.5 })));
  const dropRet = mk(G.cylLow, track(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.3, roughness: 0.5 })));
  const fmTubes = mk(G.cylLow, M.flowmeter);
  const fmFloats = mk(G.cylLow, M.red);
  const fmCaps = mk(G.cylLow, M.red);
  const blueCaps = mk(G.cylLow, M.blue);
  const tags = mk(G.box, track(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })));
  const halos = mk(G.torus, M.halo);
  halos.castShadow = false;
  const supTop = SUP_Y - BAR_R;
  const supLen = supTop - DUCT_TOP;
  const retTop = RET_Y - BAR_R;
  const retLen = retTop - DUCT_TOP;
  for (let i = 0; i < N; i++) {
    const x = PORT_X(i);
    setInst(valveBodies, i, [x, SUP_Y + BAR_R + 0.01, SUP_Z], [0.012, 0.02, 0.012]);
    setInst(actBodies, i, [x, SUP_Y + BAR_R + 0.045, SUP_Z], [0.016, 0.05, 0.016]);
    setInst(actRings, i, [x, SUP_Y + BAR_R + 0.03, SUP_Z], [0.0165, 0.006, 0.0165]);
    setInst(actCaps, i, [x, SUP_Y + BAR_R + 0.074, SUP_Z], [0.012, 0.008, 0.012]);
    setInst(dropSup, i, [x, DUCT_TOP + supLen / 2, SUP_Z + 0.002], [0.008, supLen, 0.008]);
    setInst(dropRet, i, [x, DUCT_TOP + retLen / 2, RET_Z - 0.03], [0.008, retLen, 0.008]);
    setInst(fmTubes, i, [x, RET_Y + BAR_R + 0.045, RET_Z], [0.007, 0.08, 0.007]);
    setInst(fmCaps, i, [x, RET_Y + BAR_R + 0.09, RET_Z], [0.008, 0.012, 0.008]);
    setInst(blueCaps, i, [x, RET_Y, RET_Z + BAR_R + 0.004], [0.009, 0.01, 0.009], [Math.PI / 2, 0, 0]);
    setInst(tags, i, [x, DUCT_TOP + 0.03, 0.195], [0.034, 0.03, 0.004]);
  }
  // return drops connect to the bar bottom with a short elbow offset
  const retElbows = mk(G.cylLow, M.ret);
  for (let i = 0; i < N; i++) setInst(retElbows, i, [PORT_X(i), retTop - 0.004, RET_Z - 0.015], [0.008, 0.03, 0.008], [Math.PI / 2, 0, 0]);
  [valveBodies, actBodies, actRings, actCaps, dropSup, dropRet, fmTubes, fmCaps, blueCaps, tags, retElbows].forEach((im) => (im.instanceMatrix.needsUpdate = true));
  actBodies.userData.pickInstance = 'actuator';
  actCaps.userData.pickInstance = 'actuator';
  actRings.userData.pickInstance = 'actuator';
  pickables.push(actBodies, actCaps, actRings);
  // loop numbers on tags
  for (let i = 0; i < N; i++) makeLabel(String(i + 1).padStart(2, '0'), [PORT_X(i), DUCT_TOP + 0.075, 0.2], { size: 0.022, bg: 'rgba(255,255,255,0.0)' });

  // flow particles (instanced)
  const PER_DROP = 3;
  const dropParticles = mk(G.sphere, M.particleHot, N * PER_DROP);
  const dropParticlesRet = mk(G.sphere, M.particleCold, N * PER_DROP);
  const MAIN_P = 14;
  const mainSupP = mk(G.sphere, M.particleHot, MAIN_P);
  const mainRetP = mk(G.sphere, M.particleCold, MAIN_P);
  [dropParticles, dropParticlesRet, mainSupP, mainRetP].forEach((im) => (im.castShadow = false));

  // ── zone controller ──
  const ctrl = new THREE.Group();
  ctrl.add(mesh(track(new RoundedBoxGeometry(CTRL.w, CTRL.h, CTRL.d, 3, 0.01)), M.plastic, [CTRL.x, CTRL.y, CTRL.z]));
  ctrl.add(mesh(G.box, track(new THREE.MeshStandardMaterial({ color: '#e6fcf5', roughness: 0.6 })), [CTRL.x, CTRL.y, CTRL.z + CTRL.d / 2 + 0.001], [CTRL.w - 0.03, CTRL.h - 0.05, 0.002]));
  const zoneLeds: THREE.MeshStandardMaterial[] = [];
  ZONE_ORDER.forEach((_, i) => {
    const m = track(new THREE.MeshStandardMaterial({ color: '#777', emissive: '#000' }));
    zoneLeds.push(m);
    ctrl.add(mesh(G.sphere, m, [CTRL.x - 0.12 + i * 0.06, CTRL.y, CTRL.z + CTRL.d / 2 + 0.004], [0.008, 0.008, 0.008]));
    ctrl.add(mesh(G.box, M.grey, [CTRL.x - 0.12 + i * 0.06, CTRL.y + 0.06, CTRL.z + CTRL.d / 2], [0.04, 0.02, 0.006]));
    ctrl.add(mesh(G.box, M.grey, [CTRL.x - 0.12 + i * 0.06, CTRL.y - 0.06, CTRL.z + CTRL.d / 2], [0.04, 0.02, 0.006]));
  });
  const demandLed = track(new THREE.MeshStandardMaterial({ color: '#777', emissive: '#000' }));
  ctrl.add(mesh(G.sphere, demandLed, [CTRL.x + 0.15, CTRL.y, CTRL.z + CTRL.d / 2 + 0.004], [0.01, 0.01, 0.01]));
  setPick(ctrl, 'controller');
  scene.add(ctrl);
  makeLabel('Zone controller', [CTRL.x, CTRL.y + 0.16, 0.08], { size: 0.04 });
  // cables: controller → actuator bundle, controller → boiler demand
  const cableToAct = new THREE.Mesh(track(new THREE.TubeGeometry(roundedPath([v3(CTRL.x - 0.15, CTRL.y - 0.08, 0.03), v3(0.55, CTRL.y - 0.08, 0.03), v3(0.55, 0.93, 0.03), v3(0.1, 0.93, SUP_Z - 0.02)], 0.04), 40, 0.004, 6)), M.cable);
  const cableDemand = new THREE.Mesh(track(new THREE.TubeGeometry(roundedPath([v3(CTRL.x + 0.15, CTRL.y + 0.11, 0.03), v3(CTRL.x + 0.15, 1.33, 0.03), v3(0.3, 1.33, 0.03), v3(0.3, 1.33, 0.25), v3(0.17, 1.33, 0.3)], 0.04), 40, 0.004, 6)), M.demandCable);
  scene.add(setPick(cableToAct, 'controller'), setPick(cableDemand, 'controller'));

  // ── thermostats (shown together for illustration) ──
  const thermoGeo = track(new RoundedBoxGeometry(0.1, 0.1, 0.022, 3, 0.012));
  const thermoLcd: Record<string, { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; key: string }> = {};
  const thermoGroups: Record<string, THREE.Group> = {};
  ZONE_ORDER.forEach((z) => {
    const g = new THREE.Group();
    g.add(mesh(thermoGeo, M.white, [THERMO_X[z], THERMO_Y, 0.012]));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const tex = track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(track(new THREE.PlaneGeometry(0.07, 0.06)), track(new THREE.MeshBasicMaterial({ map: tex })));
    plane.position.set(THERMO_X[z], THERMO_Y + 0.008, 0.0235);
    g.add(plane);
    thermoLcd[z] = { canvas, tex, key: '' };
    setPick(g, 'thermostat:' + z);
    thermoGroups[z] = g;
    scene.add(g);
  });
  scene.add(mesh(G.box, M.wallSide, [-1.03, THERMO_Y, 0.002], [0.9, 0.24, 0.004]));
  makeLabel('Room thermostats — shown together for illustration', [-1.03, THERMO_Y + 0.17, 0.05], { size: 0.032 });
  const thermoNameLabels: Record<string, THREE.Sprite> = {};
  const NAMES: Record<ZoneId, string> = { living: 'Living Room', bath: 'Bathroom', child: "Child's Bedroom", main: 'Main Bedroom' };
  ZONE_ORDER.forEach((z) => (thermoNameLabels[z] = makeLabel(NAMES[z], [THERMO_X[z], THERMO_Y - 0.085, 0.04], { size: 0.024 })));

  // ── explain overlay ──
  const explain = new THREE.Group();
  explain.visible = false;
  const glow = (path: THREE.Curve<THREE.Vector3>, color: string) => {
    const m = new THREE.Mesh(track(new THREE.TubeGeometry(path, 80, 0.022, 10)), track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })));
    explain.add(m);
  };
  glow(supplyPath, '#ff3b30');
  glow(returnPath, '#2f80ff');
  glow(new THREE.LineCurve3(v3(-0.43, SUP_Y, SUP_Z), v3(0.43, SUP_Y, SUP_Z)), '#ff3b30');
  glow(new THREE.LineCurve3(v3(-0.43, RET_Y, RET_Z), v3(0.43, RET_Y, RET_Z)), '#2f80ff');
  const dashed = (pts: THREE.Vector3[], color: string) => {
    const geo = track(new THREE.BufferGeometry().setFromPoints(pts));
    const line = new THREE.Line(geo, track(new THREE.LineDashedMaterial({ color, dashSize: 0.03, gapSize: 0.02, depthTest: false })));
    line.computeLineDistances();
    line.renderOrder = 9;
    explain.add(line);
  };
  ZONE_ORDER.forEach((z, i) => dashed([v3(THERMO_X[z], THERMO_Y - 0.06, 0.03), v3(THERMO_X[z], 1.12, 0.03), v3(CTRL.x - 0.12 + i * 0.06, 1.12, 0.04), v3(CTRL.x - 0.12 + i * 0.06, CTRL.y + 0.08, 0.07)], '#2f9e44'));
  dashed([v3(CTRL.x - 0.15, CTRL.y - 0.08, 0.07), v3(0, 0.93, SUP_Z)], '#2f9e44');
  dashed([v3(CTRL.x + 0.15, CTRL.y, 0.07), v3(0.17, 1.34, 0.31)], '#e8711c');
  scene.add(explain);
  const explainLabels = [
    makeLabel('① Supply (hot) — boiler → manifold → loops', [-0.75, 1.05, 0.25], { size: 0.032, color: '#c92a2a' }),
    makeLabel('② Return (cooler) — loops → manifold → boiler', [0.78, 0.5, 0.25], { size: 0.032, color: '#1864ab' }),
    makeLabel('③ Control signal — thermostat → controller → actuators', [-0.2, 1.2, 0.1], { size: 0.032, color: '#2b8a3e' }),
    makeLabel('④ Boiler demand — controller → boiler', [0.6, 1.4, 0.3], { size: 0.032, color: '#d9480f' }),
  ];
  explainLabels.forEach((l) => (l.visible = false));

  // ── connect-mode port markers & links ──
  const portGroup = new THREE.Group();
  portGroup.visible = false;
  scene.add(portGroup);
  const portMats: Record<string, THREE.MeshBasicMaterial> = {};
  const portColor = (id: string) => (id.includes('supply') ? '#ff3b30' : id.includes('return') ? '#2f80ff' : id.includes('demand') ? '#e8711c' : id.startsWith('thermostat') || id.startsWith('controller.in') ? '#2f9e44' : '#7048e8');
  const portMeshes: Record<string, THREE.Mesh> = {};
  Object.entries(PORT_POS).forEach(([id, p]) => {
    const m = track(new THREE.MeshBasicMaterial({ color: portColor(id), depthTest: false }));
    portMats[id] = m;
    const s = new THREE.Mesh(G.sphere, m);
    s.position.set(...p);
    s.scale.setScalar(0.014);
    s.renderOrder = 11;
    s.userData.pick = 'port:' + id;
    portGroup.add(s);
    portMeshes[id] = s;
    pickables.push(s);
  });
  const ctxMat = track(new THREE.MeshBasicMaterial({ color: '#868e96', depthTest: false }));
  Object.entries(CONTEXT_POS).forEach(([id, p]) => {
    const s = new THREE.Mesh(G.box, ctxMat);
    s.position.set(...p);
    s.scale.setScalar(0.02);
    s.renderOrder = 11;
    s.userData.pick = id;
    portGroup.add(s);
  });
  let linkLines: THREE.LineSegments | null = null;
  const linkMat = track(new THREE.LineBasicMaterial({ color: '#111', depthTest: false }));

  // selection helpers
  const selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#ffb703'));
  selBox.visible = false;
  (selBox.material as THREE.Material).depthTest = false;
  selBox.renderOrder = 12;
  scene.add(selBox);
  track(selBox.geometry);
  track(selBox.material as THREE.Material);

  // ── state ──
  let snap: SceneSnapshot | null = null;
  let highlighted = new Set<string>();
  let explainOn = false;
  let lastLcdKey = '';
  let lastConnKey = '-';
  let tFlow = 0;
  let camAnim: { fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null;
  const colA = new THREE.Color();
  const colB = new THREE.Color();

  function drawLcd(s: SceneSnapshot) {
    const key = `${Math.round(s.flowC)}|${s.mode}|${s.burnerOn}|${s.pumpOn}|${s.ta1}`;
    if (key === lastLcdKey) return;
    lastLcdKey = key;
    const g = lcdCanvas.getContext('2d')!;
    g.fillStyle = '#0b2a5b';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#bfe3ff';
    g.font = '700 54px monospace';
    g.fillText(`${Math.round(s.flowC)}°`, 14, 62);
    g.font = '600 22px system-ui, sans-serif';
    g.fillText(s.modeLabel, 14, 100);
    g.fillText(s.pumpOn ? 'PUMP ⟳' : 'PUMP –', 150, 40);
    g.fillText(s.ta1 ? 'DEMAND ●' : 'DEMAND ○', 140, 72);
    g.fillStyle = s.burnerOn ? '#ff922b' : '#24406b';
    g.beginPath();
    g.arc(226, 104, 12, 0, Math.PI * 2);
    g.fill();
    lcdTex.needsUpdate = true;
    const ledColor = s.mode === 'fault' ? '#ff2d2d' : s.burnerOn ? '#ff8c1a' : s.pumpOn ? '#3aa0ff' : '#2b8a3e';
    ledMat.emissive.set(ledColor);
    ledMat.color.set(ledColor);
  }

  function drawThermostats(s: SceneSnapshot) {
    ZONE_ORDER.forEach((z) => {
      const t = s.thermostats[z];
      const key = `${t.enabled}|${t.calling}|${t.air.toFixed(1)}|${t.sp}`;
      const l = thermoLcd[z];
      if (l.key === key) return;
      l.key = key;
      const g = l.canvas.getContext('2d')!;
      g.fillStyle = t.enabled ? '#0b2a5b' : '#05080d';
      g.fillRect(0, 0, 128, 128);
      if (t.enabled) {
        g.fillStyle = '#bfe3ff';
        g.font = '700 40px monospace';
        g.fillText(t.air.toFixed(1), 10, 62);
        g.font = '600 18px monospace';
        g.fillText(`SET ${t.sp.toFixed(1)}°`, 10, 100);
        g.fillStyle = t.calling ? '#ff922b' : '#24406b';
        g.beginPath();
        g.moveTo(110, 30);
        g.quadraticCurveTo(98, 16, 108, 4);
        g.quadraticCurveTo(122, 18, 110, 30);
        g.fill();
      }
      l.tex.needsUpdate = true;
    });
  }

  function applyInstances(s: SceneSnapshot) {
    for (let i = 0; i < N; i++) {
      const l = s.loops[i];
      const x = PORT_X(i);
      const pinH = 0.004 + 0.014 * l.pos;
      setInst(actPins, i, [x, SUP_Y + BAR_R + 0.078 + pinH / 2, SUP_Z], [0.003, pinH, 0.003]);
      actPins.setColorAt(i, colA.set(l.pos >= 0.98 ? '#2f9e44' : l.pos > 0.02 ? '#94d82d' : '#adb5bd'));
      setInst(actDots, i, [x, SUP_Y + BAR_R + 0.055, SUP_Z + 0.0165], [0.003, 0.003, 0.003]);
      actDots.setColorAt(i, colA.set(l.cmd ? '#ff2d2d' : '#ced4da'));
      setInst(fmFloats, i, [x, RET_Y + BAR_R + 0.012 + 0.06 * Math.min(1, l.flowFrac), RET_Z], [0.0055, 0.008, 0.0055]);
      const hl = highlighted.has(l.id);
      dropSup.setColorAt(i, colA.set(l.flowing ? '#e8462d' : '#b8836f').lerp(colB.set('#ffe066'), hl ? 0.5 : 0));
      dropRet.setColorAt(i, colA.set(l.flowing ? '#2f6fe0' : '#7f95b8').lerp(colB.set('#a5d8ff'), hl ? 0.6 : 0));
      tags.setColorAt(i, colA.set(l.color));
      setInst(halos, i, [x, SUP_Y + BAR_R + 0.045, SUP_Z], hl ? [0.026, 0.026, 0.026] : [0, 0, 0], [Math.PI / 2, 0, 0]);
      actBodies.setColorAt(i, colA.set(l.phase === 'fault' ? '#ffc9c9' : '#fbfbfb'));
    }
    [actPins, actDots, fmFloats, halos].forEach((im) => (im.instanceMatrix.needsUpdate = true));
    [actPins, actDots, dropSup, dropRet, tags, actBodies].forEach((im) => im.instanceColor && (im.instanceColor.needsUpdate = true));
    (actDots.material as THREE.MeshStandardMaterial).emissive.set('#000');
  }

  function applyIndicators(s: SceneSnapshot) {
    flame.visible = s.burnerOn; // flame only while the simulated burner is on
    ZONE_ORDER.forEach((z, i) => {
      const on = s.zoneOut[z];
      zoneLeds[i].emissive.set(on ? '#f59f00' : '#000');
      zoneLeds[i].color.set(on ? '#f59f00' : '#777');
    });
    demandLed.emissive.set(s.ta1 ? '#ff7a1a' : '#000');
    demandLed.color.set(s.ta1 ? '#ff7a1a' : '#777');
    // connect mode: ghost missing physical links
    const ghost = (m: THREE.MeshStandardMaterial, on: boolean) => {
      m.opacity = on ? 1 : 0.22;
      m.depthWrite = on;
    };
    const cm = s.connectMode;
    ghost(M.supply, !cm || s.summary.supply);
    ghost(M.ret, !cm || s.summary.ret);
    ghost(M.cable, !cm || ZONE_ORDER.every((z) => s.summary.power[z]));
    ghost(M.demandCable, !cm || s.summary.demandLink);
    portGroup.visible = cm;
    Object.entries(portMeshes).forEach(([id, m]) => m.scale.setScalar(s.pendingPort === id ? 0.024 : 0.014));
    // link lines (rebuilt only when the set of connections changes)
    const connKey = cm ? s.connections.map((c) => c.from + '>' + c.to).join('|') : '';
    if (connKey === lastConnKey) return;
    lastConnKey = connKey;
    if (linkLines) {
      portGroup.remove(linkLines);
      linkLines.geometry.dispose();
      linkLines = null;
    }
    if (cm && s.connections.length) {
      const pts: THREE.Vector3[] = [];
      for (const c of s.connections) {
        const a = PORT_POS[c.from];
        const b = PORT_POS[c.to];
        if (a && b) pts.push(v3(...a), v3(...b));
      }
      linkLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), linkMat);
      linkLines.renderOrder = 11;
      portGroup.add(linkLines);
    }
  }

  // ── picking ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const objs = pickables.filter((o) => o.visible && (o.parent?.visible ?? true));
    const hits = raycaster.intersectObjects(objs, true);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.pickInstance === 'actuator' && h.instanceId !== undefined && snap) {
        onPick('actuator:' + snap.loops[h.instanceId].id);
        return;
      }
      if (o.userData.pick) {
        onPick(o.userData.pick as string);
        return;
      }
    }
    onPick(null);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // ── resize ──
  const resize = () => {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ── render loop ──
  let raf = 0;
  let last = performance.now();
  const supLenTotal = supplyPath.getLength();
  const retLenTotal = returnPath.getLength();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s = snap;
    if (s && !s.paused) tFlow += dt;
    // camera animation
    if (camAnim) {
      camAnim.t = Math.min(1, camAnim.t + dt / 0.7);
      const k = camAnim.t < 0.5 ? 2 * camAnim.t * camAnim.t : 1 - Math.pow(-2 * camAnim.t + 2, 2) / 2;
      camera.position.lerpVectors(camAnim.fromP, camAnim.toP, k);
      controls.target.lerpVectors(camAnim.fromT, camAnim.toT, k);
      if (camAnim.t >= 1) camAnim = null;
    }
    controls.update();
    if (s) {
      // flame flicker
      if (s.burnerOn) {
        const f = 1 + 0.08 * Math.sin(now / 70) + 0.05 * Math.sin(now / 37);
        flameOuter.scale.set(1, f, 1);
      }
      if (s.pumpOn && !s.paused) impeller.rotation.z -= dt * 12;
      // drop particles — only for eligible flowing loops
      for (let i = 0; i < N; i++) {
        const l = s.loops[i];
        const x = PORT_X(i);
        for (let k = 0; k < PER_DROP; k++) {
          const idx = i * PER_DROP + k;
          if (!l.flowing) {
            setInst(dropParticles, idx, [0, -5, 0], [0, 0, 0]);
            setInst(dropParticlesRet, idx, [0, -5, 0], [0, 0, 0]);
            continue;
          }
          const ph = (tFlow * 0.35 * (0.4 + l.flowFrac) + k / PER_DROP) % 1;
          setInst(dropParticles, idx, [x, supTop - ph * supLen, SUP_Z + 0.002], [0.0055, 0.0055, 0.0055]);
          setInst(dropParticlesRet, idx, [x, DUCT_TOP + ph * retLen, RET_Z - 0.03], [0.0055, 0.0055, 0.0055]);
        }
      }
      // main pipe particles
      for (let k = 0; k < MAIN_P; k++) {
        if (!s.chFlow) {
          setInst(mainSupP, k, [0, -5, 0], [0, 0, 0]);
          setInst(mainRetP, k, [0, -5, 0], [0, 0, 0]);
          continue;
        }
        const ph = (tFlow * (0.35 / supLenTotal) * 1.6 + k / MAIN_P) % 1;
        const p1 = supplyPath.getPointAt(ph);
        const p2 = returnPath.getPointAt((tFlow * (0.35 / retLenTotal) * 1.6 + k / MAIN_P) % 1);
        setInst(mainSupP, k, [p1.x, p1.y, p1.z], [0.0075, 0.0075, 0.0075]);
        setInst(mainRetP, k, [p2.x, p2.y, p2.z], [0.0075, 0.0075, 0.0075]);
      }
      [dropParticles, dropParticlesRet, mainSupP, mainRetP].forEach((im) => (im.instanceMatrix.needsUpdate = true));
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // ── API ──
  const api: SceneApi = {
    update(s) {
      snap = s;
      drawLcd(s);
      drawThermostats(s);
      applyInstances(s);
      applyIndicators(s);
    },
    setSelection(id, loopIds) {
      highlighted = new Set(loopIds);
      if (snap) applyInstances(snap);
      selBox.visible = false;
      if (!id) return;
      const box = new THREE.Box3();
      if (id.startsWith('actuator:') && snap) {
        const i = snap.loops.findIndex((l) => l.id === id.slice(9));
        if (i >= 0) {
          const x = PORT_X(i);
          box.set(v3(x - 0.022, SUP_Y + BAR_R, SUP_Z - 0.022), v3(x + 0.022, SUP_Y + BAR_R + 0.1, SUP_Z + 0.022));
        }
      } else {
        const target = pickables.find((o) => o.userData.pick === id);
        if (!target) return;
        box.setFromObject(target);
      }
      if (box.isEmpty()) return;
      box.expandByScalar(0.01);
      selBox.box.copy(box);
      selBox.visible = true;
    },
    setCamera(p) {
      const c = CAMERAS[p];
      camAnim = { fromP: camera.position.clone(), toP: v3(...c.pos), fromT: controls.target.clone(), toT: v3(...c.target), t: 0 };
    },
    setExplain(on) {
      explainOn = on;
      explain.visible = explainOn;
      explainLabels.forEach((l) => (l.visible = explainOn));
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      if (linkLines) linkLines.geometry.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
  void thermoGroups;
  void thermoNameLabels;
  return api;
}
