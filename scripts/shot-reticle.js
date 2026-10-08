const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2000));
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/shot-reticle-v2.png' });
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
