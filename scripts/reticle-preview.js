// 临时预览：渲染 us2/su2 静态分划为 PNG（双层描边类同 css/style.css）
const fs = require('fs');
const puppeteer = require('puppeteer-core');

(async () => {
  const src = fs.readFileSync('js/reticles.js', 'utf8');
  const m = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const css = `
    body { margin:0; background:#8a8560; }
    .row { display:flex; }
    .cell { width:640px; height:640px; position:relative; }
    svg { width:100%; height:100%; display:block; }
    .gs-out { stroke: rgba(255,255,255,.5); fill: none; stroke-linecap: round; }
    .gs-ink { stroke: rgba(8,10,6,.95); fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .gs-num { fill: rgba(8,10,6,.88); stroke: rgba(255,255,255,.55); stroke-width: 2.6; paint-order: stroke fill;
      font-size: 12px; font-family: "Consolas", monospace; }
    .gs-num2 { fill: rgba(8,10,6,.88); stroke: none; font-family: "Consolas", monospace; }
  `;
  const cell = (key) => `<div class="cell"><svg viewBox="0 0 1000 1000"><g class="gs-ret gs-ret-${key}">${m.RETICLES[key]()}</g></svg></div>`;
  const html = `<html><head><style>${css}</style></head><body><div class="row">${cell('us2')}${cell('su2')}</div></body></html>`;
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 640 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'scripts/out-reticle-preview.png' });
  await browser.close();
  console.log('ok -> scripts/out-reticle-preview.png');
})().catch(e => { console.error(e); process.exit(1); });
