// 2026-09-24 黑豹/猎豹音效回归：pz5a-egAll 单文件引擎（油门循环 + 末尾 3.5s 怠速段）+ 双开炮声
// 黑豹全状态机 e2e；猎豹（同引擎形制）验证开炮声选曲。车库经 next 按钮逐车选中。
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const approx = (v, ref, tol) => Math.abs(v - ref) <= tol;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.errs = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => page.errs.push('PAGEERROR: ' + String(e.message).slice(0, 300)));
  return page;
}

async function gotoBattle(page, tankId, failed, label) {
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__game && window.__game.world, { timeout: 180000, polling: 500 });
  await page.waitForFunction(() => window.__game.state === 'cover', { timeout: 60000, polling: 300 });
  await page.mouse.click(800, 450);
  await sleep(1200);
  // 音频引擎兜底初始化（正常由封面点击触发；--autoplay-policy=no-user-gesture-required 下幂等安全）
  await page.evaluate(() => { if (!window.__audio.started) window.__audio.init(); });
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  // 逐车 next 直到选中目标车（每次等车库不忙再点）
  for (let i = 0; i < 26; i++) {
    const sel = await page.evaluate(() => window.__game.ui.selectedTank);
    if (sel === tankId) break;
    await page.waitForFunction(() => !window.__game._hangarBusy, { timeout: 30000, polling: 200 }).catch(() => {});
    await page.evaluate(() => document.querySelector('#screen-hangar [data-action="next"]').click());
    await sleep(900);
  }
  const selOk = await page.evaluate((id) => window.__game.ui.selectedTank === id, tankId);
  failed.check(label + ' garage selected ' + tankId, selOk);
  await page.waitForFunction(() => {
    const b = document.querySelector('.fh-start-btn');
    return b && !b.disabled && !window.__game._hangarBusy;
  }, { timeout: 60000, polling: 300 }).catch(() => console.log('WARN: start-btn wait timeout'));
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  console.log(label + ' battle starting...');
  await sleep(9000);
  const st = await page.evaluate((id) => ({
    player: window.__game.player.cfg.id,
    key: window.__audio.ext && window.__audio.ext._key,
    engineAlive: !!window.__audio.extEngine,
  }), tankId);
  failed.check(label + ' in battle as ' + tankId, st.player === tankId && st.key === tankId, JSON.stringify(st));
  return st;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  });
  const failed = {
    n: 0,
    check(name, ok, extra = '') { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : '')); if (!ok) this.n++; },
  };
  let totalErrs = 0;

  // ═══ 静态：五文件 HTTP200 + config 字段（页面内 import config 校验）═══
  {
    const page = await newPage(browser);
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const http = await page.evaluate(async () => {
      const files = ['pz5a-egAll.mp3', 'pz5a-fire1.mp3', 'pz5a-75mm-inner2.mp3', 'jpz-fdn-88mm-fire.mp3', 'jpz-fdn-88mm-inner.mp3'];
      const out = {};
      for (const f of files) out[f] = (await fetch('/tankSound/gem/' + f, { method: 'HEAD' })).status;
      return out;
    });
    for (const [f, s] of Object.entries(http)) failed.check('HTTP200 ' + f, s === 200, 'status=' + s);
    const cfg = await page.evaluate(async () => {
      const { TANKS } = await import('/js/config.js');
      const pick = (id) => {
        const s = TANKS[id].sound;
        return s ? { fire: s.fire, fireAim: s.fireAim, drive: s.drive, driveAccel: s.seg && s.seg.driveAccel, driveCruiseEnd: s.seg && s.seg.driveCruiseEnd, driveIdle: s.seg && s.seg.driveIdle, noLegacy: !s.engine } : null;
      };
      return { panther: pick('panther'), jagdpanther: pick('jagdpanther') };
    });
    const segOk = (c) => c.driveAccel === 7 && c.driveCruiseEnd === 15 && c.driveIdle === 4;
    failed.check('panther sound fields', !!cfg.panther && /pz5a-fire1/.test(cfg.panther.fire) && /pz5a-75mm-inner2/.test(cfg.panther.fireAim) && /pz5a-egAll/.test(cfg.panther.drive) && segOk(cfg.panther), JSON.stringify(cfg.panther));
    failed.check('jagdpanther sound fields', !!cfg.jagdpanther && /jpz-fdn-88mm-fire/.test(cfg.jagdpanther.fire) && /jpz-fdn-88mm-inner/.test(cfg.jagdpanther.fireAim) && /pz5a-egAll/.test(cfg.jagdpanther.drive) && segOk(cfg.jagdpanther), JSON.stringify(cfg.jagdpanther));
    totalErrs += page.errs.length;
    if (page.errs.length) console.log('static page errors:', page.errs.slice(0, 5));
    await page.close();
  }

  // ═══ 黑豹：单文件引擎全状态机 + 双开炮声 ═══
  {
    const page = await newPage(browser);
    await gotoBattle(page, 'panther', failed, 'panther');
    const eng = () => page.evaluate(() => {
      const e = window.__audio.extEngine, a = window.__audio;
      return {
        newStyle: !!(e && e.newStyle),
        idleLoopStart: e && e.idleRange ? +e.idleRange[0].toFixed(2) : null,
        driveLoopEnd: e && e.driveRange ? +e.driveRange[1].toFixed(2) : null,
        driveLoopStart: e && e.driveRange ? +e.driveRange[0].toFixed(2) : null,
        accelLoopEnd: e && e.accelSeg ? +e.accelSeg.toFixed(2) : null,
        idleG: e ? +e.idleG.gain.value.toFixed(3) : null,
        driveG: e ? +e.driveG.gain.value.toFixed(3) : null,
        accelG: e && e.accelG ? +e.accelG.gain.value.toFixed(3) : null,
        sp: +Math.abs(window.__game.player.speed).toFixed(2),
        driveDur: a.ext && a.ext.drive ? +a.ext.drive.duration.toFixed(2) : null,
        fireDur: a.ext && a.ext.fire ? +a.ext.fire.duration.toFixed(2) : null,
        fireAimDur: a.ext && a.ext.fireAim ? +a.ext.fireAim.duration.toFixed(2) : null,
      };
    });
    await sleep(1000);
    let s = await eng();
    failed.check('panther drive decoded ≈20.6s', s.driveDur !== null && approx(s.driveDur, 20.6, 0.25), String(s.driveDur));
    failed.check('panther fire decoded ≈8.0s', s.fireDur !== null && approx(s.fireDur, 8.0, 0.2), String(s.fireDur));
    failed.check('panther fireAim decoded ≈8.7s', s.fireAimDur !== null && approx(s.fireAimDur, 8.7, 0.2), String(s.fireAimDur));
    failed.check('panther engine newStyle active', s.newStyle === true);
    failed.check('idle loop = last 4s section (≈16.57)', s.idleLoopStart !== null && approx(s.idleLoopStart, s.driveDur - 4.0, 0.1), 'loopStart=' + s.idleLoopStart);
    failed.check('accel loop [0,7]', s.accelLoopEnd !== null && approx(s.accelLoopEnd, 7, 0.1), 'loopEnd=' + s.accelLoopEnd);
    failed.check('cruise loop [7,15] (excludes decel/idle tail)', s.driveLoopEnd !== null && approx(s.driveLoopEnd, 15, 0.1) && approx(s.driveLoopStart, 7, 0.1), 'loop=' + s.driveLoopStart + '..' + s.driveLoopEnd);
    failed.check('stationary: idle up', s.idleG > 0.25, JSON.stringify(s));
    failed.check('stationary: drive+accel silent', s.driveG < 0.1 && s.accelG < 0.1);

    // W 起步（1.2s，未到极速）→ 加速段循环
    await page.keyboard.down('KeyW');
    await sleep(1200);
    s = await eng();
    failed.check('accelerating: accel section ≈1.0, cruise silent', s.accelG > 0.5 && s.driveG < 0.15 && s.idleG < 0.15, JSON.stringify(s));

    // 继续踩到极速 → 切巡航段（80%）
    await sleep(9000);
    s = await eng();
    failed.check('cruise at top speed: cruise section ≈0.8, accel silent', s.driveG > 0.68 && s.driveG < 0.92 && s.accelG < 0.15, JSON.stringify(s));

    // 开镜舱内衰减 ×0.7 → 巡航段 ≈0.56
    await page.evaluate(() => { window.__game.input.aiming = true; });
    await sleep(900);
    s = await eng();
    failed.check('scope view attenuates cruise ≈0.56 (top×scope)', s.driveG > 0.5 && s.driveG < 0.64 && s.accelG < 0.15, JSON.stringify(s));
    await page.evaluate(() => { window.__game.input.aiming = false; });
    await sleep(900);

    // 松油门（仍在滑行）：连续声模型——巡航段不中断，音量滑到 50~80% 档
    await page.keyboard.up('KeyW');
    await sleep(2200);
    s = await eng();
    failed.check('release: cruise continues at coast volume', s.driveG > 0.5 && s.driveG < 0.8 && s.accelG < 0.15, JSON.stringify(s));
    failed.check('release: idle still silent while coasting', s.idleG < 0.15, JSON.stringify(s));

    // 刹停：静止 → 怠速回归
    await page.keyboard.down('Space');
    await sleep(2000);
    await page.keyboard.up('Space');
    await sleep(1200);
    s = await eng();
    failed.check('stopped: drive+accel silenced, idle back', s.driveG < 0.1 && s.accelG < 0.1 && s.idleG > 0.25, JSON.stringify(s));

    // 开炮声：第三人称 fire（8.0s），开镜 fireAim（8.7s）
    const fire3 = await page.evaluate(async () => {
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
    failed.check('panther third-person fire ≈8.0s buffer', fire3.started.some((d) => approx(d, 8.0, 0.2)), JSON.stringify(fire3.started));
    const fireAim = await page.evaluate(async () => {
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
    failed.check('panther scope fire ≈8.7s buffer', fireAim.started.some((d) => approx(d, 8.7, 0.2)), JSON.stringify(fireAim.started));

    totalErrs += page.errs.length;
    if (page.errs.length) console.log('panther page errors:', page.errs.slice(0, 5));
    await page.close();
  }

  // ═══ 猎豹：同引擎形制 + 88mm 双开炮声（引擎只做怠速抽查）═══
  {
    const page = await newPage(browser);
    await gotoBattle(page, 'jagdpanther', failed, 'jagdpanther');
    await sleep(1000);
    const s = await page.evaluate(() => {
      const e = window.__audio.extEngine, a = window.__audio;
      return {
        idleG: e ? +e.idleG.gain.value.toFixed(3) : null,
        driveDur: a.ext && a.ext.drive ? +a.ext.drive.duration.toFixed(2) : null,
        fireDur: a.ext && a.ext.fire ? +a.ext.fire.duration.toFixed(2) : null,
        fireAimDur: a.ext && a.ext.fireAim ? +a.ext.fireAim.duration.toFixed(2) : null,
      };
    });
    failed.check('jagdpanther engine idle up', s.idleG > 0.25, JSON.stringify(s));
    failed.check('jagdpanther fire decoded ≈9.5s', s.fireDur !== null && approx(s.fireDur, 9.5, 0.2), String(s.fireDur));
    failed.check('jagdpanther fireAim decoded ≈9.2s', s.fireAimDur !== null && approx(s.fireAimDur, 9.2, 0.2), String(s.fireAimDur));

    const fire3 = await page.evaluate(async () => {
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
    failed.check('jagdpanther third-person fire ≈9.5s buffer', fire3.started.some((d) => approx(d, 9.5, 0.2)), JSON.stringify(fire3.started));
    const fireAim = await page.evaluate(async () => {
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
      return { started };
    });
    failed.check('jagdpanther scope fire ≈9.2s buffer', fireAim.started.some((d) => approx(d, 9.2, 0.2)), JSON.stringify(fireAim.started));

    totalErrs += page.errs.length;
    if (page.errs.length) console.log('jagdpanther page errors:', page.errs.slice(0, 5));
    await page.close();
  }

  console.log('CONSOLE ERRORS (total ' + totalErrs + ')');
  console.log(failed.n === 0 && totalErrs === 0 ? 'PANTHER/JPZ SOUND TEST: ALL PASS' : 'PANTHER/JPZ SOUND TEST: FAILED (' + failed.n + ' checks)');
  await browser.close();
  process.exit(failed.n === 0 && totalErrs === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
