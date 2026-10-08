// 上喷排气复核 v2：is2m 大负荷起步，连拍 4 帧（位置前移 0.7m + 初始即云团）
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
  // 侧后方视角固定看车尾甲板
  await page.evaluate(() => {
    const g = window.__game;
    g.camera.fov = 55; g.camera.updateProjectionMatrix();
    g.input.keys.add('KeyW');
  });
  // 起步 1s 后连拍（此时 startK 大负荷，烟最浓）
  await sleep(1200);
  for (let i = 1; i <= 4; i++) {
    await page.evaluate(() => {
      const g = window.__game, p = g.player;
      // 相机拉到车尾侧后
      const back = 7;
      g.camera.position.set(p.pos.x - Math.sin(p.heading) * back + Math.cos(p.heading) * 3,
        p.pos.y + 3.2, p.pos.z - Math.cos(p.heading) * back - Math.sin(p.heading) * 3);
      g.camera.lookAt(p.pos.x, p.pos.y + 1.6, p.pos.z);
    });
    await page.screenshot({ path: `scripts/shot-is2m-jet${i}.png` });
    await sleep(320);
  }
  // 数值：新生烟团相对排气点的位置（z 偏移 & 高度 & 初始尺寸）
  const res = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const pool = g.effects.ps.pools.smoke;
    const out = [];
    for (let i = 0; i < pool.count; i++) {
      if (pool.life[i] < 0.02 || pool.life[i] > 1.0) continue;
      // 世界坐标 → 车体局部
      const v = { x: pool.px[i * 3] - p.pos.x, y: pool.px[i * 3 + 1], z: pool.px[i * 3 + 2] - p.pos.z };
      const sh = Math.sin(p.heading), ch = Math.cos(p.heading);
      const lz = sh * v.x + ch * v.z;
      const lx = ch * v.x - sh * v.z;
      out.push({ lx: +lx.toFixed(2), lz: +lz.toFixed(2), life: +pool.life[i].toFixed(2), size: +pool.pd[i * 4].toFixed(2) });
    }
    const fresh = out.filter(o => o.life < 0.35);
    return {
      count: out.length,
      freshCount: fresh.length,
      freshMinZ: fresh.length ? Math.min(...fresh.map(o => o.lz)) : null,
      freshSizes: fresh.slice(0, 8),
      maxY: out.length ? +Math.max(...out.map(o => o.y)).toFixed(2) : null,
    };
  });
  g_input_done: {
  }
  console.log('粒子采样:', JSON.stringify(res));
  await page.evaluate(() => window.__game.input.keys.delete('KeyW'));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
