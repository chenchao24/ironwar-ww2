// 刻度盘测距旋转验证 v2：瞄准敌车本体（炮口圆套住）→ 转盘应转到 ≈ -距离×0.06°
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2000));
  // 敌人正前 300m + 瞄准敌车中心（含俯仰）
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player, e = g.enemies[0];
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    e.pos.set(p.pos.x + fx * 300, 0, p.pos.z + fz * 300);
    e._syncTransform(1);
    const camY = p.root.position.y + p.cfg.dims.turretTop + 1.15;
    const dy = (e.root.position.y + 1.5) - camY;
    g.rig.aimYaw = p.heading;
    g.rig.aimPitch = Math.atan2(dy, 294);
  });
  await new Promise(r => setTimeout(r, 4000));
  await page.keyboard.press('Shift');   // 开镜
  await new Promise(r => setTimeout(r, 3000));
  const r1 = await page.evaluate(() => ({
    dialAngle: +window.__game.ui._dialAngle.toFixed(2),
    aimDist: window.__game.aimDist && +window.__game.aimDist.toFixed(0),
    aiming: window.__game.rig.aiming,
    aimOffset: +window.__game.player.aimOffset.toFixed(5),
  }));
  console.log('转盘(期望≈-9°@300m):', JSON.stringify(r1));
  await page.screenshot({ path: 'scripts/shot-scope-dial.png' });
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
