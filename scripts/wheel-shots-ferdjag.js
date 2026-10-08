// 切割轮件隔离渲染截图（playbook 验收第 1 步，供目检）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1200,800', '--use-angle=default'],
    defaultViewport: { width: 1200, height: 800 },
  });
  const page = await browser.newPage();
  const shots = [
    ['model/ferdinand.glb', 'wheelR1'], ['model/ferdinand.glb', 'wheelR2'],
    ['model/ferdinand.glb', 'sprocketR'], ['model/ferdinand.glb', 'idlerR'],
    ['model/jagdpanther_g1.glb', 'wheelR1'], ['model/jagdpanther_g1.glb', 'wheelR7'],
    ['model/jagdpanther_g1.glb', 'sprocketR'], ['model/jagdpanther_g1.glb', 'idlerR'],
  ];
  for (const [glb, only] of shots) {
    await page.goto(`http://localhost:8081/glbview.html?glb=${encodeURIComponent(glb)}&only=${only}`, { waitUntil: 'domcontentloaded' });
    await sleep(2500);
    await page.screenshot({ path: `scripts/shot-wheel-${glb.includes('ferd') ? 'ferd' : 'jagp'}-${only}.png` });
    console.log('shot', only);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
