const puppeteer = require('puppeteer-core');
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
  // 左 AP 落地 / 右 HE 落地（HE 走新路径 dirtHit+heGround：土尘主导、无环、小闪）
  await page.evaluate(() => {
    const g = window.__game;
    g.effects.dirtHit({ x: -215, y: 0, z: 300 }, 1);
    g.effects.dirtHit({ x: -185, y: 0, z: 300 }, 1.8);
    g.effects.heGround({ x: -185, y: 0, z: 300 });
  });
  await new Promise(r => setTimeout(r, 450));
  await page.screenshot({ path: 'scripts/shot-he-ground.png' });
  // HE 命中坦克（敌车拉到面前吃一发 HE splash 效果）
  await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies[0];
    e.place(-200, 300, 180);
    const hitPos = e.root.position.clone(); hitPos.y += 2;
    g.effects.explosion(hitPos, 1.0);
    g.effects.bigDustBurst(hitPos, 1);
  });
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: 'scripts/shot-he-tank.png' });
  await browser.close();
})();
