// 拼接朝向对照图：每模型一行（文件名 | +Z 面 | -Z 面）→ scripts/eu-facing-sheet.png
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const files = fs.readdirSync('scripts/eu-facing').filter(f => f.endsWith('_posZ.png')).sort();
  const rows = files.map(f => {
    const name = f.replace('_posZ.png', '');
    return `<div style="display:flex;align-items:center;gap:6px;margin:4px 0">
      <div style="width:240px;font:13px monospace">${name}</div>
      <div style="text-align:center"><img src="eu-facing/${name}_posZ.png" width="200"><div style="font:11px monospace">+Z 面</div></div>
      <div style="text-align:center"><img src="eu-facing/${name}_negZ.png" width="200"><div style="font:11px monospace">-Z 面</div></div>
    </div>`;
  }).join('\n');
  fs.writeFileSync('scripts/eu-facing-sheet.html', `<html><body style="background:#eee;margin:10px">${rows}</body></html>`);
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 700, height: 1200 },
  });
  const page = await browser.newPage();
  const url = 'file:///' + path.resolve('scripts/eu-facing-sheet.html').replace(/\\/g, '/');
  await page.goto(url);
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/eu-facing-sheet.png', fullPage: true });
  await browser.close();
  console.log('sheet OK', files.length);
})();
