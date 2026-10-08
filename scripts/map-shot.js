const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Missing')) errors.push(m.text().slice(0, 120)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 120)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  // 截图专用：玩家无敌（防 AI 击毁触发死亡遮罩污染截图），非破坏性运行时补丁
  await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => {};
    g.player.resolveHit = () => null;
  });

  const v = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    const by = {};
    for (const d of w.destructibles.list) by[d.type] = (by[d.type] || 0) + 1;
    const rocks = w.obstacles.filter(o => o.kind === 'rock').length;
    return {
      leaf: by.leaf || 0, pine: by.pine || 0, bush: by.bush || 0,
      boulder: by.boulder || 0, obstacles: w.obstacles.length,
      sightBlockers: w.sightBlockers.length,
      fogColor: g.scene.fog ? '#' + g.scene.fog.color.getHexString() : null,
    };
  });
  console.log('COUNTS:', JSON.stringify(v));

  // 场景一：第三人称平视（地貌+地平线+天空衔接）
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.place(0, 0, 0);
    g.rig.aimYaw = 0.8;
    g.rig.aimPitch = -0.06;
    g.rig.dist = 14;
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-map-landscape.png' });

  // 场景二：抬头看天空（蓝天白云验证）
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimPitch = 0.55;
    g.rig.dist = 14;
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-map-sky.png' });

  // 场景二点五：斜上 20°（云+地平线同框，最常用视角）
  await page.evaluate(() => { window.__game.rig.aimPitch = 0.18; });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'scripts/shot-map-horizon.png' });

  // 场景三：中央区俯瞰伪装密度（开镜拉高不现实，用自由视角 C 键逻辑复杂——改用望远镜? 直接把玩家挪到树丛旁平视）
  const cover = await page.evaluate(() => {
    const g = window.__game, w = g.world, p = g.player;
    // 找一个最近的树实例，把玩家挪到旁边 25m 看过去
    const t = w.destructibles.list.find(d => d.kind === 'inst' && d.type === 'leaf' && d.alive && Math.hypot(d.x, d.z) < 200);
    if (!t) return null;
    p.place(t.x - 30, t.z + 8, 0);
    g.rig.aimYaw = Math.atan2(0, 30) ; // 朝 +x 看向树
    g.rig.aimPitch = -0.02;
    g.rig.dist = 12;
    return { x: t.x, z: t.z };
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/shot-map-cover.png' });
  console.log('COVER_SPOT:', JSON.stringify(cover));

  // FPS 粗测（2s 帧计数）
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / 2)); };
    requestAnimationFrame(tick);
  }));
  console.log('FPS_HEADLESS:', fps);
  console.log('ERRORS:', errors.length, errors.slice(0, 5));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
