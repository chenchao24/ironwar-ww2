// 阿登森林图烟测：选图 → 开战 → 多视角截图 + 布景统计 + FPS
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
  const logs = [];
  page.on('console', (m) => { if (m.text().includes('[ardennes]')) logs.push(m.text()); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.select('#fh-map-select', 'ardennes');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  // 截图专用：玩家无敌
  await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => {};
    g.player.resolveHit = () => null;
  });

  const v = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    const by = {};
    for (const d of w.destructibles.list) by[d.type] = (by[d.type] || 0) + 1;
    return {
      map: w.mapId, snowpine: by.snowpine || 0, snowbare: by.snowbare || 0,
      pine2: (by.pine2_t1 || 0) + (by.pine2_t2 || 0) + (by.pine2_t3 || 0),
      snowdead: (by.snowdead || 0) + (by.snowdead2 || 0), snowbush: (by.snowbush1 || 0) + (by.snowbush2 || 0),
      boulder: by.boulder || 0, pylon: by.pylon01 || 0,
      obstacles: w.obstacles.length, sightBlockers: w.sightBlockers.length,
      snowfall: !!w.snowfall,
      fog: g.scene.fog ? g.scene.fog.density : null,
      terrain: w.map.terrain,
      roadSpeedAt: typeof w.roadSpeedAt === 'function' ? w.roadSpeedAt(0, 55) : 'MISSING',
      groundY0: +w.groundY(0, 0).toFixed(2),
    };
  });
  console.log('COUNTS:', JSON.stringify(v));
  console.log('LOGS:', logs.join(' | '));

  const shots = [
    // [名字, 玩家x, 玩家z, aimYaw, aimPitch, dist]
    ['village', -160, 60, Math.PI / 2 + 0.3, -0.03, 16],      // 从西侧看中心村
    ['forest-in', -430, -300, 0.6, 0.02, 13],                 // 西脊林内
    ['road-west', -600, 130, Math.PI / 2, -0.02, 15],         // 主路西段（电线杆+线）
    ['poles', -400, 128, Math.PI / 2 + 0.15, 0.06, 14],       // 电线杆近景
    ['rock', -380, -140, 2.4, 0.0, 14],                       // 巨石露头点
    ['ridge-view', -380, -100, 2.2, -0.05, 18],               // 西脊顶看谷地
    ['creek', -40, 330, 0.2, -0.04, 15],                      // 雪溪涉渡点
  ];
  for (const [name, x, z, yaw, pitch, dist] of shots) {
    await page.evaluate((x2, z2, y2, p2, d2) => {
      const g = window.__game;
      g.player.place(x2, z2, 0);
      g.rig.aimYaw = y2; g.rig.aimPitch = p2; g.rig.dist = d2;
    }, x, z, yaw, pitch, dist);
    await new Promise(r => setTimeout(r, 1100));
    await page.screenshot({ path: 'scripts/shot-ardennes-' + name + '.png' });
  }

  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / 2)); };
    requestAnimationFrame(tick);
  }));
  console.log('FPS_HEADLESS:', fps);
  console.log('ERRORS:', errors.length, errors.slice(0, 6));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
