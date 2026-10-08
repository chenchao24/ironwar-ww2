// P2 验证：1v5 德军排级大脑——编队间距 ≥80m / 阶段流转 march→alert→engage / 狙击延迟开火 / 无错
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
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate(() => {
    const ui = window.__game.ui;
    ui.selectedTank = 'm4a3'; ui.settings.factionLock = false;
    ui.settings.enemyTanks = ['tiger1', 'panther', 'jagdpanther', 'ferdinand', 'jagdtiger'];
    ui.settings.difficulty = 'ace';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);

  // ① 编队与任务分配检查
  const s1 = await page.evaluate(() => {
    const pl = window.__game.platoon;
    if (!pl) return { platoon: false };
    return {
      platoon: true, phase: pl.phase,
      members: pl.members.map(m => `${m.tank.cfg.id}:${m.role}/${m.task}`),
      doctrine: pl.doctrine.contactReaction,
    };
  });
  console.log('SETUP', JSON.stringify(s1, null, 1));

  // ② 行军 30s：每 5s 采样最小两两间距（应 ≥80m 槽位设计；行进中允许瞬时值略低）
  let minGap = Infinity;
  for (let i = 0; i < 6; i++) {
    await sleep(5000);
    const s = await page.evaluate(() => {
      const g = window.__game;
      let min = Infinity, pair = '';
      for (let a = 0; a < g.enemies.length; a++) for (let b = a + 1; b < g.enemies.length; b++) {
        const d = Math.hypot(g.enemies[a].pos.x - g.enemies[b].pos.x, g.enemies[a].pos.z - g.enemies[b].pos.z);
        if (d < min) { min = d; pair = `${g.enemies[a].cfg.id}/${g.enemies[b].cfg.id}`; }
      }
      return { min: Math.round(min), pair, phase: g.platoon ? g.platoon.phase : '-', lineDist: g.platoon ? Math.round(g.platoon.lineDist) : 0 };
    });
    if (s.min < minGap) minGap = s.min;
    console.log(`MARCH t=${(i + 1) * 5}s`, JSON.stringify(s));
  }
  console.log('MIN_GAP', minGap, 'm（设计槽位间距 ≥80m；行进收敛中 ≥40m 可接受）');

  // ③ 阶段流转：玩家开火暴露 → alert（德军 hold）；确认 → engage 任务指令
  await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    v.onFire(g.player, [g.player, ...g.enemies]);   // 玩家开火暴露（疑似）
  });
  await sleep(1500);
  const s3 = await page.evaluate(() => {
    const g = window.__game, pl = g.platoon;
    return { phase: pl.phase, orders: pl.members.map(m => m.ai.order && m.ai.order.type), states: g.ais.map(a => a.state) };
  });
  console.log('ALERT', JSON.stringify(s3), '（德军 ambush → 应全 hold/alert）');

  // 确认玩家（直接注入 spotted）→ engage：flanker 有 flank 指令、sniper holdFire（王牌前 4s）
  await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    for (const e of g.enemies) v._confirm(v._st(e, g.player), e, g.player);
  });
  await sleep(800);
  const s4 = await page.evaluate(() => {
    const g = window.__game, pl = g.platoon;
    return { phase: pl.phase, orders: pl.members.map(m => `${m.task}:${m.ai.order && m.ai.order.type}${m.ai.order && m.ai.order.holdFire ? '/holdFire' : ''}`) };
  });
  console.log('ENGAGE', JSON.stringify(s4), '（期望 flanker:flank、sniper:sniper/holdFire、anchor:anchor）');
  await sleep(4000);
  const s5 = await page.evaluate(() => {
    const g = window.__game, pl = g.platoon;
    return { phase: pl.phase, orders: pl.members.map(m => `${m.task}:${m.ai.order && m.ai.order.type}${m.ai.order && m.ai.order.holdFire ? '/holdFire' : ''}`) };
  });
  console.log('ENGAGE+4s', JSON.stringify(s5), '（sniper holdFire 应已解除）');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
