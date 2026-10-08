// 拟真弹道命中率基准（2026-09-19 散布改造配套）：静止全收敛 + 真实高斯散布（fire() 全链路），
// 在 400/600/800/1000m 视线&弹道双净空的直线上连射，统计命中板率。
// 用法：node scripts/ballistic-hitrate.js [发数=25]（默认玩家当前车型；输出含 σ@距离换算）
const puppeteer = require('puppeteer-core');

const N = parseInt(process.argv[2] || '25', 10);
const TANK = process.argv[3] || null;   // 可选：目标车型 key（走车库 _cycleHangar 真实装载）
const DISTANCES = [400, 600, 800, 1000];

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
  if (TANK) {
    const picked = await page.evaluate(async (key) => {
      const g = window.__game;
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let guard = 0;
      while (g.ui.selectedTank !== key && guard++ < 24) {
        g._cycleHangar(1);
        await wait(300);
        let busy = 0;
        while (g._hangarBusy && busy++ < 300) await wait(100);
      }
      return g.ui.selectedTank;
    }, TANK);
    if (picked !== TANK) console.error(`WARN: 车库未能切到 ${TANK}（当前 ${picked}）`);
  }
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4000));
  // 镜位：准星射线与瞄具同源（追尾相机会锁空）；主循环每帧回写 rig 状态——须设 input 闩锁
  await page.evaluate(() => { window.__game.input.aiming = true; });

  const setup = await page.evaluate(() => {
    const g = window.__game, P = g.player, E = g.enemies[0];
    window.__hits = 0;
    window.__dirt = [];
    g.ais.forEach(a => { a.update = () => {}; });   // 冻结 AI（目标静止不还手）
    E.applyHit = () => { window.__hits++; return { type: 'bounce', events: [] }; };   // 命中板计数，不掉血不摧毁
    const od = g.effects.dirtHit.bind(g.effects);
    g.effects.dirtHit = (p, k) => { window.__dirt.push({ x: p.x, z: p.z }); od(p, k); };
    return { pid: P.cfg.id, sigma: P.cfg.dispersion, pen: P.cfg.shellPen };
  });
  console.log(`车型 ${setup.pid}  σ=${setup.sigma} rad  每距 ${N} 发（AP ${setup.pen}mm）`);

  for (const D of DISTANCES) {
    const res = await page.evaluate((D, N) => {
      const g = window.__game, P = g.player, E = g.enemies[0], w = g.world;
      const V3 = g.rig.farPoint.constructor;
      const sy = () => w.groundY(P.pos.x, P.pos.z) + P.cfg.dims.hullHeight + 1.2;
      const tyOf = () => w.groundY(E.pos.x, E.pos.z) + E.cfg.dims.hullHeight * 0.55;
      // 找一条 视线净空(≥0.5m) + 弹道净空(炮口→敌车无擦地) 的射线
      let found = null;
      outer:
      for (let k = 0; k < 64; k++) {
        const ang = k / 64 * Math.PI * 2;
        const ex = Math.cos(ang) * D, ez = Math.sin(ang) * D;
        P.place(0, 0, 0); E.place(ex, ez, 0);
        const s0 = sy(), t0 = tyOf();
        let minClear = Infinity;
        const steps = Math.floor(D / 3);
        for (let i = 2; i < steps; i++) {
          const t = i / steps;
          const c = (s0 + (t0 - s0) * t) - w.groundY(ex * t, ez * t);
          if (c < minClear) minClear = c;
        }
        if (minClear < 0.5) continue;
        const mz = new V3(), md = new V3();
        P.getMuzzle(mz, md);
        if (g._trajectoryContact(mz, new V3(ex, t0, ez), P.shellVelocityOf())) continue;
        // 可破坏物避障：射线段距 group/inst 中心 < 半径+2m → 换角度（石/树/房挡弹不挡瞄）
        let blocked = false;
        for (const dd of (w.destructibles ? w.destructibles.list : [])) {
          if (!dd.alive) continue;
          const cx = dd.cx !== undefined ? dd.cx : dd.x, cz = dd.cz !== undefined ? dd.cz : dd.z;
          const rr = (dd.radius || dd.boundR || 4) + 2;
          const L2 = ex * ex + ez * ez;
          const t = Math.max(0, Math.min(1, (cx * ex + cz * ez) / L2));
          const ddx = cx - ex * t, ddz = cz - ez * t;
          if (ddx * ddx + ddz * ddz < rr * rr) { blocked = true; break; }
        }
        if (blocked) continue;
        found = { ex, ez };
        break;
      }
      if (!found) return { skip: true };
      // 重置悬挂/姿态：上距连射的 susPitchV 踢累积累会让模型俯仰大摆，炮塔伺服够不到目标
      P.susPitch = 0; P.susRoll = 0; P.susPitchV = 0; P.susRollV = 0;
      P.accelSm = 0; P.speed = 0;
      P._syncTransform(1);
      // 瞄准收敛（敌车中心）
      const dx = found.ex, dz = found.ez;
      const dy = tyOf() - sy();
      g.rig.aimYaw = Math.atan2(dx, dz);
      g.rig.aimPitch = Math.asin(dy / Math.hypot(dx, dz, dy));
      P.aimAt(new V3(found.ex, tyOf(), found.ez));
      // 先执行后判断：place/主循环遗留的 aimOffset≈0 会让条件先行版一次都不跑（炮塔不转）
      for (let i = 0; i < 2400; i++) {
        P.updateTurret(1 / 60);
        if (P.aimOffset < 0.0004) break;
      }
      window.__dirt.length = 0;
      const hits0 = window.__hits;
      for (let n = 0; n < N; n++) {
        P.reload = 0;
        P.shellPool.ap = 999;
        P.dispersion = P.cfg.dispersion;   // 静止全收敛档
        const shot = P.fire();
        if (!shot) break;
        g.shells.fire(shot);
        for (let s = 0; s < 320 && g.shells.shells.length; s++) g.shells.update(1 / 60);
      }
      return { hits: window.__hits - hits0, aimOffset: +P.aimOffset.toFixed(5) };
    }, D, N);
    if (res.skip) { console.log(`${String(D).padStart(4)}m  ✗ 未找到双净空射线，跳过`); continue; }
    const stats = await page.evaluate(() => {
      const E = window.__game.enemies[0];
      const ds = window.__dirt.map(p => Math.hypot(p.x - E.pos.x, p.z - E.pos.z)).sort((a, b) => a - b);
      return ds.length ? { med: ds[ds.length >> 1], max: ds[ds.length - 1] } : null;
    });
    const pct = (res.hits / N * 100).toFixed(0);
    const sig = (setup.sigma * D).toFixed(2);
    console.log(`${String(D).padStart(4)}m  命中 ${res.hits}/${N} = ${pct}%   σ@${D}m=±${sig}m   aimOffset=${res.aimOffset}` +
      (stats ? `   脱靶弹距目标中位 ${stats.med}m / 最远 ${stats.max}m` : ''));
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
