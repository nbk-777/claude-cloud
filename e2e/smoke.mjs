// Browser smoke test: opens the single-file production build from disk (file://),
// exercises thermostats, scenarios and views, asserts DOM state and saves screenshots.
// Run: npm run build && npm run smoke
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Playwright is pre-installed globally in this environment; resolve it via require().
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('@playwright/test'));
}
const here = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(resolve(here, '../dist/index.html')).href;
const shots = resolve(here, 'screenshots');
mkdirSync(shots, { recursive: true });

const errors = [];
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForSelector('[data-testid="plan"]');

check('plan renders 14 loops', (await page.locator('[data-testid^="loop-L"]').count()) === 14);
check('4 thermostats on plan', (await page.locator('[data-testid^="thermo-"]').count()) === 4);
check('cabinet warning visible', await page.locator('[data-testid="cabinet-warning"]').isVisible());

// visibility of illustrated components on the plan
check('plan: thermostat LCD devices (4)', (await page.locator('[data-testid="plan"] .dev-thermostat').count()) === 4);
check('plan: boiler front panel drawn', (await page.locator('[data-testid="plan"] [data-testid="boiler-front"]').count()) === 1);
check('plan: shower device drawn', (await page.locator('[data-testid="plan"] [data-testid="shower-device"]').count()) === 1);

// buttons change state: + on child thermostat (strip)
const child = page.locator('[data-testid="tw-child"]');
await child.locator('[data-testid="tw-child-plus"]').click();
check('thermostat + raises setpoint', (await child.locator('[data-testid="sp-child"]').textContent()) === '21.5');
await child.locator('[data-testid="tw-child-minus"]').click();
check('thermostat − lowers setpoint', (await child.locator('[data-testid="sp-child"]').textContent()) === '21.0');
await child.locator('[data-testid="tw-child-power"]').click();
check('power off → LCD dark', (await child.locator('[data-testid="tw-child-lcd"]').getAttribute('data-lcd')) === 'off');
await child.locator('[data-testid="tw-child-power"]').click();
check('power on → LCD lit', (await child.locator('[data-testid="tw-child-lcd"]').getAttribute('data-lcd')) === 'on');

// Scenario 1: living only, at 60x
await page.locator('[data-testid="speed"]').fill('60');
await page.click('[data-testid="scen-livingOnly"]');
await page.waitForTimeout(9000); // ≈ 9 sim-min at 60×
const flowingLiving = await page.locator('.loop.is-flowing').count();
check('scenario 1: only living-zone loops flow', flowingLiving > 0 && flowingLiving <= 8, `flowing=${flowingLiving}`);
check('scenario 1: child loops not flowing', (await page.locator('[data-testid="loop-L07"].is-flowing').count()) === 0);
check('boiler in heating', (await page.locator('[data-testid="boiler-mode"]').innerText()).includes('გათბობა'));
await page.screenshot({ path: `${shots}/01-plan-living-only.png` });

// open thermostat widget on plan
await page.click('[data-testid="thermo-living"]');
check('thermostat popover opens', await page.locator('[data-testid="thermo-popover"]').isVisible());
check('inspector shows thermostat', (await page.locator('[data-testid="insp-name"]').innerText()).includes('თერმოსტატი'));
await page.screenshot({ path: `${shots}/02-thermostat-popover.png` });

// turn living OFF → actuators close after delay
await page.locator('[data-testid="thermo-popover"] [data-testid="tw-living-power"]').click();
await page.waitForTimeout(6000);
check('living OFF → status off', (await page.locator('[data-testid="status-living"]').first().innerText()).includes('გამორთ'));
await page.locator('[data-testid="thermo-popover"] button[aria-label="დახურვა"]').click();

// Scenario 2: all four + wiring layer
await page.click('[data-testid="scen-allFour"]');
await page.check('[data-testid="layer-wiring"]');
check('wiring layer drawn on plan', (await page.locator('[data-testid="plan"] .wiring').count()) === 1);
await page.waitForTimeout(8000);
check('scenario 2: all 14 loops flowing', (await page.locator('.loop.is-flowing').count()) === 14);
await page.screenshot({ path: `${shots}/03-plan-all-four-wiring.png` });

// reset button restarts the sim clock
await page.click('[data-testid="reset"]');
await page.waitForTimeout(300);
const tr = await page.locator('[data-testid="simtime"]').innerText();
check('reset restarts sim time', tr < '00:05:00', tr);

// Pause: sim time frozen
await page.click('[data-testid="pause"]');
const t1 = await page.locator('[data-testid="simtime"]').innerText();
await page.waitForTimeout(1500);
const t2 = await page.locator('[data-testid="simtime"]').innerText();
check('pause freezes sim time', t1 === t2, `${t1} vs ${t2}`);
check('pause class applied', (await page.locator('[data-testid="app"]').getAttribute('data-paused')) === '1');
await page.click('[data-testid="pause"]');

// Manifold view (re-run scenario 2 after the reset/pause checks)
await page.click('[data-testid="scen-allFour"]');
await page.click('[data-testid="tab-manifold"]');
await page.waitForTimeout(9000);
check('manifold: 14 ports', (await page.locator('[data-testid^="port-L"]').count()) === 14);
check('manifold: open actuators shown', (await page.locator('[data-testid^="port-L"][data-phase="open"]').count()) > 0);
check('manifold: 14 actuator devices', (await page.locator('.dev-actuator').count()) === 14);
check('manifold: 14 flow meters', (await page.locator('.dev-flowmeter').count()) === 14);
check('manifold: gauges', (await page.locator('[data-testid="manifold-view"] .dev-gauge').count()) >= 2);
check('manifold: bars tinted while heating', (await page.locator('[data-testid="manifold-view"]').getAttribute('data-heating')) === '1');
check('manifold: some float raised', (await page.locator('.dev-flowmeter:not([data-float="0.00"])').count()) > 0);
await page.locator('[data-testid="act-L01"]').click();
check('actuator click → inspector shows %', /\d+%/.test(await page.locator('[data-testid="insp-state"]').innerText()));
await page.screenshot({ path: `${shots}/04-manifold.png` });

// Scenario 6 stuck actuator → fault phase on manifold
await page.click('[data-testid="scen-stuckActuator"]');
await page.click('[data-testid="tab-manifold"]');
await page.waitForTimeout(6000);
check('scenario 6: stuck actuator shows fault', (await page.locator('[data-testid="port-L07"]').getAttribute('data-phase')) === 'fault');
await page.screenshot({ path: `${shots}/05-manifold-stuck.png` });

// Scenario 8 shower → boiler view DHW
await page.click('[data-testid="scen-shower"]');
await page.click('[data-testid="tab-boiler"]');
await page.waitForTimeout(500);
check('scenario 8: boiler view DHW mode', (await page.locator('[data-testid="boiler-view"]').getAttribute('data-mode')) === 'dhw');
check('scenario 8: diverter on DHW', (await page.locator('[data-testid="diverter"]').getAttribute('data-pos')) === 'DHW');
check('boiler: front panel + TA1 terminal strip', (await page.locator('[data-testid="boiler-view"] [data-testid="boiler-terminals"]').count()) === 1);
check('boiler: shower flowing', (await page.locator('[data-testid="boiler-view"] [data-testid="shower-device"]').getAttribute('data-on')) === '1');
check('boiler: flame lit', (await page.locator('[data-testid="boiler-view"] [data-testid="boiler-front"]').getAttribute('data-burner')) === '1');
// hot-water toggle off → back to heating
await page.uncheck('[data-testid="shower"]');
await page.waitForTimeout(500);
check('shower toggle off → leaves DHW', (await page.locator('[data-testid="boiler-view"]').getAttribute('data-mode')) !== 'dhw');
await page.screenshot({ path: `${shots}/06-boiler-dhw.png` });

// Wiring centre view
await page.click('[data-testid="scen-allFour"]');
await page.click('[data-testid="tab-wiring"]');
await page.waitForTimeout(5000);
check('wiring: zone 1 output on', (await page.locator('[data-testid="zone-1"]').getAttribute('data-out')) === '1');
check('wiring: relay closed (COM–NO)', (await page.locator('[data-testid="relay"]').getAttribute('data-closed')) === '1');
check('wiring: TA1 wire orange class', ((await page.locator('[data-testid="ta1-wire"]').getAttribute('class')) || '').includes('ta1-closed'));
check('wiring: signal core live', (await page.locator('[data-testid="sig-living"]').getAttribute('data-live')) === '1');
// DIP 0 / 2 / 5 min select
await page.selectOption('[data-testid="relay-delay"]', '120');
check('DIP select → 2 min', (await page.locator('[data-testid="relay-delay"]').inputValue()) === '120');
await page.selectOption('[data-testid="relay-delay"]', '300');
// wires toggle
await page.check('[data-testid="wires-toggle"]');
check('wires toggle on', await page.locator('[data-testid="wires-toggle"]').isChecked());
await page.screenshot({ path: `${shots}/07-wiring-centre.png` });

// Scenario 10 floor trip
await page.click('[data-testid="scen-floorTrip"]');
await page.waitForTimeout(500);
check('scenario 10: fault 116 warning', await page.locator('[data-testid="w-fault"]').isVisible());
await page.screenshot({ path: `${shots}/08-floor-trip.png` });

// Scenario 9 bath only → short-cycling notice eventually
await page.click('[data-testid="scen-bathOnly"]');
await page.waitForSelector('[data-testid="w-short"]', { timeout: 90000 }).catch(() => {});
check('scenario 9: short-cycling notice', await page.locator('[data-testid="w-short"]').isVisible());
await page.screenshot({ path: `${shots}/09-bath-only-cycling.png` });

// Mapping page + reassign + persistence across reload
await page.click('[data-testid="tab-mapping"]');
await page.selectOption('[data-testid="room-L01"]', 'hall');
await page.reload();
await page.click('[data-testid="tab-mapping"]');
check('mapping persists after reload', (await page.locator('[data-testid="room-L01"]').inputValue()) === 'hall');
// invalid import keeps data
await page.setInputFiles('[data-testid="import-file"]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1}') });
await page.waitForTimeout(300);
check('invalid import rejected', (await page.locator('[data-testid="import-msg"]').innerText()).includes('უარყოფილია'));
check('data unchanged after bad import', (await page.locator('[data-testid="room-L01"]').inputValue()) === 'hall');
await page.screenshot({ path: `${shots}/10-mapping.png`, fullPage: true });
await page.click('[data-testid="tab-open"]');
await page.screenshot({ path: `${shots}/11-open-items.png` });
await page.click('[data-testid="tab-sources"]');
await page.screenshot({ path: `${shots}/12-sources.png`, fullPage: true });

// mobile-ish width
await page.setViewportSize({ width: 420, height: 900 });
await page.click('[data-testid="tab-plan"]');
await page.screenshot({ path: `${shots}/13-narrow.png` });

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(results.join('\n'));
console.log(`\nscreenshots → ${shots}`);
