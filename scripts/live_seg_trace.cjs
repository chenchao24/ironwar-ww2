// 深挖：包围球检测埋点，看炮弹穿过坦克时 _segmentHitsTank 的判定
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__game && window.__game.world, { timeout: 180000, polling: 500 });
  await page.mouse.click(800, 450); await sleep(1200);
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  await page.waitForFunction(() => { const b = document.querySelector('.fh-start-btn'); return b && !b.disabled; }, { timeout: 60000, polling: 300 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  await sleep(9000);

  const r = await page.evaluate(async () => {
    const zzz = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__game, p = g.player;
    const t = g.enemies.find((e) => !e.destroyed);
    p.shellType = 'he';
    window.__log = [];
    // 包围球检测埋点（只记目标车）
    const origSeg = g.shells._segmentHitsTank.bind(g.shells);
    g.shells._segmentHitsTank = (a, b, tk) => {
      const res = origSeg(a, b, tk);
      if (tk === t && window.__log.length < 40) {
        const cy = tk.root.position.y + tk.cfg.dims.hullHeight * 0.7;
        const rr = Math.max(tk.cfg.dims.length, tk.cfg.dims.width) * 0.42 + 0.6;
        window.__log.push(`seg=${res} a=(${a.x.toFixed(0)},${a.y.toFixed(1)},${a.z.toFixed(0)}) b=(${b.x.toFixed(0)},${b.y.toFixed(1)},${b.z.toFixed(0)}) 球心=(${tk.root.position.x.toFixed(0)},${cy.toFixed(1)},${tk.root.position.z.toFixed(0)}) r=${rr.toFixed(1)}`);
      }
      return res;
    };
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const ex = p.root.position.x + fx * 40, ez = p.root.position.z + fz * 40;
    t.root.position.set(ex, p.root.position.y, ez);
    t.heading = p.heading + Math.PI; t.root.rotation.y = t.heading; t.speed = 0;
    // 等两帧让 matrixWorld 更新
    await zzz(300);
    p.reload = 0;
    const shot = p.fire();
    g.shells.fire(shot);
    await zzz(1500);
    return {
      target: t.cfg.name,
      tanksInMgr: g.shells.tanks.length,
      enemyInMgr: g.shells.tanks.includes(t),
      log: window.__log.slice(0, 20),
      crew: t.crew.map((c) => c.state).join(''),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
