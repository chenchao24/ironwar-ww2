// 校验：倒树持续烟尘雪白化 + 村落配树
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
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

  // 1) 倒树持续烟尘：压倒一棵树，等落地后看 8-10s 持续烟源颜色
  await page.evaluate(() => {
    const g = window.__game, w = g.world;
    const t = w.destructibles.list.find(d => d.kind === 'inst' && d.type === 'snowpine' && d.alive && d.x < -200 && d.z > 0);
    window.__tree = t;
    if (t) {
      g.player.place(t.x - 24, t.z + 4, 0);
      g.rig.aimYaw = Math.PI / 2 + 0.15; g.rig.aimPitch = 0.04; g.rig.dist = 12;
      w.destructibles.fellTree(t, 1, 0, true);
    }
  });
  await new Promise(r => setTimeout(r, 2500));   // 倒伏完(0.85s) + 持续烟腾起
  await page.screenshot({ path: 'scripts/shot-fx3-tree-linger.png' });

  // 2) 村落配树俯瞰：村东侧看村
  await page.evaluate(() => {
    const g = window.__game;
    g.player.place(120, 50, 270);
    g.rig.aimYaw = -Math.PI / 2 + 0.2; g.rig.aimPitch = -0.02; g.rig.dist = 16;
  });
  await new Promise(r => setTimeout(r, 1100));
  await page.screenshot({ path: 'scripts/shot-fx3-village-trees.png' });

  const n = await page.evaluate(() => {
    const by = {};
    for (const d of window.__game.world.destructibles.list) by[d.type] = (by[d.type] || 0) + 1;
    return by;
  });
  console.log('COUNTS:', JSON.stringify(n));
  console.log('ERRORS:', errors.length, errors.slice(0, 4));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
