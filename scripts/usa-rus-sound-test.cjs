// 2026-09-24 美/苏/英批次回归：14 车炮声 + m26/m4a3/t34-85/su100 单文件三段引擎（无独立怠速）
// 引擎 e2e ×3（m26/m4a3/t34-85）：静止低速回退 / 加速段一次性 / 巡航滑行 / 减速段刹停一次 / 双开炮声
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const approx = (v, ref, tol) => Math.abs(v - ref) <= tol;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const FILES = [
  'usa/m26-egDown.mp3', 'usa/m4-egDown.mp3', 'rus/t34-egAll.mp3',
  'usa/m26-90mm-fire.mp3', 'usa/m26-90mm-inner.mp3', 'usa/us-76mm-fire.mp3', 'usa/us-76mm-inner.mp3', 'usa/us-75mm-fire.mp3',
  'rus/76mm-fire.mp3', 'rus/76mm-inner.mp3', 'rus/t34-85mm-fire1.mp3', 'rus/t34-85mm-inner.mp3',
  'rus/100mm-fire.mp3', 'rus/100mm-inner.mp3', 'rus/122mm-fire.mp3', 'rus/122mm-inner.mp3',
  'rus/152mm-fire.mp3', 'rus/152mm-inner.mp3', 'rus/85mm-fire.mp3', 'rus/85mm-inner.mp3',
  'uk/57mm-fire.mp3', 'uk/57mm-inner.mp3',
];

// 三场引擎 e2e 的预期（config seg 值）
const ENGINES = {
  m26:    { dur: 22.22, accel: 4.9, cruiseEnd: 13.06, decelStart: 16.4, fire: 10.32, fireAim: 10.63 },
  m4a3:   { dur: 23.16, accel: 3.0, cruiseEnd: 17.4, decelStart: 17.4, fire: 8.09, fireAim: 8.09 },
  't34-85': { dur: 16.99, accel: 4.9, cruiseEnd: 13.24, decelStart: 13.8, fire: 10.15, fireAim: 10.10 },
};

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

// 引擎全状态流 + 双开炮声
async function engineFlow(page, tankId, spec, failed, label) {
  const eng = () => page.evaluate(() => {
    const e = window.__audio.extEngine, a = window.__audio;
    return {
      newStyle: !!(e && e.newStyle),
      noIdle: !e || !e.idleG,
      driveRange: e && e.driveRange ? [+e.driveRange[0].toFixed(2), +e.driveRange[1].toFixed(2)] : null,
      idleG: e && e.idleG ? +e.idleG.gain.value.toFixed(3) : null,
      driveG: e ? +e.driveG.gain.value.toFixed(3) : null,
      accelG: e && e.accelG ? +e.accelG.gain.value.toFixed(3) : null,
      sp: +Math.abs(window.__game.player.speed).toFixed(2),
      driveDur: a.ext && a.ext.drive ? +a.ext.drive.duration.toFixed(2) : null,
    };
  });
  await sleep(1000);
  let s = await eng();
  failed.check(label + ' drive decoded ≈' + spec.dur + 's / no idle source', s.driveDur !== null && approx(s.driveDur, spec.dur, 0.3) && s.noIdle, JSON.stringify(s));
  failed.check(label + ' cruise loop [' + spec.accel + ',' + spec.cruiseEnd + '] (waveform-optimized)',
    s.driveRange !== null && approx(s.driveRange[0], spec.accel, 0.1) && approx(s.driveRange[1], spec.cruiseEnd, 0.15), JSON.stringify(s.driveRange));
  failed.check(label + ' stationary: cruise loop at low vol (no-idle fallback)', s.driveG > 0.2 && s.driveG < 0.5, JSON.stringify(s));

  // W 起步 → 加速段一次性播放
  await page.keyboard.down('KeyW');
  await sleep(1600);
  s = await eng();
  failed.check(label + ' accelerating: accel section up, cruise silent', s.accelG > 0.5 && s.driveG < 0.2, JSON.stringify(s));

  // 松油门滑行 → 巡航循环接手
  await page.keyboard.up('KeyW');
  await sleep(1200);
  s = await eng();
  failed.check(label + ' coasting: cruise continues', s.driveG > 0.45 && s.accelG < 0.2 && s.sp > 0.9, JSON.stringify(s));

  // 刹停 → 减速段播一次（drive 缓冲整段时长入捕获）→ 低速回退稳态
  await page.evaluate(() => {
    const a = window.__audio;
    window.__spiedStarts3 = [];
    const orig = a.ctx.createBufferSource.bind(a.ctx);
    a.ctx.createBufferSource = function () {
      const src = orig();
      const ostart = src.start.bind(src);
      src.start = (...args) => { if (src.buffer) window.__spiedStarts3.push({ d: +src.buffer.duration.toFixed(2), off: args[1] != null ? +Number(args[1]).toFixed(2) : null }); return ostart(...args); };
      return src;
    };
  });
  await page.keyboard.down('Space');
  await sleep(2600);
  await page.keyboard.up('Space');
  await sleep(900);
  s = await eng();
  // 减速段 = drive 缓冲且 start 偏移 = driveDecelStart（与巡航链拷贝同缓冲不同偏移，可区分）
  const blips = await page.evaluate((ds) => window.__spiedStarts3.filter((x) => Math.abs(x.d - window.__audio.ext.drive.duration) < 0.3 && x.off != null && Math.abs(x.off - ds) < 0.3).length, spec.decelStart);
  failed.check(label + ' stopped + internal decel segment once (offset ' + spec.decelStart + ')', s.sp < 0.3 && blips === 1, 'sp=' + s.sp + ' blips=' + blips + ' driveG=' + s.driveG);

  // 双开炮声（真实 fire 路径）
  const fire = await page.evaluate(async (spec2) => {
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
    const t1 = performance.now();
    while (!window.__game.player.readyToFire() && performance.now() - t1 < 30000) await new Promise((r) => setTimeout(r, 300));
    window.__game.input.aiming = true;
    await new Promise((r) => setTimeout(r, 400));
    window.__game.input.firePressed = true;
    await new Promise((r) => setTimeout(r, 1200));
    window.__game.input.aiming = false;
    return { started };
  }, spec);
  failed.check(label + ' third-person fire ≈' + spec.fire + 's buffer', fire.started.some((d) => approx(d, spec.fire, 0.25)), JSON.stringify(fire.started));
  failed.check(label + ' scope fire ≈' + spec.fireAim + 's buffer', fire.started.some((d) => approx(d, spec.fireAim, 0.25)), JSON.stringify(fire.started));

  // 命中音距离衰减 + 程序化着火音已移除
  const att = await page.evaluate(async () => {
    const a = window.__audio;
    const vols = [];
    const orig = a._playBuffer.bind(a);
    a._playBuffer = function (buf, vol) { vols.push(+vol.toFixed(3)); return orig(buf, vol); };
    a.setListenerPos(window.__game.player.root.position);
    a.playHitArmor(false, 0);       // 近距
    a.playHitArmor(false, 1000);    // 千米外
    a.playHitArmor(false, null);    // 未标注（兼容旧调用，不衰减）
    a.startFire();                  // 程序化着火音：应为空操作
    await new Promise((r) => setTimeout(r, 200));
    a._playBuffer = orig;
    return { vols, fireNodes: !!a.fireNodes, a300: +a._hitAtten(300).toFixed(3), a1000: +a._hitAtten(1000).toFixed(3) };
  });
  failed.check(label + ' hit atten: near=0.8, 1000m≈0.096 (degressive)', approx(att.vols[0], 0.8, 0.01) && approx(att.vols[1], 0.096, 0.02) && approx(att.vols[2], 0.8, 0.01), JSON.stringify(att));
  failed.check(label + ' procedural fire sound removed (startFire no-op)', att.fireNodes === false && att.a300 > 0.7 && att.a1000 < 0.2, JSON.stringify(att));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  });
  const failed = { n: 0, check(name, ok, extra = '') { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : '')); if (!ok) this.n++; } };
  let totalErrs = 0;

  // ═══ 静态：21 文件 HTTP200 + 14 车炮声字段 + 4 引擎 seg ═══
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const http = await page.evaluate(async (names) => {
      const out = {};
      for (const f of names) out[f] = (await fetch('/tankSound/' + f, { method: 'HEAD' })).status;
      return out;
    }, FILES);
    for (const [f, s] of Object.entries(http)) check_(failed, 'HTTP200 ' + f, s === 200, 'status=' + s);

    const cfg = await page.evaluate(async () => {
      const { TANKS } = await import('/js/config.js');
      const pick = (id) => {
        const s = TANKS[id].sound;
        return s ? { fire: s.fire, fireAim: s.fireAim, drive: s.drive, seg: s.seg } : null;
      };
      const out = {};
      for (const id of ['m4a3', 'm26', 'm36', 'm10', 'm18', 'cromwell', 't34-85', 'su100', 'is2', 'is2m', 'su152', 'isu152', 'kv1', 'is1']) out[id] = pick(id);
      return out;
    });
    const same = (c, re) => c && re.test(c.fire) && re.test(c.fireAim) && c.fire === c.fireAim;
    const pair = (c, reF, reA) => c && reF.test(c.fire) && reA.test(c.fireAim);
    check_(failed, 'm4a3 fire pair us-76mm', pair(cfg.m4a3, /us-76mm-fire/, /us-76mm-inner/));
    check_(failed, 'm26 fire pair m26-90mm', pair(cfg.m26, /m26-90mm-fire/, /m26-90mm-inner/));
    check_(failed, 'm36 single sound = m26-90mm-inner (open-top)', same(cfg.m36, /m26-90mm-inner/));
    check_(failed, 'm10 single sound = us-75mm-fire (open-top)', same(cfg.m10, /us-75mm-fire/));
    check_(failed, 'm18 single sound = rus/76mm-fire (open-top)', same(cfg.m18, /rus\/76mm-fire/));
    check_(failed, 'cromwell fire pair uk/57mm', pair(cfg.cromwell, /57mm-fire/, /57mm-inner/));
    check_(failed, 't34-85 fire pair', pair(cfg['t34-85'], /t34-85mm-fire1/, /t34-85mm-inner/));
    check_(failed, 'su100 fire pair 100mm', pair(cfg.su100, /100mm-fire/, /100mm-inner/));
    check_(failed, 'is2/is2m fire pair 122mm', pair(cfg.is2, /122mm-fire/, /122mm-inner/) && pair(cfg.is2m, /122mm-fire/, /122mm-inner/));
    check_(failed, 'su152/isu152 fire pair 152mm', pair(cfg.su152, /152mm-fire/, /152mm-inner/) && pair(cfg.isu152, /152mm-fire/, /152mm-inner/));
    check_(failed, 'kv1 fire pair rus/76mm', pair(cfg.kv1, /rus\/76mm-fire/, /rus\/76mm-inner/));
    check_(failed, 'is1 fire pair 85mm', pair(cfg.is1, /85mm-fire/, /85mm-inner/));
    // 引擎 seg 静态断言
    const segOk = (c, accel, ce, ds, de) => c && c.seg.driveAccel === accel && c.seg.driveCruiseEnd === ce && c.seg.driveDecelStart === ds && (de == null ? c.seg.driveDecelEnd == null : c.seg.driveDecelEnd === de) && !c.seg.engineStart;
    check_(failed, 'm26 engine seg (4.9/13.06/16.4)', segOk(cfg.m26, 4.9, 13.06, 16.4, null), JSON.stringify(cfg.m26 && cfg.m26.seg));
    check_(failed, 'm4a3 engine seg (3/17.4/17.4→20)', segOk(cfg.m4a3, 3.0, 17.4, 17.4, 20.0), JSON.stringify(cfg.m4a3 && cfg.m4a3.seg));
    check_(failed, 't34-85 engine seg (4.9/13.24/13.8)', segOk(cfg['t34-85'], 4.9, 13.24, 13.8, null));
    check_(failed, 'su100 engine seg = t34 (shared file)', segOk(cfg.su100, 4.9, 13.24, 13.8, null));
    totalErrs += page.errs ? 0 : 0;
    await page.close();
  }

  // ═══ 三场引擎 e2e + 炮声 ═══
  for (const [tankId, spec] of Object.entries(ENGINES)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    page.errs = [];
    page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => page.errs.push('PAGEERROR: ' + String(e.message).slice(0, 300)));
    await gotoBattle(page, tankId, failed, tankId);
    await engineFlow(page, tankId, spec, failed, tankId);
    totalErrs += page.errs.length;
    if (page.errs.length) console.log(tankId + ' page errors:', page.errs.slice(0, 5));
    await page.close();
  }

  console.log('CONSOLE ERRORS (total ' + totalErrs + ')');
  console.log(failed.n === 0 && totalErrs === 0 ? 'USA/RUS SOUND TEST: ALL PASS' : 'USA/RUS SOUND TEST: FAILED (' + failed.n + ' checks)');
  await browser.close();
  process.exit(failed.n === 0 && totalErrs === 0 ? 0 : 1);

  function check_(f, name, ok, extra = '') { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' | ' + extra : '')); if (!ok) f.n++; }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
