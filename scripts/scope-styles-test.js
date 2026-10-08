// 瞄准镜分划样式验证：M4（us2 静态 M82 3×）与 T-34-85（su2 静态 TSh-16 4×）开镜截图 + 倍率读数
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  for (const tank of ['m4a3', 't34-85', 'tiger1']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
    await page.click('#screen-cover');
    await sleep(500);
    await page.click('#btn-hunt-mode');
    await sleep(3500);
    await page.evaluate((t) => { window.__game.ui.selectedTank = t; }, tank);
    await page.click('#screen-hangar [data-action="start"]');
    await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
    await sleep(2500);
    await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });   // 右键开镜
    await sleep(1800);
    const info = await page.evaluate(() => {
      const g = window.__game;
      return {
        aiming: g.rig.aiming, zoomMag: +g.rig.zoomMag.toFixed(2),
        zoomText: document.getElementById('gs-zoom').textContent,
        reticleCls: document.getElementById('gs-reticle').getAttribute('class'),
        par: document.getElementById('gs-svg').getAttribute('preserveAspectRatio'),
      };
    });
    console.log(tank.toUpperCase(), JSON.stringify(info));
    await page.screenshot({ path: `scripts/shot-scope-${tank}.png` });
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
