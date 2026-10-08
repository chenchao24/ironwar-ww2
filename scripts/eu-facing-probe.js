// eu 模型朝向探针：每件从 ±Z 两侧各拍一张，拼左右对照图（左=+Z 面，右=-Z 面）→ scripts/eu-facing/
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const stats = JSON.parse(fs.readFileSync('scripts/eu-stats.json', 'utf8'));
  const dir = 'otherModel/EuropeCity/opt';
  fs.mkdirSync('scripts/eu-facing', { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 420, height: 420 },
  });
  const page = await browser.newPage();
  for (const r of stats) {
    const f = r.file;
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent(dir + '/' + f),
      { waitUntil: 'networkidle0', timeout: 30000 });
    const ok = await page.waitForFunction(() => window.__ready || window.__fail, { timeout: 30000 }).then(() => true, () => false);
    if (!ok) { console.log('TIMEOUT', f); continue; }
    const size = Math.max(r.sizeX, r.sizeY, r.sizeZ);
    for (const [tag, pz] of [['posZ', 1], ['negZ', -1]]) {
      await page.evaluate((pz2, d) => {
        const b = window.__box;
        const cy = (b.min[1] + b.max[1]) / 2;
        window.__view(0, cy + d * 0.25, pz2 * d, 0, cy, 0);
      }, pz, size * 1.6);
      await new Promise(res => setTimeout(res, 200));
      await page.screenshot({ path: `scripts/eu-facing/${f.replace('.glb', '')}_${tag}.png` });
    }
    process.stdout.write('.');
  }
  console.log('\n→ scripts/eu-facing/');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
