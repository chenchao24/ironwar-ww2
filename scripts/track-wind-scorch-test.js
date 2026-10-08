// 三项修复综合验证：①履带行驶滚动方向 ②熏黑减浅 ③灌木风摆动画
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

  // ── ① 履带：侧向锁相机，起步前进，连拍两帧 ──
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimYaw = g.player.heading + Math.PI / 2;   // 左侧视角：车头=屏幕右
    g.rig.aimPitch = 0.06;
  });
  await sleep(1000);
  await page.keyboard.down('w');
  await sleep(1500);                                  // 速度爬升
  const spd = await page.evaluate(() => +window.__game.player.speed.toFixed(2));
  await page.screenshot({ path: 'scripts/shot-trk-fwd-a.png' });
  await sleep(260);
  await page.screenshot({ path: 'scripts/shot-trk-fwd-b.png' });
  await page.keyboard.up('w');
  console.log('前进车速:', spd, 'm/s');
  // 倒车对照
  await sleep(1200);
  await page.keyboard.down('s');
  await sleep(1800);
  const spdR = await page.evaluate(() => +window.__game.player.speed.toFixed(2));
  await page.screenshot({ path: 'scripts/shot-trk-rev-a.png' });
  await sleep(260);
  await page.screenshot({ path: 'scripts/shot-trk-rev-b.png' });
  await page.keyboard.up('s');
  console.log('倒车车速:', spdR, 'm/s');

  // ── ② 熏黑色阶：击毁最近敌人 ──
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies[0];
    // 摆到玩家正前方 30m
    const h = g.player.heading, p = g.player.root.position;
    const x = p.x + Math.sin(h) * 30, z = p.z + Math.cos(h) * 30;
    e.pos.set(x, 0, z); e.root.position.set(x, g.world.groundY(x, z), z);
    g.rig.aimYaw = h; g.rig.aimPitch = 0.03;
    e.destroy(false);
  });
  await sleep(1200);
  await page.screenshot({ path: 'scripts/shot-scorch-light.png' });

  // ── ③ 风摆：镜头对准最近一丛灌木，连拍两帧 ──
  const hedge = await page.evaluate(() => {
    const g = window.__game;
    const hf = g.world.hedgeField;
    if (!hf || !hf.hedges.length) return null;
    const p = g.player.root.position;
    let best = null, bd = 1e9;
    for (const h of hf.hedges) {
      const d = (h.cx - p.x) ** 2 + (h.cz - p.z) ** 2;
      if (d < bd) { bd = d; best = h; }
    }
    // 玩家瞬移到灌木旁 12m，镜头对准
    const x = best.cx + 12, z = best.cz + 12;
    g.player.pos.set(x, 0, z);
    g.player.root.position.set(x, g.world.groundY(x, z), z);
    g.player.heading = Math.atan2(best.cx - x, best.cz - z);
    g.rig.aimYaw = g.player.heading; g.rig.aimPitch = 0.12;
    return { cx: +best.cx.toFixed(0), cz: +best.cz.toFixed(0), dist: +Math.sqrt(bd).toFixed(0) };
  });
  console.log('最近灌木:', JSON.stringify(hedge));
  await sleep(800);
  await page.screenshot({ path: 'scripts/shot-wind-a.png' });
  await sleep(650);
  await page.screenshot({ path: 'scripts/shot-wind-b.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
