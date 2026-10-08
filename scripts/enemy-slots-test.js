// 敌方编队编辑器回归：数量步进 1↔5 / 逐槽选车型 / 阵营过滤与失效回退 / 指定车型进战斗 / 零报错
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--window-size=1600,900', '--use-angle=default', '--enable-unsafe-webgpu'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  const fails = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  const ck = (name, v) => { console.log((v ? 'OK  ' : 'FAIL') + ' ' + name); if (!v) fails.push(name); };

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);

  // ── A. 步进器：1 → 5 → 上限封顶 → 减回下限 ──
  const a0 = await page.evaluate(() => ({
    cnt: document.getElementById('fh-enemy-count').textContent,
    rows: document.querySelectorAll('#fh-enemy-list .fh-enemy-slot').length,
    slots: window.__game.ui.settings.enemyTanks.slice(),
  }));
  ck('A1 默认 1 辆/1 槽/random', a0.rows === 1 && a0.slots.join() === 'random' && a0.cnt.includes('1'));
  for (let i = 0; i < 6; i++) await page.click('#fh-enemy-plus');   // 点 6 次应封顶 5
  const a1 = await page.evaluate(() => ({
    cnt: document.getElementById('fh-enemy-count').textContent,
    rows: document.querySelectorAll('#fh-enemy-list .fh-enemy-slot').length,
    slots: window.__game.ui.settings.enemyTanks.slice(),
  }));
  ck('A2 步进封顶 5 辆/5 槽', a1.rows === 5 && a1.slots.length === 5 && a1.cnt.includes('5'));
  for (let i = 0; i < 6; i++) await page.click('#fh-enemy-minus');  // 点 6 次应封底 1
  const a2 = await page.evaluate(() => document.querySelectorAll('#fh-enemy-list .fh-enemy-slot').length);
  ck('A3 步进封底 1 辆', a2 === 1);

  // ── B. 阵营过滤：玩家 tiger1（轴心）+ 锁定 → 下拉只列同盟车型 ──
  const b1 = await page.evaluate(() => {
    const g = window.__game;
    g.ui.settings.factionLock = true;
    g.ui._refreshEnemySlotOptions();
    const sel = document.querySelector('#fh-enemy-list .fh-es-select');
    return [...sel.options].map((o) => o.value);
  });
  ck('B1 锁定轴心玩家只列同盟+随机', b1.join() === ['random', 'm4a3', 'm10', 'cromwell', 't34-85', 'is2'].join());

  // ── C. 逐槽指定车型 + 失效回退（锁定时选同阵营车型 → 换玩家/锁定后回退 random） ──
  for (let i = 0; i < 4; i++) await page.click('#fh-enemy-plus');   // 回到 5 槽
  const c1 = await page.evaluate(() => {
    const g = window.__game;
    const picks = ['m4a3', 'is2', 'random', 't34-85', 'm10'];
    document.querySelectorAll('#fh-enemy-list .fh-es-select').forEach((sel, i) => {
      sel.value = picks[i];
      sel.dispatchEvent(new Event('change'));
    });
    return g.ui.settings.enemyTanks.slice();
  });
  ck('C1 五槽指定车型写入 settings', c1.join() === 'm4a3,is2,random,t34-85,m10');
  const pv = await page.evaluate(() => document.getElementById('fh-preview-text').textContent);
  ck('C2 预览只留模式/地图（对手/规则/弹药/消耗品已移除）',
    pv.includes('猎杀模式 1v5') && pv.includes('库尔斯克') && !pv.includes('对手') && !pv.includes('规则') && !pv.includes('消耗品'));
  // 切到 m4a3 玩家（同盟）→ 槽内同盟车型全部失效回退 random
  const c2 = await page.evaluate(() => {
    const g = window.__game;
    g.ui.selectedTank = 'm4a3';
    g.ui._refreshEnemySlotOptions();
    return g.ui.settings.enemyTanks.slice();
  });
  ck('C3 阵营失效选择回退 random', c2.join() === 'random,random,random,random,random');
  // 关掉固定阵营 → 轴心车型可选
  const c3 = await page.evaluate(() => {
    const g = window.__game;
    g.ui.settings.factionLock = false;
    g.ui._refreshEnemySlotOptions();
    const sel = document.querySelector('#fh-enemy-list .fh-es-select');
    return [...sel.options].map((o) => o.value);
  });
  ck('C4 混编时全 13 车可选', c3.length === 14 && c3.includes('tiger2') && c3.includes('m4a3') && c3.includes('jagdtiger'));

  // ── D. 指定编队进战斗：5 辆轴心重坦（玩家 m4a3，混编） ──
  await page.evaluate(() => {
    const g = window.__game;
    const picks = ['tiger2', 'panther', 'ferdinand', 'jagdpanther', 'tiger1'];
    document.querySelectorAll('#fh-enemy-list .fh-es-select').forEach((sel, i) => {
      sel.value = picks[i];
      sel.dispatchEvent(new Event('change'));
    });
  });
  await page.screenshot({ path: 'scripts/shot-enemy-slots.png' });
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2000);
  const d1 = await page.evaluate(() => ({
    n: window.__game.enemies.length,
    keys: window.__game.enemies.map((e) => e.cfg.id),
    ais: window.__game.ais.length,
  }));
  ck('D1 战场 5 敌 + 5 AI', d1.n === 5 && d1.ais === 5);
  ck('D2 敌车型号与槽位一致', d1.keys.join() === 'tiger2,panther,ferdinand,jagdpanther,tiger1');
  await page.screenshot({ path: 'scripts/shot-enemy-slots-battle.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  console.log(fails.length ? `FAILED: ${fails.length}` : 'ALL PASS');
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
