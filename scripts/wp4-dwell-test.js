// WP4 验证：A) AI dwell 远距确认 B) 埋伏保护 C) 玩家 dwell 角色上限 D) casemate 扇形 E) 炮塔朝向延迟
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
    ui.selectedTank = 'm4a3';
    ui.settings.factionLock = false;
    ui.settings.enemyTanks = ['jagdpanther'];
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);

  // A) AI dwell：d=1050（jagdpanther dwell 1100），玩家开火 → 疑似；手动 aiDwell ×10 → 确认
  const A = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    v.pairs.clear(); v.radioQueue.length = 0;
    p.place(-407, 607, 0); e.place(407, -207, 180);   // wp2 探针通畅位（1150m 带）
    p.speed = 0; e.speed = 0;
    v.onFire(p, [p, e]);                                // 玩家开火 → AI 疑似（带误差）
    const lv0 = v.contactInfo(e, p).level;
    const r = [];
    for (let i = 0; i < 10; i++) r.push(v.aiDwell(0.3, e, p).progress ?? (v.aiDwell(0, e, p).done ? 1 : -1));
    return { d: 1050, lv0, lvEnd: v.contactInfo(e, p).level, expect: 'lv0=1 lvEnd=2' };
  });
  console.log('A', JSON.stringify(A));

  // B) 埋伏保护：玩家 _stillT=10（tgtK×0.8 → dwell 880 < 1050）→ outOfRange，等级不变
  const B = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    v.pairs.clear(); v.radioQueue.length = 0;
    p.place(-407, 607, 0); e.place(407, -207, 180);
    p.speed = 0; e.speed = 0; p._stillT = 10;
    v.onFire(p, [p, e]);
    const r = v.aiDwell(0.3, e, p);
    return { outOfRange: !!r.outOfRange, lv: v.contactInfo(e, p).level, expect: 'outOfRange=true lv=1' };
  });
  console.log('B', JSON.stringify(B));

  // C) casemate 扇形：猎豹车尾对玩家（heading 背向），玩家侧后 900m 移动 → detectR=1200×0.5=600<900 不察觉
  const C = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    const test = (headingDeg) => {
      v.pairs.clear(); v.radioQueue.length = 0;
      e.place(300, 0, headingDeg);                     // place(x, z, deg)：deg 为车头朝向
      p.place(300, 900, 180);                          // 玩家在 e 的 +z 方向 900m
      p.speed = 5; e.speed = 0; p._stillT = 0;
      v._detect([p, e]);
      return v.contactInfo(e, p).level;
    };
    // 车头朝 +z（deg 使 atan2 朝玩家）vs 背对：先试 0/180 两值取对比
    return { toward: test(0), away: test(180), expect: 'toward=1 away=0（若相反则朝向定义相反，结论对调）' };
  });
  console.log('C', JSON.stringify(C));

  // D) 玩家 dwell 角色上限：玩家 m4a3=brawler(900)：950m 不累积、850m 累积
  const D = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    const run = (d) => {
      v.pairs.clear(); v.radioQueue.length = 0;
      p.place(0, 0, 0); e.place(0, d, 180);
      p.speed = 0; e.speed = 0; e._stillT = 0;
      const dir = { x: 0, y: 0, z: 1 };
      for (let i = 0; i < 5; i++) v.playerDwell(0.3, p, [e], dir, true);
      return v.pairs.get(p).get(e).dwellT;
    };
    return { d950: run(950), d850: +run(850).toFixed(2), expect: 'd950=0 d850>0（需 LOS 通畅）' };
  });
  console.log('D', JSON.stringify(D));

  // E) 炮塔朝向延迟：tiger 敌（换不了车，用猎豹？casemate 无炮塔——改用函数直接读 _confirmDelay）
  const E = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    p.place(0, 0, 0); e.place(400, 0, 270);
    e.turretYaw = 0; e.heading = -Math.PI / 2;         // 车体朝玩家（-x→atan2 朝西）
    const d1 = v._confirmDelay(e, p);
    e.turretYaw = Math.PI;                              // 炮塔背对
    const d2 = v._confirmDelay(e, p);
    return { casemateDelay: d1, note: 'jpz4 为 casemate 应恒 0.5', d2, expect: 'd1=0.5' };
  });
  console.log('E', JSON.stringify(E));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
