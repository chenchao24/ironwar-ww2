// 雪地特效第 2 批校验：trackDust 扬雪 / groundShock 雪尘环 / 落地浮尘快速沉降
const puppeteer = require('puppeteer-core');

async function boot(page, mapId) {
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.select('#fh-map-select', mapId);
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const g = window.__game; g.player.applyHit = () => {}; g.player.resolveHit = () => null; });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));

  for (const mapId of ['ardennes', 'kursk']) {
    await boot(page, mapId);
    // 视点：平地上看正前方 35m
    await page.evaluate(() => {
      const g = window.__game;
      g.player.place(-160, 55, 90);
      g.rig.aimYaw = Math.PI / 2; g.rig.aimPitch = -0.06; g.rig.dist = 13;
    });
    // trackDust（持续 1s 模拟行驶）+ groundShock + dirtHit 同时触发
    await page.evaluate(() => {
      const g = window.__game, V3 = g.player.root.position.constructor;
      window.__dustTick = setInterval(() => {
        g.effects.trackDust(new V3(-130, g.world.groundY(-130, 45) + 0.3, 45), 0.9);
        g.effects.trackDust(new V3(-126, g.world.groundY(-126, 48) + 0.3, 48), 0.9);
      }, 50);
      g.effects.groundShock({ x: -125, y: g.world.groundY(-125, 62), z: 62 }, 1.2);
      g.effects.dirtHit(new V3(-125, 0, 80), 1.8);
    });
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: `scripts/shot-fx2-${mapId}-early.png` });
    await new Promise(r => setTimeout(r, 1800));
    await page.evaluate(() => clearInterval(window.__dustTick));
    await page.screenshot({ path: `scripts/shot-fx2-${mapId}-settle.png` });
  }
  console.log('ERRORS:', errors.length, errors.slice(0, 4));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
