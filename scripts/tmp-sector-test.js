// 小地图视野扇面：方向 + 存在性像素验证
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
  // 炮指向世界 +x（turretYaw = π/2，heading 0）
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    for (const e of g.enemies) e.place(900, 900, 0);
    p.place(0, 0, 0);
    p.turretYaw = Math.PI / 2;
  });
  await sleep(500);
  const out = await page.evaluate(() => {
    const cv = document.getElementById('minimap');
    const ctx = cv.getContext('2d');
    const SIZE = 208, c = SIZE / 2, r1 = c * (500 / 800);
    const px = (x, y) => { const d = ctx.getImageData(Math.round(x * (cv.width / SIZE)), Math.round(y * (cv.height / SIZE)), 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    // aim = heading+turretYaw = π/2；th = -π；a0 = π/2-(π/2+π) = -π → 画布方向 (cos a0, sin a0)=(-1,0)（+x 世界在小地图的朝向）
    const aimSide = px(c - r1 * 0.7, c);       // 扇面内
    const oppSide = px(c + r1 * 0.7, c);       // 扇面外
    const dpr = cv.width / SIZE;
    // 判断"扇面内"像素与扇面外像素的差异（扇面填充是半透明暖白，叠在地形上）
    return { aimSide, oppSide, diff: Math.abs(aimSide[0] - oppSide[0]) + Math.abs(aimSide[3] - oppSide[3]) };
  });
  console.log(JSON.stringify(out));
  console.log('SECTOR VISIBLE:', out.diff > 15);
  await page.screenshot({ path: 'scripts/shot-minimap-sector.png', clip: { x: 1330, y: 8, width: 262, height: 262 } });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
