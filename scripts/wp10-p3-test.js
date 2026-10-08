// P3 验收：T3 远距狙击换位循环（无死锁）/ T4 岩石口袋脱困阶梯 / T5 炮闩损毁不坐死
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function enterBattle(page, player, enemies, difficulty = 'ace') {
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 120000 });
  await page.click('#screen-cover'); await sleep(400);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate((player, enemies, difficulty) => {
    const ui = window.__game.ui;
    ui.selectedTank = player; ui.settings.factionLock = false;
    ui.settings.enemyTanks = [enemies].flat(); ui.settings.difficulty = difficulty;
  }, player, enemies, difficulty);
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });

  // ── T4 岩石口袋：AI 围进障碍环 → L1 反复失败 → L2 大绕行 → 逃出/拉黑目标 ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'm4a3', 'tiger1', 'ace');
    await page.evaluate(() => {
      const g = window.__game, e = g.enemies[0];
      e.place(300, 300, 0);
      // 岩石口袋：8 块障碍围成 ~14m 半径环
      for (const [ox, oz, r] of [[312, 300, 6], [288, 300, 6], [300, 312, 6], [300, 288, 6], [308.5, 308.5, 5], [291.5, 291.5, 5], [308.5, 291.5, 5], [291.5, 308.5, 5]]) {
        g.world.obstacles.push({ x: ox, z: oz, r, topY: 5 });
      }
    });
    let maxLog = 0, escaped = false;
    for (let i = 0; i < 40; i++) {   // 80s
      await sleep(2000);
      const s = await page.evaluate(() => {
        const g = window.__game, a = g.ais[0], e = g.enemies[0];
        return { d: Math.round(Math.hypot(e.pos.x - 300, e.pos.z - 300)), log: (a._unstickLog || []).length, state: a.state };
      });
      if (s.log > maxLog) maxLog = s.log;
      if (s.d > 40) { escaped = true; console.log(`T4 逃出 @${(i + 1) * 2}s d=${s.d}`); break; }
    }
    console.log('T4', JSON.stringify({ maxLog, escaped }), '（期望：log 升到 ≥3（L2 触发）且最终逃出或 L3 拉黑）');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }

  // ── T5 火力丧失：虎王炮闩损毁+无维修 → holding 超时 → _fireDead → 游走不坐死 ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'm4a3', 'tiger2', 'ace');
    await page.evaluate(() => {
      const g = window.__game, v = g.visibility, e = g.enemies[0];
      g.player.place(0, 0, 0); e.place(0, 300, 0);
      g.player.speed = 0; e.speed = 0;
      v._confirm(v._st(e, g.player), e, g.player);   // 预确认进入交战
      e.modules.breech.hp = 0;                        // 炮闩损毁
      e.consumables.repair = 0;                       // 无维修包
    });
    let fireDead = false, moved = 0, lastPos = null;
    for (let i = 0; i < 35; i++) {   // 70s
      await sleep(2000);
      const s = await page.evaluate(() => {
        const g = window.__game, a = g.ais[0], e = g.enemies[0];
        return { fd: a._fireDead, x: e.pos.x, z: e.pos.z, state: a.state };
      });
      if (s.fd) fireDead = true;
      if (lastPos) moved += Math.hypot(s.x - lastPos.x, s.z - lastPos.z);
      lastPos = s;
      if (fireDead && moved > 30) break;
    }
    console.log('T5', JSON.stringify({ fireDead, moved: Math.round(moved) }), '（期望：fireDead=true 且持续机动 >30m）');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }

  // ── T3 狙击换位循环：玩家每 18s 打一炮换位 50m；AI  dwell/冷却/再搜索循环无死锁 ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'jagdtiger', 'jagdpanther', 'ace');
    await page.evaluate(() => {
      const g = window.__game;
      g.player.place(0, 0, 0); g.enemies[0].place(0, 1000, 180);
      g.player.speed = 0; g.enemies[0].speed = 0;
    });
    const stateHist = {};
    let reloc = 0;
    for (let i = 0; i < 70; i++) {   // 140s
      await sleep(2000);
      const s = await page.evaluate(() => {
        const g = window.__game, a = g.ais[0];
        const ci = g.visibility.contactInfo(g.enemies[0], g.player);
        return { state: a.state, lv: ci.level, dwellCd: !!(g.visibility.pairs.get(g.enemies[0]) && g.visibility.pairs.get(g.enemies[0]).get(g.player) && g.visibility.pairs.get(g.enemies[0]).get(g.player).dwellCdUntil) };
      });
      stateHist[s.state] = (stateHist[s.state] || 0) + 1;
      if ((i + 1) % 9 === 0) {   // 每 18s：开火事件 + 换位 50m
        reloc++;
        await page.evaluate(() => {
          const g = window.__game, v = g.visibility;
          v.onFire(g.player, [g.player, ...g.enemies]);
          g.player.place(g.player.pos.x + 50, g.player.pos.z, 0);
          g.player.speed = 0;
        });
      }
    }
    console.log('T3', JSON.stringify({ reloc, stateHist }), '（期望：状态在 search/alert/flank 间循环，无单状态冻结全程）');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
