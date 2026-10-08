// T5 复核：炮闩损毁+无维修 → _fireDead 直判 + 持续机动
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
    ui.settings.enemyTanks = ['tiger2']; ui.settings.difficulty = 'ace';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);
  await page.evaluate(() => {
    const g = window.__game, v = g.visibility, e = g.enemies[0];
    g.player.place(0, 0, 0); e.place(0, 300, 0);
    g.player.speed = 0; e.speed = 0;
    v._confirm(v._st(e, g.player), e, g.player);
    e.modules.breech.hp = 0; e.consumables.repair = 0;
  });
  let fireDead = false, moved = 0, lastPos = null;
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const s = await page.evaluate(() => {
      const g = window.__game, a = g.ais[0], e = g.enemies[0];
      return { fd: a._fireDead, x: e.pos.x, z: e.pos.z };
    });
    if (s.fd) fireDead = true;
    if (lastPos) moved += Math.hypot(s.x - lastPos.x, s.z - lastPos.z);
    lastPos = s;
    if (fireDead && moved > 30) break;
  }
  console.log('T5r', JSON.stringify({ fireDead, moved: Math.round(moved) }));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
