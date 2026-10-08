// 渲染指定 GLB 侧视/俯视截图（看结构） 用法: node scripts/render-glb.js <glb路径> <out前缀>
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const glb = process.argv[2] || 'tankModel/pz.kpfw._vi.glb';
  const out = process.argv[3] || 'scripts/shot-glb';
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1400,900', '--use-angle=default'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('C:', m.text().slice(0, 300)); });
  await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent(glb), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready || window.__fail', { timeout: 60000 });
  if (await page.evaluate(() => window.__fail)) { console.log('LOAD FAILED'); await browser.close(); process.exit(1); }
  await sleep(500);
  console.log('box', JSON.stringify(await page.evaluate(() => window.__box)));
  const views = [
    ['sideZ', [0, 1.6, 12], [0, 1, 0]],
    ['sideX', [12, 1.6, 0], [0, 1, 0]],
    ['iso', [8, 7, 8], [0, 0.5, 0]],
  ];
  for (const [name, pos, tgt] of views) {
    await page.evaluate(([p, t]) => window.__view(...p, ...t), [pos, tgt]);
    await sleep(250);
    await page.screenshot({ path: `${out}-${name}.png` });
  }
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
