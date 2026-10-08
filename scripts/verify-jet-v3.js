// 上喷排气复核 v3：冻结相机 rig，近距侧后方连拍
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
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'is2m'; });
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(6000);
  await page.evaluate(() => { window.__game.input.keys.add('KeyW'); });
  await sleep(1200);
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.update = () => {};   // 冻结相机
    const p = g.player;
    const back = 6.5;
    g.camera.position.set(
      p.pos.x - Math.sin(p.heading) * back + Math.cos(p.heading) * 3.5,
      p.pos.y + 2.6,
      p.pos.z - Math.cos(p.heading) * back - Math.sin(p.heading) * 3.5);
    g.camera.lookAt(p.pos.x, p.pos.y + 1.5, p.pos.z);
  });
  for (let i = 1; i <= 4; i++) {
    await page.screenshot({ path: `scripts/shot-is2m-jetB${i}.png` });
    await sleep(280);
  }
  await page.evaluate(() => window.__game.input.keys.delete('KeyW'));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
