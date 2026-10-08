const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto('http://localhost:8081/pivot-editor.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  const st = await page.evaluate(() => ({
    export: document.getElementById('export').textContent,
    readout: document.getElementById('readout').textContent,
  }));
  console.log(JSON.stringify(st, null, 1));
  await page.screenshot({ path: 'scripts/shot-pivot-editor.png' });
  console.log('ERRORS:', errs.length, errs.slice(0, 3));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
