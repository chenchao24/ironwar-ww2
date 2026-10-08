// 端到端实弹测试：真炮真弹真飞行——把敌人摆到玩家炮口正前方，连发 HE，读目标乘员/模块状态
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__game && window.__game.world, { timeout: 180000, polling: 500 });
  await page.mouse.click(800, 450);
  await sleep(1200);
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  await page.waitForFunction(() => {
    const b = document.querySelector('.fh-start-btn');
    return b && !b.disabled && !window.__game._hangarBusy;
  }, { timeout: 60000, polling: 300 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  await sleep(9000);

  // 逐发：摆位 → 切 HE → fire → 等弹着 → 读状态
  for (let i = 1; i <= 6; i++) {
    const r = await page.evaluate(() => {
      const g = window.__game, p = g.player;
      const t = g.enemies.find((e) => !e.destroyed);
      if (!t) return { done: 'NO ENEMY' };
      p.cfg.heShell = { power: 3, penMult: 0.12, nearMissR: 5 };   // 临时把虎式 HE 改成 152 级威力
      p.shellType = 'he';
      // 摆到玩家车体正前方 80m
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
      const px = p.root.position.x, pz = p.root.position.z;
      const ex = px + fx * 80, ez = pz + fz * 80;
      t.root.position.set(ex, g.world.groundY(ex, ez), ez);
      t.heading = p.heading + Math.PI;
      t.speed = 0;
      if (t.root.rotation) t.root.rotation.y = t.heading;
      const before = {
        crew: t.crew.map((c) => c.state).join(''),
        tracks: t.mods.tracks, destroyed: t.destroyed,
      };
      p.reload = 0;
      const shot = p.fire();
      g.shells.fire(shot);
      return { before, target: t.cfg.name, pool: { ...p.shellPool } };
    });
    if (r.done) { console.log(r.done); break; }
    await sleep(1200);
    const after = await page.evaluate(() => {
      const g = window.__game;
      const t = g.enemies.find((e) => !e.destroyed) || g.enemies[0];
      const recent = (t.pendingEvents || []).map((e) => e.label || e.mod || e.type);
      t.pendingEvents = [];
      return {
        crew: t.crew.map((c) => c.state).join(''),
        tracks: t.mods.tracks, destroyed: t.destroyed,
        recent,
        shellsInFlight: g.shells.shells.length,
      };
    });
    console.log(`第${i}发 → ${r.target}: 乘员 ${r.before.crew}→${after.crew} 履带 ${r.before.tracks}→${after.tracks} 摧毁=${after.destroyed} 事件=[${after.recent.join('、')}] 空中弹=${after.shellsInFlight}`);
    if (after.destroyed) break;
  }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO CONSOLE ERRORS');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
