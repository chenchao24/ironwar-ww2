// 外排轮隔离渲染 + 整车侧视（看内排轮是否保留、外排轮是否圆整）
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
    ['wheelR1,wheelR3,wheelR5,wheelR7,wheelR9', 'shot-t2o-wheels', [[6, 2.5, 0.2], [1.4, 0.5, 0.2]]],
    ['', 'shot-t2o-side', [[9, 1.2, 0.2], [0, 1.0, 0.2]]],
    ['', 'shot-t2o-front', [[6, 2.0, 8], [0, 1.4, 0]]],
  ];
  for (const [only, out, [pos, tgt]] of jobs) {
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent('model/tiger2.glb') + (only ? '&only=' + only : ''), { waitUntil: 'domcontentloaded' });
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
