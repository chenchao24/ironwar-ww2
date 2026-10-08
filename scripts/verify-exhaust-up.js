// 苏系上喷排气验证：is2m 战斗内大油门，采样烟粒子最大高度（应 ≥0.5m）；对照 m26（默认型）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 200)));
  for (const [id, expect] of [['is2m', 'up'], ['m26', 'normal']]) {
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
    await page.click('#screen-cover');
    await sleep(400);
    await page.click('#btn-hunt-mode');
    await sleep(3500);
    await page.evaluate((id) => { window.__game.ui.selectedTank = id; }, id);
    await page.click('#screen-hangar [data-action="start"]');
    await sleep(6000);
    // 大油门 1s（起步大负荷），持续 1.5s 采样烟粒子最大高度（相对排气点 y）
    const res = await page.evaluate(async (expect) => {
      const g = window.__game, p = g.player;
      const exhY = p.cfg.exhaustLocal[0][1];
      g.input.keys.add('KeyW');
      const t0 = performance.now();
      let maxRise = 0, samples = 0, minRise = 1e9;
      const rises = [];
      while (performance.now() - t0 < 2500) {
        await new Promise(r => requestAnimationFrame(r));
        const pool = g.effects.ps.pools.smoke;
        let frameMax = 0;
        for (let i = 0; i < pool.count; i++) {
          if (pool.life[i] < 0.02 || pool.life[i] > 0.5) continue;   // 只看新生烟团
          const py = pool.px[i * 3 + 1];
          const rise = py - (exhY + 0.0);   // 相对排气点高度（世界 y 绝对，车在地面上）
          if (rise > frameMax) frameMax = rise;
        }
        if (frameMax > 0.05) { rises.push(frameMax); samples++; }
        if (frameMax > maxRise) maxRise = frameMax;
      }
      g.input.keys.delete('KeyW');
      rises.sort((a, b) => a - b);
      return {
        expect, type: p.cfg.exhaustType || 'normal', exhY,
        maxRise: +maxRise.toFixed(2),
        medianRise: samples ? +rises[Math.floor(rises.length / 2)].toFixed(2) : 0,
        samples,
      };
    }, expect);
    console.log(id, JSON.stringify(res));
    if (id === 'is2m') {
      await sleep(300);
      await page.screenshot({ path: 'scripts/shot-is2m-exhaust.png' });
    }
  }
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
