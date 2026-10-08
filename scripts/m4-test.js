// M4 验证：① 炮塔枢轴（转 90° 看炮塔相对座圈是否居中不摆动） ② 履带 UV 滚动方向（行进两帧连拍对比纹理走向）
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
  await page.evaluate(() => { window.__game.ui.selectedTank = 'm4a3'; });
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  // ── ① 炮塔枢轴：aimYaw 转 90°，等炮塔伺服收敛后截图（相机随 aimYaw 环绕到车体侧方） ──
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimYaw = g.player.root.rotation.y + Math.PI / 2;
    g.rig.aimPitch = 0;
  });
  await sleep(6000);   // 0.35 rad/s → 90° 约 4.5s
  const tur = await page.evaluate(() => {
    const g = window.__game;
    return { turretYaw: +g.player.turretGroup.rotation.y.toFixed(2), speed: +(g.player.speed || 0).toFixed(2) };
  });
  console.log('TURRET:', JSON.stringify(tur));
  await page.screenshot({ path: 'scripts/shot-m4-turret90.png' });

  // ── ② 履带滚动：回正瞄准，全速行进中两帧连拍 ──
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimYaw = g.player.root.rotation.y;
  });
  await sleep(5000);   // 等炮塔回正
  await page.keyboard.down('w');
  await sleep(2500);   // 提速
  const spd = await page.evaluate(() => +(window.__game.player.speed || 0).toFixed(1));
  console.log('SPEED:', spd);
  await page.screenshot({ path: 'scripts/shot-m4-track1.png' });
  await sleep(400);
  await page.screenshot({ path: 'scripts/shot-m4-track2.png' });
  await page.keyboard.up('w');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
