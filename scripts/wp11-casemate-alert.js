// 修复验证：casemate alert 摆车体——猎虎侧后 800m 开火，alert 态应枢轴转向声源
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
    ui.settings.enemyTanks = ['jagdtiger']; ui.settings.difficulty = 'standard';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);
  await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    g.player.place(800, 800, 0);
    const e = g.enemies[0];
    e.place(800, 0, 270);   // 玩家正西 800m；猎虎车头朝南（270°）——玩家在其右侧后方向
    g.player.speed = 0; e.speed = 0;
  });
  const h0 = await page.evaluate(() => window.__game.enemies[0].heading);
  await page.evaluate(() => {
    const g = window.__game;
    g.visibility.onFire(g.player, [g.player, ...g.enemies]);   // 侧向开火 → 疑似
  });
  let stateSeen = '';
  for (let i = 0; i < 8; i++) {
    await sleep(1500);
    const s = await page.evaluate(() => {
      const g = window.__game, a = g.ais[0];
      return { h: g.enemies[0].heading, state: a.state };
    });
    stateSeen = s.state;
    if (i === 7) console.log('END', JSON.stringify(s));
  }
  const hEnd = await page.evaluate(() => window.__game.enemies[0].heading);
  const dyaw = Math.abs(hEnd - h0);
  console.log('CASEMATE_ALERT', JSON.stringify({ h0: +h0.toFixed(2), hEnd: +hEnd.toFixed(2), dyaw: +dyaw.toFixed(2), stateSeen }),
    '\n  期望：dyaw > 0.5（alert 态枢轴摆车体朝向声源）');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
