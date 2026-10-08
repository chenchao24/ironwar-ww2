// 白洗涂装校验：阿登（应有白洗）vs 库尔斯克（应无）；玩家车侧面 + 敌车
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
  await page.evaluate(() => {
    const g = window.__game;
    g.player.applyHit = () => {}; g.player.resolveHit = () => null;
    for (const e of g.enemies) { e.applyHit = () => {}; }   // 敌车也别死（保持完整供截图）
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));

  for (const mapId of ['ardennes', 'kursk']) {
    await boot(page, mapId);
    // 玩家车侧面视角：车头朝 +z，相机从右后方看
    await page.evaluate(() => {
      const g = window.__game;
      g.player.place(-160, 55, 0);
      g.rig.aimYaw = 0.9; g.rig.aimPitch = -0.02; g.rig.dist = 11;
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `scripts/shot-wash-${mapId}-player.png` });
    // 敌车近景（把玩家挪到敌车旁，敌车无敌不打死；玩家无敌已设）
    const info = await page.evaluate(() => {
      const g = window.__game, e = g.enemies[0];
      if (!e) return null;
      const p = e.root.position;
      g.player.place(p.x - 16, p.z - 10, 0);
      g.rig.aimYaw = Math.atan2(p.x - g.player.root.position.x, p.z - g.player.root.position.z);
      g.rig.aimPitch = 0.02; g.rig.dist = 14;
      return { enemy: e.cfg.id, dist: 16 };
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `scripts/shot-wash-${mapId}-enemy.png` });
    console.log(mapId, 'enemy:', JSON.stringify(info));
  }
  console.log('ERRORS:', errors.length, errors.slice(0, 4));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
