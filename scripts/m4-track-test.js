// M4 履带滚动方向验证（侧视）：相机保持车体侧方，行进中两帧连拍对比履带纹理位移方向
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'm4a3'; });
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  // 相机锁到车体侧方（aimYaw 与航向差 90°），W 全速行进
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimYaw = g.player.root.rotation.y + Math.PI / 2;
    g.rig.aimPitch = 0.05;
  });
  await page.keyboard.down('w');
  await sleep(3000);
  const spd = await page.evaluate(() => +(window.__game.player.speed * 3.6).toFixed(1));
  console.log('SPEED km/h:', spd);
  await page.screenshot({ path: 'scripts/shot-m4-roll1.png' });
  await sleep(350);
  await page.screenshot({ path: 'scripts/shot-m4-roll2.png' });
  await page.keyboard.up('w');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
