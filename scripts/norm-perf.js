// 诺曼底 vs 库尔斯克 帧率剖析：同机位逐项开关（树篱/树木/建筑/阴影）测 FPS 差
const puppeteer = require('puppeteer-core');

async function measure(page, seconds = 3) {
  return page.evaluate((sec) => new Promise((res) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 < sec * 1000) requestAnimationFrame(tick);
      else res(frames / sec);
    };
    requestAnimationFrame(tick);
  }), seconds);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });

  for (const mapId of ['normandy', 'kursk']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)));
    await page.evaluateOnNewDocument((m) => {
      const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
      s.mapId = m;
      localStorage.setItem('ironwar3_settings', JSON.stringify(s));
    }, mapId);
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
    await page.click('#screen-cover');
    await new Promise(r => setTimeout(r, 400));
    await page.click('#btn-hunt-mode');
    await new Promise(r => setTimeout(r, 3000));
    await page.click('#screen-hangar [data-action="start"]');
    await new Promise(r => setTimeout(r, 5000));
    // 统一机位：平视前线（normandy 看镇区+树篱带，kursk 看中央灌木带）
    await page.evaluate((m) => {
      const g = window.__game;
      g.player.applyHit = () => {}; g.player.resolveHit = () => null;
      if (m === 'normandy') { g.player.place(5, 90, 0); g.rig.aimYaw = Math.PI; }
      else { g.player.place(0, 300, 0); g.rig.aimYaw = Math.PI; }
      g.rig.aimPitch = -0.02; g.rig.dist = 14;
    }, mapId);
    await new Promise(r => setTimeout(r, 1500));

    const base = await measure(page);
    const info0 = await page.evaluate(() => {
      const g = window.__game;
      return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
    });

    // 逐项开关
    const results = { base: +base.toFixed(1), calls: info0.calls, tris: (info0.tris / 1e6).toFixed(2) + 'M' };
    // 1) 树篱整组
    await page.evaluate(() => { window.__game.world.hedgeField.group.visible = false; });
    results.noHedges = +(await measure(page)).toFixed(1);
    await page.evaluate(() => { window.__game.world.hedgeField.group.visible = true; });
    // 2) 树木（InstancedMesh leaf/pine）
    await page.evaluate(() => {
      window.__treeMeshes = [];
      window.__game.world.root.traverse(o => {
        if (o.isInstancedMesh && o.visible && o.count > 20) { window.__treeMeshes.push(o); o.visible = false; }
      });
    });
    const treeCount = await page.evaluate(() => window.__treeMeshes.length);
    results.noInstanced = +(await measure(page)).toFixed(1);
    results.instancedMeshes = treeCount;
    await page.evaluate(() => { window.__treeMeshes.forEach(o => o.visible = true); });
    // 3) 阴影
    await page.evaluate(() => { window.__game.renderer.shadowMap.enabled = false; });
    results.noShadow = +(await measure(page)).toFixed(1);
    await page.evaluate(() => { window.__game.renderer.shadowMap.enabled = true; });

    console.log(mapId.toUpperCase() + ':', JSON.stringify(results), errors.length ? 'ERRORS: ' + errors.join('|') : '');
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
