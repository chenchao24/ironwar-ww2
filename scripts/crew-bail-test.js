// 拟真伤害体系回归：驾驶员瘫痪 / 断带趴窝 / 修理读条 / 弃车（AI+玩家模态） / 固定阵营 / AI 修理黄标
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(1500);

  // ── A1. 驾驶员阵亡 → 立即瘫痪；断带 → 不能动 ──
  const a1 = await page.evaluate(() => {
    const g = window.__game, e = g.enemies[0];
    const out = {};
    // 驾驶员阵亡
    e.crew.find(c => c.id === 'driver').state = 2;
    e.drive(0.1, 1, 0, false);
    out.driverDeadImmobile = e.immobilized === true;
    // 玩家：断带 → 不能动
    const p = g.player;
    p.mods.tracks = 1;
    p.drive(0.1, 1, 0, false);
    out.trackImmobile = Math.abs(p.speed) < 0.01;
    // 修理读条：8s 基础 + 1 项 3s = 11s
    out.repairStart = p.startRepair();
    out.repairDur = p.repairing ? +p.repairing.dur.toFixed(1) : null;
    // 读条中给油门 → 仍然不动
    p.drive(0.1, 1, 0, false);
    out.repairImmobile = Math.abs(p.speed) < 0.01;
    return out;
  });
  console.log('A1:', JSON.stringify(a1));

  // ── A2. 修理读条完成（模拟 11.2s）→ 履带修复、维修包 3→2 ──
  const a2 = await page.evaluate(() => {
    const p = window.__game.player;
    const before = p.consumables.repair;
    for (let i = 0; i < 112; i++) p.update(0.1);
    return { done: p.repairing === null, tracks: p.mods.tracks, consum: p.consumables.repair, before };
  });
  console.log('A2:', JSON.stringify(a2));

  // ── A3. AI 脱战读条修理（敌断带 + 玩家未点亮） + REPAIR 黄标 ──
  const a3 = await page.evaluate(async () => {
    const g = window.__game, e = g.enemies[0];
    e.immobilized = false;   // 撤销 A1 的驾驶员瘫痪
    e.crew.find(c => c.id === 'driver').state = 0;
    e.mods.tracks = 1;
    return { spotted: g.player.spotted, dist: Math.round(e.pos.distanceTo(g.player.pos)) };
  });
  await sleep(2600);
  const a3b = await page.evaluate(() => {
    const e = window.__game.enemies[0];
    const mk = window.__game.ui.markers.get(e);
    return { repairing: !!e.repairing, markerRepair: mk ? mk.classList.contains('repairing') : null };
  });
  console.log('A3:', JSON.stringify(a3), '→', JSON.stringify(a3b));

  // ── A4. AI 弃车：阵亡 2 人 + 强制 random=0 → bailedOut/destroyed/炮管低垂/战果计数 ──
  const a4 = await page.evaluate(() => {
    const g = window.__game, e = g.enemies[0];
    const realRandom = Math.random;
    Math.random = () => 0.01;
    e.crew.find(c => c.id === 'commander').state = 2;
    e.crew.find(c => c.id === 'gunner').state = 2;
    e._checkBail(null);
    Math.random = realRandom;
    const killsBefore = g.kills;
    return { bailedOut: e.bailedOut, destroyed: e.destroyed, gunPitch: +e.gunPitch.toFixed(2), killsBefore };
  });
  console.log('A4:', JSON.stringify(a4));
  await sleep(500);
  const a4b = await page.evaluate(() => ({ kills: window.__game.kills }));
  console.log('A4-kills:', JSON.stringify(a4b));

  // ── A5. 玩家弃车模态：阵亡 3 人 + random=0 → 模态弹出 → 确认 → 判负结算 ──
  const a5 = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const realRandom = Math.random;
    Math.random = () => 0.01;
    p.crew.find(c => c.id === 'commander').state = 2;
    p.crew.find(c => c.id === 'gunner').state = 2;
    p.crew.find(c => c.id === 'loader').state = 2;
    p._checkBail(null);
    Math.random = realRandom;
    return { bailedOut: p.bailedOut, destroyed: p.destroyed };
  });
  await sleep(800);
  const a5b = await page.evaluate(() => ({
    modal: document.getElementById('screen-bail').classList.contains('active'),
  }));
  console.log('A5:', JSON.stringify(a5), JSON.stringify(a5b));
  await page.click('#btn-bail-confirm');
  await sleep(3500);
  const a5c = await page.evaluate(() => ({ state: window.__game.state, title: document.getElementById('result-title').textContent }));
  console.log('A5-result:', JSON.stringify(a5c));

  // ── B. 固定阵营：重载页面 → M4 玩家 + 锁定 → 敌人应全是轴心（de） ──
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  const b1 = await page.evaluate(() => {
    const g = window.__game;
    g.ui.selectedTank = 'm4a3';
    g.ui.settings.factionLock = true;
    return { lockBtn: document.getElementById('fh-faction-lock').classList.contains('active') };
  });
  await page.click('#fh-enemy-plus');
  await page.click('#fh-enemy-plus');
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  const b2 = await page.evaluate(() => window.__game.enemies.map(e => e.cfg.nation));
  console.log('B:', JSON.stringify(b1), JSON.stringify(b2));

  await page.screenshot({ path: 'scripts/shot-crew-bail.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
