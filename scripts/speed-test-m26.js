// M26 地形模式极速实测：库尔斯克(软土 0.9×越野) / 诺曼底(硬地 1.0×越野)，同图路面与野地应一致
// 预期（m26 maxSpeed 40km/h，offroadK 0.45）：kursk = 40×0.45×0.9 = 16.2；normandy = 40×0.45 = 18.0
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));

  const runMap = async (mapId, spots) => {
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((m) => {
      const s = JSON.parse(localStorage.getItem('ironwar3_settings') || '{}');
      s.mapId = m;
      localStorage.setItem('ironwar3_settings', JSON.stringify(s));
    }, mapId);
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
    await page.click('#screen-cover');
    await new Promise(r => setTimeout(r, 400));
    await page.click('#btn-hunt-mode');
    await new Promise(r => setTimeout(r, 3500));
    await page.evaluate(() => { window.__game.ui.selectedTank = 'm26'; });   // 选 M26 出战（start 时按 TANKS 取 cfg）
    await page.click('#screen-hangar [data-action="start"]');
    await new Promise(r => setTimeout(r, 5000));
    const pid = await page.evaluate(() => window.__game.player && window.__game.player.cfg.id);
    if (pid !== 'm26') throw new Error('玩家车不是 m26: ' + pid);
    const out = [];
    for (const [label, x, z, hdg] of spots) {
      out.push(await page.evaluate(async ({ x, z, hdg, label }) => {
        const g = window.__game, p = g.player;
        p.applyHit = () => ({ type: 'bounce', pen: false }); p.resolveHit = () => null;
        for (const e of g.enemies) e.place(900, 900, 0);
        p.place(x, z, hdg);
        p.speed = 0;
        g.input.keys.add('KeyW');
        const t0 = performance.now();
        let maxV = 0;
        while (performance.now() - t0 < 30000) {
          await new Promise(r => requestAnimationFrame(r));
          maxV = Math.max(maxV, Math.abs(p.speed));
        }
        g.input.keys.delete('KeyW');
        return { label, topKmh: +(maxV * 3.6).toFixed(1) };
      }, { x, z, hdg, label }));
    }
    return out;
  };

  // 库尔斯克：软土（应同为 16.2）
  const k = await runMap('kursk', [['路面', -560, -300, 69], ['野地', -400, 600, 90]]);
  // 诺曼底：硬地（应同为 18.0）
  const n = await runMap('normandy', [['空地A', -700, -500, 90], ['空地B', 300, 600, 90]]);
  console.log('M26 KURSK(soft):', JSON.stringify(k), ' NORMANDY(hard):', JSON.stringify(n), ' ERR:', errors.join('|') || 'none');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
