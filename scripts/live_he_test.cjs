// 活体验证：真实浏览器战斗中，对敌方坦克直接调用 applyHESplash（P=3 模拟 152 HE），观察乘员/模块变化
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1600,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 300)));
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
    const lines = ['目标: ' + t.cfg.name];
    for (let i = 0; i < 8; i++) {
      const hit = { armor: 100, isTurret: false, zone: 'hullFront', localPoint: { x: 0, y: 1.5, z: 2.94 }, track: false };
      const r = t.applyHESplash(hit, { hePower: 3 });
      lines.push(`第${i + 1}发: ` + (r.events.length ? r.events.map((e) => e.label || e.mod).join('、') : '（无效果）'));
      if (t.destroyed) { lines.push('→ 目标已摧毁'); break; }
    }
    lines.push('乘员状态: ' + t.crew.map((c) => c.name + '=' + c.state).join(' '));
    return lines.join('\n');
  });
  console.log(out);
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO CONSOLE ERRORS');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(2); });
