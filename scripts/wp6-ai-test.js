// WP6 验证：①搜索状态走 POI 不走真坐标 ②节奏总监 L2/L3 升级 ③王牌 60s 浸泡无错
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
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => {
    const ui = window.__game.ui;
    ui.selectedTank = 'jagdpanther';
    ui.settings.factionLock = false;
    ui.settings.enemyTanks = ['tiger1'];
    ui.settings.difficulty = 'ace';
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);

  // ① 远距摆位（>1300m，双静），AI 应走 POI 而非直冲玩家
  const s1 = await page.evaluate(() => {
    const g = window.__game;
    g.player.place(-900, -900, 45); g.enemies[0].place(900, 900, 225);
    g.player.speed = 0; g.enemies[0].speed = 0;
    return g.ais[0].state;
  });
  await sleep(20000);
  const s2 = await page.evaluate(() => {
    const g = window.__game, a = g.ais[0], e = g.enemies[0];
    return {
      state: a.state, level: a._searchLevel,
      searchPoi: a._searchPoi ? `${a._searchPoi.type}(${Math.round(a._searchPoi.x)},${Math.round(a._searchPoi.z)})` : null,
      visited: a._visited.size,
      distToPlayer: Math.round(Math.hypot(e.pos.x - g.player.pos.x, e.pos.z - g.player.pos.z)),
      ciLevel: g.visibility.contactInfo(e, g.player).level,
    };
  });
  console.log('SEARCH', s1, '→', JSON.stringify(s2), '(期望 state=search，有 searchPoi/visited，ciLevel=0，未直线逼近）');

  // ② 节奏升级：人工推无接触时长 → L2/L3 行为
  const s3 = await page.evaluate(() => {
    const g = window.__game, a = g.ais[0];
    a._noContactT = 80;   // ≥75 → L2 地图控制
    return 'set80';
  });
  await sleep(3000);
  const s4 = await page.evaluate(() => {
    const a = window.__game.ais[0];
    return { level: a._searchLevel, poi: a._searchPoi ? `${a._searchPoi.type}(${Math.round(a._searchPoi.x)},${Math.round(a._searchPoi.z)})` : null };
  });
  await page.evaluate(() => { window.__game.ais[0]._noContactT = 110; });   // ≥105 → L3 梳篦
  await sleep(3000);
  const s5 = await page.evaluate(() => {
    const a = window.__game.ais[0];
    return { level: a._searchLevel, poi: a._searchPoi ? `${a._searchPoi.type}(${Math.round(a._searchPoi.x)},${Math.round(a._searchPoi.z)})` : null };
  });
  console.log('PACING L2', JSON.stringify(s4), '(期望 level=2)');
  console.log('PACING L3', JSON.stringify(s5), '(期望 level=3 且 poi.type=node)');

  // ③ 浸泡：玩家挂机 40s，AI 状态机运转无错（超时表/脱困自然触发）
  const states = [];
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    states.push(await page.evaluate(() => window.__game.ais[0].state));
  }
  const uniq = [...new Set(states)];
  console.log('SOAK40s states:', uniq.join(','), '(期望至少 search，无卡死)');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
