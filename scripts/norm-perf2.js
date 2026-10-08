// 诺曼底瓶颈定位：JS 帧时间 vs GPU（降分辨率对照）+ 分类三角量
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 120)));
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
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => {}; g.player.resolveHit = () => null;
    g.player.place(5, 90, 0); g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.02; g.rig.dist = 14;
  });
  await new Promise(r => setTimeout(r, 1500));

  // 1) 手动步进 _frame 测 JS 侧帧耗时（停掉 RAF 循环）
  const jsTime = await page.evaluate(() => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    // 手动维持时钟与帧调用
    const t0 = performance.now();
    const N = 40;
    for (let i = 0; i < N; i++) { g.clock.update(); g._frame(); }
    const total = performance.now() - t0;
    return +(total / N).toFixed(2);
  });
  console.log('JS+render frame time (ms):', jsTime, '=> FPS if nothing else:', (1000 / jsTime).toFixed(1));

  // 2) 仅 render 耗时（场景不动）：分离渲染成本
  const parts = await page.evaluate(() => {
    const g = window.__game;
    const t0 = performance.now();
    const N = 40;
    for (let i = 0; i < N; i++) g.renderer.render(g.scene, g.camera);
    const renderMs = (performance.now() - t0) / N;
    return { renderMs: +renderMs.toFixed(2), calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  });
  console.log('render-only (ms):', JSON.stringify(parts));

  // 3) 分类三角量：建筑/树篱/树木/地面/坦克
  const tris = await page.evaluate(() => {
    const g = window.__game;
    const countTris = (obj) => {
      let t = 0;
      obj.traverse(o => {
        if (!o.visible) return;
        if (o.isInstancedMesh) { const g2 = o.geometry; t += (g2.index ? g2.index.count / 3 : g2.attributes.position.count / 3) * o.count; }
        else if (o.isMesh) { const g2 = o.geometry; t += g2.index ? g2.index.count / 3 : g2.attributes.position.count / 3; }
      });
      return Math.round(t);
    };
    const out = { hedgeChunks: 0, other: 0 };
    out.hedgeChunks = countTris(g.world.hedgeField.group);
    // 建筑合批 + 树：root 下非树篱部分
    let buildings = 0, trees = 0, ground = 0, sky = 0;
    for (const ch of g.world.root.children) {
      if (ch === g.world.hedgeField.group) continue;
      if (ch === g.world.sky) { sky += countTris(ch); continue; }
      if (ch.isMesh && ch.geometry && ch.geometry.attributes.position && ch.geometry.attributes.position.count === 40401) { ground += countTris(ch); continue; }
      if (ch.isInstancedMesh) trees += countTris(ch);
      else buildings += countTris(ch);
    }
    return { hedges: out.hedgeChunks, trees, buildings, ground, sky,
      tanks: countTris(g.player.root) + g.enemies.reduce((s, e) => s + countTris(e.root), 0) };
  });
  console.log('TRIS_BY_CLASS:', JSON.stringify(tris));

  // 4) 降分辨率对照（GPU 是否瓶颈）
  await page.evaluate(() => {
    const g = window.__game;
    g.renderer.setPixelRatio(0.4);
    g.renderer.setAnimationLoop(() => { g.clock.update(); g._frame(); });
  });
  await new Promise(r => setTimeout(r, 1000));
  const fpsLow = await page.evaluate(() => new Promise((res) => {
    let f = 0; const t0 = performance.now();
    const tick = () => { f++; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(f / 3); };
    requestAnimationFrame(tick);
  }));
  console.log('FPS at pixelRatio 0.4:', fpsLow.toFixed(1));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
