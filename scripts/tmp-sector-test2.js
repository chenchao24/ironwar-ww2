// 视野扇面跟随屏幕视线（rig.aimYaw）验证：转鼠标视角，扇面应跟随而非跟随炮管
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 150)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(6500);
  await page.click('#screen-hangar [data-action="start"]'); await sleep(7000);
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    for (const e of g.enemies) e.place(900, 900, 0);
    p.place(0, 0, 0);
  });
  await sleep(300);
  // 场景一：炮塔在 0（正前），鼠标视角转 90°（世界 +x）→ 扇面应在 +x 侧
  await page.evaluate(() => { window.__game.rig.aimYaw = Math.PI / 2; });
  await sleep(400);
  const read = () => page.evaluate(() => {
    const cv = document.getElementById('minimap'), ctx = cv.getContext('2d');
    const SIZE = 208, c = SIZE / 2, r1 = c * (500 / 800), dpr = cv.width / SIZE;
    const px = (x, y) => { const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data; return d[0] + d[1] + d[2]; };
    // rig.aimYaw = π/2（世界 +x）；th = -π → a0 = π/2-(π/2+π) = -π → 屏幕方向 (-1,0)
    return { viewSide: px(c - r1 * 0.7, c), oppSide: px(c + r1 * 0.7, c) };
  });
  const s1 = await read();
  // 场景二：炮塔明显偏左（turretYaw = -0.6），但视线看向 -x（aimYaw = -π/2）→ 扇面仍应跟视线（-x → 屏幕右侧）
  await page.evaluate(() => { window.__game.player.turretYaw = -0.6; window.__game.rig.aimYaw = -Math.PI / 2; });
  await sleep(300);
  const s2 = await read();   // aim -π/2 → a0 = π/2-(-π/2+π) = 0 → 屏幕方向 (+1,0) 右侧
  console.log('场景1 视线+x: 视线侧亮度', s1.viewSide, '对侧', s1.oppSide, '→ 扇面跟视线:', s1.viewSide > s1.oppSide);
  console.log('场景2 炮塔-0.6/视线-x: 视线侧亮度', s2.oppSide, '对侧', s2.viewSide, '→ 扇面跟视线(右侧):', s2.oppSide > s2.viewSide);
  await page.screenshot({ path: 'scripts/shot-minimap-sector.png', clip: { x: 1330, y: 8, width: 262, height: 262 } });
  console.log('ERRORS: 0');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
