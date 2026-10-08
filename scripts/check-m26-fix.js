// M26 修正后复核：右侧 R1/R2/R5 轮特写 + 整车侧面
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 300)));
  const jobs = [
    ['wheelR1', 'shot-m26fix-R1', [[3.4, 0.7, -1.72], [1.4, 0.39, -1.72]]],
    ['wheelR2', 'shot-m26fix-R2', [[3.4, 0.7, -0.98], [1.4, 0.39, -0.98]]],
    ['wheelR5', 'shot-m26fix-R5', [[3.4, 0.7, 1.22], [1.4, 0.39, 1.22]]],
    ['wheelR6', 'shot-m26fix-R6', [[3.4, 0.7, 2.01], [1.4, 0.39, 2.01]]],
    ['wheelL1,wheelL2,wheelL3', 'shot-m26fix-L123', [[-4.5, 1.2, -1.1], [0, 0.39, -1.1]]],
    ['', 'shot-m26fix-side', [[8, 1.5, 0], [0, 1.2, 0]]],
    ['', 'shot-m26fix-sideL', [[-8, 1.5, 0], [0, 1.2, 0]]],
  ];
  for (const [only, out, [pos, tgt]] of jobs) {
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent('model/m26_pershing.glb') + (only ? '&only=' + only : ''), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready || window.__fail', { timeout: 60000 });
    if (await page.evaluate(() => window.__fail)) { console.log(out, 'LOAD FAILED'); continue; }
    await sleep(400);
    await page.evaluate(([p, t]) => window.__view(...p, ...t), [pos, tgt]);
    await sleep(250);
    await page.screenshot({ path: `scripts/${out}.png` });
    console.log(out, 'ok');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
