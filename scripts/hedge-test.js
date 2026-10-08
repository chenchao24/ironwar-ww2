// 灌木带游戏集成冒烟测试：启动战斗 → 布置统计 → 视线遮挡对照 → 穿越特效计数 → 截图
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  // ── 1. 布置统计 ──
  const stats = await page.evaluate(() => {
    const hf = window.__game.world.hedgeField;
    if (!hf) return null;
    return {
      hedges: hf.hedges.length,
      cards: hf.stats.cards,
      tris: Math.round(hf.stats.tris / 1000),
      sightCircles: hf._sight.length,
      sightBlockersTotal: window.__game.world.sightBlockers.length,
      bandRange: (() => {
        const rs = hf.hedges.map(h => Math.hypot(h.cx, h.cz));
        return [Math.round(Math.min(...rs)), Math.round(Math.max(...rs))];
      })(),
    };
  });
  console.log('BUILD:', JSON.stringify(stats));

  // ── 2. 视线遮挡对照：穿过灌木圆链的视线应被挡（canSee=false），侧移对照线应可见 ──
  const los = await page.evaluate(() => {
    const g = window.__game, hf = g.world.hedgeField, vis = g.visibility;
    const h = hf.hedges.find(h => h.blockers.length);
    const b = hf._sight.find(s => Math.hypot(s.x - h.wcx, s.z - h.wcz) < h.len);   // 该丛的一个圆
    const mk = (x, z) => ({ pos: { x, z, distanceTo: () => 0 }, cfg: { dims: { hullHeight: 2 } }, speed: 0 });
    // 视线：沿 z 向穿圆心 → canSee 应为 false（被挡）
    const visible = vis.canSee(mk(b.x, b.z - 60), mk(b.x, b.z + 60));
    // 同一线段的手动段-圆相交（应与 visible 相反）
    const manual = vis._segCircleHit(b.x, b.z - 60, b.x, b.z + 60, b.x, b.z, b.r);
    const inVis = vis.sightBlockers.includes(b);
    // 对照：横向偏移 60m 的视线——沿线多点检查是否邻近其他圆/障碍，无邻近才算有效对照
    const cx = b.x + 60, cz = b.z;
    let nearOthers = false;
    for (let t = 0; t <= 1; t += 0.1) {
      const sx = cx, sz = cz - 60 + 120 * t;
      if (g.world.sightBlockers.some(s => Math.hypot(s.x - sx, s.z - sz) < s.r + 3) ||
          g.world.obstacles.some(o => Math.hypot(o.x - sx, o.z - sz) < o.r + 2)) { nearOthers = true; break; }
    }
    const ctrl = nearOthers ? null : vis.canSee(mk(cx, cz - 60), mk(cx, cz + 60));
    return { visible, blocked: !visible, manual, inVis, ctrl, nearOthers };
  });
  console.log('LOS:', JSON.stringify(los));

  // ── 2.5 贴地/避路/伴生石校验（静态布置：构建期一次生效，无需旋转复测） ──
  const ground = await page.evaluate(() => {
    const g = window.__game, hf = g.world.hedgeField, gY = hf.groundY;
    // 贴地：草丛卡 anchorBottom 且 p[1]=0 → instY+0.04 应恒等于该卡位置的 groundY
    let maxErr = 0, sumErr = 0, n = 0;
    for (const hg of hf.group.children) {
      const im = hg.children[hg.children.length - 1];   // 每丛最后一个 InstancedMesh = 草丛卡集
      if (!im || !im.instanceMatrix) continue;
      const a = im.instanceMatrix.array;
      const step = Math.max(1, Math.floor(im.count / 40));
      for (let i = 0; i < im.count; i += step) {
        const lx = a[i * 16 + 12], ly = a[i * 16 + 13], lz = a[i * 16 + 14];
        const err = Math.abs((ly + 0.04) - gY(lx, lz));
        if (err > maxErr) maxErr = err;
        sumErr += err; n++;
      }
    }
    // 避路：每丛沿长轴 5 点采样，取全场最小 roadDist（应 ≥ 9.5）
    let roadMin = 1e9;
    for (const h of hf.hedges) {
      const ax = Math.cos(h.yaw), az = -Math.sin(h.yaw);
      for (const t of [-0.9, -0.45, 0, 0.45, 0.9]) {
        const d = hf.roadDist(h.cx + ax * t * h.halfLen, h.cz + az * t * h.halfLen);
        if (d < roadMin) roadMin = d;
      }
    }
    // 伴生石：半长 +8m 内有岩石障碍的丛数
    let withRock = 0;
    for (const h of hf.hedges) {
      if (g.world.obstacles.some(o => o.kind === 'rock' && Math.hypot(o.x - h.cx, o.z - h.cz) < h.halfLen + 8)) withRock++;
    }
    return { ground: { maxErr: +maxErr.toFixed(3), meanErr: +(sumErr / n).toFixed(3), n },
             roadMin: +roadMin.toFixed(1), withRock, hedges: hf.hedges.length };
  });
  console.log('GROUND/ROAD/ROCK:', JSON.stringify(ground));

  // ── 3. 穿越特效：把玩家传进一丛中央并给速度，手动驱动 update，计粒子/音效/落叶调用 ──
  const fx = await page.evaluate(() => {
    const g = window.__game, hf = g.world.hedgeField;
    const h = hf.hedges[1];
    g.player.place(h.wcx, h.wcz, 0);
    g.player.speed = 6;
    let dust = 0, leaves = 0, sound = 0;
    const origSpawn = g.ps.spawn.bind(g.ps);
    g.ps.spawn = (type, o) => { if (type === 'smoke') dust++; return origSpawn(type, o); };
    const origLeaf = g.world.destructibles.leafBurst.bind(g.world.destructibles);
    g.world.destructibles.leafBurst = (...args) => { leaves += args[3]; return origLeaf(...args); };
    const origProp = (hf.audio && hf.audio.playProp) ? hf.audio.playProp.bind(hf.audio) : null;
    if (origProp) hf.audio.playProp = (name, vol) => { if (name === 'crushWood') sound++; return origProp(name, vol); };
    for (let i = 0; i < 30; i++) hf.update(0.05, g.player, g.enemies);   // 1.5s
    g.ps.spawn = origSpawn;
    g.world.destructibles.leafBurst = origLeaf;
    if (origProp) hf.audio.playProp = origProp;
    return { dust, leaves, sound, audioStarted: !!(hf.audio && hf.audio.started) };
  });
  console.log('FX:', JSON.stringify(fx));

  // ── 3.5 开火震落：炮口在丛侧 ~3m → muzzleShake 应产生尘埃；60m 外对照应为 0 ──
  const shake = await page.evaluate(() => {
    const g = window.__game, hf = g.world.hedgeField;
    const h = hf.hedges[1];
    let spawned = 0;
    const origSpawn = g.ps.spawn.bind(g.ps);
    g.ps.spawn = (type, o) => { if (type === 'smoke') spawned++; return origSpawn(type, o); };
    hf.muzzleShake({ x: h.wcx + 3, y: 0, z: h.wcz });
    const near = spawned;
    spawned = 0;
    hf.muzzleShake({ x: h.wcx + 60, y: 0, z: h.wcz });
    const far = spawned;
    g.ps.spawn = origSpawn;
    return { near, far };
  });
  console.log('SHAKE:', JSON.stringify(shake));

  // ── 4. 性能 + 特写截图（把玩家放到一丛旁侧向看） ──
  const perf = await page.evaluate(() => {
    const g = window.__game, hf = g.world.hedgeField;
    const h = hf.hedges[2];
    // 放到丛侧方 25m，看向丛（垂直于长轴方向 = (sin wyaw, cos wyaw)）
    const off = 25;
    g.player.place(h.wcx + Math.sin(h.wyaw) * off, h.wcz + Math.cos(h.wyaw) * off, 0);
    const dx = h.wcx - g.player.pos.x, dz = h.wcz - g.player.pos.z;
    g.rig.aimYaw = Math.atan2(dx, dz);
    g.rig.aimPitch = 0.02;
    return { calls: g.renderer.info.render.calls, tris: Math.round(g.renderer.info.render.triangles / 1000) };
  });
  console.log('PERF:', JSON.stringify(perf));
  await sleep(1200);
  await page.screenshot({ path: 'scripts/shot-hedge-ingame.png' });

  // ── 5. 坡度最大的一丛特写（贴地目视验证：侧向低机位看基部与地面的衔接） ──
  await page.evaluate(() => {
    const g = window.__game, hf = g.world.hedgeField, gY = hf.groundY;
    let best = null, bestRange = -1;
    for (const h of hf.hedges) {
      let lo = 1e9, hi = -1e9;
      for (const b of h.blockers) {
        const y = gY(b.x, b.z);
        if (y < lo) lo = y; if (y > hi) hi = y;
      }
      if (hi - lo > bestRange) { bestRange = hi - lo; best = h; }
    }
    const h = best, off = 22;
    // 垂直于长轴的侧向机位（长轴世界方向 = (cos wyaw, -sin wyaw)，侧向 = (sin, cos)）
    g.player.place(h.wcx + Math.sin(h.wyaw) * off, h.wcz + Math.cos(h.wyaw) * off, 0);
    const dx = h.wcx - g.player.pos.x, dz = h.wcz - g.player.pos.z;
    g.rig.aimYaw = Math.atan2(dx, dz);
    g.rig.aimPitch = -0.06;
  });
  await sleep(1200);
  await page.screenshot({ path: 'scripts/shot-hedge-ground.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
