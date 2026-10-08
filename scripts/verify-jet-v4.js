// V 字上喷验证（is2m）：左右两侧烟团应各自向本侧外倾 15~25°（不交叉）
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
  // 冻结相机到车尾正后方（看 V 字）
  await page.evaluate(() => { window.__game.input.keys.add('KeyW'); });
  await sleep(1200);
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.update = () => {};
    const p = g.player;
    g.camera.position.set(p.pos.x - Math.sin(p.heading) * 5.5, p.pos.y + 2.2, p.pos.z - Math.cos(p.heading) * 5.5);
    g.camera.lookAt(p.pos.x, p.pos.y + 1.4, p.pos.z);
  });
  await page.screenshot({ path: 'scripts/shot-is2m-jetV.png' });
  await sleep(300);
  await page.screenshot({ path: 'scripts/shot-is2m-jetV2.png' });
  // 数值：左右两侧各自的外倾角
  const res = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const pool = g.effects.ps.pools.smoke;
    const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
    const out = { L: [], R: [] };
    for (let i = 0; i < pool.count; i++) {
      if (pool.life[i] < 0.02 || pool.life[i] > 0.09) continue;
      const dx = pool.px[i * 3] - p.pos.x, dz = pool.px[i * 3 + 2] - p.pos.z;
      if (Math.hypot(dx, dz) > 6) continue;
      // 车体局部 x（右正）：lx = ch*dx - sh*dz? 局部 +x → 世界 (cos,0,-sin) → lx = dx*cos + dz*(-sin)
      const lx = dx * ch - dz * sh;
      const side = lx >= 0 ? 'R' : 'L';
      // 外侧单位向量（世界系）
      const ox = side === 'R' ? ch : -ch, oz = side === 'R' ? -sh : sh;
      const vlat = pool.vx[i] * ox + pool.vz[i] * oz;   // 沿外侧的横向速度（>0 = 外倾）
      const vup = pool.vy[i];
      if (vup > 1.5) out[side].push({ vlat: +vlat.toFixed(2), vup: +vup.toFixed(2), ang: +(Math.atan2(vlat, vup) * 180 / Math.PI).toFixed(1) });
    }
    const avg = (arr, k) => arr.length ? +(arr.reduce((s, o) => s + o[k], 0) / arr.length).toFixed(2) : null;
    return {
      nL: out.L.length, nR: out.R.length,
      L_avgLat: avg(out.L, 'vlat'), L_avgAng: avg(out.L, 'ang'),
      R_avgLat: avg(out.R, 'vlat'), R_avgAng: avg(out.R, 'ang'),
      samplesL: out.L.slice(0, 4), samplesR: out.R.slice(0, 4),
    };
  });
  console.log('V 字验证:', JSON.stringify(res, null, 1));
  await page.evaluate(() => window.__game.input.keys.delete('KeyW'));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
