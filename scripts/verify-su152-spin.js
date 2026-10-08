// su152 轮面旋转实证：车库内强制轮组转 0.9 rad，拍同轮两角度对比
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
  // 相机拉近距离看右前轮（冻结 showcase 循环干扰：直接操作场景相机）
  await page.evaluate(() => {
    const g = window.__game;
    g.camera.position.set(3.4, 1.1, 2.6);
    g.camera.lookAt(1.3, 0.4, 2.2);
  });
  await sleep(200);
  const shot = async (n) => { await page.screenshot({ path: `scripts/shot-su152-spin${n}.png`, clip: { x: 300, y: 250, width: 800, height: 500 } }); };
  await page.evaluate(() => {
    const t = window.__game.menuTank;
    for (const w of t.wheelGroups) w.group.rotation.x = 0;
    t.root.updateMatrixWorld(true);
  });
  await shot(1);
  await page.evaluate(() => {
    const t = window.__game.menuTank;
    for (const w of t.wheelGroups) w.group.rotation.x = 0.9;
    t.root.updateMatrixWorld(true);
  });
  await shot(2);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
