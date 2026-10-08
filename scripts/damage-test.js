// 伤害系统 + 1vN 集成测试：M4 出战、3 敌、API 直接结算命中、AI 实战 20s
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3000));
  // 切到 M4
  await page.click('#screen-hangar [data-action="next"]');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'scripts/shot-hangar-m4.png' });
  // 敌方数量 3（编队步进器 1→3）
  await page.click('#fh-enemy-plus');
  await page.click('#fh-enemy-plus');
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 2000));

  // ── 伤害系统 API 测试：把 0 号敌传送到玩家正前方 80m，直接结算命中 ──
  const dmg = await page.evaluate(() => {
    const g = window.__game;
    const THREE_V = g.player.pos.constructor;   // Vector3 构造
    const p = g.player, e = g.enemies[0];
    const out = {};
    // ① AP 直击炮塔正面（穿深 200 必穿）：应产生乘员/模块事件
    const dir = new THREE_V(0, 0, 1);   // 任意水平方向
    const pt = e.root.position.clone(); pt.y += 2.2;
    const hit = e.resolveHitZone(pt, dir);
    const before = e.crewAlive();
    const res = e.applyHit(hit, 200, 'ap', pt, dir, 130);
    out.pen1 = { type: res.type, events: (res.events || []).map(ev => ev.label), crewBefore: before, crewAfter: e.crewAlive(), destroyed: e.destroyed };
    // ② AP 打不穿的面（穿深 10）
    const e2 = g.enemies[1];
    const pt2 = e2.root.position.clone(); pt2.y += 1.0;
    const hit2 = e2.resolveHitZone(pt2, dir);
    const res2 = e2.applyHit(hit2, 10, 'ap', pt2, dir, 100);
    out.bounce = { type: res2.type, zone: res2.zone };
    // ③ HE 未击穿（外部毁伤，可能断履带/伤观瞄）
    const e3 = g.enemies[2];
    const pt3 = e3.root.position.clone(); pt3.y += 1.0;
    const hit3 = e3.resolveHitZone(pt3, dir);
    const res3 = e3.applyHit(hit3, 10, 'he', pt3, dir, 150);
    out.heSplash = { type: res3.type, events: (res3.events || []).map(ev => ev.label) };
    // ④ 弹药架连打到殉爆（统计）
    let det = 0;
    for (let i = 0; i < 20 && !e.destroyed; i++) {
      const r = e.applyHit(hit, 200, 'ap', pt, dir, 130);
      if (r.type === 'dead') break;
    }
    out.det1 = { destroyed: e.destroyed, detonated: e.ammoDetonated, crewLeft: e.crewAlive() };
    return out;
  });
  console.log('DAMAGE:', JSON.stringify(dmg, null, 1));

  // ── AI 实战 20s：观察敌 AI 是否推进/开火（玩家静止挨打） ──
  await new Promise(r => setTimeout(r, 20000));
  const aiState = await page.evaluate(() => {
    const g = window.__game;
    return {
      enemies: g.enemies.map(e => ({
        destroyed: e.destroyed, crew: e.crewAlive(), speed: +e.speed.toFixed(1),
        aiState: g.ais[g.enemies.indexOf(e)] ? g.ais[g.enemies.indexOf(e)].state : null,
      })),
      playerCrew: g.player.crew.map(c => c.state).join(''),
      playerDestroyed: g.player.destroyed,
      playerSpotted: g.player.spotted,
      battleTime: +g.battleTime.toFixed(1),
      state: g.state,
    };
  });
  console.log('AI-20s:', JSON.stringify(aiState, null, 1));
  await page.screenshot({ path: 'scripts/shot-1v3-battle.png' });

  console.log('CONSOLE ERRORS (' + errors.length + '):');
  errors.slice(0, 15).forEach(e => console.log('  ', e.slice(0, 300)));
  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
