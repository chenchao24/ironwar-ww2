// 点亮侦查 v2 视觉验证截图：疑似目标橙标 + 暴露警示
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4500));
  const info = await page.evaluate(async () => {
    const g = window.__game, vis = g.visibility, P = g.player, E = g.enemies[0];
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const ai of g.ais) ai.update = () => {};
    // 敌车放到 780m 开阔位，开火 → 玩家侧疑似
    let spot = null;
    for (let k = 0; k < 16 && !spot; k++) {
      const a = k / 16 * Math.PI * 2, x = P.pos.x + Math.cos(a) * 780, z = P.pos.z + Math.sin(a) * 780;
      if (Math.abs(x) > 1040 || Math.abs(z) > 1040) continue;
      E.place(x, z, 0);
      if (vis.losDetail(P, E).see) spot = { x, z };
    }
    if (!spot) return { ok: false };
    vis.onFire(E, [P, ...g.enemies]);          // 敌开火 → 橙标
    vis.onFire(P, [P, ...g.enemies]);          // 玩家开过火 → 暴露警示
    // 相机转向敌标方向
    g.rig.aimYaw = Math.atan2(spot.x - P.pos.x, spot.z - P.pos.z);
    g.rig.aimPitch = 0;
    await wait(1200);
    return { ok: true, suspected: E.suspected === true, exposure: vis.playerExposure() };
  });
  console.log('SETUP:', JSON.stringify(info));
  await page.screenshot({ path: 'scripts/shot-spotting.png' });
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
