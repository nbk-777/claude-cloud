// 3D Balcony page browser check (WebGL via SwiftShader). Run: npm run build && npm run smoke:3d
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const URL_ = pathToFileURL(resolve(here, '../dist/index.html')).href + '#balcony-3d';
const SHOTS = resolve(here, 'screenshots');
mkdirSync(SHOTS, { recursive: true });
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('@playwright/test'));
}
(async () => {
  const out = SHOTS;
  const res = []; const ok = (n, c, x='') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + String(e))); p.on('console', m => (m.type()==='error'||m.type()==='warning') && errs.push(m.type()+': '+m.text()));
  await p.goto(URL_);
  await p.waitForFunction(() => document.querySelector('[data-testid="b3d-canvas-host"]')?.getAttribute('data-status') === 'ready', null, { timeout: 30000 });
  ok('route #balcony-3d opens the page with a WebGL canvas', await p.locator('[data-testid="balcony-canvas"]').count() === 1);
  await p.waitForTimeout(1200);
  await p.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-default.png' });
  ok('default: standby before demand reaches boiler', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'STANDBY');
  // setpoint buttons
  const sp0 = await p.textContent('[data-testid="b3d-sp-living"]');
  await p.click('[data-testid="b3d-plus-living"]');
  ok('setpoint + works', (await p.textContent('[data-testid="b3d-sp-living"]')) === (parseFloat(sp0) + 0.5).toFixed(1));
  await p.click('[data-testid="b3d-minus-living"]');
  // active heating
  await p.locator('[data-testid="speed"]').fill('60');
  await p.waitForTimeout(9000);
  ok('active heating: boiler HEATING', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'HEATING');
  await p.click('[data-testid="cam-manifold"]'); await p.waitForTimeout(1200);
  await p.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-heating.png' });
  // thermostat select from panel highlights zone
  await p.click('text=Child\'s Bedroom >> nth=0'); await p.waitForTimeout(300);
  ok('thermostat inspector lists its loops', /controls L07, L08/.test(await p.textContent('[data-testid="b3d-insp-state"]')));
  await p.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-thermo-highlight.png' });
  // connect mode
  await p.check('[data-testid="connect-toggle"]');
  ok('connect panel visible', await p.locator('[data-testid="connect-panel"]').isVisible());
  await p.click('[data-testid="reset-connections"]');
  await p.waitForTimeout(2500);
  ok('reset connections → boiler request blocked', (await p.textContent('[data-testid="b3d-boiler-mode"]')) !== 'HEATING', await p.textContent('[data-testid="b3d-boiler-mode"]'));
  await p.click('[data-testid="cam-full"]'); await p.waitForTimeout(1000);
  await p.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-connect-empty.png' });
  await p.selectOption('[data-testid="from-port"]', 'thermostat.living');
  await p.selectOption('[data-testid="to-port"]', 'manifold.supply');
  await p.click('[data-testid="connect-btn"]');
  ok('incompatible ports rejected', /Incompatible/.test(await p.textContent('[data-testid="connect-msg"]')));
  await p.selectOption('[data-testid="from-port"]', 'boiler.supply');
  await p.selectOption('[data-testid="to-port"]', 'manifold.supply');
  await p.click('[data-testid="connect-btn"]');
  ok('compatible ports connected', /Connected/.test(await p.textContent('[data-testid="connect-msg"]')));
  await p.click('[data-testid="load-example"]');
  await p.waitForTimeout(12000);
  ok('assembled example → heating resumes', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'HEATING', await p.textContent('[data-testid="b3d-boiler-mode"]'));
  await p.uncheck('[data-testid="connect-toggle"]');
  // demand stops → standby
  for (const z of ['living','bath','child','main']) await p.click(`[data-testid="b3d-power-${z}"]`);
  await p.waitForTimeout(12000);
  ok('demand stops → standby', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'STANDBY', await p.textContent('[data-testid="b3d-boiler-mode"]'));
  for (const z of ['living','bath','child','main']) await p.click(`[data-testid="b3d-power-${z}"]`);
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(800);
  await p.screenshot({ path: out + '/b3d-mobile.png' });
  ok('no console errors or warnings', errs.length === 0, errs.slice(0,3).join(' | '));
  console.log(res.join('\n'));
  if (res.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
  await b.close();
})();
