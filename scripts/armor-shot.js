// armor-view.html 截图自查：node scripts/armor-shot.js [tankId]
const puppeteer = require('puppeteer-core');
const tank = process.argv[2] || 'tiger1';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto(`http://localhost:8081/armor-view.html?tank=${tank}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__armor && window.__armor.ready', { timeout: 60000 });
  await new Promise(r => setTimeout(r, 800));
  for (const v of ['persp', 'side', 'front', 'top']) {
    await page.evaluate((name) => window.__armor.setView(name), v);
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: `scripts/shot-armor-${tank}-${v}.png` });
    console.log('shot:', v);
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
