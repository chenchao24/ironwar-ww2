// 车尾轮隔离渲染：确认摇臂混入形态
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  const jobs = [
    ['wheelRS', 'shot-arm-side', [[8, 0.64, -2.54], [1.3, 0.64, -2.54]]],
    ['wheelRS', 'shot-arm-angle', [[3.2, 1.6, -1.2], [1.4, 0.6, -2.5]]],
  ];
  for (const [only, out, [pos, tgt]] of jobs) {
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent('model/tiger2.glb') + '&only=' + only, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready || window.__fail', { timeout: 60000 });
    await sleep(400);
    await page.evaluate(([p, t]) => window.__view(...p, ...t), [pos, tgt]);
    await sleep(250);
    await page.screenshot({ path: `scripts/${out}.png` });
    console.log(out, 'ok');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
