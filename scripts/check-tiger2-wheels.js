// 渲染 model/tiger2.glb 的诱导轮（检验挡泥弧板残留）+ 整车 + 主动轮
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
    ['wheelRI,wheelLI', 'shot-t2-wI', [[3, 1.5, 3.4], [0, 0.9, 3.1]]],
    ['wheelRS,wheelLS', 'shot-t2-wS', [[3, 1.5, -2.9], [0, 1.0, -2.9]]],
    ['', 'shot-t2-full', [[8, 5, 9], [0, 1.2, 0]]],
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
