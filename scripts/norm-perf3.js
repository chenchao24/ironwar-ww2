// 两图手动步进帧耗时对照（真机估算口径）+ 诺曼底截图复核
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  for (const mapId of ['normandy', 'kursk']) {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((m) => {
      const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
      s.mapId = m; localStorage.setItem('ironwar3_settings', JSON.stringify(s));
    }, mapId);
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
    await page.click('#screen-cover');
    await new Promise(r => setTimeout(r, 400));
    await page.click('#btn-hunt-mode');
    await new Promise(r => setTimeout(r, 3000));
    await page.click('#screen-hangar [data-action="start"]');
    await new Promise(r => setTimeout(r, 5000));
    await page.evaluate((m) => {
      const g = window.__game;
      g.player.applyHit = () => {}; g.player.resolveHit = () => null;
      if (m === 'normandy') { g.player.place(5, 90, 0); } else { g.player.place(0, 300, 0); }
      g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.02; g.rig.dist = 14;
    }, mapId);
    await new Promise(r => setTimeout(r, 1500));
    const res = await page.evaluate(() => {
      const g = window.__game;
      g.renderer.setAnimationLoop(null);
      const t0 = performance.now();
      const N = 40;
      for (let i = 0; i < N; i++) { g.clock.update(); g._frame(); }
      const ms = (performance.now() - t0) / N;
      return { ms: +ms.toFixed(1), calls: g.renderer.info.render.calls, tris: +(g.renderer.info.render.triangles / 1e6).toFixed(2) };
    });
    console.log(mapId.toUpperCase() + ':', JSON.stringify(res), '=> ~' + (1000 / res.ms).toFixed(0) + ' FPS');
    if (mapId === 'normandy') {
      await page.evaluate(() => { const g = window.__game; g.renderer.setAnimationLoop(() => { g.clock.update(); g._frame(); }); });
      await new Promise(r => setTimeout(r, 800));
      await page.screenshot({ path: 'scripts/shot-norm-opt-view.png' });
    }
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
