// 虎王疑似卡死排查：1v1 45s 逐秒记录 pos/speed/unstick/bypass/searchPoi
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate(() => {
    const ui = window.__game.ui;
    ui.selectedTank = 'm4a3'; ui.settings.factionLock = false;
    ui.settings.enemyTanks = ['tiger2']; ui.settings.difficulty = 'standard';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);
  let last = null;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const s = await page.evaluate(() => {
      const g = window.__game, a = g.ais[0], e = g.enemies[0];
      return {
        x: +e.pos.x.toFixed(1), z: +e.pos.z.toFixed(1), spd: +e.speed.toFixed(1),
        state: a.state, unT: +(a._unstickT || 0).toFixed(1), bpT: +(a._bypassT || 0).toFixed(1),
        stuckT: +(a.stuckTimer || 0).toFixed(1), obs: +(a._observeT || 0).toFixed(1),
        poi: a._searchPoi ? `${a._searchPoi.type}(${Math.round(a._searchPoi.x)},${Math.round(a._searchPoi.z)})` : '-',
      };
    });
    const moved = last ? Math.hypot(s.x - last.x, s.z - last.z).toFixed(1) : '-';
    console.log(`t=${i + 1}s pos=(${s.x},${s.z}) mv=${moved} spd=${s.spd} ${s.state} un=${s.unT} bp=${s.bpT} st=${s.stuckT} obs=${s.obs} poi=${s.poi}`);
    last = s;
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
