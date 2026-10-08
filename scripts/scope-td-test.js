// 德军歼击车分划迭代验证：5 车开镜截图 + 倍率读数
// 期望：marder3m=de2td 4× / jpz4l70·jagdpanther=de2td7 5× / ferdinand=de2td7 5×→7×(Shift) / jagdtiger=de2td7 10×
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TANKS = ['marder3m', 'jpz4l70', 'ferdinand', 'jagdpanther', 'jagdtiger'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  for (const tank of TANKS) {
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
    const read = () => ({
      aiming: window.__game.rig.aiming, zoomMag: +window.__game.rig.zoomMag.toFixed(2),
      fov: +window.__game.camera.fov.toFixed(1),
      zoomText: document.getElementById('gs-zoom').textContent,
      reticleCls: document.getElementById('gs-reticle').getAttribute('class'),
    });
    const info = await page.evaluate(read);
    console.log(tank.toUpperCase(), JSON.stringify(info));
    await page.screenshot({ path: `scripts/shot-scope-${tank}.png` });
    if (tank === 'ferdinand') {   // 双档：Shift 切 5×→7×
      await page.keyboard.down('ShiftLeft'); await page.keyboard.up('ShiftLeft');
      await sleep(1500);
      const info2 = await page.evaluate(read);
      console.log(tank.toUpperCase() + '_7X', JSON.stringify(info2));
      await page.screenshot({ path: `scripts/shot-scope-${tank}-7x.png` });
    }
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
