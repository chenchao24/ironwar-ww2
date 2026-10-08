// M26 瞄具验证：us3 分划（中央短竖十字）+ 4×/8× 双档（开镜态 Shift 切档）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => { errs.push(e.message); console.error('PAGEERROR:', e.message.slice(0, 200)); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'm26'; });
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(6000);

  // 开镜（右键）→ 4× 截图
  await page.mouse.click(800, 450, { button: 'right' });
  await sleep(1200);
  const st1 = await page.evaluate(() => {
    const g = window.__game;
    return {
      aiming: g.rig.aiming,
      fov: +g.camera.fov.toFixed(2),
      reticleKey: g.ui._reticleKey,
      zoomIdx: g.rig.zoomIdx,
      mag: +(62 / g.rig.aimFovEff()).toFixed(1),
    };
  });
  console.log('开镜 4×:', JSON.stringify(st1));
  await page.screenshot({ path: 'scripts/shot-m26-scope-4x.png' });

  // Shift 切档 → 8× 截图
  await page.keyboard.press('Shift');
  await sleep(800);
  const st2 = await page.evaluate(() => {
    const g = window.__game;
    return { fov: +g.camera.fov.toFixed(2), zoomIdx: g.rig.zoomIdx, mag: +(62 / g.rig.aimFovEff()).toFixed(1) };
  });
  console.log('切档 8×:', JSON.stringify(st2));
  await page.screenshot({ path: 'scripts/shot-m26-scope-8x.png' });

  // 再按 Shift 应回到 4×
  await page.keyboard.press('Shift');
  await sleep(800);
  const st3 = await page.evaluate(() => ({ zoomIdx: window.__game.rig.zoomIdx, mag: +(62 / window.__game.rig.aimFovEff()).toFixed(1) }));
  console.log('回切 4×:', JSON.stringify(st3));
  console.log('控制台错误数:', errs.length);
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
