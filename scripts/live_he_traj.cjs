// 终极追踪：同平面摆放 + 弹道采样 + 命中检测埋点
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
    const origZone = t.resolveHitZone.bind(t);
    t.resolveHitZone = (pos, dir) => {
      const h = origZone(pos, dir);
      window.__log.push('zone=' + (h ? h.plateName + ' armor=' + h.armor : 'NULL'));
      return h;
    };
    // 同平面摆放，40m
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const ex = p.root.position.x + fx * 40, ez = p.root.position.z + fz * 40;
    t.root.position.set(ex, p.root.position.y, ez);
    t.heading = p.heading + Math.PI; t.root.rotation.y = t.heading; t.speed = 0;
    p.reload = 0;
    const shot = p.fire();
    g.shells.fire(shot);
    const out = {
      target: t.cfg.name, turretTop: t.cfg.dims.turretTop,
      muzzle: [shot.pos.x.toFixed(1), shot.pos.y.toFixed(1), shot.pos.z.toFixed(1)],
      dir: [shot.dir.x.toFixed(3), shot.dir.y.toFixed(3), shot.dir.z.toFixed(3)],
      enemy: [ex.toFixed(1), t.root.position.y.toFixed(1), ez.toFixed(1)],
      samples: [],
    };
    for (let k = 0; k < 30; k++) {
      await zzz(50);
      const s = g.shells.shells.find((x) => x.owner === p);
      if (!s) { out.samples.push('GONE@' + (k + 1) * 50 + 'ms'); break; }
      out.samples.push([s.pos.x.toFixed(1), s.pos.y.toFixed(2), s.pos.z.toFixed(1)].join(','));
    }
    out.log = window.__log;
    out.crew = t.crew.map((c) => c.state).join('');
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
