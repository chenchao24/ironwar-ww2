// 修复后验证 v3（2026-09-19 拟真弹道改造）：①石头精确网格求交（贴面切线弹越过 / 穿心弹挡下）
//               ②hull-down 测距门 = 真实弹道积分：净空→保留敌坦（弹着落炮塔）；擦地→抢到碰地点（弹着落在碰地）
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => { window.__game.ais.forEach(a => { a.update = () => {}; }); });   // 冻结 AI：敌车不得挪出瞄线

  // ─────────── ① 石头 ───────────
  const rockCases = await page.evaluate(() => {
    const g = window.__game, des = g.world.destructibles, w = g.world;
    const V3 = g.rig.farPoint.constructor;
    const rocks = des.list.filter(d => d.kind === 'group' && d.meshTris && d.alive);
    g.enemies.forEach(e => e.place(900, -900, 0));   // 挪远免干扰
    window.__rockHits = [];
    const od = des.damageDestructible.bind(des);
    des.damageDestructible = (dd, pos, st) => { window.__rockHits.push({ type: dd.type }); return od(dd, pos, st); };

    // 选一块石头 + 一条全程净空的切线：路径每 2m 采样，线高 ≥ 地面 +0.5
    const ray = new g.raycaster.constructor();
    let picked = null;
    outer:
    for (const d of rocks.slice(0, 12)) {
      const cx = d.cx, cz = d.cz, cy = (d.box.min.y + d.box.max.y) / 2;
      for (let k = 0; k < 16; k++) {
        const th = k / 16 * Math.PI * 2, ux = Math.cos(th), uz = Math.sin(th);
        ray.set(new V3(cx + ux * 60, cy, cz + uz * 60), new V3(-ux, 0, -uz).normalize());
        const hits = ray.intersectObject(d.group, true);
        if (!hits.length) continue;
        const rs = Math.hypot(hits[0].point.x - cx, hits[0].point.z - cz);
        // 切线方向与过切点线（面外 0.4m）
        const dir = new V3(-uz, 0, ux);
        const px = cx + ux * (rs + 0.4), pz = cz + uz * (rs + 0.4);
        let clear = true;
        for (let s = -40; s <= 40; s += 2) {
          const x = px + dir.x * s, z = pz + dir.z * s;
          if (cy < w.groundY(x, z) + 0.5) { clear = false; break; }
        }
        if (!clear) continue;
        picked = { d, cx, cz, cy, ux, uz, rs, dir };
        break outer;
      }
    }
    if (!picked) return { err: '找不到净空切线几何' };
    const { cx, cz, cy, ux, uz, rs, dir, d } = picked;
    const fire = (pos, dvec) => g.shells.fire({ pos, dir: dvec, velocity: 300, pen: 100, penDrop: 0, spall: 0, owner: g.player, shellType: 'ap' });
    // A：贴面切线弹（面外 +0.4m，全程净空已验证）——应越过
    fire(new V3(cx + ux * (rs + 0.4) - dir.x * 40, cy, cz + uz * (rs + 0.4) - dir.z * 40), dir.clone());
    // B：穿心弹（水平直线穿过网格中心点——局部原点恒在石体内）——应挡下
    const anchor = d.group.position;
    const fireB = () => {
      const dx = anchor.x - (anchor.x + 45), dy = 0, dz = 0;
      fire(new V3(anchor.x + 45, anchor.y + 1.2, anchor.z), new V3(-1, 0, 0));
    };
    // 穿心线也要验净空（起点→石面前不被地形挡）
    let bClear = true;
    for (let s = 45; s >= rs + 1; s -= 2) {
      if (anchor.y + 1.2 < w.groundY(anchor.x + s, anchor.z) + 0.3) { bClear = false; break; }
    }
    if (bClear) fireB();
    return { rs: +rs.toFixed(2), boundR: +d.boundR.toFixed(2), rockAt: { x: cx | 0, z: cz | 0 }, bClear, anchorY: +anchor.y.toFixed(1) };
  });
  console.log('ROCK_SETUP:', JSON.stringify(rockCases));
  await new Promise(r => setTimeout(r, 1500));
  const rockHits = await page.evaluate(() => window.__rockHits);
  console.log('ROCK_HITS:', JSON.stringify(rockHits),
    rockHits.length === (rockCases.bClear ? 1 : 0) ? '✓ A越过+B挡下' : '(检查详情)');

  // ─────────── ② hull-down ───────────
  const crestRes = await page.evaluate(() => {
    const g = window.__game, w = g.world, vis = g.visibility, P = g.player, E = g.enemies[0];
    let found = null;
    outer:
    for (let dist = 850; dist >= 450 && !found; dist -= 50) {
      for (let k = 0; k < 48; k++) {
        const ang = k / 48 * Math.PI * 2;
        const ex = Math.cos(ang) * dist, ez = Math.sin(ang) * dist;
        P.place(0, 0, 0); E.place(ex, ez, 0);
        if (!vis.canSee(P, E)) continue;
        const sy = w.groundY(0, 0) + P.cfg.dims.hullHeight + 1.35;
        const ty = w.groundY(ex, ez) + E.cfg.dims.turretTop * 0.75;
        let minClear = Infinity;
        const steps = Math.floor(dist / 2);
        for (let i = 6; i < steps; i++) {
          const t = i / steps;
          const c = (sy + (ty - sy) * t) - w.groundY(ex * t, ez * t);
          if (c < minClear) minClear = c;
        }
        if (minClear > 0.02 && minClear < 0.4) {
          found = { dist, ex: +ex.toFixed(0), ez: +ez.toFixed(0), minClear: +minClear.toFixed(2), sy: +sy.toFixed(2), ty: +ty.toFixed(2) };
          break outer;
        }
      }
    }
    if (!found) return null;
    const dx = found.ex, dz = found.ez, dy = found.ty - found.sy, len = Math.hypot(dx, dz, dy);
    g.rig.aimYaw = Math.atan2(dx, dz);
    g.rig.aimPitch = Math.asin(dy / len);
    window.__crest = { trueDist: Math.hypot(dx, dz), ty: found.ty, ex: found.ex, ez: found.ez };
    return found;
  });
  console.log('CREST_GEO:', JSON.stringify(crestRes));
  // 开镜（镜位相机贴炮手瞄具）：追尾相机射线会从敌车顶掠过锁空——准星射线必须与瞄具同源。
  // ⚠ 主循环每帧 rig.setAimMode(input.aiming) 强制回写——必须设 input 闩锁，只设 rig 会被覆盖
  await page.evaluate(() => { window.__game.input.aiming = true; });
  await new Promise(r => setTimeout(r, 1500));
  const aimState = await page.evaluate(() => {
    const g = window.__game, c = window.__crest, P = g.player, V3 = g.rig.farPoint.constructor;
    g._updateRanging();
    // 炮塔收敛（先执行后判断：遗留 aimOffset≈0 会让条件先行版一次都不跑）
    P.aimAt(g.rig.aimTarget.clone());
    for (let i = 0; i < 4000; i++) {
      P.updateTurret(1 / 60);
      if (P.aimOffset < 0.001) break;
    }
    // 期望判定：与新 _updateRanging 同门控——炮口→敌车抛物线净空则应保留敌坦，擦地则应抢到碰地点
    const mz = new V3(), md = new V3();
    P.getMuzzle(mz, md);
    const dir = g.rig.aimDirection(new V3());
    const to = g.camera.position.clone().addScaledVector(dir, c.trueDist);
    const contact = g._trajectoryContact(mz, to, P.shellVelocityOf());
    window.__contact = contact;
    return {
      aimDist: g.aimDist ? +g.aimDist.toFixed(1) : null,
      trueDist: +c.trueDist.toFixed(1),
      expectClear: !contact,
    };
  });
  const gateOk = aimState.expectClear
    ? Math.abs(aimState.trueDist - aimState.aimDist) < 10
    : (aimState.aimDist != null && aimState.trueDist - aimState.aimDist > 10);
  console.log('AIM_STATE:', JSON.stringify(aimState),
    gateOk ? (aimState.expectClear ? '✓ 弹道净空→保留敌坦' : '✓ 弹道擦地→抢到碰地点') : '✗ 门控与弹道积分不一致');

  // 无散布直射（getMuzzle 取炮管指向，绕开 fire() 的后坐散布注入）
  // → 净空场景弹着应落在炮塔；擦地场景弹着应落在碰地点
  await page.evaluate(() => {
    const g = window.__game, P = g.player, E = g.enemies[0];
    const V3 = g.rig.farPoint.constructor;
    window.__fireRec = { dirt: [], tankHit: null };
    const od = g.effects.dirtHit.bind(g.effects);
    g.effects.dirtHit = (p) => {
      const c = window.__contact;
      window.__fireRec.dirt.push({
        toTarget: +Math.hypot(p.x - window.__crest.ex, p.z - window.__crest.ez).toFixed(1),
        toContact: c ? +p.distanceTo(c).toFixed(1) : null,
      }); od(p);
    };
    const oa = E.applyHit.bind(E);
    E.applyHit = (hit, pen, st, pos, dir, sp) => { window.__fireRec.tankHit = { plate: hit.plateName || hit.zone }; return oa(hit, pen, st, pos, dir, sp); };
    for (let i = 0; i < 400; i++) P.updateTurret(1 / 60);
    const pos = new V3(), dir = new V3();
    P.getMuzzle(pos, dir);
    g.shells.fire({ pos, dir, velocity: P.shellVelocityOf(), pen: 200, penDrop: 0, spall: 100, owner: P, shellType: 'ap' });
    window.__fireRec.aimOffset = +P.aimOffset.toFixed(4);
  });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 200));
    const rec = await page.evaluate(() => ({ ...window.__fireRec, shells: window.__game.shells.shells.length }));
    if (rec.tankHit || rec.dirt.length || rec.shells === 0) {
      const verdict = aimState.expectClear
        ? (rec.tankHit ? '✓ 弹着在炮塔' : '(未中——净空场景应命中，检查)')
        : (rec.dirt.length && rec.dirt[0].toContact != null && rec.dirt[0].toContact < 12 ? '✓ 弹着落在碰地点' : '(擦地场景未落在碰地，检查)');
      console.log('FIRE_RESULT:', JSON.stringify(rec), verdict);
      break;
    }
    if (i === 39) console.log('FIRE_RESULT: 超时', JSON.stringify(rec));
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
