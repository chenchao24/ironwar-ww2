// T1 失败追踪：1v5 德军 vs 挂机开阔地玩家，120s 逐 5s 记录各 AI 位置/状态/距玩家/POI
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
    ui.settings.enemyTanks = ['tiger1', 'panther', 'jagdpanther', 'ferdinand', 'marder3m'];
    ui.settings.difficulty = 'standard';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);
  const p0 = await page.evaluate(() => {
    const g = window.__game;
    return { player: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)], spawn: g.enemies.map(e => [Math.round(e.pos.x), Math.round(e.pos.z)]) };
  });
  console.log('PLAYER', p0.player, 'ENEMY_SPAWNS', JSON.stringify(p0.spawn));
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const s = await page.evaluate(() => {
      const g = window.__game;
      return g.ais.map((a, j) => {
        const e = g.enemies[j];
        const d = Math.round(Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z));
        const los = g.visibility.losDetail(e, g.player);
        return `#${j}${e.cfg.id.slice(0, 4)}(${Math.round(e.pos.x)},${Math.round(e.pos.z)}) d=${d} ${a.state}/L${a._searchLevel} ${los.see ? 'see' : los.softOnly ? 'soft' : 'blk'} obs=${(a._observeT || 0).toFixed(1)} un=${(a._unstickT || 0).toFixed(1)}`;
      });
    });
    console.log(`t=${(i + 1) * 5}s`, s.join(' | '));
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
