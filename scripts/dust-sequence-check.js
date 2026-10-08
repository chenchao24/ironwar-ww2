// 弹着尘堆时序目检：地面命中后 腾起(~0.8s) / 柱顶(~1.7s) / 下落(~2.8s) / 贴地消散(~5.5s) 四时刻近景截图
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 60000 });
  await sleep(1500);

  // 高抛点：HE 落点正前 ~60m，相机侧后平视尘柱
  const t0 = Date.now();
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    for (const e of g.enemies) e.place(900, 900, 0);
    p.place(-40, 0, 0);
    const V3 = p.pos.constructor;
    p.shellType = 'he';
    p.aimAt(new V3(20, 0, 0));   // 落点 (20,0,0)：相机在 -40 沿 +x 看，尘堆距镜头 ~60m
    for (let i = 0; i < 400; i++) p.updateTurret(1 / 60);
    p.reload = 0; g.shells.fire(p.fire());
    g.rig.aimYaw = Math.PI / 2; g.rig.aimPitch = 0.1; g.rig.dist = 16;
  });
  const maxY = () => page.evaluate(() => {
    const q = window.__game.ps.pools.smoke;
    let m = 0;
    for (let i = 0; i < q.count; i++) if (q.life[i] < q.maxLife[i] && q.maxLife[i] > 9 && q.px[i * 3 + 1] > m) m = q.px[i * 3 + 1];
    return m;
  });
  await sleep(Math.max(0, 1400 - (Date.now() - t0)));
  console.log('RISE  maxY:', (await maxY()).toFixed(2), 'm');
  await page.screenshot({ path: 'scripts/shot-dust-seq-rise.png' });
  await sleep(900);
  console.log('APEX  maxY:', (await maxY()).toFixed(2), 'm   （峰目标 7~10m）');
  await page.screenshot({ path: 'scripts/shot-dust-seq-apex.png' });
  await sleep(1100);
  console.log('FALL  maxY:', (await maxY()).toFixed(2), 'm');
  await page.screenshot({ path: 'scripts/shot-dust-seq-fall.png' });
  await sleep(2700);
  console.log('SETTLE maxY:', (await maxY()).toFixed(2), 'm');
  await page.screenshot({ path: 'scripts/shot-dust-seq-settled.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
