// 弹着尘堆回归：0.5s 延迟生成 / 口径范围 / 前慢后快消退 / 同向漂移 / 地面+坦克双命中 / 零报错
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  const fails = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  const ck = (name, v) => { console.log((v ? 'OK  ' : 'FAIL') + ' ' + name); if (!v) fails.push(name); };

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 60000 });
  await sleep(1500);

  // ── A. 地面命中（虎式 88mm：R=12.45×0.8≈10.0，主柱 n≈46 + 底部基础云 n≈17）──
  const a1 = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    for (const e of g.enemies) e.place(900, 900, 0);
    p.place(0, 0, 0);
    const V3 = p.pos.constructor;
    p.aimAt(new V3(55, 0, 0));
    for (let i = 0; i < 400; i++) p.updateTurret(1 / 60);
    const cnt0 = (() => { const q = g.ps.pools.smoke; let c = 0; for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i]) c++; return c; })();
    p.reload = 0; g.shells.fire(p.fire());   // p.fire() 只产数据，须注册进 ShellManager 才飞行
    return { cnt0, cal: p.cfg.gunCaliber };
  });
  await sleep(250);
  const a2 = await page.evaluate(() => window.__game.effects._delayed.length);
  ck('A1 命中后 0.5s 内尘堆排队待生成', a2 >= 1);
  await sleep(1200);
  const a3 = await page.evaluate(() => {
    const g = window.__game, q = g.ps.pools.smoke;
    let c = 0, mn = 1e9, mx = 0;
    for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i]) {
      c++;
      if (q.maxLife[i] >= 9.5) { mn = Math.min(mn, q.maxLife[i]); mx = Math.max(mx, q.maxLife[i]); }
    }
    return { cnt: c, delayed: g.effects._delayed.length, lmin: mn, lmax: mx };
  });
  ck('A2 尘堆已生成（延迟队列清空、烟粒子净增 ≥35）', a3.delayed === 0 && a3.cnt - a1.cnt0 >= 35);
  ck('A3 尘堆寿命 10~15s（实测 ' + a3.lmin.toFixed(1) + '~' + a3.lmax.toFixed(1) + 's，旧 20~30s）', a3.lmin >= 9.5 && a3.lmax <= 15.5);
  const LMAIN = a3.lmax;   // 主柱寿命（单次抽取全柱共享；底部基础云为 0.85~1.0 倍散布，据此区分主柱团）

  await sleep(1000);
  // ── B0. 腾起高度：出生 ~1.9s（腾起 ~2s 到顶）尘柱最高团 ≥4.5m（峰目标 7~10m；旧版峰 2.5~3m 必挂）。
  //        必须在截图前测——截图耗时数百毫秒，柱团过顶下落会污染测量 ──
  const b0 = await page.evaluate((lm) => {
    const q = window.__game.ps.pools.smoke;
    let maxY = 0;
    for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i] && Math.abs(q.maxLife[i] - lm) < 0.01 && q.px[i * 3 + 1] > maxY) maxY = q.px[i * 3 + 1];
    return maxY;
  }, LMAIN);
  ck(`B0 地面腾起中尘柱已升高（+1.9s 最高 ${b0.toFixed(1)}m ≥ 4.5m，峰目标 7~10m）`, b0 >= 4.5);

  await page.evaluate(() => { window.__game.rig.aimYaw = Math.PI / 2; });   // 相机转向尘堆（+x）
  await sleep(700);
  await page.screenshot({ path: 'scripts/shot-dustmound-ground.png' });

  // ── B1. 消退曲线：前 1.5s α 降幅 <12%（1-t^2.5 前慢后快；只测主柱团，排除基础云的短寿命散布）──
  const b1 = await page.evaluate((lm) => {
    const q = window.__game.ps.pools.smoke;
    let s = 0, n = 0;
    for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i] && Math.abs(q.maxLife[i] - lm) < 0.01) { s += q.pd[i * 4 + 1]; n++; }
    return { avg: s / Math.max(1, n), n };
  }, LMAIN);
  await sleep(1500);
  const b2 = await page.evaluate((lm) => {
    const q = window.__game.ps.pools.smoke;
    let s = 0, n = 0;
    for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i] && Math.abs(q.maxLife[i] - lm) < 0.01) { s += q.pd[i * 4 + 1]; n++; }
    return { avg: s / Math.max(1, n) };
  }, LMAIN);
  const dropFrac = 1 - b2.avg / b1.avg;
  ck(`B1 前 1.5s 消退缓慢（降幅 ${(dropFrac * 100).toFixed(1)}% < 12%，线性应 ~12%）`, b1.n > 20 && dropFrac < 0.12);

  // ── C. 同向漂移：尘堆质心沿风向移动（2.5s 内 ~0.1m 级——落地反弹阻尼水平速度，比悬浮期慢，属自然）──
  const c1 = await page.evaluate(() => {
    const q = window.__game.ps.pools.smoke;
    let cx = 0, cz = 0, n = 0;
    for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i] && q.maxLife[i] > 9) { cx += q.px[i * 3]; cz += q.px[i * 3 + 2]; n++; }
    return { cx: cx / n, cz: cz / n, n };
  });
  await sleep(2500);
  const c2 = await page.evaluate(() => {
    const q = window.__game.ps.pools.smoke;
    let cx = 0, cz = 0, n = 0;
    for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i] && q.maxLife[i] > 9) { cx += q.px[i * 3]; cz += q.px[i * 3 + 2]; n++; }
    return { cx: cx / n, cz: cz / n };
  });
  const driftNow = Math.hypot(c2.cx - c1.cx, c2.cz - c1.cz);
  const driftDirOk = (c2.cx - c1.cx) * 0.9 + (c2.cz - c1.cz) * 0.35 > 0;   // 与 WIND(0.9,0.35) 同向
  ck(`C1 尘堆沿风向漂移（2.5s 位移 ${driftNow.toFixed(2)}m，方向一致）`, driftNow > 0.04 && driftNow < 2 && driftDirOk);

  // ── D. 坦克命中：敌车放正前 40m，HE 直击 → 尘堆排队 ──
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const e = g.enemies[0];
    e.place(40, 0, 0); e.root.updateMatrixWorld(true);
    const V3 = p.pos.constructor;
    p.shellType = 'he';
    p.aimAt(new V3(40, 1.5, 0));
    for (let i = 0; i < 400; i++) p.updateTurret(1 / 60);
    p.reload = 0; g.shells.fire(p.fire());
  });
  await sleep(600);
  const d1 = await page.evaluate(() => window.__game.effects._delayed.length);
  ck('D1 坦克命中也排队尘堆', d1 >= 1);
  await sleep(1500);
  await page.evaluate(() => { window.__game.rig.aimYaw = Math.PI / 2; });
  await sleep(700);
  await page.screenshot({ path: 'scripts/shot-dustmound-tank.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL PASS');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
