// ═══ 点亮/侦查系统 v2 回归（第六次迭代） ═══
// 覆盖：分档自动确认（静止500/移动700）/ AI 警戒圈700 / 主动侦查 dwell /
//       开火暴露（玩家侧疑似标记 DOM / AI 侧误差注入与收敛）/ 电台共享 / 暴露警示
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  // 1v3（测电台共享）+ 标准难度（警戒圈 700）
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.settings.enemyTanks = ['random', 'random', 'random'];
    g.ui.settings.enemyCount = 3;
    g.ui.aiDifficulty = 'standard';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4500));

  const res = await page.evaluate(async () => {
    const g = window.__game, vis = g.visibility, P = g.player;
    const [E0, E1, E2] = g.enemies;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = { checks: {} };
    const ck = (name, v) => { out.checks[name] = !!v; };

    // 冻结 AI（不开火不机动；点亮系统独立运转）
    for (const ai of g.ais) ai.update = () => {};

    // 开阔位扫描：绕 P 找 dist 处 LOS 完全通畅的点
    const placeOpen = (E, px, pz, dist) => {
      for (let k = 0; k < 16; k++) {
        const ang = k / 16 * Math.PI * 2;
        const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist;
        if (Math.abs(x) > 1040 || Math.abs(z) > 1040) continue;
        E.place(x, z, 0);
        if (vis.losDetail(P, E).see) return { x, z, ok: true };
      }
      return { ok: false };
    };
    const d2 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

    // ── 布场 ──
    P.place(450, 0, 90);
    const s0 = placeOpen(E0, 450, 0, 750);          // E0：750m 开阔
    E1.place(-700, 300, 0);                          // E1：~1188m
    E2.place(-900, -900, 0);                         // E2：~1622m（>1400 直触圈，电台唯一途径）
    out.setup = { openSpot: s0.ok, dE0: d2(P, E0) | 0, dE1: d2(P, E1) | 0, dE2: d2(P, E2) | 0 };

    // ── A1：750m 双方互不自动点亮（旧系统 1000m 会互亮） ──
    await wait(3200);
    ck('A1_playerNotAutoSpot@750', vis.contactInfo(P, E0).level === 0);
    ck('A1_aiNotAlert@750', vis.contactInfo(E0, P).level === 0);

    // ── B2：玩家开火 → AI 疑似接触 + 声源误差（40~120m）；连续开火收敛 ──
    vis.onFire(P, [P, ...g.enemies]);
    await wait(300);
    const ciE0 = vis.contactInfo(E0, P);
    ck('B2_aiSuspectedAfterFire', ciE0.suspected === true && ciE0.spotted === false);
    const err1 = ciE0.aimPos ? Math.hypot(ciE0.aimPos.x - P.pos.x, ciE0.aimPos.z - P.pos.z) : -1;
    ck('B2_errInRange', err1 >= 20 && err1 <= 130);
    out.errFirstShot = err1 | 0;
    ck('B2_exposureWarn', vis.playerExposure() >= 1);
    // 连续开火 ×3：误差应收敛到 <8m（近似锁定）
    vis.onFire(P, [P, ...g.enemies]); await wait(120);
    vis.onFire(P, [P, ...g.enemies]); await wait(120);
    vis.onFire(P, [P, ...g.enemies]); await wait(300);
    const ciE0b = vis.contactInfo(E0, P);
    const err2 = ciE0b.aimPos ? Math.hypot(ciE0b.aimPos.x - P.pos.x, ciE0b.aimPos.z - P.pos.z) : 999;
    ck('B2_errConverge', err2 < Math.max(8, err1 * 0.3));
    out.errAfter3Shots = err2 | 0;
    ck('B2_noDirectContact_E2', vis.contactInfo(E2, P).level === 0);   // 1622m 超直触圈

    // ── B3：电台共享 2~4s → E2 获得疑似 ──
    await wait(4600);
    ck('B3_radioShared_E2', vis.contactInfo(E2, P).level >= 1);

    // ── B1：敌 1188m 开火（远超自动圈）→ 玩家侧疑似橙标 DOM，快照不跟踪 ──
    vis.onFire(E1, [P, ...g.enemies]);
    await wait(400);
    const ciE1 = vis.contactInfo(P, E1);
    ck('B1_playerSuspected', ciE1.suspected === true && ciE1.spotted === false);
    const mk = g.ui.markers.get(E1);
    out.b1dbg = { hasMk: !!mk, cls: mk ? mk.className : null,
      tag: mk && mk.querySelector('.em-tag') ? mk.querySelector('.em-tag').textContent : 'no-tag',
      susp: E1.suspected, spot: E1.spotted, lost: E1.lostContact, mkN: g.ui.markers.size };
    ck('B1_markerDomOrange', !!mk && mk.classList.contains('suspected') &&
      mk.querySelector('.em-tag').textContent === '疑似目标');
    const snap = E1.lastKnownPos ? { x: E1.lastKnownPos.x, z: E1.lastKnownPos.z } : null;
    E1.place(-650, 350, 0);                          // 敌移位 → 标记应钉在原快照位
    await wait(350);
    ck('B1_markerStatic', !!snap && E1.lastKnownPos &&
      Math.abs(E1.lastKnownPos.x - snap.x) < 0.01 && Math.abs(E1.lastKnownPos.z - snap.z) < 0.01);
    ck('B1_exposureDom', document.getElementById('exposure-warn').classList.contains('show'));

    // ── Phase2：主动侦查 dwell（750m 唯一确认途径） ──
    E0.place(s0.x, s0.z, 0);                          // 复位防漂移
    const origDwell = vis.playerDwell.bind(vis);
    vis.playerDwell = (dt, p, en) => {
      const dir = {
        x: E0.pos.x - P.pos.x,
        y: (E0.root.position.y + 1.6) - (P.root.position.y + 2.4),
        z: E0.pos.z - P.pos.z,
      };
      const L = Math.hypot(dir.x, dir.y, dir.z) || 1;
      dir.x /= L; dir.y /= L; dir.z /= L;
      origDwell(dt, p, en, dir, true);
    };
    await wait(3400);
    vis.playerDwell = (dt, p, en, dir, active) => origDwell(dt, p, en, dir, active);
    ck('C_dwellConfirm@750', vis.contactInfo(P, E0).level === 2 && E0.spotted === true);

    // ── Phase3：AI 警戒圈确认（玩家抵近 650m 且 LOS 通 → AI 确认点亮） ──
    const px = E0.pos.x - (E0.pos.x - P.pos.x), pz = E0.pos.z - (E0.pos.z - P.pos.z); // 方向单位化↓
    const ux = (E0.pos.x - P.pos.x) / d2(P, E0), uz = (E0.pos.z - P.pos.z) / d2(P, E0);
    P.place(E0.pos.x - ux * 650, E0.pos.z - uz * 650, 0);
    await wait(3200);
    ck('D_aiConfirm@650', vis.contactInfo(E0, P).level === 2 && vis.playerExposure() === 2);

    // ── Phase4：分档参数单元校验（移动 700 / 隐蔽 300） ──
    E0.speed = 5;
    ck('E_autoMoving700', vis._autoRange(P, E0, { see: true, softOnly: false }) === 700);
    E0.speed = 0;
    ck('E_autoStationary500', vis._autoRange(P, E0, { see: true, softOnly: false }) === 500);
    ck('E_autoConcealed300', vis._autoRange(P, E0, { see: false, softOnly: true }) === 300);
    ck('E_aiAlert700', vis._autoRange(E0, P, { see: true, softOnly: false }) === 700);

    // ── Phase5：LOS 高度判定（灌木/障碍 topY，第七次迭代） ──
    let topOk = true, topN = 0;
    for (const b of g.world.sightBlockers) {
      topN++;
      if (!(b.topY > g.world.groundY(b.x, b.z) + 1)) topOk = false;
    }
    ck('F_blockersHaveTopY', topOk && topN > 50);
    const flat = (() => {   // 找一对地面高相近、60m 间距的点
      for (let k = 0; k < 24; k++) {
        const ax = 200 + (k * 17) % 500, az = -300 + (k * 53) % 400;
        const bx = ax + 60, bz = az;
        const ga = g.world.groundY(ax, az), gb = g.world.groundY(bx, bz);
        if (Math.abs(ga - gb) < 0.6) return { ax, az, bx, bz, gy: (ga + gb) / 2 };
      }
      return null;
    })();
    if (flat) {
      const mx = (flat.ax + flat.bx) / 2, mz = (flat.az + flat.bz) / 2;
      vis.sightBlockers.push({ x: mx, z: mz, r: 1, hedge: true, topY: flat.gy + 2.8, _test: 1 });
      // 平地眼高 2.2m → 应被 2.8m 丛顶挡住
      ck('F_flatBlocked', !vis._los(flat.ax, flat.az, flat.gy + 2.2, flat.bx, flat.bz, flat.gy + 2.2, false, true));
      // 双方抬到坡上（+6m）→ 射线 8.2m 高 → 应越过丛顶
      ck('F_slopeSeeOver', vis._los(flat.ax, flat.az, flat.gy + 8.2, flat.bx, flat.bz, flat.gy + 8.2, false, true));
      // 无 topY 旧数据 → 保持旧行为（挡）
      vis.sightBlockers.push({ x: mx, z: mz, r: 1, hedge: true, _test: 1 });
      ck('F_legacyBlocked', !vis._los(flat.ax, flat.az, flat.gy + 8.2, flat.bx, flat.bz, flat.gy + 8.2, false, true));
      vis.sightBlockers = vis.sightBlockers.filter(b => !b._test);
    } else ck('F_flatFound', false);

    return out;
  });

  const pass = Object.values(res.checks).every(Boolean);
  console.log('SPOTTING_TEST:', JSON.stringify(res, null, 1));
  console.log(pass ? 'ALL PASS' : 'SOME FAIL');
  console.log('ERRORS:', errors.length, errors.slice(0, 3));
  await browser.close();
  process.exit(pass && !errors.length ? 0 : 1);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
