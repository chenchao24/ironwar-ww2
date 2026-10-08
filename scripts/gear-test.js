const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 120)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 5000));
  const log = await page.evaluate(async () => {
    const g = window.__game, p = g.player;
    p.applyHit = () => ({ type: 'bounce', pen: false }); p.resolveHit = () => null;
    for (const e of g.enemies) e.place(900, 900, 0);
    const out = [];
    g.input.keys.add('KeyW');
    const t0 = performance.now();
    let lastGear = 'N';
    while (performance.now() - t0 < 30000) {
      await new Promise(r => requestAnimationFrame(r));
      const gear = document.getElementById('gear-val').textContent;
      const barW = document.getElementById('speed-fill').style.width;
      if (gear !== lastGear) { out.push({ t: +((performance.now() - t0) / 1000).toFixed(1), gear, barW, kmh: Math.round(Math.abs(p.speed) * 3.6) }); lastGear = gear; }
    }
    g.input.keys.delete('KeyW');
    return out;
  });
  console.log('GEAR_SHIFTS:', JSON.stringify(log));
  await page.screenshot({ path: 'scripts/shot-gear.png' });
  await browser.close();
})();
