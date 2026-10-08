// 渲染原始模型 m18/m36 侧面/前斜视角（切分前摸底）
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
    ['tankModel/m18.glb', '', 'shot-m18-full', [[6, 3.5, 6.5], [0, 1.0, 0]]],
    ['tankModel/m18.glb', '', 'shot-m18-side', [[6.5, 1.3, 0], [0, 1.0, 0]]],
    ['tankModel/m36_gmc.glb', '', 'shot-m36-full', [[6, 3.5, 6.5], [0, 1.0, 0]]],
    ['tankModel/m36_gmc.glb', '', 'shot-m36-side', [[6.5, 1.3, 0], [0, 1.0, 0]]],
  ];
  for (const [glb, only, out, [pos, tgt]] of jobs) {
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent(glb), { waitUntil: 'domcontentloaded' });
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
