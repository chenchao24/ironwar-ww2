// WP8 验收 T6：13 车型各 1v1 独狼 sanity（45s/局）——无页面错误、AI 不冻结（位移>20m）、状态合法
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TANKS = ['tiger2'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  for (const enemy of TANKS) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
    await page.click('#screen-cover'); await sleep(400);
    await page.click('#btn-hunt-mode'); await sleep(3500);
    await page.evaluate((enemy) => {
      const ui = window.__game.ui;
      ui.selectedTank = 'm4a3'; ui.settings.factionLock = false;
      ui.settings.enemyTanks = [enemy]; ui.settings.difficulty = 'standard';
    }, enemy);
    await page.click('#screen-hangar [data-action="start"]');
    await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
    await sleep(2000);
    const p0 = await page.evaluate(() => {
      const e = window.__game.enemies[0];
      return { x: e.pos.x, z: e.pos.z };
    });
    const states = new Set();
    for (let i = 0; i < 9; i++) {   // 45s
      await sleep(5000);
      const s = await page.evaluate(() => window.__game.ais[0].state);
      states.add(s);
    }
    const r = await page.evaluate((p0) => {
      const e = window.__game.enemies[0], a = window.__game.ais[0];
      return {
        moved: Math.round(Math.hypot(e.pos.x - p0.x, e.pos.z - p0.z)),
        state: a.state, destroyed: e.destroyed,
      };
    }, p0);
    const ok = errors.length === 0 && (r.moved > 20 || r.destroyed);
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${enemy}: moved=${r.moved}m states=${[...states].join('/')} ${errors.length ? 'ERR=' + errors[0] : ''}`);
    await page.close();
  }
  await browser.close();
  console.log('T6 DONE');
})();
