// 机枪节点探针：逐候选节点隔离渲染（glbview ?glb=&only=）
const puppeteer = require('puppeteer-core');
const cases = [
  ['jumbo', 'model/m4a3e2_jumbo.glb', ['Object_8', 'Object_11', 'Object_25', 'Object_26', 'Object_27']],
  ['e8', 'model/m4a3e8.glb', ['Object_7']],
  ['firefly', 'model/sherman_firefly.glb', ['Object_21', 'Object_22', 'Object_12', 'Object_27']],
];
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=900,700'], defaultViewport: { width: 900, height: 700 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PE:', e.message.slice(0, 120)));
  for (const [tag, glb, nodes] of cases) {
    for (const n of nodes) {
      await page.goto(`http://localhost:8081/glbview.html?glb=${encodeURIComponent(glb)}&only=${n}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(r => setTimeout(r, 1200));
      await page.screenshot({ path: `scripts/shot-mg-${tag}-${n}.png` });
    }
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
