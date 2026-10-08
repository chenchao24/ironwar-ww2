// WP3 tgtK/obsK 验证：系数矩阵（直接读 _tgtK/_obsK/_autoRange）+ 端到端不对称确认
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
    window.__game.ui.selectedTank = 'jagdpanther';
    window.__game.ui.settings.enemyTanks = ['tiger1'];
  });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);

  // ── A) 系数矩阵 ──
  const coeff = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    const out = {};
    const snap = () => ({ tgtK_e: +v._tgtK(e, false).toFixed(3), obsK_e: +v._obsK(e).toFixed(3), obsK_p: +v._obsK(p).toFixed(3) });
    out.base = snap();                                     // tiger 重型 ×1.15
    e.crew.find(c => c.id === 'commander').state = 2;      // 车长阵亡
    out.cmdDead = snap();                                  // obsK_e → 0.5
    e.modules.optics.hp = 0;                               // 观瞄损毁
    out.optDead = snap();                                  // obsK_e → max(0.25, 0.5×0.4)=0.25? 0.2→floor 0.25
    e.crew.find(c => c.id === 'commander').state = 0;
    out.optOnly = snap();                                  // obsK_e → 0.4
    e._stillT = 10;                                        // 埋伏态
    out.ambush = snap();                                   // tgtK_e ×0.8
    v.onFire(e, [p, e]);                                   // 开火窗口
    out.fired = snap();                                    // tgtK_e ×1.5（叠加重型/埋伏）
    return out;
  });
  console.log('COEFF', JSON.stringify(coeff, null, 1));

  // ── B) 端到端不对称：虎式车长阵亡+观瞄损毁 → d=480 静止 ×4拍：P→E=2、E→P=1（不确认） ──
  const e2e = await page.evaluate(() => {
    const g = window.__game, v = g.visibility;
    const p = g.player, e = g.enemies[0];
    e.crew.find(c => c.id === 'commander').state = 2;      // 保持车长阵亡+观瞄损毁
    v.pairs.clear(); v.radioQueue.length = 0;
    p.place(0, -100, 90); e.place(0, 380, 270);
    p.speed = 0; e.speed = 0; p._stillT = 0; e._stillT = 0;
    const res = { d: 480, autoR_e2p: Math.round(v._autoRange(e, p, v.losDetail(e, p)) * v._tgtK(p, false)), autoR_p2e: Math.round(v._autoRange(p, e, v.losDetail(p, e)) * v._tgtK(e, false)) };
    for (let i = 0; i < 4; i++) { p.speed = 0; e.speed = 0; v._detect([p, e]); }
    res['P→E'] = v.contactInfo(p, e).level; res['E→P'] = v.contactInfo(e, p).level;
    return JSON.stringify(res) + ' (期望 P→E=2 E→P=1，autoR_e2p≈125-250 <480)';
  });
  console.log('E2E', e2e);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
