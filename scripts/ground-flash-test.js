// AP/HE 地面命中爆闪强化验证：参数断言 + 冻结爆闪截图
// 冻结原理：包装 ps.spawn，把爆闪 glow/fire 粒子 maxLife 延至 60s、清速度——亮斑定在弹着点供截图
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  let failed = 0;
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!ok) failed++; };
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(1500);

  // 敌车全部挪远；装填好；安装 spawn/flash 间谍 + 冻结钩子（只冻结弹着点 20m 内的爆闪粒子）
  await page.evaluate(() => {
    const g = window.__game;
    for (const e of g.enemies) e.place(900, 900, 0);
    const fx = Math.sin(g.player.heading), fz = Math.cos(g.player.heading);
    const rx = Math.cos(g.player.heading), rz = -Math.sin(g.player.heading);
    g.__ptAP = { x: g.player.pos.x + fx * 60 + rx * -15, z: g.player.pos.z + fz * 60 + rz * -15 };
    g.__ptHE = { x: g.player.pos.x + fx * 60 + rx * 15, z: g.player.pos.z + fz * 60 + rz * 15 };
    window.__flashSpawns = [];
    window.__flashLights = [];
    const ps = g.ps;
    const origSpawn = ps.spawn.bind(ps);
    ps.spawn = function (kind, o) {
      origSpawn(kind, o);
      const near = o.x != null && Math.hypot(o.x - g.__ptAP.x, o.z - g.__ptAP.z) < 20
        || o.x != null && Math.hypot(o.x - g.__ptHE.x, o.z - g.__ptHE.z) < 20;
      if (!near) return;
      if ((kind === 'glow' && o.life <= 0.2) || (kind === 'fire' && o.life <= 0.3)) {
        const p = ps.pools[kind];
        const i = (p.head - 1 + p.count) % p.count;
        p.maxLife[i] = 60; p.life[i] = 60 * 0.28;   // 冻结在接近满亮度相位
        p.vx[i] = p.vy[i] = p.vz[i] = 0;
        window.__flashSpawns.push({ kind, life: o.life, size0: +o.size0.toFixed(2), size1: +o.size1.toFixed(2), alpha: o.alpha });
      }
    };
    const origFlash = ps.flash.bind(ps);
    ps.flash = function (pos, color, intensity, decay) {
      window.__flashLights.push({ color: '#' + color.toString(16), intensity: +intensity.toFixed(1), decay });
      return origFlash(pos, color, intensity, decay);
    };
  });

  // AP 打左前 60m
  await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = p.pos.constructor;
    const t = g.__ptAP;
    p.aimAt(new V3(t.x, g.world.groundY(t.x, t.z), t.z));
    for (let i = 0; i < 400; i++) p.updateTurret(1 / 60);
    p.reload = 0; g.shells.fire(p.fire());
  });
  await page.waitForFunction(() => window.__flashSpawns.length > 0, { timeout: 8000, polling: 40 });
  await sleep(600);

  // HE 打右前 60m
  await page.evaluate(() => {
    const g = window.__game, p = g.player, V3 = p.pos.constructor;
    const t = g.__ptHE;
    p.shellType = 'he';
    p.aimAt(new V3(t.x, g.world.groundY(t.x, t.z), t.z));
    for (let i = 0; i < 400; i++) p.updateTurret(1 / 60);
    p.reload = 0; g.shells.fire(p.fire());
  });
  await page.waitForFunction(() => window.__flashSpawns.some((f) => f.life === 0.14), { timeout: 8000, polling: 40 });
  await sleep(600);

  // 相机锁定两爆点中间
  await page.evaluate(() => {
    const g = window.__game;
    const mx = (g.__ptAP.x + g.__ptHE.x) / 2, mz = (g.__ptAP.z + g.__ptHE.z) / 2;
    const p = g.player.root.position;
    g.__camLock = setInterval(() => {
      g.rig.aimYaw = Math.atan2(mx - p.x, mz - p.z);
      g.rig.aimPitch = -0.18;
      g.rig.dist = 18;
    }, 50);
  });
  await sleep(800);
  await page.screenshot({ path: 'scripts/shot-ground-flash.png' });
  await page.evaluate(() => clearInterval(window.__camLock));

  // 断言：AP dirtHit 爆闪（强化后）
  const ap = await page.evaluate(() => window.__flashSpawns.filter((f) => f.life === 0.17 && f.kind === 'glow'));
  check('AP 中心爆闪 size0 ≈1.6（原 1.1）', ap.length >= 1 && ap[0].size0 > 1.45 && ap[0].size0 < 1.75, JSON.stringify(ap[0] || null));
  check('AP 中心爆闪 alpha 0.85（原 0.45）', ap.length >= 1 && Math.abs(ap[0].alpha - 0.85) < 0.01, String(ap[0] && ap[0].alpha));
  check('AP 中心爆闪 size1 ≈4.2（原 2.8）', ap.length >= 1 && ap[0].size1 > 3.9 && ap[0].size1 < 4.5, String(ap[0] && ap[0].size1));

  // HE：dirtHit(1.8) 爆闪（life 同为 0.17，size0 随 k 放大）+ heGround 爆闪
  const he = await page.evaluate(() => window.__flashSpawns.filter((f) => f.kind === 'glow'));
  const heCore = he.filter((f) => Math.abs(f.life - 0.14) < 0.01);
  const heDirt = he.filter((f) => Math.abs(f.life - 0.17) < 0.01 && f.size0 > 1.9);   // 排除 AP 的 1.6（HE k≈1.89 → ≈2.2）
  check('HE heGround 爆闪 size0 ≈3.2（原 2.2）、alpha 1（原 0.65）', heCore.length >= 1 && heCore[0].size0 > 3.0 && heCore[0].alpha === 1, JSON.stringify(heCore[0] || null));
  check('HE dirtHit 爆闪 size0 ≈2.2（1.6×√k）', heDirt.length >= 1 && heDirt[0].size0 > 2.0 && heDirt[0].size0 < 2.4, JSON.stringify(heDirt[0] || null));

  // 点光：AP dirtHit 26、HE dirtHit 26×k≈49、heGround 42
  const lights = await page.evaluate(() => window.__flashLights);
  check('AP 地面点光强度 26（原 12）', lights.some((l) => Math.abs(l.intensity - 26) < 0.1), JSON.stringify(lights));
  check('HE dirtHit 点光强度 ≈49（26×k，原 22.7）', lights.some((l) => l.intensity > 45 && l.intensity < 53), JSON.stringify(lights));
  check('HE heGround 点光强度 42（原 22）', lights.some((l) => Math.abs(l.intensity - 42) < 0.1), JSON.stringify(lights));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  console.log(failed === 0 && errors.length === 0 ? 'GROUND FLASH TEST: ALL PASS' : `FAILED (${failed})`);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
