// P2 验证②：T7 苏军冲锋 + 混合编队 flanker 指令 + T1 复测（排级行军下接触时间）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function enterBattle(page, player, enemies, difficulty = 'standard') {
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate((player, enemies, difficulty) => {
    const ui = window.__game.ui;
    ui.selectedTank = player; ui.settings.factionLock = false;
    ui.settings.enemyTanks = enemies; ui.settings.difficulty = difficulty;
  }, player, enemies, difficulty);
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });

  // ── T7 苏军冲锋：1v5（t34×4 + is2），玩家挂机开阔地；观察接触后全队 charge/快速接近 ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'm4a3', ['t34-85', 't34-85', 't34-85', 't34-85', 'is2']);
    const t0 = Date.now();
    let contact = null, minDist0 = null, minDistLater = null, orders = null;
    for (let i = 0; i < 130; i++) {
      await sleep(2000);
      const s = await page.evaluate(() => {
        const g = window.__game;
        const ds = g.enemies.map(e => Math.round(Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z)));
        const lv = g.enemies.map(e => g.visibility.contactInfo(e, g.player).level);
        return { minD: Math.min(...ds), maxLv: Math.max(...lv), phase: g.platoon ? g.platoon.phase : '-',
          orders: g.platoon ? g.platoon.members.map(m => m.ai.order && m.ai.order.type) : [] };
      });
      const el = (Date.now() - t0) / 1000;
      if (!contact && s.maxLv >= 1) {
        contact = el; minDist0 = s.minD; orders = s.orders.join(',');
        console.log(`T7 接触 @${el.toFixed(0)}s minD=${s.minD} phase=${s.phase} orders=${s.orders}`);
      }
      if (contact && el > contact + 25) { minDistLater = s.minD; console.log(`T7 接触+25s minD=${s.minD} phase=${s.phase}`); break; }
    }
    console.log('T7', JSON.stringify({ contact, minDist0, minDistLater, closing: minDist0 != null && minDistLater != null && minDistLater < minDist0 - 100 }));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }

  // ── 混合编队：t34×2 + cromwell + is2 → 确认后应有 flank 指令 ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'jagdpanther', ['t34-85', 't34-85', 'cromwell', 'is2'], 'ace');
    const s = await page.evaluate(() => {
      const g = window.__game, v = g.visibility;
      for (const e of g.enemies) v._confirm(v._st(e, g.player), e, g.player);
      return new Promise(res => setTimeout(() => {
        const pl = g.platoon;
        res({
          phase: pl.phase,
          members: pl.members.map(m => `${m.tank.cfg.id}:${m.role}/${m.task}:${m.ai.order && m.ai.order.type}`),
        });
      }, 1000));
    });
    console.log('FLANK', JSON.stringify(s), '（期望有 :flank 指令）');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
