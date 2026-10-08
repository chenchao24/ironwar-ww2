// eu 模型 ±X 山墙探针（只拍镇区用到的 15 件）→ scripts/eu-facing-x/ + 对照表 eu-facing-x-sheet.png
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const MODELS = [
  'le_mans_corner', 'le_mans_corner_house_1_b_france', 'le_mans_house_1_row', 'le_mans_house_2_france',
  'le_mans_filler_house_1', 'mons_shop_2_belgium', 'angers_shop_2_france',
  'nivelles_corner_house_1_belgium', 'nivelles_corner_house_2_belgium', 'nivelles_house_6_belgium',
  'fumay_house_1_france', 'feluy_village_house_1_belgium', 'romedenne_house_1_belgium',
  'romeree_house_1_belgium', 'troyes_corner_shop_1_france', 'york_corner_shop_1',
];
(async () => {
  const stats = JSON.parse(fs.readFileSync('scripts/eu-stats.json', 'utf8'));
  const dir = 'otherModel/EuropeCity/opt';
  fs.mkdirSync('scripts/eu-facing-x', { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 420, height: 420 },
  });
  const page = await browser.newPage();
  for (const name of MODELS) {
    const f = name + '.glb';
    const r = stats.find(s => s.file === f);
    if (!r) { console.log('NO STAT', f); continue; }
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent(dir + '/' + f),
      { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => window.__ready || window.__fail, { timeout: 30000 });
    const size = Math.max(r.sizeX, r.sizeY, r.sizeZ);
    for (const [tag, px] of [['posX', 1], ['negX', -1]]) {
      await page.evaluate((px2, d) => {
        const b = window.__box;
        const cy = (b.min[1] + b.max[1]) / 2;
        window.__view(px2 * d, cy + d * 0.25, 0, 0, cy, 0);
      }, px, size * 1.6);
      await new Promise(res => setTimeout(res, 200));
      await page.screenshot({ path: `scripts/eu-facing-x/${name}_${tag}.png` });
    }
    process.stdout.write('.');
  }
  // 对照表
  const rows = MODELS.map(name => `
    <div style="display:flex;align-items:center;gap:6px;margin:4px 0">
      <div style="width:230px;font:13px monospace">${name}</div>
      <div style="text-align:center"><img src="eu-facing-x/${name}_negX.png" width="200"><div style="font:11px monospace">-X 山墙</div></div>
      <div style="text-align:center"><img src="eu-facing-x/${name}_posX.png" width="200"><div style="font:11px monospace">+X 山墙</div></div>
    </div>`).join('\n');
  fs.writeFileSync('scripts/eu-facing-x-sheet.html', `<html><body style="background:#eee;margin:10px">${rows}</body></html>`);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 700, height: 1200 });
  await page2.goto('file:///' + path.resolve('scripts/eu-facing-x-sheet.html').replace(/\\/g, '/'));
  await new Promise(r => setTimeout(r, 800));
  await page2.screenshot({ path: 'scripts/eu-facing-x-sheet.png', fullPage: true });
  console.log('\nOK');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
