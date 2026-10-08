// 2026-09-23 APCR 改造冒烟测试 v2：封面 → 猎杀模式 → 车库 → 开战 → 切弹 1/2/3 → 截图弹药面板
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
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 300)));

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  // 等全部模型加载完（world 就绪）再操作，否则会抢跑 _startBattle 撞上 this.world === null
  await page.waitForFunction(() => window.__game && window.__game.world, { timeout: 180000, polling: 500 });
  console.log('world ready');
  // 封面：任意点击进入主菜单（用 evaluate 点击，绕过覆盖层命中判定）
  await page.mouse.click(800, 450);
  await sleep(1500);
  const menuOn = await page.evaluate(() => document.getElementById('screen-menu').classList.contains('active'));
  console.log('menu active:', menuOn);
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  console.log('hangar active: true');
  // 等车库展示车就绪（开始按钮解除禁用态）
  await page.waitForFunction(() => {
    const b = document.querySelector('.fh-start-btn');
    return b && !b.disabled && !window.__game._hangarBusy;
  }, { timeout: 60000, polling: 300 }).catch(() => console.log('WARN: start-btn ready wait timed out, proceeding'));
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());   // 显式选图，驱动内部状态
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  console.log('battle starting...');
  await sleep(9000);   // 战斗载入（模型+地图）

  const rows1 = await page.$$eval('.am-row', (rs) => rs.map((r) => r.textContent.trim().replace(/\s+/g, ' ')));
  console.log('ammo rows:', JSON.stringify(rows1));

  // 按 3 切 APCR（若本车有），截图
  await page.keyboard.press('3');
  await sleep(600);
  const active1 = await page.evaluate(() => {
    const a = document.querySelector('.am-row.active');
    return a ? a.textContent.trim().replace(/\s+/g, ' ') : null;
  });
  console.log('after key 3, active:', active1);
  await page.screenshot({ path: '_smoke_apcr_ui.png' });

  // 切回 1，开一炮（无头模式拿不到 pointer lock，直接注入 firePressed 走真实 fire 路径）
  await page.keyboard.press('1');
  // 切弹会触发装填，等装完再开火（否则 firePressed 被 consumeFire 白消费）
  await page.waitForFunction(() => window.__game.player.readyToFire(), { timeout: 30000, polling: 300 });
  const st = await page.evaluate(() => {
    const p = window.__game.player;
    return { shellType: p.shellType, ready: p.readyToFire(), pool: { ...p.shellPool }, enabled: window.__game.input.enabled };
  });
  console.log('pre-fire state:', JSON.stringify(st));
  await page.evaluate(() => { window.__game.input.firePressed = true; });
  await sleep(2000);
  const st2 = await page.evaluate(() => {
    const p = window.__game.player;
    return { shellType: p.shellType, pool: { ...p.shellPool }, shots: window.__game.playerShots };
  });
  console.log('post-fire state:', JSON.stringify(st2));
  const rows2 = await page.$$eval('.am-row', (rs) => rs.map((r) => r.textContent.trim().replace(/\s+/g, ' ')));
  console.log('after fire, rows:', JSON.stringify(rows2));

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO CONSOLE ERRORS');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(2); });
