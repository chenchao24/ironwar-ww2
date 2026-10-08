// 排除法：同一相机分别渲染「含 wheelRS」和「移除 wheelRS」，确认碎条归属
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent('model/tiger2.glb') + '&only=wheelRS', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready || window.__fail', { timeout: 60000 });
  await sleep(400);
  await page.evaluate(() => window.__view(8, 0.64, -2.54, 1.3, 0.64, -2.54));
  await sleep(200);
  await page.screenshot({ path: 'scripts/shot-probe-with.png' });
  // 移除 wheelRS 后再渲染
  await page.evaluate(() => {
    let target = null;
    window.__scene.traverse(o => { if (o.isMesh && o.name === 'wheelRS') target = o; });
    if (target) target.parent.remove(target);
    window.__view(8, 0.64, -2.54, 1.3, 0.64, -2.54);
  });
  await sleep(200);
  await page.screenshot({ path: 'scripts/shot-probe-without.png' });
  console.log('done');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
