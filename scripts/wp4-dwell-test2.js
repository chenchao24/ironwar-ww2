// WP4 复测 B/C：B) 纯埋伏态（无开火窗口）dwell 应 outOfRange；C) 通畅 LOS 下的 casemate 扇形
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

  // B) 埋伏保护（开火窗口已过期）：dwell 1100×0.8=880 < 1050 → outOfRange
  const B = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    v.pairs.clear(); v.radioQueue.length = 0;
    p.place(-407, 607, 0); e.place(407, -207, 180);
    p.speed = 0; e.speed = 0; p._stillT = 10;
    p._lastFireAt = v.time - 10;                       // 开火窗口已过期（纯埋伏态）
    const st = v._st(e, p);                            // 手工造疑似（等价开火暴露已消退后的残留状态）
    st.level = 1; st.suspectTimer = 30; st.lastKnownPos = p.pos.clone();
    st.errVec = { x: 40, z: 30 }; st._errDone = true;
    const r = v.aiDwell(0.3, e, p);
    return { outOfRange: !!r.outOfRange, lv: v.contactInfo(e, p).level, expect: 'outOfRange=true lv=1' };
  });
  console.log('B', JSON.stringify(B));

  // C) casemate 扇形（通畅 LOS，(-400,0)→(500,0) 900m 带）：
  //    车头朝玩家(deg 270)→detectR=1200×tK ≥900 察觉；背对(deg 90)→×0.5=600<900 不察觉
  const C = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    p._lastFireAt = v.time - 10;
    const test = (deg) => {
      v.pairs.clear(); v.radioQueue.length = 0;
      p.place(-400, 0, 90); e.place(500, 0, deg);
      p.speed = 5; e.speed = 0; p._stillT = 0;
      v._detect([p, e]);
      const los = v.losDetail(e, p);
      return { lv: v.contactInfo(e, p).level, los: los.see ? 'see' : los.softOnly ? 'soft' : 'blocked' };
    };
    return { toward270: test(270), away90: test(90), expect: 'toward.lv=1 away.lv=0（若朝向定义相反则对调）' };
  });
  console.log('C', JSON.stringify(C));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
