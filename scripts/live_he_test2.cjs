// 全链路诊断：真实战斗中走 applyHit 正式入口打 HE，打印 result.type 和事件
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__game && window.__game.world, { timeout: 180000, polling: 500 });
  await page.mouse.click(800, 450);
  await sleep(1200);
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  await page.waitForFunction(() => {
    const b = document.querySelector('.fh-start-btn');
    return b && !b.disabled && !window.__game._hangarBusy;
  }, { timeout: 60000, polling: 300 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  await sleep(9000);

  const out = await page.evaluate(() => {
    const g = window.__game;
    const t = g.enemies.find((e) => !e.destroyed);
    if (!t) return 'NO ENEMY';
    const lines = ['目标: ' + t.cfg.name + '，JS含超压毁伤: ' + t.applyHESplash.toString().includes('超压')];
    // 找车主炮口径 & hePower
    const p = g.player;
    lines.push('玩家: ' + p.cfg.name + ' caliber=' + p.cfg.caliber + ' heShell=' + JSON.stringify(p.cfg.heShell || null));
    // 全路径 applyHit：HE 直击车体正面（穿深 12.8 模拟 152mm HE）
    for (let i = 0; i < 6; i++) {
      const hit = { armor: 100, isTurret: false, zone: 'hullFront', localPoint: { x: 0, y: 1.5, z: 2.94 }, track: false, cosA: 1, impactAngleDeg: 0 };
      const shell = { hePower: 3, owner: { cfg: { caliber: 152 } }, shellType: 'he' };
      let r;
      try {
        r = t.applyHit(hit, 12.8, 'he', null, null, 100, shell);
        lines.push(`第${i + 1}发 type=${r.type} events=[${(r.events || []).map((e) => e.label || e.mod).join('、')}]`);
      } catch (e) {
        lines.push(`第${i + 1}发 异常: ${e.message} | ${(e.stack || '').split('\n')[1] || ''}`);
        break;
      }
      if (t.destroyed) { lines.push('→ 目标已摧毁'); break; }
    }
    lines.push('乘员: ' + t.crew.map((c) => c.name + '=' + c.state).join(' '));
    return lines.join('\n');
  });
  console.log(out);
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO CONSOLE ERRORS');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
