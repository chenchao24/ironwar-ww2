// showcase 程序化验收：页面数据（变体分布/轮廓起伏/fps）+ 截图像素分析（色彩层次/细节度）
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [h, s * 100, l * 100];
}

async function hedgePixelDetail(file, roi) {
  const img = sharp(`scripts/${file}`);
  const { width: W, height: H } = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const [rx0, ry0, rx1, ry1] = roi;
  const x0 = Math.round(rx0 * W), x1 = Math.round(rx1 * W), y0 = Math.round(ry0 * H), y1 = Math.round(ry1 * H);
  const hueBands = [0, 0, 0, 0, 0];   // <55 / 55-75 / 75-95 / 95-115 / >=115 (绿色系内)
  const lum = [];                      // 绿像素亮度
  let green = 0, n = 0, detail = 0, dn = 0;
  for (let y = y0 + 1; y < y1 - 1; y += 2) for (let x = x0 + 1; x < x1 - 1; x += 2) {
    const i = (y * W + x) * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    n++;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (h >= 45 && h <= 160 && s > 14 && l > 8 && l < 80) {
      green++; lum.push(l);
      hueBands[h < 55 ? 0 : h < 75 ? 1 : h < 95 ? 2 : h < 115 ? 3 : 4]++;
    }
    // 局部细节度：相邻像素亮度差（高频纹理）
    const i2 = i + 3, i3 = i + W * 3;
    detail += Math.abs(data[i] - data[i2]) + Math.abs(data[i] - data[i3]);
    dn += 2;
  }
  lum.sort((a, b) => a - b);
  const pct = (p) => lum.length ? +lum[Math.floor(p * (lum.length - 1))].toFixed(1) : 0;
  const gb = hueBands.map(v => +(v / Math.max(green, 1) * 100).toFixed(1));
  return {
    greenPct: +(green / n * 100).toFixed(1),
    hueBands_lt55_55_75_75_95_95_115_ge115: gb,
    lumP10_P50_P90: [pct(0.1), pct(0.5), pct(0.9)],
    detailAvg: +(detail / dn).toFixed(2),
  };
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/showcase.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__showcase && window.__showcase.ready', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 2000));

  const data = await page.evaluate(() => {
    const s = window.__showcase;
    const env = Object.entries(s.hedgeTopEnvelope).map(([x, y]) => [+x, +y]).sort((a, b) => a[0] - b[0]);
    const ys = env.map(e => e[1]);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const std = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
    // 分三段看两端收低
    const third = Math.max(1, Math.floor(env.length / 4));
    const endL = ys.slice(0, third), endR = ys.slice(-third), mid = ys.slice(third, -third);
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    return {
      variants: s.hedgeVariantCounts,
      cards: s.hedgeStats.cards,
      bbox: { w: s.hedgeStats.max[0] - s.hedgeStats.min[0], h: s.hedgeStats.max[1] - s.hedgeStats.min[1], d: s.hedgeStats.max[2] - s.hedgeStats.min[2] },
      envelopeBins: env.length, envelopeStd: +std.toFixed(3),
      envelopeMin: +Math.min(...ys).toFixed(2), envelopeMax: +Math.max(...ys).toFixed(2),
      endTaperL: +avg(endL).toFixed(2), endTaperR: +avg(endR).toFixed(2), midAvg: +avg(mid).toFixed(2),
      fps: Math.round(s.fpsEMA()),
      drawCalls: (() => { return null; })(),
    };
  });
  console.log('PAGE DATA:', JSON.stringify(data, null, 1));

  // 灌木特写视角像素分析（ROI 取画面中部灌木主体）
  await page.evaluate(() => { window.__showcase.setView('hedge'); window.__showcase.uWindAmp.value = 0; });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-sc-hedge.png' });
  console.log('HEDGE PIXELS:', JSON.stringify(await hedgePixelDetail('shot-sc-hedge.png', [0.18, 0.3, 0.82, 0.85])));
  await page.evaluate(() => window.__showcase.setView('hedgeSide'));
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-sc-hedgeSide.png' });
  console.log('SIDE  PIXELS:', JSON.stringify(await hedgePixelDetail('shot-sc-hedgeSide.png', [0.2, 0.3, 0.8, 0.88])));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
