// M4 履带滚动符号定向：静止状态下手动改 offset.x（0 → +0.15），观察底部履带段纹理滑移方向。
// 正确方向：底部履带段纹理应向车尾滑（offset 减小 = 纹理向 +U 滑）。若向车头滑则符号反。
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

  // 相机锁侧方，停车（空格手刹）
  await page.evaluate(() => {
    const g = window.__game;
    g.rig.aimYaw = g.player.root.rotation.y + Math.PI / 2;
    g.rig.aimPitch = 0.05;
  });
  await page.keyboard.down(' ');
  await sleep(800);
  await page.keyboard.up(' ');
  await sleep(1200);
  const st = await page.evaluate(() => {
    const g = window.__game;
    g.player.speed = 0;
    const t = g.player.trackMaterials[0];
    t.offset.x = 0; t.offset.y = 0;
    return { mats: g.player.trackMaterials.length, speed: g.player.speed };
  });
  console.log('STATE:', JSON.stringify(st));
  await sleep(400);
  await page.screenshot({ path: 'scripts/shot-m4-off0.png' });
  await page.evaluate(() => { window.__game.player.trackMaterials.forEach(t => { t.offset.x = 0.37; }); });
  await sleep(400);
  await page.screenshot({ path: 'scripts/shot-m4-off1.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
