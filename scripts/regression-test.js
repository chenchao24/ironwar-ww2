// 回归验证：切车 → M4 出战 → 瞄具 → 伤害全链路
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 5000));   // 等虎式初始装载完成
  await page.click('#screen-hangar [data-action="next"]');
  await new Promise(r => setTimeout(r, 4000));
  const hangar = await page.evaluate(() => ({
    sel: window.__game.ui.selectedTank,
    pager: document.getElementById('fh-pager-name').textContent,
    shown: window.__game.menuTank ? window.__game.menuTank.cfg.id : null,
  }));
  console.log('车库:', JSON.stringify(hangar));
  await page.screenshot({ path: 'scripts/shot-hangar-m4.png' });
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2000));
  const battle = await page.evaluate(() => {
    const g = window.__game;
    return { player: g.player.cfg.id, enemies: g.enemies.map(e => e.cfg.id), zoom: g.player.cfg.zoomFov };
  });
  console.log('战斗:', JSON.stringify(battle));
  // 开镜看 M70 分划
  await page.keyboard.press('Shift');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'scripts/shot-scope-m4.png' });
  // 关镜，强制近距命中测试：把敌人拉到正前 60m，用游戏 API 开火
  const penTest = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player, e = g.enemies[0];
    // 敌人拉到玩家正前方 60m（玩家朝向 +z 局部）
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    e.pos.set(p.pos.x + fx * 60, 0, p.pos.z + fz * 60);
    e._syncTransform(1);
    // 直接结算 3 发 AP（穿深 104 → M4 侧/正大概率穿虎式侧面 80mm）
    const THREE_V = p.pos.constructor;
    const dir = new THREE_V(fx, 0, fz);
    const results = [];
    for (let i = 0; i < 3 && !e.destroyed; i++) {
      const pt = e.root.position.clone(); pt.y += 1.2;
      const hit = e.resolveHitZone(pt, dir);
      const r = e.applyHit(hit, 104, 'ap', pt, dir, 100);
      results.push({ type: r.type, zone: r.zone, events: (r.events || []).map(ev => ev.label).slice(0, 4) });
    }
    return { results, enemyDestroyed: e.destroyed, enemyCrew: e.crewAlive() };
  });
  console.log('近距命中:', JSON.stringify(penTest));
  console.log('CONSOLE ERRORS (' + errors.length + '):');
  errors.slice(0, 10).forEach(e => console.log('  ', e.slice(0, 250)));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
