// 渲染 model/m26_pershing.glb：轮件隔离 + 机枪拆分 + 整车多角度复核
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
    ['wheelR1,wheelR2,wheelR3,wheelR4,wheelR5,wheelR6', 'shot-m26-wRoad', [[4.5, 1.2, 0], [0, 0.4, 0.15]]],
    ['wheelRS,wheelLS', 'shot-m26-wS', [[3, 1.5, -2.5], [0, 0.7, -2.5]]],
    ['wheelRI,wheelLI', 'shot-m26-wI', [[3, 1.5, 2.6], [0, 0.85, 2.55]]],
    ['wheelRT1,wheelRT2,wheelRT3,wheelRT4,wheelRT5', 'shot-m26-wT', [[4, 1.8, 0], [0, 1.0, 0]]],
    ['coaxMg', 'shot-m26-coaxMg', [[2.5, 2.3, 2.2], [0, 2.0, 1.6]]],
    ['Object_23', 'shot-m26-hullMg', [[2.5, 1.5, 2.5], [0, 1.1, 1.8]]],
    ['', 'shot-m26-full', [[7.5, 4.5, 8], [0, 1.2, 0]]],
    ['', 'shot-m26-side', [[8, 1.5, 0], [0, 1.2, 0]]],
    ['', 'shot-m26-rear', [[-2, 3, -8], [0, 1.2, 0]]],
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
