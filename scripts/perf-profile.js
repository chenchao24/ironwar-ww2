// 性能画像：加载时长 + 各图 FPS/draw call/显存/堆内存 + 实体统计
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default', '--enable-precise-memory-info'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const t0 = Date.now();
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 180000 });
  console.log('TIME_TO_COVER:', ((Date.now() - t0) / 1000).toFixed(1) + 's');

  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));

  for (const mapId of ['kursk', 'normandy', 'ardennes']) {
    await page.evaluate(() => history.go(0));
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 180000 });
    await page.click('#screen-cover');
    await new Promise(r => setTimeout(r, 400));
    await page.click('#btn-hunt-mode');
    await new Promise(r => setTimeout(r, 3000));
    await page.select('#fh-map-select', mapId);
    const tB = Date.now();
    await page.click('#screen-hangar [data-action="start"]');
    await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
    console.log(`BATTLE_ENTER[${mapId}]:`, ((Date.now() - tB) / 1000).toFixed(1) + 's（含懒加载）');
    await new Promise(r => setTimeout(r, 2500));
    const stats = await page.evaluate(() => {
      const g = window.__game, w = g.world, r = g.renderer.info;
      const by = {};
      for (const d of w.destructibles.list) by[d.kind] = (by[d.kind] || 0) + 1;
      return {
        calls: r.render.calls, tris: Math.round(r.render.triangles / 1000) + 'k',
        geoms: r.memory.geometries, texs: r.memory.textures, programs: r.programs.length,
        desList: w.destructibles.list.length, desKind: by,
        obstacles: w.obstacles.length, sight: w.sightBlockers.length,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      };
    });
    const fps = await page.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res((n / 3).toFixed(1)); };
      requestAnimationFrame(tick);
    }));
    console.log(`MAP[${mapId}]:`, JSON.stringify(stats), 'FPS:', fps);
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
