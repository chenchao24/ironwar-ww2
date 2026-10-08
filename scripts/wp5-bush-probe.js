const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover'); await sleep(500);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);
  const r = await page.evaluate(() => {
    const g = window.__game;
    const sb = g.world.sightBlockers || [];
    let maxCell = 0, maxAt = null;
    for (let x = -1000; x <= 1000; x += 200) for (let z = -1000; z <= 1000; z += 200) {
      let s = 0;
      for (const b of sb) if (Math.abs(b.x - x) < 200 && Math.abs(b.z - z) < 200 && Math.hypot(b.x - x, b.z - z) < 200) s++;
      if (s > maxCell) { maxCell = s; maxAt = [x, z]; }
    }
    return { total: sb.length, maxCell, maxAt, sample: sb.slice(0, 3) };
  });
  console.log(JSON.stringify(r));
  await browser.close();
})();
