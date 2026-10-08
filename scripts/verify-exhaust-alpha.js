// 尾气透明度规则 + 云化验证（is2m 上喷型 / m26 默认型对照）：
// ① 起步加速（W 按下、未达极速）→ alphaMul=1；② 极速巡航（达地形极速仍按 W）→ 0.5；
// ③ 低速滑行（<8km/h 松开油门）→ 1；④ 初始尺寸云化（size0 ≥0.9）
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

  const sample = () => page.evaluate(() => {
    const g = window.__game, p = g.player;
    const pool = g.effects.ps.pools.smoke;
    // 新生、在车体附近的烟团（排除战场远处烟）
    const out = [];
    for (let i = 0; i < pool.count; i++) {
      if (pool.life[i] < 0.02 || pool.life[i] > 0.4) continue;
      const dx = pool.px[i * 3] - p.pos.x, dz = pool.px[i * 3 + 2] - p.pos.z;
      if (Math.hypot(dx, dz) > 8) continue;
      out.push({ a: +pool.alpha0[i].toFixed(3), s: +pool.size0[i].toFixed(2) });
    }
    return { kmh: +(p.speed * 3.6).toFixed(1), n: out.length,
      meanA: out.length ? +(out.reduce((s, o) => s + o.a, 0) / out.length).toFixed(3) : null,
      meanS: out.length ? +(out.reduce((s, o) => s + o.s, 0) / out.length).toFixed(2) : null };
  });

  // ① 起步加速段
  await page.keyboard.down('KeyW');
  await sleep(1500);
  const s1 = await sample();
  // ② 继续按 W 到极速巡航（is2m 软土极速 ≈17.3km/h）
  await sleep(9000);
  const s2 = await sample();
  // ③ 松开 W 滑行降速（仍在极速以上段会维持 0.5，掉到 8 以下应回 1）
  await page.keyboard.up('KeyW');
  await sleep(4000);
  const s3 = await sample();
  console.log('① 加速段(按W,未达极速):', JSON.stringify(s1));
  console.log('② 极速巡航(按W,达极速):', JSON.stringify(s2));
  console.log('③ 松油门滑行(应 <8 或降速):', JSON.stringify(s3));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
