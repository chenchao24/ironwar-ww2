// 埋点版：追踪 HE 实弹从出膛到命中结算的每一步
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
    p.cfg.heShell = { power: 3, penMult: 0.12, nearMissR: 5 };
    p.shellType = 'he';
    const origZone = t.resolveHitZone.bind(t);
    const origHit = t.applyHit.bind(t);
    window.__log = [];
    t.resolveHitZone = (pos, dir) => {
      const h = origZone(pos, dir);
      window.__log.push('zone=' + (h ? h.plateName + '/' + h.zone + ' armor=' + h.armor + ' ang=' + Math.round(h.impactAngleDeg) : 'NULL(板缝)'));
      return h;
    };
    t.applyHit = (hit, pen, st, hw, dw, sp, sh) => {
      const r = origHit(hit, pen, st, hw, dw, sp, sh);
      window.__log.push('applyHit st=' + st + ' pen=' + Math.round(pen) + ' hePower=' + (sh && sh.hePower) + ' → ' + r.type + ' ev=' + (r.events || []).length);
      return r;
    };
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const ex = p.root.position.x + fx * 60, ez = p.root.position.z + fz * 60;
    t.root.position.set(ex, p.root.position.y, ez);   // 与玩家同一高度平面，避免地形起伏导致擦顶
    t.heading = p.heading + Math.PI; t.root.rotation.y = t.heading; t.speed = 0;
    const before = t.crew.map((c) => c.state).join('');
    p.reload = 0;
    const shot = p.fire();
    g.shells.fire(shot);
    await zzz(1500);
    return {
      target: t.cfg.name, before, after: t.crew.map((c) => c.state).join(''),
      log: window.__log, shotVel: shot.velocity, shotType: shot.shellType, hePower: shot.hePower,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
