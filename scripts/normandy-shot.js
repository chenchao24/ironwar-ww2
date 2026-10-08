// 诺曼底骨架截图验证：车库选诺曼底 → 开战 → 平视/天空/俯瞰三机位截图
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Missing')) errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 160)));
  // 开战前就把地图设为诺曼底（避免依赖按钮点击时序）
  await page.evaluateOnNewDocument(() => {
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = 'normandy';
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  // 车库 UI 断言：地图按钮激活态
  const uiState = await page.evaluate(() => ({
    activeMap: document.querySelector('#fh-map-row .fh-diff-btn.active')?.dataset.map || null,
    preview: document.getElementById('fh-preview-text')?.textContent || '',
  }));
  console.log('GARAGE_UI:', JSON.stringify(uiState));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => {};
    g.player.resolveHit = () => null;
  });
  const v = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    return {
      mapId: w.mapId, size: w.mapSize,
      obstacles: w.obstacles.length, sightBlockers: w.sightBlockers.length,
      hedges: w.hedgeField ? w.hedgeField.stats : null,
      fog: g.scene.fog ? '#' + g.scene.fog.color.getHexString() : null,
      ground0: +w.groundY(0, 0).toFixed(2),
      drawCalls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles,
    };
  });
  console.log('WORLD:', JSON.stringify(v));

  // 场景一：第三人称平视（田块/地平线/天空衔接）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(0, 0, 0);
    g.rig.aimYaw = 0.8; g.rig.aimPitch = -0.04; g.rig.dist = 14;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm-landscape.png' });

  // 场景一·五：挪到最近一道树篱旁平视（bocage 观感 + 遮挡圆对照）
  const hedgeSpot = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    if (!w.hedgeField || !w.hedgeField.hedges.length) return null;
    let best = null, bd = 1e9;
    for (const h of w.hedgeField.hedges) {
      const d = Math.hypot(h.wcx, h.wcz);
      if (d < bd) { bd = d; best = h; }
    }
    const px = best.wcx + Math.sin(best.wyaw) * 26, pz = best.wcz + Math.cos(best.wyaw) * 26;
    g.player.place(px, pz, 0);
    g.rig.aimYaw = Math.atan2(best.wcx - px, best.wcz - pz);
    g.rig.aimPitch = -0.02; g.rig.dist = 16;
    return { cx: +best.wcx.toFixed(0), cz: +best.wcz.toFixed(0), len: best.len };
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm-hedge.png' });
  console.log('HEDGE_SPOT:', JSON.stringify(hedgeSpot));
  const perf = await page.evaluate(() => {
    const g = window.__game;
    return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  });
  console.log('PERF_AT_HEDGE:', JSON.stringify(perf));

  // 场景一·八：中心小镇平视（教堂 + 石屋 + 战损建筑）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(5, 55, 0);
    g.rig.aimYaw = Math.atan2(5 - 5, -26 - 55);   // = π，由南向北看向十字口
    g.rig.aimPitch = 0.0; g.rig.dist = 18;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm-town.png' });
  const townPerf = await page.evaluate(() => {
    const g = window.__game;
    return { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
  });
  console.log('PERF_AT_TOWN:', JSON.stringify(townPerf));

  // 场景一·九：小镇侧视（教堂轮廓 + 比例对照坦克）
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(70, -26, 0);
    g.rig.aimYaw = Math.atan2(34 - 70, -4 - (-26));
    g.rig.aimPitch = 0.06; g.rig.dist = 16;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-norm-town2.png' });

  // 场景二：斜上 15°（晨阳 + 云 + 地平线）
  await page.evaluate(() => { const g = window.__game; g.rig.aimPitch = 0.15; g.rig.aimYaw = Math.atan2(0.78, 0.42); });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-norm-sun.png' });

  // 场景三：高位俯瞰田块拼接（直接把相机拉远拉高）
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimPitch = -0.9; g.rig.dist = 260;
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'scripts/shot-norm-top.png' });

  console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
