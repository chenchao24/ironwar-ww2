// 车姿显示器回归：①炮塔朝上/车体相对旋转跟随 ②受击标记（hull-local、颜色分档、2.6s 淡出）
//                   ③歼击车射界弧标记 ④右下油门区左侧布局截图
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 150)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => { window.__game.ais.forEach(a => { a.update = () => {}; }); });

  // ① 结构存在
  const built = await page.evaluate(() => !!document.querySelector('#attitude svg #att-hull')
    && !!document.getElementById('att-name') && !!document.getElementById('att-inner')
    && !!document.getElementById('att-gunline') && !!document.getElementById('att-sector'));
  console.log('BUILD:', built ? '✓ 容器+SVG 已构建（含装饰圈/炮线/扇形）' : '✗ 缺失');

  // ② 车体姿态显示：瞄准线偏 +0.5rad（炮塔指向车体右侧）→ 车体轮廓 rotate≈+28.6°（同侧摆动）
  await page.evaluate(() => {
    const g = window.__game, P = g.player;
    g.rig.aimYaw = P.heading + 0.5;
  });
  await new Promise(r => setTimeout(r, 4000));
  const rot = await page.evaluate(() => {
    const g = window.__game;
    const tr = document.getElementById('att-hull').getAttribute('transform') || '';
    const turretTr = document.getElementById('att-turret').getAttribute('transform');
    return { turretYaw: +g.player.turretYaw.toFixed(3), transform: tr, turretTr,
      name: document.getElementById('att-name').textContent,
      sector: document.getElementById('att-sector').style.display !== 'none',
      angleGone: !document.getElementById('att-angle') && !document.getElementById('att-cap') };
  });
  const deg = rot.turretYaw * 180 / Math.PI;
  const m = /rotate\((-?[\d.]+) /.exec(rot.transform);
  const shown = m ? parseFloat(m[1]) : null;
  console.log('ROTATE:', JSON.stringify(rot),
    shown != null && Math.abs(shown - deg) < 3 && Math.abs(deg) > 20 && !rot.turretTr && rot.angleGone && rot.name === 'Tiger I' && rot.sector
      ? '✓ 炮塔朝上参考/车体同侧摆动/车名/观测扇形/文字已去' : '✗ 旋转或文本不符');

  // ③ 受击标记：车体正前方 2.5m 处命中（pen 红）→ hull-local (0, 2.5)
  const hitRes = await page.evaluate(() => {
    const g = window.__game, P = g.player, V3 = g.rig.farPoint.constructor;
    const f = new V3(Math.sin(P.heading), 0, Math.cos(P.heading));
    const pos = P.root.position.clone().addScaledVector(f, 2.5);
    g.shells.onPlayerHit('pen', new V3(0, 0, 1), null, null, pos);
    g.shells.onPlayerHit('bounce', new V3(0, 0, 1), { type: 'splash' }, null, pos.clone());   // 溅射 → 橙
    const hits = [...document.querySelectorAll('#att-hits circle')];
    return { n: hits.length, fills: hits.map(h => h.getAttribute('fill')),
      front: hits.length ? Math.abs(parseFloat(hits[0].getAttribute('cy')) - 56.3) < 6 : false };
  });
  console.log('HIT_MARK:', JSON.stringify(hitRes),
    hitRes.n === 2 && hitRes.fills[0] === '#ff5a3c' && hitRes.fills[1] === '#ffb14a' && hitRes.front ? '✓ 命中点+颜色分档' : '✗ 标记不符');

  // 截图（右下角区域：姿态表 + 油门集群）
  await page.screenshot({ path: 'scripts/shot-attitude-hit.png', clip: { x: 1600 - 430, y: 900 - 300, width: 430, height: 300 } });

  // ④ 淡出：2.8s 后标记应清空
  await new Promise(r => setTimeout(r, 2800));
  const faded = await page.evaluate(() => document.querySelectorAll('#att-hits circle').length);
  console.log('FADE:', faded === 0 ? '✓ 标记已淡出清除' : `✗ 残留 ${faded}`);

  // ⑤ 歼击车射界弧标记 + 卡限位提亮 + 观察视野扇形（合成参数直接喂 updateAttitude，逻辑同源）
  const arc = await page.evaluate(() => {
    const ui = window.__game.ui;
    const fake = { cfg: { casemate: { arc: 10.5 }, nameEn: 'Marder III M' }, turretYaw: 10.4 * Math.PI / 180, heading: 0 };   // 卡在弧缘
    ui.updateAttitude(fake, 0.35);   // 视线偏 +0.35rad、FoV 62
    const lines = document.querySelectorAll('#att-arc line').length;
    const clampAtEdge = document.getElementById('att-arc').classList.contains('clamp');
    const coneShown = document.getElementById("att-sector").style.display !== "none";
    const coneTr = document.getElementById("att-sector").getAttribute("transform") || '';
    const hullTr = document.getElementById('att-hull').getAttribute('transform') || '';
    fake.turretYaw = 0.1;
    ui.updateAttitude(fake, 0.35);
    const clampMid = document.getElementById('att-arc').classList.contains('clamp');
    const name = document.getElementById('att-name').textContent;
    ui._setAttitudeArc({ cfg: {} });   // 还原：无歼击车 → 无弧标记
    return { lines, clampAtEdge, clampMid, coneShown, coneTr, hullTr, name };
  });
  console.log('ARC:', JSON.stringify(arc),
    arc.lines === 2 && arc.clampAtEdge && !arc.clampMid && arc.coneShown && /rotate\(-9\./.test(arc.coneTr)
      && /rotate\(10\.4 /.test(arc.hullTr) && arc.name === 'Marder III M'
      ? '✓ 射界弧 + 卡缘提亮 + 视野扇形（炮线相对方位）+ 车体摆动' : '✗ 弧/扇形不符');

  // ⑥ 实战视觉：给当前车临时挂 casemate 配置（主循环每帧按 cfg 重绘），拖炮到弧缘 → 截图
  await page.evaluate(() => {
    const g = window.__game;
    g.player.cfg.casemate = { arc: 10.5 };
    g.rig.aimYaw = g.player.heading + 0.30;   // 远超 ±10.5° → 炮卡弧缘
  });
  await new Promise(r => setTimeout(r, 5000));
  const clampLive = await page.evaluate(() => ({
    yaw: +(window.__game.player.turretYaw * 180 / Math.PI).toFixed(1),
    clamp: document.getElementById('att-arc').classList.contains('clamp'),
    lines: document.querySelectorAll('#att-arc line').length,
    sector: document.getElementById('att-sector').style.display !== 'none',
  }));
  console.log('CLAMP_LIVE:', JSON.stringify(clampLive),
    clampLive.lines === 2 && clampLive.clamp && clampLive.sector && Math.abs(clampLive.yaw) <= 11 ? '✓ 实战卡缘提亮+观测扇形' : '(检查)');
  await page.screenshot({ path: 'scripts/shot-attitude-casemate.png', clip: { x: 1600 - 430, y: 900 - 300, width: 430, height: 300 } });
  await page.screenshot({ path: 'scripts/shot-minimap-casemate.png', clip: { x: 1600 - 300, y: 0, width: 300, height: 300 } });   // 小地图（右上）射界扇形
  await page.evaluate(() => { delete window.__game.player.cfg.casemate; });   // 还原

  console.log('CONSOLE ERRORS:', errors.length, errors.slice(0, 3));
  await browser.close();
  if (errors.length) process.exit(1);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
