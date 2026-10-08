// 综合验证：①炮弹越过装甲板缝不再被吸附（不再卡成空中光柱） ②AI 顶石头后倒车脱困
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  // ── ①炮弹板缝穿过：朝敌车包围球内、装甲板上方的空档射击，断言炮弹直接飞过不滞留 ──
  const r1 = await page.evaluate(() => {
    const g = window.__game;
    g.ais.forEach(ai => { ai._orig = ai.update; ai.update = () => {}; });
    for (const e of g.enemies) { e._origDrive = e.drive; e.drive = () => {}; e.throttle = 0; e.steer = 0; e.speed = 0; }
    const e = g.enemies[0];
    const p = g.player;
    const V = Object.getPrototypeOf(p.root.position).constructor;
    const c = e.root.position.clone(); c.y += e.cfg.dims.hullHeight * 0.7;
    const target = c.clone(); target.y += 2.9;   // 包围球内（r≈3.5）、车顶之上 → 板缝
    const from = p.root.position.clone(); from.y += 2.2;
    const dir = target.clone().sub(from).normalize();
    const firedAt = performance.now();
    g.shells.fire({ pos: from, dir, velocity: 800, pen: 200, penDrop: 0, owner: p, shellType: 'ap', spall: 100 });
    return { firedAt };
  });
  // 采样 3 秒：记录炮弹位置是否移动、何时消失
  const track = [];
  for (let i = 0; i < 6; i++) {
    await sleep(500);
    track.push(await page.evaluate(() => {
      const s = window.__game.shells.shells[0];
      return s ? [+s.pos.x.toFixed(1), +s.pos.y.toFixed(1), +s.pos.z.toFixed(1)] : null;
    }));
  }
  const frozen = track.filter(Boolean).length >= 3 &&
    JSON.stringify(track.filter(Boolean).slice(-2)[0]) === JSON.stringify(track.filter(Boolean).slice(-1)[0]);
  console.log('①板缝穿过: 轨迹采样', JSON.stringify(track), frozen ? '→ 卡住（BUG）' : '→ 飞过/已消失（OK）');

  // ── ②AI 顶石头脱困：把敌车车头怼进最大障碍石，恢复 AI，观察是否倒车脱困 ──
  const r2 = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies[0], ai = g.ais[0];
    if (ai._orig) ai.update = ai._orig;   // 恢复 AI
    if (e._origDrive) e.drive = e._origDrive;   // 恢复行驶
    e.modules.breech.hp = 0;              // 炮闩损坏 → 不开火（只测驾驶）
    ai._patrolT = 999;                    // 巡逻超时 → 立即向玩家方向行驶（巡逻分支也走脱困逻辑）
    const obs = g.world.obstacles.slice().sort((a, b) => b.r - a.r)[0];
    const p = g.player;
    // 车头怼进石头（鼻端没入障碍半径内），玩家在同侧：AI 想接近玩家会先顶住石头
    const dx = obs.x - p.root.position.x, dz = obs.z - p.root.position.z;
    const L = Math.hypot(dx, dz);
    const px = obs.x + dx / L * (obs.r + 1.5), pz = obs.z + dz / L * (obs.r + 1.5);
    const yawToRock = Math.atan2(obs.x - px, obs.z - pz);
    e.place(px, pz, yawToRock * 180 / Math.PI);   // 车头朝石头
    return { obs: { x: +obs.x.toFixed(0), z: +obs.z.toFixed(0), r: +obs.r.toFixed(1) },
             start: [+px.toFixed(1), +pz.toFixed(1)], enemy: e.cfg.id };
  });
  console.log('②AI脱困: 障碍', JSON.stringify(r2.obs), '敌车', r2.enemy, '起点', r2.start);
  let minSpeed = 0, maxMove = 0, maxStall = 0, stall = 0, lastMove = 0;
  const p0 = r2.start;
  for (let i = 0; i < 50; i++) {
    await sleep(500);
    const s = await page.evaluate(() => {
      const e = window.__game.enemies[0], ai = window.__game.ais[0];
      return { x: e.root.position.x, z: e.root.position.z, speed: e.speed, hdg: e.heading,
               bp: ai._bypassT > 0 ? `${ai._bypassX.toFixed(0)},${ai._bypassZ.toFixed(0)} (${ai._bypassT.toFixed(1)}s)` : '-',
               unstick: +(ai._unstickT > 0), state: ai.state };
    });
    minSpeed = Math.min(minSpeed, s.speed);
    const mv = Math.hypot(s.x - p0[0], s.z - p0[1]);
    maxMove = Math.max(maxMove, mv);
    // 位移仍在变化 → 未困死；停滞计时（>1m 位移变化即清零）
    if (Math.abs(mv - lastMove) > 1) { lastMove = mv; stall = 0; } else { stall += 0.5; maxStall = Math.max(maxStall, stall); }
    if (i % 2 === 0 || s.unstick) console.log(`   t=${(i * 0.5).toFixed(1)}s speed=${s.speed.toFixed(1)} unstick=${s.unstick} state=${s.state} 位移=${mv.toFixed(1)}m  pos=(${s.x.toFixed(1)},${s.z.toFixed(1)}) hdg=${s.hdg.toFixed(2)} bp=(${s.bp})`);
  }
  console.log(`②结果: 最大位移 ${maxMove.toFixed(1)}m, 最低速度 ${minSpeed.toFixed(1)}（倒车证据）, 最长停滞 ${maxStall.toFixed(1)}s`,
    maxMove > 15 ? '→ 脱困 OK' : '→ 仍卡死（BUG）');
  await browser.close();
})();
