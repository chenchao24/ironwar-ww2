// 后效结算坐标系验证：平地 vs 车体前倾（坡上/顶石头）侧面射击，统计击穿后有效毁伤事件
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  const out = await page.evaluate(() => {
    const g = window.__game;
    g.paused = true;   // 暂停战斗循环，防止物理每帧重置车体姿态
    const e = g.enemies[0];
    const V = Object.getPrototypeOf(e.root.position).constructor;
    const result = {};
    for (const tilt of [0, 0.22, -0.22]) {
      e.root.rotation.x = tilt;
      e.root.updateWorldMatrix(true, true);
      // 从 +x 侧面水平射击车体中部（世界系真实方向）
      const wp = e.root.localToWorld(new V(e.cfg.dims.width / 2 + 0.6, 1.1, 0));
      const ctr = e.root.localToWorld(new V(0, 1.1, 0));
      const wd = ctr.sub(wp).normalize();
      let hits = 0, eventful = 0, crewEv = 0, modEv = 0;
      for (let i = 0; i < 30; i++) {
        // 快照/恢复：每发独立（成员/模块满状态）
        const crewSnap = e.crew.map(c => c.state);
        const hpSnap = {}; for (const k in e.modules) hpSnap[k] = e.modules[k].hp;
        const tracksSnap = e.mods.tracks, deadSnap = e.destroyed, bailSnap = e.bailedOut;
        const pendSnap = e.pendingEvents.length, rpSnap = (e._recentPens || []).length;
        const hit = e.resolveHitZone(wp.clone(), wd.clone());
        if (hit) {
          hits++;
          const res = e.applyHit(hit, 999, 'ap', hit.worldPos, wd.clone(), 200);
          const evs = res.events.filter(ev => ev.type !== 'exit');
          if (evs.length) eventful++;
          crewEv += evs.filter(ev => ev.type === 'crew').length;
          modEv += evs.filter(ev => ev.type === 'module' || ev.type === 'fire' || ev.type === 'ammo_boom').length;
        }
        e.crew.forEach((c, j) => { c.state = crewSnap[j]; });
        for (const k in e.modules) e.modules[k].hp = hpSnap[k];
        e.mods.tracks = tracksSnap; e.destroyed = deadSnap; e.bailedOut = bailSnap;
        e.pendingEvents.length = pendSnap;
        if (e._recentPens) e._recentPens.length = rpSnap;
      }
      result['tilt' + tilt] = { hits, eventful, crewEv, modEv };
    }
    e.root.rotation.x = 0;
    e.root.updateWorldMatrix(true, true);
    g.paused = false;
    return { enemy: e.cfg.id, result };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
