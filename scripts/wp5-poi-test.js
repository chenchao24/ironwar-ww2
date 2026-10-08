// WP5 POI 生成验证：两图各跑一次，统计类型分布 + 高地校验 + 边界检查
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);
  const r = await page.evaluate(async () => {
    const { generatePOIs } = await import('./js/ai/poi.js');
    const g = window.__game;
    const pois = generatePOIs(g.world, 1100);
    const byType = {};
    for (const p of pois) byType[p.type] = (byType[p.type] || 0) + 1;
    // 高地校验：每个 hill POI 应不低于 100m 四邻均值
    const gy = (x, z) => g.world.groundY(x, z);
    let hillOk = 0, hillN = 0;
    for (const p of pois.filter(q => q.type === 'hill')) {
      hillN++;
      const avg = (gy(p.x + 100, p.z) + gy(p.x - 100, p.z) + gy(p.x, p.z + 100) + gy(p.x, p.z - 100)) / 4;
      if (gy(p.x, p.z) >= avg) hillOk++;
    }
    const inBound = pois.every(p => Math.abs(p.x) <= 1100 && Math.abs(p.z) <= 1100);
    return { total: pois.length, byType, hillOk: `${hillOk}/${hillN}`, inBound,
      sample: pois.slice(0, 6).map(p => `${p.type}(${Math.round(p.x)},${Math.round(p.z)},s${p.score.toFixed(1)})`) };
  });
  console.log('POI', JSON.stringify(r, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
