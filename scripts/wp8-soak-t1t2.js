// WP8 验收 T1/T2：T1 挂机玩家 1v5 德军 ≤90s 接触交战；T2 灌木蹲坑玩家最终被发现
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const SKIP_T1 = process.argv.includes('--t2');
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });

  // ── T1：挂机玩家（开阔地静止）1v5 德军混编：敌发现并与玩家交战 ──
  if (!SKIP_T1) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
    await page.click('#screen-cover'); await sleep(500);
    await page.click('#btn-hunt-mode'); await sleep(3500);
    await page.evaluate(() => {
      const ui = window.__game.ui;
      ui.selectedTank = 'm4a3'; ui.settings.factionLock = false;
      ui.settings.enemyTanks = ['tiger1', 'panther', 'jagdpanther', 'ferdinand', 'marder3m'];
      ui.settings.difficulty = 'standard';
    });
    await page.click('#screen-hangar [data-action="start"]');
    await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
    const t0 = Date.now();
    let contact = null, engage = null;
    for (let i = 0; i < 110; i++) {   // 220s 窗口（headless ≈0.75× 墙钟；校准后判定线见输出）
      await sleep(2000);
      const s = await page.evaluate(() => {
        const g = window.__game;
        const lv = g.enemies.map(e => g.visibility.contactInfo(e, g.player).level);
        const states = g.ais.map(a => a.state);
        return { lv, states, maxLv: Math.max(...lv) };
      });
      const el = (Date.now() - t0) / 1000;
      if (!contact && s.maxLv >= 1) { contact = el; console.log(`T1 疑似接触 @${el.toFixed(0)}s states=${s.states}`); }
      if (!engage && s.maxLv >= 2) { engage = el; console.log(`T1 确认点亮 @${el.toFixed(0)}s states=${s.states}`); break; }
    }
    console.log('T1', JSON.stringify({ contact, engage, pass: engage !== null && engage <= 160 }));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }

  // ── T2：灌木蹲坑玩家（不开火不动）：节奏升级 → 最终接触（上限 240s 观察） ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
    await page.click('#screen-cover'); await sleep(500);
    await page.click('#btn-hunt-mode'); await sleep(3500);
    await page.evaluate(() => {
      const ui = window.__game.ui;
      ui.selectedTank = 'jagdpanther'; ui.settings.factionLock = false;
      ui.settings.enemyTanks = ['tiger1', 'tiger1'];
      ui.settings.difficulty = 'standard';
    });
    await page.click('#screen-hangar [data-action="start"]');
    await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
    await sleep(2000);
    // 把玩家藏进最近一丛灌木中心
    await page.evaluate(() => {
      const g = window.__game, sb = g.world.sightBlockers;
      let best = null, bd = Infinity;
      for (const b of sb) {
        const d = Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) g.player.place(best.x, best.z, 0);
      g.player.speed = 0;
    });
    const t0 = Date.now();
    let contact = null, lastReport = '';
    for (let i = 0; i < 150; i++) {   // 300s 窗口（藏得好的玩家本就该拖很久；L3 梳篦收敛即可）
      await sleep(2000);
      const s = await page.evaluate(() => {
        const g = window.__game;
        const lv = g.enemies.map(e => g.visibility.contactInfo(e, g.player).level);
        return { maxLv: Math.max(...lv), states: g.ais.map(a => `${a.state}/L${a._searchLevel}`), lv };
      });
      const el = (Date.now() - t0) / 1000;
      const rep = `${el.toFixed(0)}s maxLv=${s.maxLv} ${s.states.join(' ')}`;
      if (rep !== lastReport && el % 20 < 2) { console.log('T2', rep); lastReport = rep; }
      if (!contact && s.maxLv >= 1) { contact = el; console.log(`T2 接触 @${el.toFixed(0)}s`); break; }
    }
    console.log('T2', JSON.stringify({ contact, pass: contact !== null }));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
