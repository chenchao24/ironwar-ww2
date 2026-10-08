// 2026-09-25 虎式音效回归：fireAim（开镜炮声）+ 实验换档形发动机（seg.gear，tiger-eg2/egAll2）
// 三梯度加速段按车速带循环切换（0-2.37 / 3.63-7.6 / 8.2-11.93），相邻档切换播段间衔接音
// （2.37-3.63 / 7.6-8.2），巡航循环 11.97s~文件尾，停车衔接独立怠速文件（tiger-eg2）。
// 音量恒定（开镜 ×0.7，怠速 ×0.7）。
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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
  const approx = (v, ref, tol) => Math.abs(v - ref) <= tol;

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__game && window.__game.world, { timeout: 180000, polling: 500 });
  console.log('world ready');

  // 1) 音频文件可访问
  const http = await page.evaluate(async () => {
    const out = {};
    for (const f of ['pz6e-tiger-88mm-inner2.mp3', 'tiger-eg2.mp3', 'tiger-egAll2.mp3']) {
      out[f] = (await fetch('/tankSound/gem/' + f, { method: 'HEAD' })).status;
    }
    return out;
  });
  for (const [f, s] of Object.entries(http)) check('HTTP200 tankSound/gem/' + f, s === 200, 'status=' + s);

  // 2) 封面 → 菜单 → 车库 → 库尔斯克开战
  await page.mouse.click(800, 450);
  await sleep(1200);
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

  // 3) 虎式外部音效缓冲：换档形（idle=tiger-eg2 独立怠速，drive=tiger-egAll2 三梯度+巡航）
  const ext = await page.evaluate(() => {
    const a = window.__audio;
    const d = (b) => (b ? +b.duration.toFixed(2) : null);
    const e = a.extEngine;
    return {
      key: a.ext && a.ext._key,
      tank: window.__game.player.cfg.id,
      idle: d(a.ext && a.ext.idle),
      drive: d(a.ext && a.ext.drive),
      fireAim: d(a.ext && a.ext.fireAim),
      newStyle: !!(e && e.newStyle),
      gear: !!(e && e.gear),
      nGears: e && e.gears ? e.gears.length : 0,
      cruiseStart: e && e.cruiseStart != null ? +e.cruiseStart : null,
      idleRange: e && e.idleChain ? [+(e.idleChain.start).toFixed(2), +(e.idleChain.end).toFixed(2)] : null,
    };
  });
  check('player is tiger1', ext.tank === 'tiger1', ext.tank);
  check('ext loaded for tiger1', ext.key === 'tiger1', ext.key);
  check('idle decoded (tiger-eg2)', ext.idle !== null && ext.idle > 0.5, String(ext.idle));
  check('drive decoded ≥12.5s (含巡航段)', ext.drive !== null && ext.drive > 12.5, String(ext.drive));
  check('fireAim decoded ≈8.2s', ext.fireAim !== null && approx(ext.fireAim, 8.2, 0.2), String(ext.fireAim));
  check('engine newStyle + gear mode active', ext.newStyle === true && ext.gear === true);
  check('3 gear segments configured', ext.nGears === 3, String(ext.nGears));
  check('cruise starts ≈11.97s', approx(ext.cruiseStart, 11.97, 0.02), String(ext.cruiseStart));
  check('idle chain covers whole tiger-eg2 file', ext.idleRange && ext.idleRange[0] === 0 && approx(ext.idleRange[1], ext.idle, 0.05), JSON.stringify(ext.idleRange));

  const eng = () => page.evaluate(() => {
    const e = window.__audio.extEngine;
    return {
      idleG: +e.idleG.gain.value.toFixed(3),
      driveG: +e.driveG.gain.value.toFixed(3),
      curDrive: e.curDrive,
      chain: e.driveChain ? [+(e.driveChain.start).toFixed(2), +(e.driveChain.end).toFixed(2)] : null,
      shift: !!e.accelChainSrc,
      sp: +Math.abs(window.__game.player.speed).toFixed(2),
    };
  });

  // 4) 静止（尚未行驶）：独立怠速文件循环，音量 0.7（ENGINE_TL_IDLE）
  await sleep(1000);
  let s = await eng();
  check('idle gain ≈0.7 when stationary', s.idleG > 0.6 && s.idleG < 0.8, JSON.stringify(s));
  check('drive chain not started when stationary', s.curDrive === -1 && s.driveG < 0.1, JSON.stringify(s));

  // 5) W 起步：落入 1 档循环 [0, 2.37]（起步直接进档，无衔接音）
  await page.keyboard.down('KeyW');
  await sleep(700);
  s = await eng();
  check('gear 1 engaged on launch (chain [0,2.37])', s.curDrive === 0 && s.chain && approx(s.chain[0], 0, 0.05) && approx(s.chain[1], 2.37, 0.05), JSON.stringify(s));
  check('drive gain ≈1.0 in gear', s.driveG > 0.6, JSON.stringify(s));
  check('idle silenced while driving', s.idleG < 0.1, JSON.stringify(s));

  // 6) 持续油门：车速带推进 → 至少升到 2 档；升档瞬间播衔接音（offset≈2.37 的源启动）
  await page.evaluate(() => {
    const a = window.__audio;
    window.__shiftRec = [];
    const orig = a.ctx.createBufferSource.bind(a.ctx);
    a.ctx.createBufferSource = function () {
      const src = orig();
      const ostart = src.start.bind(src);
      src.start = (...args) => {
        if (src.buffer && a.ext.drive && src.buffer === a.ext.drive && args[1] != null) window.__shiftRec.push(+args[1].toFixed(2));
        return ostart(...args);
      };
      return src;
    };
  });
  await sleep(3000);
  s = await eng();
  const shiftRec = await page.evaluate(() => window.__shiftRec);
  check('shifted up through gears (curDrive ≥1)', s.curDrive >= 1, JSON.stringify(s));
  check('shift one-shot used gear-change material (offset 2.37)', shiftRec.some((o) => approx(o, 2.37, 0.06)), JSON.stringify(shiftRec));

  // 7) 油门到底达极速：巡航循环 [11.97, 文件尾]
  await sleep(13000);
  s = await eng();
  const kmh = s.sp * 3.6;
  check('reached terrain-capped top speed (≈18km/h)', kmh > 15.5, 'speed=' + kmh.toFixed(1) + 'km/h');
  check('cruise loop [11.97, end] at top speed', s.curDrive === 3 && s.chain && approx(s.chain[0], 11.97, 0.05), JSON.stringify(s));
  check('volume constant ≈1.0 at cruise', s.driveG > 0.9, JSON.stringify(s));

  // 7b) 开镜（舱内视角）×0.7；退镜恢复
  await page.evaluate(() => { window.__game.input.aiming = true; });
  await sleep(900);
  s = await eng();
  check('scope view attenuates cruise ≈0.7', s.driveG > 0.6 && s.driveG < 0.8, JSON.stringify(s));
  await page.evaluate(() => { window.__game.input.aiming = false; });
  await sleep(900);
  s = await eng();
  check('scope exit restores ≈1.0', s.driveG > 0.9, JSON.stringify(s));

  // 8) 松油门（高速滑行）：保持当前档/巡航循环，音量恒定
  await page.keyboard.up('KeyW');
  await sleep(1300);
  s = await eng();
  check('coasting holds cruise loop', s.curDrive === 3 && s.driveG > 0.9, JSON.stringify(s));

  // 9) 空格刹停 → 停车衔接怠速（curDrive 回 -1，怠速文件循环 0.7）
  await page.keyboard.down('Space');
  await sleep(2500);
  await page.keyboard.up('Space');
  await sleep(1500);
  s = await eng();
  check('vehicle stopped', s.sp < 0.3, 'sp=' + s.sp);
  check('idle takes over after stop (≈0.7)', s.curDrive === -1 && s.idleG > 0.6 && s.idleG < 0.8 && s.driveG < 0.1, JSON.stringify(s));

  // 10) 再踩油门：起步直接进 1 档（无衔接音）
  await page.keyboard.down('KeyW');
  await sleep(700);
  s = await eng();
  check('re-launch engages gear 1', s.curDrive === 0 && s.chain && approx(s.chain[0], 0, 0.05), JSON.stringify(s));
  await page.keyboard.up('KeyW');
  await sleep(4000);   // 滑行减停，回怠速
  s = await eng();
  check('coast to stop returns to idle', s.curDrive === -1 && s.idleG > 0.6, JSON.stringify(s));

  // 11) 开镜开炮：走 playFire(1, rig.aiming) → 应选 fireAim 缓冲（≈8.2s）
  const fired = await page.evaluate(async () => {
    const a = window.__audio;
    const started = [];
    const orig = a.ctx.createBufferSource.bind(a.ctx);
    a.ctx.createBufferSource = function () {
      const src = orig();
      const ostart = src.start.bind(src);
      src.start = (...args) => { if (src.buffer) started.push(+src.buffer.duration.toFixed(2)); return ostart(...args); };
      return src;
    };
    window.__game.input.aiming = true;
    await new Promise((r) => setTimeout(r, 400));
    window.__game.input.firePressed = true;
    await new Promise((r) => setTimeout(r, 1200));
    window.__game.input.aiming = false;
    return { started, shots: window.__game.playerShots };
  });
  check('fire actually fired', fired.shots > 0, 'shots=' + fired.shots);
  check('scope fire used fireAim (≈8.2s buffer)', fired.started.some((d) => approx(d, 8.2, 0.2)), JSON.stringify(fired.started));

  await page.screenshot({ path: 'scripts/shot-tiger-sound.png' });
  console.log('CONSOLE ERRORS (' + errs.length + '):'); errs.slice(0, 10).forEach((e) => console.log('  ' + e));
  console.log(failed === 0 && errs.length === 0 ? 'TIGER SOUND TEST: ALL PASS' : 'TIGER SOUND TEST: FAILED (' + failed + ' checks)');
  await browser.close();
  process.exit(failed === 0 && errs.length === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
