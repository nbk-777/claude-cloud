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
  ok('default: standby before demand reaches boiler', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'მოლოდინი');
  // setpoint buttons
  const sp0 = await p.textContent('[data-testid="b3d-sp-living"]');
  await p.click('[data-testid="b3d-plus-living"]');
  ok('setpoint + works', (await p.textContent('[data-testid="b3d-sp-living"]')) === (parseFloat(sp0) + 0.5).toFixed(1));
  await p.click('[data-testid="b3d-minus-living"]');
  // functional 3D buttons: click them in the WebGL canvas
  const canvasBox = await p.locator('[data-testid="balcony-canvas"]').boundingBox();
  const click3d = async (id) => {
    const pos = await p.evaluate((bid) => window.__balcony3d.buttonScreenPos(bid), id);
    await p.mouse.click(canvasBox.x + pos.x, canvasBox.y + pos.y);
    await p.waitForTimeout(250);
  };
  await p.click('[data-testid="cam-thermostats"]');
  await p.waitForTimeout(2000);
  const spBefore = await p.textContent('[data-testid="b3d-sp-bath"]');
  await click3d('tbtn:bath:plus');
  ok('3D thermostat + button raises setpoint', (await p.textContent('[data-testid="b3d-sp-bath"]')) === (parseFloat(spBefore) + 0.5).toFixed(1), await p.textContent('[data-testid="b3d-sp-bath"]'));
  await click3d('tbtn:bath:minus');
  ok('3D thermostat − button lowers setpoint', (await p.textContent('[data-testid="b3d-sp-bath"]')) === spBefore);
  await click3d('tbtn:main:power');
  ok('3D thermostat ⏻ button turns room off', (await p.getAttribute('[data-testid="b3d-power-main"]', 'aria-pressed')) === 'false');
  await click3d('tbtn:main:power');
  ok('3D thermostat ⏻ button turns room on again', (await p.getAttribute('[data-testid="b3d-power-main"]', 'aria-pressed')) === 'true');
  const chBefore = await p.textContent('[data-testid="b3d-ch"]');
  await p.click('[data-testid="cam-boiler"]');
  await p.waitForTimeout(2000);
  await click3d('bbtn:plus');
  ok('3D boiler + button raises flow setpoint', (await p.textContent('[data-testid="b3d-ch"]')) === `${parseInt(chBefore) + 1}°C`, await p.textContent('[data-testid="b3d-ch"]'));
  await click3d('bbtn:minus');
  ok('3D boiler − button lowers flow setpoint', (await p.textContent('[data-testid="b3d-ch"]')) === chBefore);
  ok('3D button shows feedback toast', await p.locator('[data-testid="b3d-toast"]').isVisible());
  // camera buttons all respond
  for (const c of ['boiler', 'manifold', 'controller', 'reset']) await p.click(`[data-testid="cam-${c}"]`);
  ok('camera buttons clickable', true);
  // active heating
  await p.locator('[data-testid="speed"]').fill('60');
  await p.waitForTimeout(9000);
  ok('active heating: boiler HEATING', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'გათბობა');
  await p.click('[data-testid="cam-manifold"]'); await p.waitForTimeout(1200);
  await p.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-heating.png' });
  // thermostat select from panel highlights zone
  await p.click('[data-testid="b3d-name-child"]'); await p.waitForTimeout(300);
  ok('thermostat inspector lists its loops', /მართავს: L07, L08/.test(await p.textContent('[data-testid="b3d-insp-state"]')));
  await p.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-thermo-highlight.png' });
  // open the zone controller and look inside
  await p.click('[data-testid="ctrl-open"]');
  await p.waitForTimeout(2500);
  ok('controller opens (legend + inspector)', (await p.locator('[data-testid="ctrl-legend"]').isVisible()) && /კონტროლერი/.test(await p.textContent('[data-testid="b3d-insp-name"]')));
  ok('controller open button toggles state', (await p.getAttribute('[data-testid="ctrl-open"]', 'aria-pressed')) === 'true');
  { const bb = await p.locator('[data-testid="b3d-canvas-host"]').boundingBox(); await p.screenshot({ path: out + '/b3d-controller-open.png', clip: bb, timeout: 120000 }); }
  await p.click('[data-testid="cam-thermostats"]');
  await p.waitForTimeout(2000);
  { const bb = await p.locator('[data-testid="b3d-canvas-host"]').boundingBox(); await p.screenshot({ path: out + '/b3d-thermostat-cables.png', clip: bb, timeout: 120000 }); }
  await p.click('[data-testid="cam-full"]');
  await p.waitForTimeout(2000);
  { const bb = await p.locator('[data-testid="b3d-canvas-host"]').boundingBox(); await p.screenshot({ path: out + '/b3d-full-cables.png', clip: bb, timeout: 120000 }); }
  await p.click('[data-testid="ctrl-open"]');
  await p.waitForTimeout(500);
  ok('controller closes again', (await p.getAttribute('[data-testid="ctrl-open"]', 'aria-pressed')) === 'false');
  // connect mode
  await p.check('[data-testid="connect-toggle"]');
  ok('connect panel visible', await p.locator('[data-testid="connect-panel"]').isVisible());
  await p.click('[data-testid="reset-connections"]');
  await p.waitForTimeout(2500);
  ok('reset connections → boiler request blocked', (await p.textContent('[data-testid="b3d-boiler-mode"]')) !== 'გათბობა', await p.textContent('[data-testid="b3d-boiler-mode"]'));
  await p.click('[data-testid="cam-full"]'); await p.waitForTimeout(1000);
  await p.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-connect-empty.png' });
  await p.selectOption('[data-testid="from-port"]', 'thermostat.living');
  await p.selectOption('[data-testid="to-port"]', 'manifold.supply');
  await p.click('[data-testid="connect-btn"]');
  ok('incompatible ports rejected', /შეუთავსებელი/.test(await p.textContent('[data-testid="connect-msg"]')));
  await p.selectOption('[data-testid="from-port"]', 'boiler.supply');
  await p.selectOption('[data-testid="to-port"]', 'manifold.supply');
  await p.click('[data-testid="connect-btn"]');
  ok('compatible ports connected', /შეერთდა/.test(await p.textContent('[data-testid="connect-msg"]')));
  await p.click('[data-testid="load-example"]');
  await p.waitForTimeout(12000);
  ok('assembled example → heating resumes', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'გათბობა', await p.textContent('[data-testid="b3d-boiler-mode"]'));
  await p.uncheck('[data-testid="connect-toggle"]');
  // demand stops → standby
  for (const z of ['living','bath','child','main']) await p.click(`[data-testid="b3d-power-${z}"]`);
  await p.waitForTimeout(12000);
  ok('demand stops → standby', (await p.textContent('[data-testid="b3d-boiler-mode"]')) === 'მოლოდინი', await p.textContent('[data-testid="b3d-boiler-mode"]'));
  for (const z of ['living','bath','child','main']) await p.click(`[data-testid="b3d-power-${z}"]`);
  // phone: real touch tap on a 3D button
  const ctxM = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const m = await ctxM.newPage();
  m.on('pageerror', (e) => errs.push('pageerror ' + String(e)));
  await m.goto(URL_);
  await m.waitForFunction(() => document.querySelector('[data-testid="b3d-canvas-host"]')?.getAttribute('data-status') === 'ready', null, { timeout: 30000 });
  await m.locator('[data-testid="b3d-canvas-host"]').scrollIntoViewIfNeeded();
  await m.click('[data-testid="b3d-name-child"]'); // select → then tap the thermostat in 3D zooms to it
  await m.click('[data-testid="cam-thermostats"]');
  await m.waitForTimeout(2000);
  const tb = await m.locator('[data-testid="balcony-canvas"]').boundingBox();
  const tpos = await m.evaluate(() => window.__balcony3d.buttonScreenPos('tbtn:child:minus'));
  await m.touchscreen.tap(tb.x + tpos.x, tb.y + tpos.y - 40); // tap the thermostat body (above its buttons)
  await m.waitForTimeout(2000);
  const mb = await m.locator('[data-testid="balcony-canvas"]').boundingBox();
  const mp = await m.evaluate(() => window.__balcony3d.buttonScreenPos('tbtn:child:plus'));
  const msp = await m.textContent('[data-testid="b3d-sp-child"]');
  await m.touchscreen.tap(mb.x + mp.x, mb.y + mp.y);
  await m.waitForTimeout(300);
  ok('phone: touch tap on 3D thermostat + works', (await m.textContent('[data-testid="b3d-sp-child"]')) === (parseFloat(msp) + 0.5).toFixed(1), `${msp} → ${await m.textContent('[data-testid="b3d-sp-child"]')}`);
  await m.locator('[data-testid="b3d-canvas-host"]').screenshot({ path: out + '/b3d-mobile.png' });
  await ctxM.close();
  ok('no console errors or warnings', errs.length === 0, errs.slice(0,3).join(' | '));
  console.log(res.join('\n'));
  if (res.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
  await b.close();
})();
