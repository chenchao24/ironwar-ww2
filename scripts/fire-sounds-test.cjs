// 2026-09-24 第二批开火音效回归：marder3m/tiger2/pz4g/pz4j/jpz4l70/ferdinand/jagdtiger
// 猎虎 fire=双音源数组每发随机（e2e 验证）；其余静态断言 + 黄鼠狼敞开式同声
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const approx = (v, ref, tol) => Math.abs(v - ref) <= tol;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 300)));
  let failed = 0;
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!ok) failed++; };

  // ═══ 静态：10 文件 HTTP200 + 7 车 config 字段 ═══
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const http = await page.evaluate(async () => {
    const files = ['mur3-75mm-inner.mp3', 'pz62-tiger2-88mm-fire1.mp3', 'pz62-tiger2-88mm-inner.mp3', '75mm-long-fire.mp3', '75mm-long-inner.mp3',
      '75mm-pak-inner.mp3', 'pz4g-75mm-inner.mp3', 'jtiger-128mm-fire1.mp3', '128mm-pk-fire.mp3', '128mm-pk-inner.mp3'];
    const out = {};
    for (const f of files) out[f] = (await fetch('/tankSound/gem/' + f, { method: 'HEAD' })).status;
    return out;
  });
  for (const [f, s] of Object.entries(http)) check('HTTP200 ' + f, s === 200, 'status=' + s);
  const cfg = await page.evaluate(async () => {
    const { TANKS } = await import('/js/config.js');
    const pick = (id) => {
      const s = TANKS[id].sound;
      return s ? { fire: s.fire, fireAim: s.fireAim } : null;
    };
    return {
      marder3m: pick('marder3m'), tiger2: pick('tiger2'), ferdinand: pick('ferdinand'),
      pz4g: pick('pz4g'), pz4j: pick('pz4j'), jpz4l70: pick('jpz4l70'), jagdtiger: pick('jagdtiger'),
    };
  });
  const has = (c, re) => c && re.test(c.fire) && re.test(c.fireAim);
  check('marder3m: fire==fireAim==mur3 (敞开式同声)', has(cfg.marder3m, /mur3-75mm-inner/));
  check('tiger2: pz62 fire1 + inner', cfg.tiger2 && /pz62-tiger2-88mm-fire1/.test(cfg.tiger2.fire) && /pz62-tiger2-88mm-inner/.test(cfg.tiger2.fireAim), JSON.stringify(cfg.tiger2));
  check('ferdinand: jpz-fdn 88mm pair', cfg.ferdinand && /jpz-fdn-88mm-fire/.test(cfg.ferdinand.fire) && /jpz-fdn-88mm-inner/.test(cfg.ferdinand.fireAim));
  check('pz4g: 75mm-long pair', cfg.pz4g && /75mm-long-fire/.test(cfg.pz4g.fire) && /75mm-long-inner/.test(cfg.pz4g.fireAim));
  check('pz4j: 75mm-long pair', cfg.pz4j && /75mm-long-fire/.test(cfg.pz4j.fire) && /75mm-long-inner/.test(cfg.pz4j.fireAim));
  check('jpz4l70: fire=pak-inner, fireAim=pz4g-inner', cfg.jpz4l70 && /75mm-pak-inner/.test(cfg.jpz4l70.fire) && /pz4g-75mm-inner/.test(cfg.jpz4l70.fireAim), JSON.stringify(cfg.jpz4l70));
  check('jagdtiger: fire = 2-source array, fireAim=pk-inner', cfg.jagdtiger && Array.isArray(cfg.jagdtiger.fire) && cfg.jagdtiger.fire.length === 2
    && /jtiger-128mm-fire1/.test(cfg.jagdtiger.fire[0]) && /128mm-pk-fire/.test(cfg.jagdtiger.fire[1]) && /128mm-pk-inner/.test(cfg.jagdtiger.fireAim), JSON.stringify(cfg.jagdtiger));

  // ═══ 猎虎 e2e：车库逐车选中 → 进战斗 → 解码 + 随机选曲 ═══
  await page.mouse.click(800, 450);
  await sleep(1200);
  await page.evaluate(() => { if (!window.__audio.started) window.__audio.init(); });
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  for (let i = 0; i < 26; i++) {
    const sel = await page.evaluate(() => window.__game.ui.selectedTank);
    if (sel === 'jagdtiger') break;
    await page.waitForFunction(() => !window.__game._hangarBusy, { timeout: 30000, polling: 200 }).catch(() => {});
    await page.evaluate(() => document.querySelector('#screen-hangar [data-action="next"]').click());
    await sleep(900);
  }
  check('garage selected jagdtiger', await page.evaluate(() => window.__game.ui.selectedTank === 'jagdtiger'));
  await page.waitForFunction(() => {
    const b = document.querySelector('.fh-start-btn');
    return b && !b.disabled && !window.__game._hangarBusy;
  }, { timeout: 60000, polling: 300 }).catch(() => console.log('WARN: start-btn wait timeout'));
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  console.log('jagdtiger battle starting...');
  await sleep(9000);

  const ext = await page.evaluate(() => {
    const a = window.__audio;
    const d = (b) => (b ? +b.duration.toFixed(2) : null);
    return {
      tank: window.__game.player.cfg.id,
      key: a.ext && a.ext._key,
      fireIsArray: Array.isArray(a.ext && a.ext.fire),
      fireLens: a.ext && Array.isArray(a.ext.fire) ? a.ext.fire.map(d) : null,
      fireAim: d(a.ext && a.ext.fireAim),
    };
  });
  check('in battle as jagdtiger, ext loaded', ext.tank === 'jagdtiger' && ext.key === 'jagdtiger');
  check('fire decoded as 2-buffer array (≈3.7/≈7.6s)', ext.fireIsArray && ext.fireLens && approx(ext.fireLens[0], 3.7, 0.2) && approx(ext.fireLens[1], 7.6, 0.25), JSON.stringify(ext.fireLens));
  check('fireAim decoded ≈7.7s', ext.fireAim !== null && approx(ext.fireAim, 7.7, 0.2), String(ext.fireAim));

  // playFire 直调 ×12（第三人称）：随机选曲应覆盖双音源
  const rand = await page.evaluate(async () => {
    const a = window.__audio;
    const started = [];
    const orig = a.ctx.createBufferSource.bind(a.ctx);
    a.ctx.createBufferSource = function () {
      const src = orig();
      const ostart = src.start.bind(src);
      src.start = (...args) => { if (src.buffer) started.push(+src.buffer.duration.toFixed(2)); return ostart(...args); };
      return src;
    };
    for (let i = 0; i < 12; i++) { a.playFire(1, false); await new Promise((r) => setTimeout(r, 60)); }
    return started;
  });
  check('random fire covers both sources (12 picks)', rand.some((d) => approx(d, 3.7, 0.2)) && rand.some((d) => approx(d, 7.6, 0.25)), JSON.stringify(rand));

  // 真实开炮路径：等装填 → 注入 firePressed → 第三人称
  const realFire = await page.evaluate(async () => {
    const a = window.__audio;
    const started = [];
    const orig = a.ctx.createBufferSource.bind(a.ctx);
    a.ctx.createBufferSource = function () {
      const src = orig();
      const ostart = src.start.bind(src);
      src.start = (...args) => { if (src.buffer) started.push(+src.buffer.duration.toFixed(2)); return ostart(...args); };
      return src;
    };
    const t0 = performance.now();
    while (!window.__game.player.readyToFire() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 300));
    window.__game.input.firePressed = true;
    await new Promise((r) => setTimeout(r, 1200));
    return { started, shots: window.__game.playerShots };
  });
  check('real fire fired once', realFire.shots > 0, 'shots=' + realFire.shots);
  check('real fire uses random pool (one of the two)', realFire.started.some((d) => approx(d, 3.7, 0.2) || approx(d, 7.6, 0.25)), JSON.stringify(realFire.started));

  // 开镜 → fireAim
  const scopeFire = await page.evaluate(async () => {
    const a = window.__audio;
    const started = [];
    const orig = a.ctx.createBufferSource.bind(a.ctx);
    a.ctx.createBufferSource = function () {
      const src = orig();
      const ostart = src.start.bind(src);
      src.start = (...args) => { if (src.buffer) started.push(+src.buffer.duration.toFixed(2)); return ostart(...args); };
      return src;
    };
    const t0 = performance.now();
    while (!window.__game.player.readyToFire() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 300));
    window.__game.input.aiming = true;
    await new Promise((r) => setTimeout(r, 400));
    window.__game.input.firePressed = true;
    await new Promise((r) => setTimeout(r, 1200));
    window.__game.input.aiming = false;
    return { started, shots: window.__game.playerShots };
  });
  check('scope fire uses pk-inner (≈7.7s)', scopeFire.started.some((d) => approx(d, 7.7, 0.2)), JSON.stringify(scopeFire.started));

  await page.screenshot({ path: 'scripts/shot-fire-sounds.png' });
  console.log('CONSOLE ERRORS (' + errs.length + '):'); errs.slice(0, 10).forEach((e) => console.log('  ' + e));
  console.log(failed === 0 && errs.length === 0 ? 'FIRE SOUNDS TEST: ALL PASS' : 'FIRE SOUNDS TEST: FAILED (' + failed + ' checks)');
  await browser.close();
  process.exit(failed === 0 && errs.length === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
