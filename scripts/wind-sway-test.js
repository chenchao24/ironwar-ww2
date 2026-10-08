// 灌木风摆独立验证：传送到最近灌木旁，连拍两帧做像素差分（也验证菜单背景态）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(1200);
  // 传送到最近灌木旁，镜头对准（不碰敌人，战斗不结束）
  const hedge = await page.evaluate(() => {
    const g = window.__game;
    const hf = g.world.hedgeField;
    if (!hf || !hf.hedges.length) return null;
    const p = g.player.root.position;
    let best = null, bd = 1e9;
    for (const h of hf.hedges) {
      const d = (h.cx - p.x) ** 2 + (h.cz - p.z) ** 2;
      if (d < bd) { bd = d; best = h; }
    }
    const x = best.cx + 10, z = best.cz + 10;
    g.player.pos.set(x, 0, z);
    g.player.root.position.set(x, g.world.groundY(x, z), z);
    g.player.heading = Math.atan2(best.cx - x, best.cz - z);
    g.rig.aimYaw = g.player.heading; g.rig.aimPitch = 0.10;
    return { dist: +Math.sqrt(bd).toFixed(0) };
  });
  console.log('最近灌木:', JSON.stringify(hedge));
  await sleep(900);
  await page.screenshot({ path: 'scripts/shot-wind-a.png' });
  await sleep(650);
  await page.screenshot({ path: 'scripts/shot-wind-b.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
