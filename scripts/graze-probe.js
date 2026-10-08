// 诊断探针：①地平线露炮塔射击命中地面  ②石头挡弹余量量化
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

  // ─────────── B：石头包围体 vs 可见网格余量量化 ───────────
  const rockRes = await page.evaluate(() => {
    const g = window.__game, des = g.world.destructibles;
    const THREE_R = g.world.root ? null : null;
    const rocks = des.list.filter(d => d.kind === 'group' && d.ellipsoid && d.alive);
    const ray = new (Object.getPrototypeOf(g.raycaster).constructor)();
    const out = [];
    for (const d of rocks.slice(0, 4)) {
      const cx = d.cx, cz = d.cz;
      const cy = (d.box.min.y + d.box.max.y) / 2;
      const rx = (d.box.max.x - d.box.min.x) / 2, rz = (d.box.max.z - d.box.min.z) / 2;
      const margins = [];
      for (let k = 0; k < 16; k++) {
        const th = k / 16 * Math.PI * 2, ux = Math.cos(th), uz = Math.sin(th);
        // 椭球面距（中高平面）
        const re = 1 / Math.sqrt((ux / rx) * (ux / rx) + (uz / rz) * (uz / rz));
        // 可见网格表面距：从外侧向中心 raycast
        const org = { x: cx + ux * rx * 4, y: cy, z: cz + uz * rz * 4 };
        ray.set(new (g.raycaster.ray.origin.constructor)(org.x, org.y, org.z),
                new (g.raycaster.ray.origin.constructor)(-ux, 0, -uz).normalize());
        const hits = ray.intersectObject(d.group, true);
        if (!hits.length) { margins.push(null); continue; }
        const hp = hits[0].point;
        const rs = Math.hypot(hp.x - cx, hp.z - cz);
        margins.push(+(re - rs).toFixed(2));
      }
      const valid = margins.filter(m => m !== null);
      out.push({
        r: +d.radius.toFixed(1), size: [+(rx * 2).toFixed(1), +((d.box.max.y - d.box.min.y)).toFixed(1), +(rz * 2).toFixed(1)],
        marginAvg: +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2),
        marginMax: +Math.max(...valid).toFixed(2),
        marginMin: +Math.min(...valid).toFixed(2),
      });
    }
    return { rockCount: rocks.length, samples: out };
  });
  console.log('ROCK_MARGIN:', JSON.stringify(rockRes, null, 1));

  // ─────────── A：地平线露炮塔（hull-down）射击链路诊断 ───────────
  const crestRes = await page.evaluate(() => {
    const g = window.__game, w = g.world, vis = g.visibility, P = g.player, E = g.enemies[0];
    // 搜索一组 hull-down 几何：视线恰好掠过坡脊（minClear ∈ [0.02, 0.4]）
    let found = null;
    outer:
    for (let dist = 850; dist >= 450 && !found; dist -= 50) {
      for (let k = 0; k < 48; k++) {
        const ang = k / 48 * Math.PI * 2;
        const ex = Math.cos(ang) * dist, ez = Math.sin(ang) * dist;
        P.place(0, 0, 0); E.place(ex, ez, 0);
        if (!vis.canSee(P, E)) continue;
        // 瞄准线：瞄具位 → 敌炮塔中部
        const sy = w.groundY(0, 0) + P.cfg.dims.hullHeight + 1.35;
        const ty = w.groundY(ex, ez) + E.cfg.dims.turretTop * 0.75;
        let minClear = Infinity, at = 0;
        const steps = Math.floor(dist / 2);
        for (let i = 6; i < steps; i++) {
          const t = i / steps;
          const x = ex * t, z = ez * t;
          const y = sy + (ty - sy) * t;
          const c = y - w.groundY(x, z);
          if (c < minClear) { minClear = c; at = +(t * dist).toFixed(0); }
        }
        if (minClear > 0.02 && minClear < 0.4) {
          found = { dist, ang, ex: +ex.toFixed(0), ez: +ez.toFixed(0), minClear: +minClear.toFixed(2), clearAt: at, sy: +sy.toFixed(2), ty: +ty.toFixed(2) };
          break outer;
        }
      }
    }
    return found;
  });
  if (!crestRes) { console.log('CREST: 未找到 hull-down 几何'); await browser.close(); return; }
  console.log('CREST_GEO:', JSON.stringify(crestRes));

  // 就位：放车、开镜、瞄准炮塔，等相机与伺服收敛
  await page.evaluate((c) => {
    const g = window.__game, P = g.player, E = g.enemies[0];
    P.place(0, 0, 0); E.place(c.ex, c.ez, 0);
    const sy = g.world.groundY(0, 0) + P.cfg.dims.hullHeight + 1.35;
    const ty = g.world.groundY(c.ex, c.ez) + E.cfg.dims.turretTop * 0.75;
    const dx = c.ex, dz = c.ez, dy = ty - sy;
    const len = Math.hypot(dx, dz, dy);
    g.rig.aimYaw = Math.atan2(dx, dz);
    g.rig.aimPitch = Math.asin(dy / len);
    // 记录目标真值
    window.__crest = { trueDist: Math.hypot(dx, dz), ty, ex: c.ex, ez: c.ez };
  }, crestRes);
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 2500));   // 等开镜相机收敛 + 炮塔伺服

  const aimState = await page.evaluate(() => {
    const g = window.__game, c = window.__crest;
    g._updateRanging();
    return {
      aimDist: g.aimDist ? +g.aimDist.toFixed(1) : null,
      trueDist: +c.trueDist.toFixed(1),
      aimTargetY: +g.rig.aimTarget.y.toFixed(2),
      turretY: +c.ty.toFixed(2),
      snappedToCrest: g.aimDist ? (c.trueDist - g.aimDist) : null,   // >5m = 测距门被坡脊截胡
      aimOffset: +g.player.aimOffset.toFixed(4),
      scoped: g.rig.aiming,
    };
  });
  console.log('AIM_STATE:', JSON.stringify(aimState));

  // 开火并追踪弹着（挂钩地面命中 / 坦克命中 / 障碍命中）
  const fireRes = await page.evaluate(async () => {
    const g = window.__game, c = window.__crest, P = g.player, E = g.enemies[0];
    const rec = { dirt: [], tankHit: null, destruct: null, aimOffsetAtFire: +P.aimOffset.toFixed(4) };
    const od = g.effects.dirtHit.bind(g.effects);
    g.effects.dirtHit = (p) => { rec.dirt.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), distFromMuzzle: +Math.hypot(p.x, p.z).toFixed(0), toTarget: +Math.hypot(p.x - c.ex, p.z - c.ez).toFixed(1) }); od(p); };
    const oa = E.applyHit.bind(E);
    E.applyHit = (hit, pen, st, pos, dir, sp) => { rec.tankHit = { plate: hit.plateName || hit.zone, pen }; return oa(hit, pen, st, pos, dir, sp); };
    const od2 = g.world.destructibles.shellHit.bind(g.world.destructibles);
    g.world.destructibles.shellHit = (a, b, s) => { const r = od2(a, b, s); if (r && !rec.destruct) rec.destruct = { x: +b.x.toFixed(1), z: +b.z.toFixed(1) }; return r; };
    // 用原始弹着记录反推：开火
    P.dispersion = P.cfg.dispersion;   // 已收敛散布
    const shot = P.fire();
    if (!shot) return { err: 'fire() 返回 null（装填中？）' };
    g.shells.fire(shot);
    // 解析弹道复核（与 sim 同参）
    const v = shot.velocity, g9 = 9.8;
    const horiz = Math.hypot(shot.dir.x, shot.dir.z), vx = shot.dir.x * v, vy = shot.dir.y * v, vz = shot.dir.z * v;
    const pts = [];
    let minClear = Infinity;
    for (let t = 0; t < 4; t += 0.02) {
      const x = shot.pos.x + vx * t, z = shot.pos.z + vz * t, y = shot.pos.y + vy * t - 0.5 * g9 * t * t;
      const gy = g.world.groundY(x, z);
      if (y - gy < minClear) minClear = +(y - gy).toFixed(2);
      if (y <= gy) { pts.push({ groundAt: +Math.hypot(x - shot.pos.x, z - shot.pos.z).toFixed(0) }); break; }
      const dd = Math.hypot(x - c.ex, z - c.ez);
      if (dd < 6) { pts.push({ nearTargetAt: +Math.hypot(x - shot.pos.x, z - shot.pos.z).toFixed(0), y: +y.toFixed(2), ty: c.ty }); break; }
    }
    await new Promise(r => setTimeout(r, 3000));
    rec.traj = pts; rec.minTrajClear = minClear;
    rec.shellGone = g.shells.shells.length === 0;
    return rec;
  });
  console.log('FIRE_RESULT:', JSON.stringify(fireRes, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
