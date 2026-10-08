// T3 调试：固定双车位，开火事件 → 疑似/dwell/确认循环观测（带完整错误栈）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.stack ? e.stack.slice(0, 600) : e.message));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate(() => {
    const ui = window.__game.ui;
    ui.selectedTank = 'jagdtiger'; ui.settings.factionLock = false;
    ui.settings.enemyTanks = ['jagdpanther']; ui.settings.difficulty = 'ace';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);
  for (let i = 0; i < 50; i++) {
    await sleep(2000);
    const s = await page.evaluate((i) => {
      const g = window.__game, v = g.visibility, a = g.ais[0], e = g.enemies[0], p = g.player;
      p.place(0, 0, 0); p.speed = 0;   // 钉住玩家
      // 每 18s 注入一次开火事件（不开真炮）
      if (i > 0 && i % 9 === 0) v.onFire(p, [p, ...g.enemies]);
      const ci = v.contactInfo(e, p);
      const d = Math.round(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z));
      const st = v.pairs.get(e) && v.pairs.get(e).get(p);
      return {
        d, lv: ci.level, aiState: a.state, heat: v.suspicion.heat.size,
        susT: st ? +st.suspectTimer.toFixed(1) : null,
        errVec: st && st.errVec ? Math.round(Math.hypot(st.errVec.x, st.errVec.z)) : null,
      };
    }, i);
    console.log(`t=${(i + 1) * 2}s`, JSON.stringify(s));
  }
  await browser.close();
})();
