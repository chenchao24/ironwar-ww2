// WP2 验证 v2：先扫描通畅 LOS 摆位，再跑两层判定矩阵
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
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => {
    window.__game.ui.selectedTank = 'jagdpanther';
    window.__game.ui.settings.enemyTanks = ['tiger1'];
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);

  // ── 探针：中心点 × 8 方向 × 距离带，找 see=true 的摆位 ──
  const spots = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player, e = g.enemies[0];
    const out = {};
    for (const d of [1150, 650, 600]) {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const cx = Math.sin(a) * 200, cz = Math.cos(a) * 200;   // 8 个候选中心
        for (let k2 = 0; k2 < 8; k2++) {
          const a2 = k2 * Math.PI / 4;
          const px = cx - Math.sin(a2) * d / 2, pz = cz - Math.cos(a2) * d / 2;
          const ex = cx + Math.sin(a2) * d / 2, ez = cz + Math.cos(a2) * d / 2;
          if (Math.abs(px) > 1000 || Math.abs(pz) > 1000 || Math.abs(ex) > 1000 || Math.abs(ez) > 1000) continue;
          p.place(px, pz, 0); e.place(ex, ez, 180);
          if (g.visibility.losDetail(p, e).see) { out[d] = [px, pz, ex, ez].map(v => Math.round(v)); break; }
        }
        if (out[d]) break;
      }
    }
    return out;
  });
  console.log('SPOTS', JSON.stringify(spots));

  const scenario = (name, d, ps, es, ticks) => page.evaluate((name, d, ps, es, ticks, spot) => {
    const g = window.__game;
    const p = g.player, e = g.enemies[0];
    g.visibility.pairs.clear(); g.visibility.radioQueue.length = 0;
    p.place(spot[0], spot[1], 90); e.place(spot[2], spot[3], 270);
    p.speed = ps; e.speed = es;
    const res = { d };
    for (let i = 0; i < ticks; i++) { p.speed = ps; e.speed = es; g.visibility._detect([p, e]); }
    res['P→E'] = g.visibility.contactInfo(p, e).level;
    res['E→P'] = g.visibility.contactInfo(e, p).level;
    return name + ' ' + JSON.stringify(res);
  }, name, d, ps, es, ticks, spots[d] || [-400, 0, -400 + d, 0]);

  console.log(await scenario('S1 d=1150 敌动我静(期望 1/0)', 1150, 0, 5, 1));
  console.log(await scenario('S2 d=1150 双动(期望 1/1)', 1150, 5, 5, 1));
  console.log(await scenario('S3 d=650 双静(期望 1/1 不确认)', 650, 0, 0, 1));
  console.log(await scenario('S4 d=650 敌动×4拍(期望 P→E=2)', 650, 0, 5, 4));
  console.log(await scenario('S5 d=600 双静(期望 1/1 不确认)', 600, 0, 0, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
