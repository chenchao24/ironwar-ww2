// 击毁/弃车效果 + 烟雾泄漏修复验证
// 1) 殉爆不飞头 → 炮塔顶端近垂直火柱  2) 殉爆飞头 → 炮塔抛飞  3) 弃车 → 不熏黑+舱口烟
// 4) 残骸 20-30s 后转余烬高细烟柱  5) 重开一局 → 无烟残留/无孤儿炮塔
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
  await page.click('#fh-enemy-plus');
  await page.click('#fh-enemy-plus');
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);
  const n = await page.evaluate(() => window.__game.enemies.length);
  console.log('敌人数:', n);

  // 把敌人摆到玩家正前方（沿车头朝向扇形排开），便于观察
  await page.evaluate(() => {
    const g = window.__game;
    const p = g.player.root.position;
    const h = g.player.heading;
    const fx = Math.sin(h), fz = Math.cos(h);          // 前向
    const rx = Math.cos(h), rz = -Math.sin(h);         // 右向
    const gy = (x, z) => g.world.groundY(x, z);
    g.enemies.forEach((e, i) => {
      const d = 26 + i * 3, lat = (i - 1) * 10;
      const x = p.x + fx * d + rx * lat, z = p.z + fz * d + rz * lat;
      e.pos.set(x, 0, z);
      e.root.position.set(x, gy(x, z), z);
      e.heading = h + Math.PI; e.root.rotation.y = h + Math.PI;
    });
    g.rig.aimYaw = h; g.rig.aimPitch = 0.02;
  });
  await sleep(600);

  // 1) 殉爆·不飞头（强制 random>=0.5 走喷火柱分支）
  await page.evaluate(() => {
    const g = window.__game, e = g.enemies[0];
    const orig = Math.random;
    let calls = 0;
    Math.random = () => { calls++; return 0.85; };
    e.destroy(true);
    Math.random = orig;
  });
  await sleep(1300);
  const jetState = await page.evaluate(() => {
    const e = window.__game.enemies[0];
    return { jetT: +e.jetFireT.toFixed(1), fly: !!e.turretFly, det: e.ammoDetonated,
      fires: e._wreckFires ? e._wreckFires.length : 0 };   // random=0.85 → 40% 小火点不中（应为 0）
  });
  console.log('殉爆不飞头:', JSON.stringify(jetState));
  await page.screenshot({ path: 'scripts/shot-kill-jet.png' });

  // 2) 殉爆·飞头
  await page.evaluate(() => {
    const g = window.__game, e = g.enemies[1];
    const orig = Math.random;
    Math.random = () => 0.1;
    e.destroy(true);
    Math.random = orig;
  });
  await sleep(900);
  const flyState = await page.evaluate(() => {
    const e = window.__game.enemies[1];
    return { fly: !!e.turretFly, turretDetached: e.turretGroup.parent !== e.root && e.turretGroup.parent !== e.model,
      fires: e._wreckFires ? e._wreckFires.length : 0,   // random=0.1 → 40% 小火点命中（1 处）
      firePos: e._wreckFires ? e._wreckFires[0].pos.toArray().map(v => +v.toFixed(2)) : null };
  });
  console.log('殉爆飞头:', JSON.stringify(flyState));
  await page.screenshot({ path: 'scripts/shot-kill-fly.png' });

  // 4) 余烬阶段：把两残骸的燃烧计时推过大火段（此时敌2还活着，不会触发胜利）
  await page.evaluate(() => {
    for (const e of window.__game.enemies.slice(0, 2)) { e.jetFireT = 0; e._wreckAge = e._wreckBigT + 1; }
  });
  await sleep(3000);
  await page.screenshot({ path: 'scripts/shot-wreck-smolder.png' });

  // 3) 弃车：不熏黑 + 舱口烟（放在最后——弃车即全灭触发胜利结算）
  await page.evaluate(() => { window.__game.enemies[2].bailOut([]); });
  await sleep(1400);
  const bailState = await page.evaluate(() => {
    const e = window.__game.enemies[2];
    return {
      bailed: e.bailedOut, destroyed: e.destroyed, det: !!e.ammoDetonated,
      smokeT: +e._bailSmokeT.toFixed(0),
      propFires: window.__game.world.destructibles.propFires.length,
    };
  });
  console.log('弃车:', JSON.stringify(bailState));
  await page.screenshot({ path: 'scripts/shot-bail-smoke.png' });

  // 5) 全部击毁触发胜利 → 再来一局 → 检查残留
  await page.evaluate(() => { window.__game.enemies.forEach(e => { if (!e.destroyed) e.destroy(false); }); });
  await page.waitForFunction(() => window.__game.state === 'result', { timeout: 20000 }).catch(() => {});
  await sleep(800);
  await page.click('#btn-result-retry');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 60000 });
  await sleep(1500);
  const leak = await page.evaluate(() => {
    const g = window.__game;
    let orphanTurrets = 0;
    g.scene.traverse(o => { if (/turret/i.test(o.name || '') && o.parent === g.scene) orphanTurrets++; });
    return {
      propFires: g.world.destructibles.propFires.length,
      orphanTurrets,
      state: g.state,
    };
  });
  console.log('重开泄漏检查:', JSON.stringify(leak));
  await page.screenshot({ path: 'scripts/shot-restart-clean.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
