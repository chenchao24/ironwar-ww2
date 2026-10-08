// 空间网格 A/B 微基准：旧全表线性扫 vs 新网格聚集（同页对比，排除 FPS 噪声）
const puppeteer = require('puppeteer-core');

async function boot(page, mapId) {
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 180000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.select('#fh-map-select', mapId);
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1200, height: 700 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PE:', e.message.slice(0, 140)));

  for (const mapId of ['normandy', 'ardennes']) {
    await boot(page, mapId);
    const res = await page.evaluate(() => {
      const g = window.__game, w = g.world, des = w.destructibles, V3 = g.player.root.position.constructor;
      const timeit = (fn, n) => { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - t0) / n * 1000; };   // μs/次
      const rnd = (a, b) => a + Math.random() * (b - a);
      const S = w.mapSize / 2;

      // ── shellHit：高空无命中段（纯扫描成本；旧版内联全表 + 同款粗筛） ──
      const seg = () => { const x1 = rnd(-S, S), z1 = rnd(-S, S), x2 = x1 + rnd(-30, 30), z2 = z1 + rnd(-30, 30); return [new V3(x1, 500, z1), new V3(x2, 500, z2)]; };
      const shellOld = (() => {
        let s = 0;
        return () => {
          const [p, q] = seg();
          const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, step = Math.hypot(q.x - p.x, q.z - p.z) + 1;
          for (const d of des.list) {
            if (!d.alive) continue;
            if (d.kind === 'inst' && (d.type.startsWith('fence') || d.type.startsWith('snowbush'))) continue;
            if (d.kind === 'group' && d.type === 'pylon01') continue;
            if (d.kind === 'group') { const rr = (d.boundR || d.radius) + step; if (Math.abs(d.cx - mx) > rr || Math.abs(d.cz - mz) > rr) continue; s++; }
            else { const rr = (d.radius || 1) + step; if (Math.abs(d.x - mx) > rr || Math.abs(d.z - mz) > rr) continue; s++; }
          }
          return s;
        };
      })();
      const shellNew = () => { const [p, q] = seg(); des.shellHit(p, q, { shellType: 'ap' }); };

      // ── crushCheck（玩家放空地；旧版内联全表） ──
      const clear = [[S - 60, 0], [-S + 60, 0], [0, S - 60]];
      const crushOld = () => {
        const [px, pz] = clear[(Math.random() * 3) | 0];
        let n = 0;
        for (const d of des.list) {
          if (!d.alive || d.rule.crushH === undefined) continue;
          const cx = d.kind === 'group' ? d.cx : d.x, cz = d.kind === 'group' ? d.cz : d.z;
          const dx = cx - px, dz = cz - pz;
          if (dx * dx + dz * dz > 3600) continue;
          n++;
        }
        return n;
      };
      const crushNew = () => {
        const [px, pz] = clear[(Math.random() * 3) | 0];
        g.player.root.position.set(px, w.groundY(px, pz), pz);
        des.crushCheck(g.player, null);
      };

      // ── LOS 软遮挡（旧版内联全表 sightBlockers） ──
      const losSeg = () => { const x1 = rnd(-S, S), z1 = rnd(-S, S), x2 = x1 + rnd(-300, 300), z2 = z1 + rnd(-300, 300); return [x1, z1, x2, z2]; };
      const v = g.visibility;
      const losOld = () => {
        const [ax, az, bx, bz] = losSeg();
        let n = 0;
        for (const b of v.sightBlockers) {
          const t = v._segCircleT(ax, az, bx, bz, b.x, b.z, b.r);
          if (t >= 0) n++;
        }
        return n;
      };
      const losNew = () => { const [ax, az, bx, bz] = losSeg(); v._los(ax, az, 30, bx, bz, 30, true, true); };

      // 预热
      for (let i = 0; i < 50; i++) { shellOld(); shellNew(); crushOld(); crushNew(); losOld(); losNew(); }
      return {
        shellOldUs: +timeit(shellOld, 3000).toFixed(2), shellNewUs: +timeit(shellNew, 3000).toFixed(2),
        crushOldUs: +timeit(crushOld, 3000).toFixed(2), crushNewUs: +timeit(crushNew, 3000).toFixed(2),
        losOldUs: +timeit(losOld, 3000).toFixed(2), losNewUs: +timeit(losNew, 3000).toFixed(2),
        desN: des.list.length, sightN: v.sightBlockers.length,
      };
    });
    console.log(`BENCH[${mapId}]:`, JSON.stringify(res));
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
