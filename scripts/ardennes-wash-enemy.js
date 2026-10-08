// 白洗敌车正视校验：相机正对敌车
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 140)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.select('#fh-map-select', 'ardennes');
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => {}; g.player.resolveHit = () => null;
    for (const e of g.enemies) { e.applyHit = () => {}; }
  });
  // 逐敌车：玩家挪到敌车正前方 22m，相机回望 = 敌车正面照
  const n = await page.evaluate(() => window.__game.enemies.length);
  for (let i = 0; i < Math.min(n, 3); i++) {
    await page.evaluate((idx) => {
      const g = window.__game, e = g.enemies[idx];
      const p = e.root.position;
      const fw = { x: Math.sin(e.heading), z: Math.cos(e.heading) };
      g.player.place(p.x + fw.x * 22, p.z + fw.z * 22, 0);
      // 相机从玩家背后越过玩家看向敌车
      g.rig.aimYaw = Math.atan2(p.x - g.player.root.position.x, p.z - g.player.root.position.z);
      g.rig.aimPitch = 0.03; g.rig.dist = 10;
    }, i);
    await new Promise(r => setTimeout(r, 900));
    await page.screenshot({ path: `scripts/shot-wash-enemy-${i}.png` });
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
