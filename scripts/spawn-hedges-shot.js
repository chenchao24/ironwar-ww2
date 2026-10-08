// 出生区外围散布灌木视觉验证：出生后朝最近外围丛看 + 外围丛分布统计
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2500));

  const info = await page.evaluate(() => {
    const g = window.__game, p = g.player.pos;
    const outers = g.world.hedgeField.hedges.filter(h => h.outer);
    const withDist = outers.map(h => ({ d: +Math.hypot(h.cx - p.x, h.cz - p.z).toFixed(0), x: h.cx | 0, z: h.cz | 0, len: h.len }));
    withDist.sort((a, b) => a.d - b.d);
    // 传送到最近一丛外围灌木外侧 45m 处，车头正对丛中心（验证灌木渲染与体量）
    const hb = outers.map(h => ({ h, d: Math.hypot(h.cx - p.x, h.cz - p.z) })).sort((a, b) => a.d - b.d)[0].h;
    const px = hb.cx + 32, pz = hb.cz + 32;
    const hd = Math.atan2(hb.cx - px, hb.cz - pz);
    g.player.place(px, pz, hd * 180 / Math.PI);
    g.rig.aimYaw = hd; g.rig.aimPitch = 0;
    return {
      playerAt: { x: p.x | 0, z: p.z | 0, r: +Math.hypot(p.x, p.z).toFixed(0) },
      outerCount: outers.length,
      nearest5: withDist.slice(0, 5),
      within300: withDist.filter(b => b.d <= 300).length,
      lookingAt: { len: hb.len, dist: 45 },
    };
  });
  console.log('SPAWN_HEDGES:', JSON.stringify(info, null, 1));
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/shot-spawn-hedges.png' });
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
