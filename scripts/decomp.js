const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8081/showcase.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__showcase && window.__showcase.ready', { timeout: 90000 });
  await sleep(1500);
  const measure = (ms) => page.evaluate((ms) => new Promise(res => {
    let frames = 0; const t0 = performance.now();
    (function tick() { frames++; performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(+(frames / (performance.now() - t0) * 1000).toFixed(1)); })();
  }), ms);
  await page.evaluate(() => { window.__showcase.setView('hedge'); });
  await sleep(800);
  const full = await measure(3000);
  await page.evaluate(() => { window.__showcase.hedgeGroup.traverse(o => { if (o.isInstancedMesh) o.castShadow = false; }); });
  await sleep(400);
  const noShadow = await measure(3000);
  // 关风摆（顶点开销验证）
  await page.evaluate(() => { window.__showcase.uWindAmp.value = 0; });
  await sleep(400);
  const noWindNoShadow = await measure(3000);
  console.log(JSON.stringify({ full, hedgeShadowOff: noShadow, windAlsoOff: noWindNoShadow }, null, 1));
  await browser.close();
})();
