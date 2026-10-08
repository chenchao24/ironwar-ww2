// 开镜后充分等待（3s）再测指示器偏差（含第三人称对照）
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 3000));
  const read = () => page.evaluate(() => {
    const p = window.__game.player;
    const gm = document.getElementById('gun-marker');
    return {
      offset: [+((parseFloat(gm.style.left) || 0) - 800).toFixed(1), +((parseFloat(gm.style.top) || 0) - 450).toFixed(1)],
      aimOffset: +p.aimOffset.toFixed(4),
    };
  });
  // 大角度转向后充分收敛
  await page.evaluate(() => { window.__game.rig.aimYaw += Math.PI * 2 / 3; });
  await new Promise(r => setTimeout(r, 14000));
  const tp = await read();
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 3000));
  const sc = await read();
  console.log(JSON.stringify({ thirdPerson: tp, scoped: sc, ERRORS: errors.length }));
  await page.screenshot({ path: 'scripts/shot-scope-tiger.png' });
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
