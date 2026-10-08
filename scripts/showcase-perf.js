// showcase 性能测量：灌木带 显示/隐藏 对比帧率（3s 采样），近景=最坏情况，远景=常规
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/showcase.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__showcase && window.__showcase.ready', { timeout: 90000 });
  await sleep(1500);

  const measure = (ms) => page.evaluate((ms) => new Promise(res => {
    let frames = 0; const t0 = performance.now();
    (function tick() { frames++; performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(+(frames / (performance.now() - t0) * 1000).toFixed(1)); })();
  }), ms);
  const info = () => page.evaluate(() => {
    const i = window.__showcase.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures };
  });

  // ── 场景A：灌木特写（灌木占满画面 = overdraw 最坏情况） ──
  await page.evaluate(() => { window.__showcase.setView('hedge'); window.__showcase.uWindAmp.value = 1; });
  await sleep(800);
  const closeOn = await measure(3000);
  const infoCloseOn = await info();
  await page.evaluate(() => { window.__showcase.hedgeGroup.visible = false; });
  await sleep(400);
  const closeOff = await measure(3000);
  const infoCloseOff = await info();

  // ── 场景B：全景（常规观察距离） ──
  await page.evaluate(() => { window.__showcase.hedgeGroup.visible = true; window.__showcase.setView('overview'); });
  await sleep(800);
  const farOn = await measure(3000);
  const infoFarOn = await info();
  await page.evaluate(() => { window.__showcase.hedgeGroup.visible = false; });
  await sleep(400);
  const farOff = await measure(3000);

  console.log(JSON.stringify({
    '特写_灌木开': { fps: closeOn, ...infoCloseOn },
    '特写_灌木关': { fps: closeOff, ...infoCloseOff },
    '全景_灌木开': { fps: farOn, ...infoFarOn },
    '全景_灌木关': { fps: farOff },
    '差值_特写': +(closeOn - closeOff).toFixed(1),
    '差值_全景': +(farOn - farOff).toFixed(1),
  }, null, 1));
  await browser.close();
})();
