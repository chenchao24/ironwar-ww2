// T-34 履带滚动方向验证：观赏相机侧面近拍，前进中连拍两帧
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(5000);
  await page.evaluate(() => { window.__game.ui.selectedTank = 't34-85'; });
  await page.click('.fh-start-btn');
  await sleep(7000);
  // 观赏相机：侧面近机位（aimYaw 使相机在车体右侧，dist 拉近）
  await page.evaluate(() => {
    const g = window.__game;
    const cam = g.rig;
    cam.orbiting = true;
    cam.dist = 6;
    cam.aimPitch = 0.05;
    // 车体朝某方向行驶，相机锁在侧面（随 aimYaw 相对世界，车直行 yaw 不变即可）
    cam.aimYaw = g.player.heading + Math.PI / 2;
  });
  await page.keyboard.down('w');
  await sleep(1800);   // 提速
  await page.evaluate(() => { // 行驶中保持相机在侧面
    const g = window.__game;
    g.rig.aimYaw = g.player.heading + Math.PI / 2;
  });
  await sleep(200);
  const probe = await page.evaluate(() => {
    const t = window.__game.player;
    return { speed: +t.speed.toFixed(2), off: t.trackMaterials.map(m => +m.offset.y.toFixed(3)) };
  });
  console.log('前进中:', JSON.stringify(probe));
  await page.screenshot({ path: 'scripts/shot-t34-dir-a.png' });
  await sleep(350);
  await page.screenshot({ path: 'scripts/shot-t34-dir-b.png' });
  await sleep(350);
  await page.screenshot({ path: 'scripts/shot-t34-dir-c.png' });
  await page.keyboard.up('w');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
