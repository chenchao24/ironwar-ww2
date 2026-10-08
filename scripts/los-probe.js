// 灌木 LOS 疑点探针：为什么 hedge-test 的穿圆视线 visible=true
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4500));
  const r = await page.evaluate(() => {
    const g = window.__game, hf = g.world.hedgeField, vis = g.visibility;
    const h = hf.hedges.find(h => h.blockers.length);
    const b = hf._sight.find(s => Math.hypot(s.x - h.wcx, s.z - h.wcz) < h.len);
    const mk = (x, z) => ({ pos: { x, z, distanceTo: () => 0 }, cfg: { dims: { hullHeight: 2 } }, speed: 0 });
    const A = mk(b.x, b.z - 60), B = mk(b.x, b.z + 60);
    const ay = vis._gy(A.pos.x, A.pos.z) + 2.5, by = vis._gy(B.pos.x, B.pos.z) + 2.5;
    const gMid = vis._gy(b.x, b.z);
    // 全量诊断
    return {
      blocker: { x: +b.x.toFixed(1), z: +b.z.toFixed(1), r: +b.r.toFixed(2), topY: +(b.topY ?? -1).toFixed(2) },
      gyA: +vis._gy(A.pos.x, A.pos.z).toFixed(2), gyB: +vis._gy(B.pos.x, B.pos.z).toFixed(2),
      gyMid: +gMid.toFixed(2),
      rayYatT: +((ay + by) / 2).toFixed(2),
      topYplus: +((b.topY ?? 0) + 0.15).toFixed(2),
      losSoft: vis._los(A.pos.x, A.pos.z, ay, B.pos.x, B.pos.z, by, false, true),
      losNoSoft: vis._los(A.pos.x, A.pos.z, ay, B.pos.x, B.pos.z, by, false, false),
      segT: vis._segCircleT(A.pos.x, A.pos.z, B.pos.x, B.pos.z, b.x, b.z, b.r),
      canSee: vis.canSee(A, B),
      inVis: vis.sightBlockers.includes(b),
      nBlockers: vis.sightBlockers.length,
      // 射线中途地形最高点
      terrMax: (() => { let m = -1e9; for (let t = 0.05; t < 1; t += 0.05) { const y = vis._gy(A.pos.x + 0 * t, A.pos.z - 60 + 120 * t); if (y > m) m = y; } return +m.toFixed(2); })(),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
