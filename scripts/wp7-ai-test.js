// WP7 验证：A) casemate panic甩头+射界门开火+scoot  B) IS-2 fireAndCover  C) fleeOnConfirm(击穿即撤)
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function enterBattle(page, player, enemy) {
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover'); await sleep(500);
  await page.click('#btn-hunt-mode'); await sleep(3500);
  await page.evaluate((player, enemy) => {
    const ui = window.__game.ui;
    ui.selectedTank = player; ui.settings.factionLock = false;
    ui.settings.enemyTanks = [enemy]; ui.settings.difficulty = 'ace';
  }, player, enemy);
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

  // ── A) 猎豹（ambusher, scoot 0.7）：45° 离轴摆位 → panic 甩头 → 射界内才开火 → 开火后 relocate ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'm4a3', 'jagdpanther');
    await page.evaluate(() => {
      const g = window.__game, v = g.visibility;
      const p = g.player, e = g.enemies[0];
      p.place(0, 0, 0);
      e.place(0, 350, 45);   // 玩家在 -z 350m；车头朝 +z 45° → 目标离轴 ~45°+（超出射界×1.2 → panic）
      p.speed = 0; e.speed = 0;
      v._confirm(v._st(e, p), e, p);   // 预确认双向（直接进入交战态）
      v._confirm(v._st(p, e), p, e);
      const a = g.ais[0];              // 真实开火钩子（_lastFireT 含 12s 计时噪声，不可用作开火信号）
      const orig = a.onFire;
      a.onFire = (t) => { window.__aiFired = (window.__aiFired || 0) + 1; orig && orig(t); };
    });
    const rec = { heading0: null, headingEnd: null, fireRelYaw: null, fired: false, relocate: false, states: new Set() };
    let shells0 = 0;
    for (let i = 0; i < 56; i++) {   // 28s 采样
      await sleep(500);
      const s = await page.evaluate(() => {
        const g = window.__game, e = g.enemies[0], a = g.ais[0];
        const rel = Math.abs((() => {
          const ty = Math.atan2(g.player.pos.x - e.pos.x, g.player.pos.z - e.pos.z);
          let d = ty - e.heading;
          while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          return d;
        })());
        return { heading: e.heading, state: a.state, rel, fired: window.__aiFired || 0, scootT: a._scootT, dashT: a._dashT };
      });
      if (rec.heading0 === null) rec.heading0 = s.heading;
      rec.states.add(s.state);
      if (s.fired > shells0) {
        shells0 = s.fired;
        if (!rec.fired) { rec.fired = true; rec.fireRelYaw = +s.rel.toFixed(3); }
      }
      if (s.state === 'relocate' || s.scootT > 0) rec.relocate = true;
      rec.headingEnd = s.heading;
    }
    rec.states = [...rec.states];
    console.log('A', JSON.stringify(rec), '\n  期望：|headingEnd-heading0|>0.5（panic甩头）；fireRelYaw≤0.16（射界×0.8 内才开火）；fired=true');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }

  // ── B) IS-2（fireAndCover）：开火后必入掩/位移 ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'm4a3', 'is2');
    await page.evaluate(() => {
      const g = window.__game, v = g.visibility;
      const p = g.player, e = g.enemies[0];
      p.place(0, 0, 0); e.place(0, 380, 0);
      p.speed = 0; e.speed = 0;
      v._confirm(v._st(e, p), e, p);
      v._confirm(v._st(p, e), p, e);
    });
    await page.evaluate(() => {
      const g = window.__game, v = g.visibility;
      const p = g.player, e = g.enemies[0];
      p.place(0, 0, 0); e.place(0, 380, 0);
      p.speed = 0; e.speed = 0;
      v._confirm(v._st(e, p), e, p);
      v._confirm(v._st(p, e), p, e);
      const a = g.ais[0];
      const orig = a.onFire;
      a.onFire = (t) => { window.__aiFired = (window.__aiFired || 0) + 1; orig && orig(t); };
    });
    let shells0 = 0, postFire = null;
    for (let i = 0; i < 50 && !postFire; i++) {
      await sleep(500);
      const s = await page.evaluate(() => {
        const g = window.__game, a = g.ais[0];
        return { fired: window.__aiFired || 0, coverState: a.coverState, dashT: +a._dashT.toFixed(2), state: a.state };
      });
      if (s.fired > shells0) { shells0 = s.fired; postFire = s; }
    }
    console.log('B', JSON.stringify(postFire), '\n  期望：开火后 coverState=moving 或 dashT>0（fireAndCover）');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }

  // ── C) fleeOnConfirm 单元级：猎豹 AI 注入 fleeOnConfirm+_justHit → 下帧 evadeTimer>0 ──
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
    await enterBattle(page, 'm4a3', 'jagdpanther');
    const r = await page.evaluate(async () => {
      const g = window.__game, a = g.ais[0], e = g.enemies[0];
      g.player.place(0, 0, 0); e.place(0, 300, 0);
      g.player.speed = 0; e.speed = 0;
      a._role = { ...a._role, fleeOnConfirm: true };
      a._justHit = true;
      await new Promise(r2 => setTimeout(r2, 500));
      return { evadeTimer: +a.evadeTimer.toFixed(2), state: a.state };
    });
    console.log('C', JSON.stringify(r), '\n  期望：evadeTimer>0 且 state=evade（击穿即撤触发）');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
    await page.close();
  }
  await browser.close();
})();
