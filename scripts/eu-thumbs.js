// 欧洲小镇建筑缩略图：glbview.html 逐件截图 → scripts/eu-thumbs/<name>.png（使用文档配图）
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const dir = 'otherModel/EuropeCity/opt';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort();
  fs.mkdirSync('scripts/eu-thumbs', { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 420, height: 420 },
  });
  const page = await browser.newPage();
  for (const f of files) {
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent(dir + '/' + f),
      { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => window.__ready || window.__fail, { timeout: 30000 });
    const fail = await page.evaluate(() => !!window.__fail);
    if (fail) { console.log('\nLOAD_FAIL ' + f); continue; }
    // 按包围盒取 3/4 视角并渲染（glbview 需手动调 __view 才出图）
    await page.evaluate(() => {
      const b = window.__box;
      const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
      const d = size * 1.9;
      window.__view(cx + d * 0.75, cy + d * 0.55, cz + d * 0.75, cx, cy, cz);
    });
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: 'scripts/eu-thumbs/' + f.replace('.glb', '.png') });
    process.stdout.write(f + ' ');
  }
  console.log('\n→ scripts/eu-thumbs/');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
