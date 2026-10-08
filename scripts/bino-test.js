// 车长望远镜验证：Q 进入 → 截图 7× → Shift 切 12× → 截图 → Q 退出 → 确认恢复
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2000));

  // Q 进入望远镜
  await page.keyboard.press('KeyQ');
  await new Promise(r => setTimeout(r, 1200));
  const s1 = await page.evaluate(() => ({
    binoc: window.__game.rig.binocular, fov: +window.__game.camera.fov.toFixed(1),
    overlay: !document.getElementById('binoculars').classList.contains('hidden'),
    tankHidden: !window.__game.player.root.visible,
  }));
  console.log('7×:', JSON.stringify(s1));
  await page.screenshot({ path: 'scripts/shot-bino-7x.png' });

  // Shift 切 12×
  await page.keyboard.press('ShiftLeft');
  await new Promise(r => setTimeout(r, 900));
  const s2 = await page.evaluate(() => ({
    binoc: window.__game.rig.binocular, fov: +window.__game.camera.fov.toFixed(1),
    mag: window.__game.rig.binoMag,
  }));
  console.log('12×:', JSON.stringify(s2));
  await page.screenshot({ path: 'scripts/shot-bino-12x.png' });

  // 确认望远镜中不能开炮
  const ammoBefore = await page.evaluate(() => window.__game.player.shellPool.ap);
  await page.mouse.click(800, 450);
  await new Promise(r => setTimeout(r, 400));
  const ammoAfter = await page.evaluate(() => window.__game.player.shellPool.ap);
  console.log('禁火验证: 开炮前AP', ammoBefore, '点击后AP', ammoAfter, ammoBefore === ammoAfter ? 'OK(未开火)' : 'FAIL(开火了!)');

  // Q 退出
  await page.keyboard.press('KeyQ');
  await new Promise(r => setTimeout(r, 800));
  const s3 = await page.evaluate(() => ({
    binoc: window.__game.rig.binocular, fov: +window.__game.camera.fov.toFixed(1),
    overlay: !document.getElementById('binoculars').classList.contains('hidden'),
    tankVisible: window.__game.player.root.visible,
  }));
  console.log('退出:', JSON.stringify(s3));

  console.log('CONSOLE ERRORS (' + errors.length + '):');
  errors.slice(0, 10).forEach(e => console.log('  ', e.slice(0, 250)));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
