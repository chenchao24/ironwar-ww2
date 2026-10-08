// 虎王履带滚动方向目检：前进中连拍两帧侧面履带区域
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(6000);
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.selectedTank = 'tiger2';
    g._loadTankThenShow('tiger2');
  });
  await sleep(4000);
  await page.click('.fh-start-btn');
  await sleep(9000);
  await page.keyboard.down('KeyW');
  await sleep(2000);
  await page.screenshot({ path: 'scripts/shot-t2-trk-a.png' });
  await sleep(400);
  await page.screenshot({ path: 'scripts/shot-t2-trk-b.png' });
  await page.keyboard.up('KeyW');
  console.log('done');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
