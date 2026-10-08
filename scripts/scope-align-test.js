// 开镜对中复现：2.5×/5× 下，不同俯仰、收敛后炮口指示器与屏幕中心偏差（含"甩完停稳"场景）
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
    for (const e of window.__game.enemies) { e.drive = () => {}; e.throttle = 0; e.steer = 0; e.speed = 0; }
  });
  await sleep(2500);
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });   // 右键开镜
  await sleep(1800);

  const read = () => page.evaluate(() => {
    const g = window.__game;
    const gm = document.getElementById('gun-marker');
    return {
      pitch: +g.rig.aimPitch.toFixed(3), zoom: g.rig.zoomIdx,
      aimOffset: +g.player.aimOffset.toFixed(5),
      dx: +(parseFloat(gm.style.left) - innerWidth / 2).toFixed(1),
      dy: +(parseFloat(gm.style.top) - innerHeight / 2).toFixed(1),
      gmShown: gm.style.display !== 'none',
      range: g.aimDist ? Math.round(g.aimDist) : null,
    };
  });

  for (const [pitch, zoom] of [[0, 0], [0.15, 0], [-0.1, 0], [0, 1], [0.15, 1], [-0.1, 1]]) {
    await page.evaluate((pt, z) => {
      const g = window.__game;
      g.rig.aimPitch = pt; g.rig.addAim(0, 0);
      if (g.rig.zoomIdx !== z) g.rig.cycleAimZoom();
      // 先甩一下炮塔再回正，模拟玩家实际操作
      g.rig.addAim(0.8, 0);
      g.rig.addAim(-0.8, 0);
    }, pitch, zoom);
    await sleep(600);   // 让伺服先拉开偏差
    await page.waitForFunction(() => window.__game.player.aimOffset < 0.001, { timeout: 20000 }).catch(() => {});
    await sleep(2000);   // 停稳
    const r = await read();
    console.log(`pitch=${pitch} zoom=${zoom ? '5×' : '2.5×'}`, JSON.stringify(r));
  }
  await page.screenshot({ path: 'scripts/shot-scope-align.png' });
  await browser.close();
})();
