// 端到端实弹验证：真实 fire() → shells.fire() → 弹道 → resolveHitZone → applyHESplash
// 验证修复：shells.fire() 现在转发 hePower/nearMissR/caliber
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
  // 选 ISU-152 作为玩家车（152mm HE power=3）
  await page.evaluate(() => {
    const selN = document.getElementById('fh-sel-nation');
    const selT = document.getElementById('fh-sel-tank');
    // 找到 isu152 所在国家
    for (const opt of selN.options) {
      selN.value = opt.value;
      selN.dispatchEvent(new Event('change'));
      if ([...selT.options].some((o) => o.value === 'isu152')) break;
    }
    selT.value = 'isu152';
    selT.dispatchEvent(new Event('change'));
  });
  await sleep(1500);
  await page.waitForFunction(() => {
    const b = document.querySelector('.fh-start-btn');
    return b && !b.disabled && !window.__game._hangarBusy;
  }, { timeout: 60000, polling: 300 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  await sleep(9000);

  const out = await page.evaluate(async () => {
    const g = window.__game;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const p = g.player, t = g.enemies.find((e) => !e.destroyed);
    if (!t) return 'NO ENEMY';
    const lines = [`玩家: ${p.cfg.name}(${p.cfg.caliber}mm)`, `目标: ${t.cfg.name}`];

    // 埋点：记录 shells.fire 收到的数据 + applyHESplash 的结果
    window.__fired = [];
    const origFire = g.shells.fire.bind(g.shells);
    g.shells.fire = (d) => { window.__fired.push({ hePower: d.hePower, nearMissR: d.nearMissR, caliber: d.caliber, shellType: d.shellType }); return origFire(d); };
    window.__splashes = [];
    const origSplash = t.applyHESplash.bind(t);
    t.applyHESplash = (hit, shell) => {
      const r = origSplash(hit, shell);
      window.__splashes.push({ P: (shell && shell.hePower) || 1, armor: hit.armor, zone: hit.zone, plate: hit.plateName || '', events: (r.events || []).map((e) => e.label || e.mod) });
      return r;
    };

    // 冻结 AI 与目标，把目标瞬移到玩家正前方 30m
    for (const ai of g.ais) { ai.enabled = false; }
    const fwd = p.getGunDirection(new p.root.position.constructor());
    const muzzle = new p.root.position.constructor();
    p.getMuzzle(muzzle, new p.root.position.constructor());
    const tx = muzzle.x + fwd.x * 30, tz = muzzle.z + fwd.z * 30;
    t.place(tx, tz, 0);
    t.root.updateMatrixWorld(true);
    t.speed = 0;

    // 切 HE、瞄准目标车体中心、等炮塔到位后实弹射击
    p.switchShell('he');
    p.aimAt(new p.root.position.constructor(tx, muzzle.y - 0.3, tz));
    await sleep(2500);

    for (let i = 0; i < 8 && !t.destroyed; i++) {
      p.reload = 0;
      const shot = p.fire();
      g.shells.fire(shot);          // 真实发射路径（main.js 同款）
      await sleep(1200);
      t.speed = 0; t.place(tx, tz, 0); t.root.updateMatrixWorld(true);   // 防止被撞/滑动
    }
    await sleep(800);

    lines.push('fire数据: ' + JSON.stringify(window.__fired.slice(0, 3)));
    for (const [i, s] of window.__splashes.entries()) {
      lines.push(`第${i + 1}发 P=${s.P} armor=${s.armor} zone=${s.zone}/${s.plate} events=[${s.events.join('、') || '空'}]`);
    }
    if (!window.__splashes.length) lines.push('（未触发 applyHESplash——可能击穿/跳弹/未命中）');
    lines.push('目标状态: destroyed=' + t.destroyed + ' 乘员=' + t.crew.map((c) => c.name + '=' + c.state).join(' '));
    return lines.join('\n');
  });
  console.log(out);
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO CONSOLE ERRORS');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
