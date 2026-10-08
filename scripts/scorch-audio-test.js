// 击毁焦痕 + AI 自产声距离衰减 验证
// 1) AI 殉爆 → 永久放射状焦痕落在残骸车体中心、直径 8~10m、贴地 2) clearScorches 清理
// 3) 音频：playProp 距离衰减契约（100m 内全量 / 500m 归零）；远距 AI 撞房静默、近距全量
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MAP = process.env.SCORCH_MAP || 'kursk';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  let failed = 0;
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!ok) failed++; };
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.evaluateOnNewDocument((map) => {
    if (!map || map === 'kursk') return;
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = map;
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  }, MAP);
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#fh-enemy-plus');   // 1v1 → 2 敌
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  // 敌1 摆玩家正前 26m（近景观察焦痕）；敌2 摆 700m 外；清 AI 大脑 → 全场静止（AI 不开车不开火干扰镜头）
  const placed = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player.root.position, h = g.player.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const gy = (x, z) => g.world.groundY(x, z);
    const e1 = g.enemies[0];
    const x1 = p.x + fx * 26, z1 = p.z + fz * 26;
    e1.pos.set(x1, 0, z1); e1.root.position.set(x1, gy(x1, z1), z1);
    e1.heading = h + Math.PI; e1.root.rotation.y = h + Math.PI;
    e1.speed = 0;
    const e2 = g.enemies[1];
    if (e2) { const x2 = p.x + fx * 2500, z2 = p.z + fz * 2500; e2.pos.set(x2, 0, z2); e2.root.position.set(x2, gy(x2, z2), z2); e2.speed = 0; }   // 放到 2500m 外：超出索敌/雾距，不干扰相机（标记死亡会误触胜利结算）
    g.ais.length = 0;
    return { n: g.enemies.length, x1, z1 };
  });
  check('enemies staged', placed.n >= 2, JSON.stringify(placed));

  // 1) 敌1 殉爆击毁 → 焦痕（先清残余速度，模拟行进间被击毁的当场停车）
  await page.evaluate(() => {
    const e = window.__game.enemies[0];
    e.speed = 0;
    e.destroy(true);
  });
  await sleep(1200);
  const m = await page.evaluate(() => {
    const g = window.__game, arr = g.effects._scorches || [];
    const t = g.enemies[0];
    return arr.map((mesh) => ({
      px: +mesh.position.x.toFixed(1), pz: +mesh.position.z.toFixed(1),
      size: mesh.userData.size,
      visible: mesh.visible,
    })).concat([{ tank: { x: +t.root.position.x.toFixed(1), z: +t.root.position.z.toFixed(1) } }]);
  });
  const mark = m[0], tank = m[m.length - 1].tank;
  check('scorch mesh created', m.length >= 2, JSON.stringify(m));
  check('scorch centered on hull wreck', Math.abs(mark.px - tank.x) < 0.5 && Math.abs(mark.pz - tank.z) < 0.5,
    `mark(${mark.px},${mark.pz}) tank(${tank.x},${tank.z})`);
  check('scorch diameter 16~20m (2026-09-25 加倍)', mark.size >= 15.5 && mark.size <= 20.5, 'd=' + mark.size.toFixed(2) + 'm');

  // 相机对准残骸焦痕近景（按坐标精确解算 aimYaw）。残骸强制进余烬阶段，火苗 3s 内消散。
  // 诺曼底等地图上 rig 会被自瞄/坡度逻辑缓慢拉走 → 截图期间每 50ms 强制写一次相机
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies[0];
    e._wreckBigT = -1;     // _wreckAge > _wreckBigT → 直接进余烬薄烟段
    e._wreckFires = null;  // 清持续小火点
    e.root.visible = false;   // 隐藏残骸模型：纯焦痕目检
    const w = e.root.position;
    g.effects.scorch(w.x + 16, w.z + 2, 18);   // 对照痕（旁边无残骸的干净地面）
    const p = g.player.root.position;
    const yaw = Math.atan2(w.x - p.x, w.z - p.z);
    g.__camLock = setInterval(() => {
      g.rig.aimYaw = yaw;
      g.rig.aimPitch = -0.58;
      g.rig.dist = 24;
    }, 50);
  });
  await sleep(10000);   // 等殉爆烟团散尽（焦痕永久，烟会散）
  const dbg = await page.evaluate(() => {
    const g = window.__game, p = g.player.root.position, w = g.enemies[0].root.position;
    const m = (g.effects._scorches || [])[0];
    return {
      player: [+p.x.toFixed(1), +p.z.toFixed(1), +g.player.heading.toFixed(2)],
      wreck: [+w.x.toFixed(1), +w.z.toFixed(1)],
      mark: m ? [+m.position.x.toFixed(1), +m.position.z.toFixed(1)] : null,
      rig: { yaw: +g.rig.aimYaw.toFixed(2), pitch: +g.rig.aimPitch.toFixed(2), dist: g.rig.dist },
    };
  });
  console.log('DEBUG:', JSON.stringify(dbg));
  await page.screenshot({ path: 'scripts/shot-scorch-mark.png' });
  await page.evaluate(() => clearInterval(window.__camLock));

  // 2) 清理
  await page.evaluate(() => window.__game.effects.clearScorches());
  const after = await page.evaluate(() => window.__game.effects._scorches.length);
  check('clearScorches empties', after === 0, String(after));

  // 3) 音频距离衰减契约
  const audio = await page.evaluate(() => {
    const a = window.__audio, g = window.__game;
    const px = g.player.root.position.x, pz = g.player.root.position.z;
    const at = (d) => +a._propAtten({ x: px + d, z: pz }).toFixed(3);
    return {
      near: at(50), mid: at(300), far: at(700),
      playFar: a.playProp('ramHouse', 1, { x: px + 700, z: pz }),
      playNear: a.playProp('ramHouse', 1, { x: px + 30, z: pz }),
    };
  });
  check('prop atten: 50m full', audio.near === 1, String(audio.near));
  check('prop atten: 300m ≈0.5', Math.abs(audio.mid - 0.5) < 0.02, String(audio.mid));
  check('prop atten: 700m inaudible', audio.far === 0, String(audio.far));
  check('playProp far returns false (not played)', audio.playFar === false, String(audio.playFar));
  check('playProp near returns true', audio.playNear === true, String(audio.playNear));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  console.log(failed === 0 && errors.length === 0 ? 'SCORCH/AUDIO TEST: ALL PASS' : `FAILED (${failed})`);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
