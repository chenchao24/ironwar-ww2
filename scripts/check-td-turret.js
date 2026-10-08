// M18/M36 炮塔旋转轴目测 v2：aimPoint 指向侧方让伺服保持大 yaw
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(6000);
  for (const id of ['m18', 'm36']) {
    await page.evaluate((id) => {
      const g = window.__game;
      g.ui.selectedTank = id;
      g._loadTankThenShow(id);
    }, id);
    await sleep(3500);
    await page.evaluate(() => {
      const t = window.__game.menuTank;
      if (t) t.aimPoint.set(40, 1.6, 0);   // 世界坐标侧方 → 伺服驱动炮塔转向侧方并保持
    });
    await sleep(5000);   // 给足转向时间（0.35rad/s × ~1.3rad ≈ 4s）
    const yaw = await page.evaluate(() => window.__game.menuTank ? +window.__game.menuTank.turretYaw.toFixed(2) : null);
    await page.screenshot({ path: `scripts/shot-${id}-turretyaw.png` });
    console.log(id, 'yaw =', yaw);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
