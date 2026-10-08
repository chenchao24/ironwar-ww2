// 三辆新车接入验证：车库装配 / 歼击车限角 / IS-2 大口径 HE / 近失弹 / 实战冒烟
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.error('PAGEERROR:', e.message.slice(0, 300)); });
  page.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.error('CONSOLE-ERR:', m.text().slice(0, 300)); } });

  const enterBattle = async (tank) => {
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
    await page.click('#screen-cover');
    await sleep(500);
    await page.evaluate((k) => { window.__game.ui.selectedTank = k; }, tank);
    await page.click('#btn-hunt-mode');
    await sleep(6500);
    await page.click('#screen-hangar [data-action="start"]');
    await sleep(7000);
  };

  // ── A) 车库装配断言 + 装甲板法线垂直入射（确定性） ──
  // 板表：[板名(断言), 板中心局部坐标, rot(度), 期望等效装甲=t]
  const PLATES = {
    marder3m: [
      ['首上', [0, 1.12, 1.93], [-53, 0, 0], 50],
      ['炮盾', [0, 1.95, -0.05], [-15, 0, 0], 50],
    ],
    jpz4l70: [
      ['战斗室正面', [0.8, 1.44, 2.55], [-50, 0, 0], 80],
      ['炮盾', [-0.22, 1.55, 2.56], [-41.5, 0, 0], 80],
    ],
    is2: [
      ['首上', [0, 1.19, 2.7], [-60, 0, 0], 120],
      ['炮塔正面', [-0.55, 2.04, 2.1], [-3.5, -59, 0], 150],
      ['炮盾', [0.02, 2.06, 2.38], [-3.5, 0, 0], 200],
    ],
    ferdinand: [
      // 炮盾行移除：炮盾距 200 墙仅 0.56m，垂直入射的 2m 回溯段必被 200 墙抢先——已在 plate-hit-test（yaw 0.3）覆盖
      ['战斗室正面', [0.8, 2.32, 0.09], [-19, 0, 0], 200],
    ],
    jagdpanther: [
      // 炮盾行移除：炮盾嵌于斜正面（面距 ~10cm），垂直入射 2m 回溯段边界极薄——由 plate-hit-test 覆盖
      ['战斗室斜正面', [0.8, 1.72, 2.3], [-55.5, 0, 0], 80],
    ],
    jagdtiger: [
      // 炮盾行移除：炮盾距 250 墙仅 ~0.64m，垂直入射回溯段必被抢先——同费迪南由 plate-hit-test 覆盖
      ['战斗室正面', [0.8, 2.3, 1.22], [-12, 0, 0], 250],
    ],
  };
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(6000);
  for (const k of ['marder3m', 'jpz4l70', 'is2', 'ferdinand', 'jagdpanther', 'jagdtiger']) {
    await page.evaluate((key) => { const g = window.__game; g.ui.selectedTank = key; g._loadTankThenShow(key); }, k);
    await sleep(3500);
    const st = await page.evaluate((plates) => {
      const t = window.__game.menuTank;
      const V3 = t.pos.constructor;
      const D2R = Math.PI / 180;
      const results = [];
      for (const [name, pos, rot, want] of plates) {
        // 板法线（与 tank.js _splitParts 同式）：(0,0,1) 经 rot 欧拉角
        const e = new (t.root.rotation.constructor)(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R);
        const n = new V3(0, 0, 1).applyEuler(e);
        const startW = t.root.localToWorld(new V3(pos[0] + n.x * 3, pos[1] + n.y * 3, pos[2] + n.z * 3));
        const dirW = n.clone().negate().applyQuaternion(t.root.getWorldQuaternion(new (t.root.quaternion.constructor)())).normalize();
        const hit = t.resolveHitZone(startW, dirW);
        results.push({
          name, got: hit ? (hit.plateName || hit.zone) : null,
          armor: hit ? Math.round(hit.armor) : null, want,
          ok: !!hit && (hit.plateName || hit.zone) === name && Math.abs(hit.armor - want) < 1,
        });
      }
      return {
        id: t && t.cfg.id, y: t ? +t.root.position.y.toFixed(2) : null,
        turret: t ? t.turretGroup.children.length : null,
        barrel: t ? t.barrelGroup.children.length : null,
        wheels: t ? t.wheelGroups.length : null,
        trackMats: t ? t.trackMaterials.length : null,
        mg: !!t.mgGroup, hullMg: !!t.hullMgGroup,
        plates: results,
      };
    }, PLATES[k]);
    console.log('GARAGE', k, '→', JSON.stringify(st));
    await page.screenshot({ path: `scripts/shot-nt-${k}.png` });
  }

  // ── B) 黄鼠狼实战：限角钳制（前/右/后）+ 无机枪 + 开炮 ──
  await enterBattle('marder3m');
  const marder = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    if (!p) return { err: 'no player' };
    for (const e of g.enemies) e.place(900, 900, 0);
    p.place(0, 0, 0);
    const V3 = p.pos.constructor;
    p.aimAt(new V3(300, 2, 0));                    // 正右方
    for (let i = 0; i < 600; i++) p.updateTurret(1 / 60);
    const yawSide = +p.turretYaw.toFixed(3);
    p.aimAt(new V3(0, 2, -300));                   // 正后方
    for (let i = 0; i < 600; i++) p.updateTurret(1 / 60);
    const yawBack = +p.turretYaw.toFixed(3);
    p.aimAt(new V3(0, 2, 500));                    // 正前
    for (let i = 0; i < 600; i++) p.updateTurret(1 / 60);
    const yawFront = +p.turretYaw.toFixed(3);
    const arc = p.cfg.casemate.arc * Math.PI / 180;
    const shot = p.fire();
    return {
      mg: !!p.mgGroup, hullMg: !!p.hullMgGroup,
      yawSide, yawBack, yawFront, arc: +arc.toFixed(3),
      clampOk: Math.abs(yawSide - arc) < 0.02 && Math.abs(Math.abs(yawBack) - arc) < 0.02 && Math.abs(yawFront) < 0.03,
      fired: !!shot, v: shot ? Math.round(shot.velocity) : null,
    };
  });
  console.log('MARDER_BATTLE', JSON.stringify(marder));
  await page.screenshot({ path: 'scripts/shot-nt-marder-battle.png' });

  // ── C) IS-2 实战：HE 威力参数 + 近失弹 + 装甲板 + JPZ 顺带 ──
  await enterBattle('is2');
  const is2 = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    if (!p) return { err: 'no is2 player' };
    const e = g.enemies[0];
    e.place(900, 900, 0);
    p.place(0, 0, 0);
    const V3 = p.pos.constructor;
    p.shellType = 'he';
    const shotHe = p.fire();
    const heInfo = shotHe ? { hePower: shotHe.hePower, nearMissR: shotHe.nearMissR, v: Math.round(shotHe.velocity), pen: +shotHe.pen.toFixed(1) } : null;
    p.shellType = 'ap';
    let shotAp = p.fire();
    if (!shotAp) { p.reload = 0; shotAp = p.fire(); }   // 17.5s 装填：重置后补发
    const apInfo = shotAp ? { v: Math.round(shotAp.velocity), pen: Math.round(shotAp.pen) } : null;
    p.shellType = 'he';
    // 装甲板：正前方首上（敌车在 +30m，弹从 +z 打向 -z；世界 y = 底盘高 + 板高）——须在近失弹掷骰前做
    e.place(0, 30, 0); e.root.updateMatrixWorld(true);
    const hit = e.resolveHitZone(new V3(0, e.root.position.y + 1.5, 32.9), new V3(0, 0, -1));
    const plateInfo = { enemy: e.cfg.id, frontPlate: hit ? (hit.plateName || hit.zone) : null, frontArmor: hit ? Math.round(hit.armor) : null };
    // 近失弹：敌车在爆点 2m 内，30 次掷骰统计事件
    e.place(3, 2, 0); e.root.updateMatrixWorld(true);
    const burst = { x: 1, y: 0, z: 2 };
    let evCount = 0;
    for (let i = 0; i < 30; i++) {
      e.mods.tracks = 0; e.crew.forEach(c => c.state = 0);
      const evs = e.applyHENearMiss(burst, shotHe);
      if (evs && evs.length) evCount++;
    }
    // 4m 外（半径边缘）应显著更少
    e.place(3, 2, 0); e.root.updateMatrixWorld(true);
    let evEdge = 0;
    for (let i = 0; i < 30; i++) {
      e.mods.tracks = 0; e.crew.forEach(c => c.state = 0);
      const evs = e.applyHENearMiss({ x: -1, y: 0, z: 4 }, shotHe);   // 距敌 ~5m 边缘
      if (evs && evs.length) evEdge++;
    }
    // 虚拟机枪
    const mgOk = !!p.mgGroup;
    return { heInfo, apInfo, plateInfo, nearMissClose: evCount, nearMissEdge: evEdge, mgOk };
  });
  console.log('IS2_BATTLE', JSON.stringify(is2));
  await page.screenshot({ path: 'scripts/shot-nt-is2-battle.png' });

  // ── D) 四歼 L/70 实战：hullMg + 限角 + 开炮 ──
  await enterBattle('jpz4l70');
  const jpz = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    if (!p) return { err: 'no jpz player' };
    for (const e of g.enemies) e.place(900, 900, 0);
    p.place(0, 0, 0);
    const V3 = p.pos.constructor;
    p.aimAt(new V3(0, 2, -300));
    for (let i = 0; i < 600; i++) p.updateTurret(1 / 60);
    const yawBack = +p.turretYaw.toFixed(3);
    const arc = p.cfg.casemate.arc * Math.PI / 180;
    p.aimAt(new V3(0, 2, 500));
    for (let i = 0; i < 600; i++) p.updateTurret(1 / 60);
    const shot = p.fire();
    return { hullMg: !!p.hullMgGroup, yawBack, arc: +arc.toFixed(3), clampOk: Math.abs(Math.abs(yawBack) - arc) < 0.02, fired: !!shot };
  });
  console.log('JPZ_BATTLE', JSON.stringify(jpz));
  await page.screenshot({ path: 'scripts/shot-nt-jpz-battle.png' });

  // ── E) 费迪南 / 猎豹 / 猎虎 实战：限角 + 机枪取舍 + 开炮 ──
  for (const [tank, expectMg, expectHullMg] of [['ferdinand', false, false], ['jagdpanther', true, false], ['jagdtiger', false, true]]) {
    await enterBattle(tank);
    const st = await page.evaluate(() => {
      const g = window.__game;
      const p = g.player;
      if (!p) return { err: 'no player' };
      for (const e of g.enemies) e.place(900, 900, 0);
      p.place(0, 0, 0);
      const V3 = p.pos.constructor;
      p.aimAt(new V3(0, 2, -300));
      for (let i = 0; i < 600; i++) p.updateTurret(1 / 60);
      const yawBack = +p.turretYaw.toFixed(3);
      const arc = p.cfg.casemate.arc * Math.PI / 180;
      p.aimAt(new V3(0, 2, 500));
      for (let i = 0; i < 600; i++) p.updateTurret(1 / 60);
      const shot = p.fire();
      return {
        id: p.cfg.id, mg: !!p.mgGroup, hullMg: !!p.hullMgGroup,
        wheels: p.wheelGroups.length, yawBack, arc: +arc.toFixed(3),
        clampOk: Math.abs(Math.abs(yawBack) - arc) < 0.02, fired: !!shot,
        v: shot ? Math.round(shot.velocity) : null,
      };
    });
    st.mgOk = st.mg === expectMg && st.hullMg === expectHullMg;
    console.log('TD_BATTLE', JSON.stringify(st));
    await page.screenshot({ path: `scripts/shot-nt-${tank}-battle.png` });
  }

  console.log('TOTAL_ERRORS:', errs.length);
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
