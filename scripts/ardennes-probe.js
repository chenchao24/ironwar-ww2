// 雪树单品审查：逐类型找实例近距离截图
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1200,700', '--use-angle=default'],
    defaultViewport: { width: 1200, height: 700 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 160)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.select('#fh-map-select', 'ardennes');
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game && window.__game.player, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const g = window.__game; g.player.applyHit = () => {}; g.player.resolveHit = () => null; });

  const spots = await page.evaluate(() => {
    const w = window.__game.world;
    const out = {};
    for (const d of w.destructibles.list) {
      if (d.kind !== 'inst' || !d.alive) continue;
      if (!out[d.type] && ['snowpine', 'snowbare', 'snowdead', 'snowdead2', 'snowbush1', 'snowbush2'].includes(d.type)) {
        out[d.type] = { x: d.x, z: d.z, h: d.srcH, s: d.s };
      }
    }
    return out;
  });
  console.log(JSON.stringify(spots));
  for (const [type, p] of Object.entries(spots)) {
    await page.evaluate((p2) => {
      const g = window.__game;
      g.player.place(p2.x - 22, p2.z, 0);
      g.rig.aimYaw = Math.PI / 2;   // 朝 +x 看
      g.rig.aimPitch = 0.12;
      g.rig.dist = 10;
    }, p);
    await new Promise(r => setTimeout(r, 900));
    await page.screenshot({ path: 'scripts/shot-snowtree-' + type + '.png' });
  }
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
