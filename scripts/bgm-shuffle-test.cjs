// 2026-09-24 BGM 曲库洗牌回归：菜单 end.mp3 无缝循环；战斗 = start + 新增四首洗牌随机轮播
// 断言：6 个音频文件 HTTP 200 / 菜单曲正确 / 战斗曲库 5 首全量 / 轮播与重洗牌 / 个性化模式回退 / 零报错
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRACKS = ['start', 'adevnAs', 'fight', 'highWar', 'kersk'];

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
  let failed = 0;
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!ok) failed++; };

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__game && window.__game.world, { timeout: 180000, polling: 500 });
  console.log('world ready');

  // 1) 六个音频文件都可访问（防文件名/路径手误）
  const http = await page.evaluate(async (names) => {
    const out = {};
    for (const n of names) {
      const r = await fetch('/bgm/' + n, { method: 'HEAD' });
      out[n] = r.status;
    }
    return out;
  }, ['end.mp3', ...TRACKS.map((t) => t + '.mp3')]);
  for (const [f, s] of Object.entries(http)) check('HTTP200 bgm/' + f, s === 200, 'status=' + s);

  // 2) 封面点击 → 菜单 BGM = end.mp3 无缝循环
  await page.evaluate(() => { window.__audio.init(); });
  await page.mouse.click(800, 450);
  await sleep(1200);
  const menu = await page.evaluate(() => {
    const a = window.__audio;
    return { src: a.bgmEl ? a.bgmEl.src : '', loop: a.bgmEl ? a.bgmEl.loop : null, started: a.started };
  });
  check('menu bgm = end.mp3', /\/bgm\/end\.mp3$/.test(menu.src), menu.src);
  check('menu bgm loop = true', menu.loop === true);
  check('audio started', menu.started === true);

  // 3) 进战斗：战斗 BGM 曲库 = 5 首，洗牌后首曲在曲库内
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  await page.waitForFunction(() => {
    const b = document.querySelector('.fh-start-btn');
    return b && !b.disabled && !window.__game._hangarBusy;
  }, { timeout: 60000, polling: 300 }).catch(() => console.log('WARN: start-btn wait timeout, proceeding'));
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  console.log('battle starting...');
  await sleep(9000);

  const battle = await page.evaluate((tracks) => {
    const a = window.__audio;
    const base = (u) => (u || '').split('/').pop();
    return {
      list: a.bgmList.map(base),
      cur: base(a.bgmEl && a.bgmEl.src),
      idx: a.bgmIdx,
    };
  }, TRACKS);
  check('battle pool size = 5', battle.list.length === 5, JSON.stringify(battle.list));
  check('battle pool = 5 expected tracks',
    TRACKS.every((t) => battle.list.includes(t + '.mp3')) && battle.list.length === new Set(battle.list).size,
    JSON.stringify(battle.list));
  check('current track in pool', battle.list.includes(battle.cur), battle.cur);
  check('idx advanced to 1', battle.idx === 1, 'idx=' + battle.idx);

  // 4) 逐曲轮播 + 播完整轮重洗牌（直接驱动 _playBattleNext，不真等曲终）
  const seq = await page.evaluate(() => {
    const a = window.__audio;
    const base = (u) => (u || '').split('/').pop();
    const seq = [base(a.bgmEl.src)];
    for (let i = 0; i < 6; i++) { a._playBattleNext(); seq.push(base(a.bgmEl.src)); }
    return seq;
  });
  const played = new Set(seq.slice(1, 7));
  check('6 advances cover >= 4 distinct tracks', played.size >= 4, JSON.stringify(seq));
  check('after full round reshuffled (no crash, still in pool)', TRACKS.includes(seq[6].replace('.mp3', '')), seq[6]);
  check('no silent-stop: bgmEl alive after advances', await page.evaluate(() => !!window.__audio.bgmEl));
  // 5) 个性化模式（nations 为空）：回退为同一曲库 5 首
  const personal = await page.evaluate(() => {
    const a = window.__audio;
    a.settings.bgmMode = 'personal';
    a.startBattleBGM(window.__game.player.cfg);
    const base = (u) => (u || '').split('/').pop();
    const out = { list: a.bgmList.map(base), mode: a.settings.bgmMode };
    a.settings.bgmMode = 'normal';
    a.startBattleBGM(window.__game.player.cfg);
    return out;
  });
  check('personal mode fallback pool = 5', personal.list.length === 5 && TRACKS.every((t) => personal.list.includes(t + '.mp3')),
    JSON.stringify(personal.list));

  // 截图存档
  await page.screenshot({ path: 'scripts/shot-bgm-test.png' });

  console.log('CONSOLE ERRORS (' + errs.length + '):'); errs.slice(0, 10).forEach((e) => console.log('  ' + e));
  console.log(failed === 0 && errs.length === 0 ? 'BGM SHUFFLE TEST: ALL PASS' : 'BGM SHUFFLE TEST: FAILED (' + failed + ' checks)');
  await browser.close();
  process.exit(failed === 0 && errs.length === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
