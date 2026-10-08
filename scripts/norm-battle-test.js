// 诺曼底实战抽查：1v1 AI 45s 行为观察（移动/报错/FPS）+ 中途换图重建（normandy→kursk）
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Missing')) errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 140)));
  await page.evaluateOnNewDocument(() => {
    const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
    s.mapId = 'normandy';
    localStorage.setItem('ironwar3_settings', JSON.stringify(s));
  });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 5000));
  await page.evaluate(() => { const g = window.__game; g.player.applyHit = () => {}; g.player.resolveHit = () => null; });

  // AI 行为观察：每 10s 记录敌车位置/状态/FPS
  for (let t = 0; t < 5; t++) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      const e = g.enemies[0];
      return {
        map: g.world.mapId,
        enemy: e ? { x: +e.pos.x.toFixed(0), z: +e.pos.z.toFixed(0), destroyed: e.destroyed, spotted: !!e.spotted } : null,
        aiState: g.ais[0] ? g.ais[0].state : null,
        fps: document.getElementById('fps') ? document.getElementById('fps').textContent : null,
        calls: g.renderer.info.render.calls,
      };
    });
    console.log('T' + (t * 10) + 's:', JSON.stringify(s));
    if (t < 4) await new Promise(r => setTimeout(r, 10000));
  }

  // 中途换图：normandy → kursk（验证 world dispose + rebuild 路径）
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.settings.mapId = 'kursk';
    g._startBattle();
  });
  await new Promise(r => setTimeout(r, 6000));
  const sw = await page.evaluate(() => {
    const g = window.__game;
    return { map: g.world.mapId, size: g.world.mapSize, obstacles: g.world.obstacles.length,
      hedges: g.world.hedgeField ? g.world.hedgeField.stats.hedges : 0 };
  });
  console.log('SWITCH_TO_KURSK:', JSON.stringify(sw));
  // 再切回诺曼底（双向重建）
  await page.evaluate(() => {
    const g = window.__game;
    g.ui.settings.mapId = 'normandy';
    g._startBattle();
  });
  await new Promise(r => setTimeout(r, 6000));
  const sw2 = await page.evaluate(() => {
    const g = window.__game;
    return { map: g.world.mapId, obstacles: g.world.obstacles.length, sightBlockers: g.world.sightBlockers.length,
      hedges: g.world.hedgeField ? g.world.hedgeField.stats.hedges : 0 };
  });
  console.log('SWITCH_BACK_NORMANDY:', JSON.stringify(sw2));
  console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
