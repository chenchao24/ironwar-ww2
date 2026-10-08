// 后视角整车 + 主动轮斜视，确认后部挡泥板完整、轮桶无残留
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
    ['', 'shot-t2-rear', [[-6, 3.5, -8], [0, 1.2, 0]]],           // 车尾 3/4 视角
    ['wheelRS', 'shot-t2-wS-angle', [[2.6, 0.7, -1.6], [1.3, 0.64, -2.54]]], // 主动轮斜前方平视
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
