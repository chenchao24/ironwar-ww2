// 瞄具迭代验证：新分划视觉 + 炮口指示器对齐（含大角度转炮塔后）+ 转盘测距
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2000));

  // 把敌人拉到玩家正前 300m，瞄准它，等炮塔收敛
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player, e = g.enemies[0];
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    e.pos.set(p.pos.x + fx * 300, 0, p.pos.z + fz * 300);
    e._syncTransform(1);
    g.rig.aimYaw = p.heading; g.rig.aimPitch = 0;
  });
  await new Promise(r => setTimeout(r, 4000));
  const measure = () => page.evaluate(() => {
    const g = window.__game;
    const gm = document.getElementById('gun-marker');
    const ch = document.getElementById('crosshair');
    return {
      aimOffset: +g.player.aimOffset.toFixed(5),
      gmShown: gm.style.display !== 'none',
      gmX: parseFloat(gm.style.left), gmY: parseFloat(gm.style.top),
      gmW: gm.style.width, chW: ch.style.width,
      centerX: innerWidth / 2, centerY: innerHeight / 2,
      dialAngle: window.__game.ui._dialAngle,
    };
  });
  const m1 = await measure();
  console.log('正面收敛:', JSON.stringify(m1),
    '| 错位px:', Math.hypot(m1.gmX - m1.centerX, m1.gmY - m1.centerY).toFixed(1));

  // 大角度转动炮塔（90° 侧向），等收敛后再测
  await page.evaluate(() => { window.__game.rig.aimYaw += Math.PI / 2; });
  await new Promise(r => setTimeout(r, 9000));   // 虎式炮塔 0.18rad/s，90°≈8.7s
  const m2 = await measure();
  console.log('转90°收敛:', JSON.stringify(m2),
    '| 错位px:', Math.hypot(m2.gmX - m2.centerX, m2.gmY - m2.centerY).toFixed(1));
  await page.screenshot({ path: 'scripts/shot-tp-marker.png' });

  // 开镜看新分划（敌人回到正前，测距转盘应转到 ~300m≈18°）
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player, e = g.enemies[0];
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    e.pos.set(p.pos.x + fx * 300, 0, p.pos.z + fz * 300);
    e._syncTransform(1);
    g.rig.aimYaw = p.heading; g.rig.aimPitch = 0;
  });
  await new Promise(r => setTimeout(r, 6000));
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 2500));
  const m3 = await measure();
  console.log('开镜:', JSON.stringify(m3),
    '| 错位px:', Math.hypot(m3.gmX - m3.centerX, m3.gmY - m3.centerY).toFixed(1));
  await page.screenshot({ path: 'scripts/shot-scope-new.png' });

  console.log('CONSOLE ERRORS (' + errors.length + '):');
  errors.slice(0, 10).forEach(e => console.log('  ', e.slice(0, 250)));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
