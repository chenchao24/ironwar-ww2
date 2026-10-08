// HE 落地特效改版验证（临时）：粒子构成 / 无环 / 颜色方差 / 火光像素占比
const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 150)));
  await page.evaluateOnNewDocument(() => {
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = 'normandy';
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 6000));
  await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => ({ type: 'bounce', pen: false }); g.player.resolveHit = () => null;
    for (const e of g.enemies) e.place(900, 900, 0);
    g.player.place(-200, 340, 0);
    g.rig.aimYaw = Math.PI; g.rig.aimPitch = -0.02; g.rig.dist = 18;
  });
  await new Promise(r => setTimeout(r, 1000));

  // ── 1) HE 落地：spawn 后立刻采样粒子构成 + 环状态 + smoke 颜色方差 ──
  const groundStats = await page.evaluate(() => {
    const g = window.__game;
    const ps = g.effects.ps;
    const live = (kind) => { let n = 0; const p = ps.pools[kind]; for (let i = 0; i < p.count; i++) if (p.life[i] < p.maxLife[i]) n++; return n; };
    const s0 = { glow: live('glow'), fire: live('fire'), smoke: live('smoke') };
    g.effects.dirtHit({ x: -185, y: 0, z: 300 }, 1.8);
    g.effects.heGround({ x: -185, y: 0, z: 300 });
    const s1 = { glow: live('glow'), fire: live('fire'), smoke: live('smoke') };
    const ringsVisible = g.effects.rings.filter(r => r.mesh.visible).length;
    // smoke 池活粒子 c0 方差（跨组本来就有差，组内抖动会让方差进一步拉大——只记录供参考）
    const P = ps.pools.smoke; const cs = [];
    for (let i = 0; i < P.count; i++) if (P.life[i] < P.maxLife[i]) cs.push([P.c0r[i], P.c0g[i], P.c0b[i]]);
    const mean = [0, 1, 2].map(k => cs.reduce((a, c) => a + c[k], 0) / cs.length);
    const varr = [0, 1, 2].map(k => Math.sqrt(cs.reduce((a, c) => a + (c[k] - mean[k]) ** 2, 0) / cs.length));
    return { before: s0, after: s1, ringsVisible, smokeCount: cs.length, colorStd: varr.map(v => +v.toFixed(3)) };
  });
  console.log('GROUND_HE', JSON.stringify(groundStats));
  await new Promise(r => setTimeout(r, 450));
  await page.screenshot({ path: 'scripts/shot-he-ground.png' });

  // ── 2) 坦克命中（explosion 1.0 + bigDustBurst，保持不变）：粒子构成对照 ──
  const tankStats = await page.evaluate(() => {
    const g = window.__game;
    const ps = g.effects.ps;
    const live = (kind) => { let n = 0; const p = ps.pools[kind]; for (let i = 0; i < p.count; i++) if (p.life[i] < p.maxLife[i]) n++; return n; };
    const s0 = { glow: live('glow'), fire: live('fire'), smoke: live('smoke') };
    const hitPos = new (g.camera.position.constructor)(-200, g.world.groundY(-200, 300) + 2, 300);
    g.effects.explosion(hitPos, 1.0);
    g.effects.bigDustBurst(hitPos, 1);
    const s1 = { glow: live('glow'), fire: live('fire'), smoke: live('smoke') };
    return { before: s0, after: s1, ringsVisible: g.effects.rings.filter(r => r.mesh.visible).length };
  });
  console.log('TANK_HIT', JSON.stringify(tankStats));
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: 'scripts/shot-he-tank.png' });

  // ── 3) 两张截图火光像素占比对比（暖亮色 = 火/闪；土色 = 尘） ──
  const px = async (file) => {
    const b64 = fs.readFileSync(file).toString('base64');
    return page.evaluate(async (src) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let fire = 0, dust = 0, total = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g2 = d[i + 1], b = d[i + 2];
        total++;
        if (r > 200 && g2 > 110 && r - b > 70) fire++;                       // 橙红火光/闪
        else if (r > 90 && r < 200 && r - b > 18 && g2 - b > 8) dust++;      // 暖土色尘
      }
      return { fire: +(fire / total * 100).toFixed(3), dust: +(dust / total * 100).toFixed(3) };
    }, 'data:image/png;base64,' + b64);
  };
  console.log('PIX_GROUND', JSON.stringify(await px('scripts/shot-he-ground.png')));
  console.log('PIX_TANK  ', JSON.stringify(await px('scripts/shot-he-tank.png')));
  await browser.close();
})();
