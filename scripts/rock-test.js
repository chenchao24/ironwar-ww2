// 巨石/干草堆/判定半径回归：巨石击毁废墟贴地、炮弹椭球判定（角部不穿模）、
// 碰撞体唯一性（摧毁后无残留空气墙）、散石总数、灌木遮挡圆半径上限
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
  await sleep(1500);

  const res = await page.evaluate(async () => {
    const THREE = await import('./node_modules/three/build/three.module.js');
    const g = window.__game, des = g.world.destructibles;
    const rocks = des.list.filter(d => d.type === 'boulder' && d.alive);
    const rockObstacles = g.world.obstacles.filter(o => o.kind === 'rock').length;

    // 碰撞体唯一性：每块石中心 0.5m 内应恰好 1 个 obstacle（旧版 registerGroup + 手动 addObstacle 双重注册）
    let doubleReg = 0;
    for (const r of rocks) {
      const n = g.world.obstacles.filter(o => Math.hypot(o.x - r.cx, o.z - r.cz) < 0.5).length;
      if (n !== 1) doubleReg++;
    }

    const r0 = rocks[0];
    const gy = des.groundY(r0.cx, r0.cz);
    const yMid = gy + (r0.box.max.y - gy) * 0.6;   // 露出地面段中部
    // 椭球判定：穿过中心的水平射线应命中
    const hitCenter = des.shellHit(new THREE.Vector3(r0.cx - 30, yMid, r0.cz), new THREE.Vector3(r0.cx + 30, yMid, r0.cz), null);
    // 包围盒角部（盒内、椭球外）的短线段不应命中（旧 AABB 判定会命中 = 空气墙）
    const hx = (r0.box.max.x - r0.box.min.x) / 2, hz = (r0.box.max.z - r0.box.min.z) / 2;
    const corner = new THREE.Vector3(r0.cx + hx * 0.85, r0.box.max.y - 0.3, r0.cz + hz * 0.85);
    const hitCorner = des.shellHit(corner, corner.clone().add(new THREE.Vector3(0.4, 0.05, 0.3)), null);

    // 击毁 → 废墟贴地检查（底面应在地表附近，不悬浮）
    for (let i = 0; i < 8 && r0.alive; i++) {
      des.damageDestructible(r0, new THREE.Vector3(r0.cx, yMid, r0.cz), 'he');
    }
    let rubble = null;
    if (!r0.alive) {
      r0.group.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(r0.group);
      const bottomGap = +(bb.min.y - gy).toFixed(2);
      const topH = +(bb.max.y - gy).toFixed(2);
      // 摧毁后碰撞体应摘除（rubbleH 0.6 < 1.5 → 可通行），不残留空气墙
      const obstacleLeft = g.world.obstacles.some(o => Math.hypot(o.x - r0.cx, o.z - r0.cz) < 0.5);
      rubble = { bottomGap, topH, obstacleLeft };
    }
    return {
      rocks: rocks.length, rockObstacles, doubleReg,
      hitCenter, hitCorner, rubble,
      hedgeSightMaxR: +Math.max(...g.world.hedgeField._sight.map(s => s.r)).toFixed(2),
      haystacks: des.list.filter(d => d.type === 'haystack').length,
    };
  });
  console.log('ROCK:', JSON.stringify(res));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
