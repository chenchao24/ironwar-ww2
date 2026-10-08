// 2026-09-24 虎王/猎虎引擎声回归：独立怠速(tiger2-eg) + 加速/巡航分段(egUp) + 虎王减速停车音(egDown 末尾 2s)
// 虎王全状态流 e2e；猎虎验证 start-egUp 分段（3s 油门 + 后段循环到文件尾）。
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
  await page.evaluate(() => { if (!window.__audio.started) window.__audio.init(); });
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  for (let i = 0; i < 26; i++) {
    const sel = await page.evaluate(() => window.__game.ui.selectedTank);
    if (sel === tankId) break;
    await page.waitForFunction(() => !window.__game._hangarBusy, { timeout: 30000, polling: 200 }).catch(() => {});
    await page.evaluate(() => document.querySelector('#screen-hangar [data-action="next"]').click());
    await sleep(900);
  }
  failed.check(label + ' garage selected ' + tankId, await page.evaluate((id) => window.__game.ui.selectedTank === id, tankId));
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
  }), tankId);
  failed.check(label + ' in battle as ' + tankId, st.player === tankId && st.key === tankId, JSON.stringify(st));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  });
  const failed = { n: 0, check(name, ok, extra = '') { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : '')); if (!ok) this.n++; } };
  let totalErrs = 0;

  // ═══ 虎王：怠速 + 加速/巡航分段 + 减速停车音 ═══
  {
    const page = await newPage(browser);
    await gotoBattle(page, 'tiger2', failed, 'tiger2');
    const eng = () => page.evaluate(() => {
      const e = window.__audio.extEngine, a = window.__audio;
      return {
        newStyle: !!(e && e.newStyle),
        idleLoopStart: e && e.idleRange ? +e.idleRange[0].toFixed(2) : null,
        accelLoopEnd: e && e.accelSeg ? +e.accelSeg.toFixed(2) : null,
        driveLoopStart: e && e.driveRange ? +e.driveRange[0].toFixed(2) : null,
        driveLoopEnd: e && e.driveRange ? +e.driveRange[1].toFixed(2) : null,
        idleG: e ? +e.idleG.gain.value.toFixed(3) : null,
        driveG: e ? +e.driveG.gain.value.toFixed(3) : null,
        accelG: e && e.accelG ? +e.accelG.gain.value.toFixed(3) : null,
        sp: +Math.abs(window.__game.player.speed).toFixed(2),
        idleDur: a.ext && a.ext.idle ? +a.ext.idle.duration.toFixed(2) : null,
        driveDur: a.ext && a.ext.drive ? +a.ext.drive.duration.toFixed(2) : null,
        decelDur: a.ext && a.ext.decel ? +a.ext.decel.duration.toFixed(2) : null,
        cruiseDur: a.ext && a.ext.cruise ? +a.ext.cruise.duration.toFixed(2) : null,
      };
    });
    await sleep(1000);
    let s = await eng();
    failed.check('tiger2 idle/drive/decel/cruise decoded (≈3.7/7.87/3.34/21.07)',
      s.idleDur !== null && approx(s.idleDur, 3.7, 0.2) && s.driveDur !== null && approx(s.driveDur, 7.87, 0.25) && s.decelDur !== null && approx(s.decelDur, 3.34, 0.2) && s.cruiseDur !== null && approx(s.cruiseDur, 21.07, 0.3),
      JSON.stringify({ idleDur: s.idleDur, driveDur: s.driveDur, decelDur: s.decelDur, cruiseDur: s.cruiseDur }));
    // 巡航循环截到 6.9（波形分析：7.2~7.87 有隆起+能量塌陷，排除）；怠速从 0.9 起（跳过文件头静音起振）
    failed.check('accel one-shot [0,3.5] + cruise file loop [4,17.54] (seam-optimized)', s.accelLoopEnd !== null && approx(s.accelLoopEnd, 3.5, 0.1) && approx(s.driveLoopStart, 4, 0.1) && approx(s.driveLoopEnd, 17.54, 0.15), 'accel..=' + s.accelLoopEnd + ' cruise=' + s.driveLoopStart + '..' + s.driveLoopEnd);
    failed.check('idle loop starts at 0.9 (skip silence)', s.idleLoopStart !== null && approx(s.idleLoopStart, 0.9, 0.1), 'loopStart=' + s.idleLoopStart);
    failed.check('stationary: idle up', s.idleG > 0.25, JSON.stringify(s));

    // W 起步 → 加速段
    await page.keyboard.down('KeyW');
    await sleep(2000);
    s = await eng();
    failed.check('accelerating: accel section up, cruise silent', s.accelG > 0.5 && s.driveG < 0.15, JSON.stringify(s));

    // 松油门滑行 → 巡航段继续（连续声模型；车速仍在阈值上方时检查）
    await page.keyboard.up('KeyW');
    await sleep(800);
    s = await eng();
    failed.check('coasting: cruise continues', s.driveG > 0.45 && s.accelG < 0.15 && s.sp > 0.9, JSON.stringify(s));

    // 空格刹停 → 减速停车音播一次（egDown 3.34s 缓冲）→ 怠速回归
    // 探针先装（挂 window 跨 evaluate 持久化），再踩刹车——否则抓不到动→停沿的触发
    await page.evaluate(() => {
      const a = window.__audio;
      window.__spiedStarts = [];
      const orig = a.ctx.createBufferSource.bind(a.ctx);
      a.ctx.createBufferSource = function () {
        const src = orig();
        const ostart = src.start.bind(src);
        src.start = (...args) => { if (src.buffer) window.__spiedStarts.push(+src.buffer.duration.toFixed(2)); return ostart(...args); };
        return src;
      };
    });
    await page.keyboard.down('Space');
    await sleep(2500);
    await page.keyboard.up('Space');
    const decel = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 800));
      return { started: window.__spiedStarts, sp: +Math.abs(window.__game.player.speed).toFixed(2) };
    });
    failed.check('vehicle stopped', decel.sp < 0.3, 'sp=' + decel.sp);
    failed.check('decel stop sound played once (egDown ≈3.34s)', decel.started.filter((d) => approx(d, 3.34, 0.2)).length === 1, JSON.stringify(decel.started));

    // 静止逗留 → 不重复触发
    const dwell = await page.evaluate(async () => {
      const a = window.__audio;
      const started = [];
      const orig = a.ctx.createBufferSource.bind(a.ctx);
      a.ctx.createBufferSource = function () {
        const src = orig();
        const ostart = src.start.bind(src);
        src.start = (...args) => { if (src.buffer) started.push(+src.buffer.duration.toFixed(2)); return ostart(...args); };
        return src;
      };
      await new Promise((r) => setTimeout(r, 2000));
      return started;
    });
    failed.check('no retrigger while stationary', dwell.filter((d) => approx(d, 3.34, 0.2)).length === 0, JSON.stringify(dwell));
    s = await eng();
    failed.check('idle back after stop', s.idleG > 0.25 && s.driveG < 0.1 && s.accelG < 0.1, JSON.stringify(s));

    totalErrs += page.errs.length;
    if (page.errs.length) console.log('tiger2 page errors:', page.errs.slice(0, 5));
    await page.close();
  }

  // ═══ 猎虎：start-egUp 分段（3s 油门 + 后段循环）+ 共用怠速 ═══
  {
    const page = await newPage(browser);
    await gotoBattle(page, 'jagdtiger', failed, 'jagdtiger');
    const eng = () => page.evaluate(() => {
      const e = window.__audio.extEngine, a = window.__audio;
      return {
        accelLoopEnd: e && e.accelSeg ? +e.accelSeg.toFixed(2) : null,
        driveLoopStart: e && e.driveRange ? +e.driveRange[0].toFixed(2) : null,
        driveLoopEnd: e && e.driveRange ? +e.driveRange[1].toFixed(2) : null,
        idleG: e ? +e.idleG.gain.value.toFixed(3) : null,
        driveG: e ? +e.driveG.gain.value.toFixed(3) : null,
        accelG: e && e.accelG ? +e.accelG.gain.value.toFixed(3) : null,
        sp: +Math.abs(window.__game.player.speed).toFixed(2),
        idleDur: a.ext && a.ext.idle ? +a.ext.idle.duration.toFixed(2) : null,
        driveDur: a.ext && a.ext.drive ? +a.ext.drive.duration.toFixed(2) : null,
        fireLens: a.ext && Array.isArray(a.ext.fire) ? a.ext.fire.map((b) => +b.duration.toFixed(2)) : null,
        fireAimDur: a.ext && a.ext.fireAim ? +a.ext.fireAim.duration.toFixed(2) : null,
      };
    });
    await sleep(1000);
    let s = await eng();
    failed.check('jagdtiger fire buffers intact (2-source ≈3.7/7.6 + fireAim ≈7.7)',
      s.fireLens !== null && s.fireLens.length === 2 && approx(s.fireLens[0], 3.7, 0.2) && approx(s.fireLens[1], 7.6, 0.25) && s.fireAimDur !== null && approx(s.fireAimDur, 7.7, 0.2),
      JSON.stringify({ fireLens: s.fireLens, fireAimDur: s.fireAimDur }));
    failed.check('jagdtiger idle=3.7 / drive=start-egUp ≈21.07', s.idleDur !== null && approx(s.idleDur, 3.7, 0.2) && s.driveDur !== null && approx(s.driveDur, 21.07, 0.3), JSON.stringify({ idleDur: s.idleDur, driveDur: s.driveDur }));
    failed.check('accel one-shot [0,4] + cruise loop [4,17.54] (seam-optimized)', s.accelLoopEnd !== null && approx(s.accelLoopEnd, 4, 0.1) && approx(s.driveLoopStart, 4, 0.1) && approx(s.driveLoopEnd, 17.54, 0.15), 'accel..=' + s.accelLoopEnd + ' cruise=' + s.driveLoopStart + '..' + s.driveLoopEnd);
    failed.check('stationary: idle up', s.idleG > 0.25, JSON.stringify(s));

    await page.keyboard.down('KeyW');
    await sleep(1500);
    s = await eng();
    failed.check('accelerating: accel section up', s.accelG > 0.5 && s.driveG < 0.15, JSON.stringify(s));
    await sleep(5000);   // 猎虎 71.7t 提速慢，继续踩到有滑行余速
    await page.keyboard.up('KeyW');
    await sleep(1000);
    s = await eng();
    failed.check('coasting: cruise continues', s.driveG > 0.45 && s.accelG < 0.15 && s.sp > 0.9, JSON.stringify(s));

    // 刹停：减速停车音（与虎王共用 egDown）播一次 → 怠速回归
    await page.evaluate(() => {
      const a = window.__audio;
      window.__spiedStarts2 = [];
      const orig = a.ctx.createBufferSource.bind(a.ctx);
      a.ctx.createBufferSource = function () {
        const src = orig();
        const ostart = src.start.bind(src);
        src.start = (...args) => { if (src.buffer) window.__spiedStarts2.push(+src.buffer.duration.toFixed(2)); return ostart(...args); };
        return src;
      };
    });
    await page.keyboard.down('Space');
    await sleep(2500);
    await page.keyboard.up('Space');
    const decelJ = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 800));
      const e = window.__audio.extEngine;
      return { started: window.__spiedStarts2, sp: +Math.abs(window.__game.player.speed).toFixed(2), idleG: +e.idleG.gain.value.toFixed(3), driveG: +e.driveG.gain.value.toFixed(3) };
    });
    failed.check('jagdtiger stopped + decel blip once (egDown ≈3.34s)', decelJ.sp < 0.3 && decelJ.started.filter((d) => approx(d, 3.34, 0.2)).length === 1, JSON.stringify(decelJ.started) + ' sp=' + decelJ.sp);
    failed.check('jagdtiger idle back after stop', decelJ.idleG > 0.25 && decelJ.driveG < 0.1, JSON.stringify(decelJ));

    totalErrs += page.errs.length;
    if (page.errs.length) console.log('jagdtiger page errors:', page.errs.slice(0, 5));
    await page.close();
  }

  console.log('CONSOLE ERRORS (total ' + totalErrs + ')');
  console.log(failed.n === 0 && totalErrs === 0 ? 'TIGER2/JT ENGINE TEST: ALL PASS' : 'TIGER2/JT ENGINE TEST: FAILED (' + failed.n + ' checks)');
  await browser.close();
  process.exit(failed.n === 0 && totalErrs === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
