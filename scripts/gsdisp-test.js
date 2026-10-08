// 镜内散布刻度环验证：开镜 → 甩炮塔扩圈（截图）→ 静止收敛（最小圈 18px + 变绿，截图）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await page.evaluate(() => {
    window.__game.ais.forEach(ai => { ai.update = () => {}; });
    for (const e of window.__game.enemies) { e.drive = () => {}; e.throttle = 0; e.steer = 0; }
  });
  await sleep(2500);
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });   // 右键开镜
  await sleep(1800);
  await page.evaluate(() => { window.__game.rig.addAim(0, 0.5); window.__game.rig.addAim(1.5, 0); });  // 甩视角扩圈
  await sleep(400);
  const bloom = await page.evaluate(() => {
    const d = document.getElementById('gs-disp');
    return { w: d.style.width, aimed: d.classList.contains('aimed'), disp: +window.__game.player.dispersion.toFixed(4) };
  });
  await page.screenshot({ path: 'scripts/shot-gsdisp-bloom.png' });
  await sleep(9000);
  const conv = await page.evaluate(() => {
    const d = document.getElementById('gs-disp');
    return { w: d.style.width, aimed: d.classList.contains('aimed'), disp: +window.__game.player.dispersion.toFixed(4) };
  });
  await page.screenshot({ path: 'scripts/shot-gsdisp-converged.png' });
  console.log('BLOOM:', JSON.stringify(bloom), ' CONVERGED:', JSON.stringify(conv));
  await browser.close();
})();
