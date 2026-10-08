// 诺曼底 v2 验收：世界参数 + 镇区/树篱/俯瞰截图
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('Missing')) errors.push(m.type() + ':' + m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 140)));
  await page.evaluateOnNewDocument(() => {
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = 'normandy';
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 6000));
  await page.evaluate(() => { const g = window.__game; g.player.applyHit = () => {}; g.player.resolveHit = () => null; });
  const v = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    return {
      mapId: w.mapId, obstacles: w.obstacles.length, sightBlockers: w.sightBlockers.length,
      hedges: w.hedgeField ? w.hedgeField.stats : null,
      calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
    };
  });
  console.log('WORLD:', JSON.stringify(v));
  // 1. 镇区平视（主街由东向西看）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-40, 55, 0);
    g.rig.aimYaw = Math.atan2(-230 - (-40), -60 - 55);
    g.rig.aimPitch = 0.02; g.rig.dist = 18;
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/shot-norm2-town.png' });
  // 2. 镇区俯瞰
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-230, 120, 0);
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.85; g.rig.dist = 190;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm2-town-top.png' });
  // 3. 全图俯瞰（田块贴图写实感）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(0, 500, 0);
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = -1.05; g.rig.dist = 700;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm2-aerial.png' });
  // 4. 树篱平视
  await page.evaluate(() => {
    const g = window.__game, w = g.world;
    let best = null, bd = 1e9;
    for (const h of w.hedgeField.hedges) {
      const d = Math.hypot(h.wcx - 200, h.wcz - 400);
      if (d < bd) { bd = d; best = h; }
    }
    const px = best.wcx + 20, pz = best.wcz + 20;
    g.player.place(px, pz, 0);
    g.rig.aimYaw = Math.atan2(best.wcx - px, best.wcz - pz);
    g.rig.aimPitch = -0.02; g.rig.dist = 16;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm2-hedge.png' });
  console.log('ERRORS:', errors.length ? errors.slice(0, 8).join(' | ') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
