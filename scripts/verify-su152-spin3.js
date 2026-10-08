// su152 轮面旋转实证 v3：用车库自带球坐标参数对准右前轮，0 / 1.5 rad 两帧
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('ERR', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(5000);
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.selectedTank = 'su152';
    g._loadTankThenShow('su152');
  });
  await sleep(4000);
  await page.evaluate(() => {
    const g = window.__game;
    g._camR = 2.1; g._camTheta = 1.05; g._camPhi = 0.28;
    g._camLookX = 1.35; g._camLookY = 0.35; g._camLookZ = 2.25;
    g.camera.fov = 46; g.camera.updateProjectionMatrix();
    const t = g.menuTank;
    for (const w of t.wheelGroups) w.group.rotation.x = 0;
    t.root.updateMatrixWorld(true);
  });
  await sleep(300);
  await page.screenshot({ path: 'scripts/shot-su152-spinC1.png', clip: { x: 380, y: 260, width: 640, height: 460 } });
  await page.evaluate(() => {
    const t = window.__game.menuTank;
    for (const w of t.wheelGroups) w.group.rotation.x += 1.5;
    t.root.updateMatrixWorld(true);
  });
  await sleep(150);
  await page.screenshot({ path: 'scripts/shot-su152-spinC2.png', clip: { x: 380, y: 260, width: 640, height: 460 } });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
