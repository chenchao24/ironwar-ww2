// showcase.html 截图自查：node scripts/showcase-shot.js
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/showcase.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__showcase && window.__showcase.ready', { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));

  const rows = await page.evaluate(() => window.__showcase.hedgeRows.map(r => {
    // 中部（去掉两端各 18%）顶面起伏统计
    const bins = Object.entries(r.env).map(([x, y]) => [+x, +y]).sort((a, b) => a[0] - b[0]);
    const lo = bins[0][0], hi = bins[bins.length - 1][0], span = hi - lo;
    const mid = bins.filter(([x]) => x >= lo + span * 0.18 && x <= hi - span * 0.18).map(([, y]) => y);
    const max = Math.max(...mid), min = Math.min(...mid);
    const mean = mid.reduce((a, b) => a + b, 0) / mid.length;
    const std = Math.sqrt(mid.reduce((a, b) => a + (b - mean) ** 2, 0) / mid.length);
    return {
      label: r.label,
      len: +((r.max[0] - r.min[0])).toFixed(2),
      topH: +(r.max[1]).toFixed(2),
      width: +((r.zMax - r.zMin)).toFixed(2),
      cards: r.cards,
      midUndulation: { min: +min.toFixed(2), max: +max.toFixed(2), swing: +(max - min).toFixed(2), std: +std.toFixed(2) },
      wanderSwing: (() => {
        const cls = Object.values(r.zEnv).map(([a, b]) => (a + b) / 2);
        return +(Math.max(...cls) - Math.min(...cls)).toFixed(2);
      })(),
    };
  }));
  console.log('ROWS:', JSON.stringify(rows, null, 1));

  const views = ['overview', 'hedgeAll', 'rowA', 'rowB', 'rowC', 'tiger', 'sherman'];
  for (const v of views) {
    await page.evaluate((name) => { window.__showcase.setView(name); window.__showcase.uWindAmp.value = 0; }, v);
    await new Promise(r => setTimeout(r, 900));
    await page.screenshot({ path: `scripts/shot-sc-${v}.png` });
    console.log('shot:', v);
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
