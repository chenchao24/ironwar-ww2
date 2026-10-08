// 大口径 HE 方案 C 验收（docs/heavy-he-damage-plan.md 第四节）：
// ① IS-2 级 122mm HE（hePower 2.2）未击穿虎式厚甲 ×300 采样：崩落/结构伤/乘员伤亡率断言
// ② 对照 88mm HE（hePower 1）×100：零崩落、零方向机/发动机伤（与改前逐字节一致）
// 用法：node scripts/heavy-he-test.js  （需 server.js 运行于 8081）
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  // 固定敌方编队为虎式（厚甲标靶）
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('ironwar3_settings', JSON.stringify({ enemyTanks: ['tiger1'], factionLock: false }));
  });

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 1500));
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.enemies && window.__game.enemies.length > 0, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  const out = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies[0];
    const V = g.player.pos.constructor;
    if (e.cfg.id !== 'tiger1') return { fatal: 'enemy is not tiger1: ' + e.cfg.id };

    // 找一处厚甲命中（≥90mm）：车体/炮塔正面四向试射
    let hit = null, pt = null, dir = null;
    outer:
    for (const y of [1.0, 1.3, 2.2, 2.4]) {
      for (const d of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]) {
        const p = e.root.position.clone(); p.y += y;
        const h = e.resolveHitZone(p, new V(...d));
        if (h && h.armor >= 90) { hit = h; pt = p; dir = new V(...d); break outer; }
      }
    }
    if (!hit) return { fatal: 'no thick plate hit found' };

    // 状态快照（每次采样后还原，保证独立同分布）
    const hp0 = {}; for (const k in e.modules) hp0[k] = e.modules[k].hp;
    const reset = () => {
      e.crew.forEach((c) => { c.state = 0; });
      for (const k in e.modules) e.modules[k].hp = hp0[k];
      e.mods.tracks = 0;
      e.destroyed = false;
      if ('bailed' in e) e.bailed = false;
      if ('burning' in e) e.burning = false;
      if ('fireT' in e) e.fireT = 0;
    };
    const sample = (shell, n) => {
      let scab = 0, crewEv = 0, struct = 0, anyEv = 0, track = 0, other = {};
      for (let i = 0; i < n; i++) {
        reset();
        const res = e.applyHit(hit, 10, 'he', pt, dir, 150, shell);
        const evs = res.events || [];
        if (evs.length) anyEv++;
        if (evs.some((ev) => ev.type === 'crew')) crewEv++;
        if (evs.some((ev) => (ev.label || '').includes('崩落'))) scab++;
        if (evs.some((ev) => ev.mod === 'tracks')) track++;
        if (e.modules.turretDrive.hp < hp0.turretDrive || e.modules.engine.hp < hp0.engine) struct++;
        for (const ev of evs) { const l = (ev.label || '?'); other[l] = (other[l] || 0) + 1; }
      }
      reset();
      return { n, scab, crewEv, struct, anyEv, track, other };
    };

    const big = sample({ hePower: 2.2, nearMissR: 4 }, 300);   // 122mm D-25T（IS-2）
    const ctrl = sample({ hePower: 1, nearMissR: 2 }, 100);    // 88mm 对照（行为应与改前一致）
    return {
      armor: hit.armor, isTurret: !!hit.isTurret, zone: hit.zone, plate: hit.plateName || null,
      big, ctrl,
    };
  });
  console.log('SAMPLE:', JSON.stringify(out, null, 1));

  // ── 断言 ──
  const fails = [];
  const A = (cond, msg) => { if (!cond) fails.push(msg); };
  if (out.fatal) { fails.push(out.fatal); }
  else {
    const { armor, isTurret, big, ctrl } = out;
    const P = 2.2, thinWound = 30 + (P - 1) * 27;   // 62.4
    A(big.struct / big.n > 0.15 && big.struct / big.n < 0.85,
      `big struct rate ${(big.struct / big.n).toFixed(2)} out of [0.15,0.85]`);
    if (armor > thinWound) {
      const exp = Math.min(0.65, 0.12 * (P - 1) + 0.002 * armor);
      const got = big.scab / big.n;
      A(Math.abs(got - exp) <= 0.12, `scab rate ${got.toFixed(2)} vs expected ${exp.toFixed(2)} (±0.12)`);
      A(big.crewEv / big.n > 0.05, `big crew casualty rate too low: ${(big.crewEv / big.n).toFixed(2)}`);
    }
    // 对照组（hePower 1）：零崩落、零方向机/发动机伤（回归保护硬断言）
    A(ctrl.scab === 0, `ctrl scab events ${ctrl.scab} !== 0 (P=1 must never scab)`);
    A(ctrl.struct === 0, `ctrl struct damage ${ctrl.struct} !== 0 (P=1 must never hurt turretDrive/engine)`);
  }

  console.log('CONSOLE ERRORS (' + errors.length + '):');
  errors.slice(0, 10).forEach((e) => console.log('  ', e.slice(0, 300)));
  await browser.close();
  if (fails.length) { console.log('FAIL:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('HEAVY-HE TEST: ALL PASS');
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
