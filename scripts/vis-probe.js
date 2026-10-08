const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
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

  const res = await page.evaluate(() => {
    const g = window.__game, w = g.world, vis = g.visibility, P = g.player, E = g.enemies[0];
    // 线段与圆相交，返回最近接近点参数 t（未相交 -1）——对齐 visibility._segCircleT
    const segCircleT = (ax, az, bx, bz, cx, cz, r) => {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      if (l2 < 1e-6) return -1;
      const t = ((cx - ax) * dx + (cz - az) * dz) / l2;
      if (t < 0 || t > 1) return -1;
      const px = ax + dx * t - cx, pz = az + dz * t - cz;
      return px * px + pz * pz < r * r ? t : -1;
    };
    const segCircle = (ax, az, bx, bz, cx, cz, r) => segCircleT(ax, az, bx, bz, cx, cz, r) >= 0;
    // 预测：复刻 _los（地形步进 + 障碍 + 软遮挡，含 topY 高度规则）
    const predict = (ax, az, bx, bz) => {
      const ay = w.groundY(ax, az) + P.cfg.dims.hullHeight + 0.5;
      const by = w.groundY(bx, bz) + E.cfg.dims.hullHeight + 0.5;
      const dist = Math.hypot(bx - ax, bz - az);
      const steps = Math.ceil(dist / 4);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (w.groundY(ax + (bx - ax) * t, az + (bz - az) * t) > ay + (by - ay) * t) return false;
      }
      for (const o of w.obstacles) {
        if (o.dead) continue;
        const t = segCircleT(ax, az, bx, bz, o.x, o.z, o.r + 1); // 测试沿用 r+1 余量（实际 r+0.3），边缘容忍
        if (t < 0) continue;
        if (o.topY !== undefined && ay + (by - ay) * t > o.topY + 0.15) continue; // 射线越顶不挡
        return false;
      }
      for (const b of w.sightBlockers) {
        const t = segCircleT(ax, az, bx, bz, b.x, b.z, b.r);
        if (t < 0) continue;
        if (b.topY !== undefined && ay + (by - ay) * t > b.topY + 0.15) continue;
        return false;
      }
      return true;
    };
    P.place(0, 0, 0);
    let agree = 0, total = 0;
    let openSee = 0, openN = 0, coverSee = 0, coverN = 0;
    let mismatches = [];
    for (let k = 0; k < 80; k++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 150 + Math.random() * 450;
      const ex = Math.cos(ang) * d, ez = Math.sin(ang) * d;
      E.place(ex, ez, 0);
      const actual = vis.canSee(P, E);
      const expected = predict(0, 0, ex, ez);
      if (actual === expected) agree++; else mismatches.push({ ex: ex | 0, ez: ez | 0, actual, expected });
      total++;
      // 分组统计：视线 25m 内是否有树实例（树丛掩体组 vs 开阔组）
      const nearTrees = w.destructibles.list.filter(o => o.kind === 'inst' && (o.type === 'leaf' || o.type === 'pine') && o.alive &&
        segCircle(0, 0, ex, ez, o.x, o.z, o.radius + 6)).length;
      if (nearTrees >= 2) { coverN++; if (actual) coverSee++; }
      else if (nearTrees === 0) { openN++; if (actual) openSee++; }
    }
    return { agree, total, mismatches: mismatches.slice(0, 5),
      openSeeRate: openN ? (openSee / openN * 100).toFixed(0) + '%(' + openN + ')' : 'n/a',
      coverSeeRate: coverN ? (coverSee / coverN * 100).toFixed(0) + '%(' + coverN + ')' : 'n/a' };
  });
  console.log('VIS_PROBE:', JSON.stringify(res, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
