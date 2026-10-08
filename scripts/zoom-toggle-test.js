// 多档瞄具验证：德系 tiger1 开镜 2.5× ↔ 空格 → 5×；T-34-85 固定 4×（空格不变）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  for (const tank of ['tiger1', 't34-85']) {
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
    const read = () => page.evaluate(() => {
      const g = window.__game;
      return { aiming: g.rig.aiming, zoomMag: +g.rig.zoomMag.toFixed(2), zoomIdx: g.rig.zoomIdx,
        zoomText: document.getElementById('gs-zoom').textContent,
        fov: +g.camera.fov.toFixed(1) };
    });
    const s0 = await read();
    await page.keyboard.press('ShiftLeft');   // Shift 切档
    await sleep(900);
    const s1 = await read();
    await page.keyboard.press('ShiftLeft');   // 再切回
    await sleep(900);
    const s2 = await read();
    console.log(tank.toUpperCase());
    console.log('  开镜初始 :', JSON.stringify(s0));
    console.log('  Shift 1次:', JSON.stringify(s1));
    console.log('  Shift 2次:', JSON.stringify(s2));
    console.log(errors.length ? '  ERRORS:\n' + errors.join('\n') : '  NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
