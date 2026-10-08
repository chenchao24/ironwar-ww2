// 上喷物理 v3 验证（is2m）：无重力下落——喷起后应悬停（最低 ≥ 出生点 -0.05m）、
// vy 渐停（后期 |vy| 小）、寿命 ≈旧值×0.7（均值 ≤1.2s）、喷起 0.5~1.0m
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'is2m'; });
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(6000);
  const res = await page.evaluate(async () => {
    const g = window.__game, p = g.player;
    const exhY = p.cfg.exhaustLocal[0][1];
    g.input.keys.add('KeyW');
    const t0 = performance.now();
    let maxRise = -1e9, minRise = 1e9, n = 0;
    const lifes = [];
    const lateVy = [];   // life>0.5s 时的垂直速度（渐停验证）
    while (performance.now() - t0 < 2500) {
      await new Promise(r => requestAnimationFrame(r));
      const pool = g.effects.ps.pools.smoke;
      for (let i = 0; i < pool.count; i++) {
        if (pool.life[i] < 0.02) continue;
        const dx = pool.px[i * 3] - p.pos.x, dz = pool.px[i * 3 + 2] - p.pos.z;
        if (Math.hypot(dx, dz) > 8) continue;
        const rise = pool.px[i * 3 + 1] - (exhY + p.root.position.y * 0 + 0);   // 相对排气点（y 绝对，车在地面上 y≈0）
        if (rise > maxRise) maxRise = rise;
        if (rise < minRise) minRise = rise;
        if (pool.life[i] > 0.5 && Math.abs(pool.vy[i]) < 2.5) lateVy.push(Math.abs(pool.vy[i]));
      }
    }
    // 寿命统计（当前在场烟团 maxLife）
    const pool = g.effects.ps.pools.smoke;
    for (let i = 0; i < pool.count; i++) {
      if (pool.maxLife[i] > 0 && pool.life[i] < pool.maxLife[i]) {
        const dx = pool.px[i * 3] - p.pos.x, dz = pool.px[i * 3 + 2] - p.pos.z;
        if (Math.hypot(dx, dz) <= 8) lifes.push(pool.maxLife[i]);
      }
    }
    g.input.keys.delete('KeyW');
    const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
    return {
      exhY,
      maxRise: +maxRise.toFixed(2), minRise: +minRise.toFixed(2),
      meanLife: avg(lifes) ? +avg(lifes).toFixed(2) : null, lifeN: lifes.length,
      lateVyMean: avg(lateVy) ? +avg(lateVy).toFixed(2) : null, lateVyN: lateVy.length,
    };
  });
  console.log('上喷物理 v3:', JSON.stringify(res));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
