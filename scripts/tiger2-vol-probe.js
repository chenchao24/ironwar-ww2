// 虎王 cruiseVol=0.8 探针：加速段 ≈0.8（原 1.0）、极速巡航 ≈0.64（原 0.8）
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
  let failed = 0;
  const check = (name, ok, extra = '') => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' | ' + extra : '')); if (!ok) failed++; };
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || t.includes('加载失败')) errs.push(m.type() + ': ' + t.slice(0, 200)); });
  page.on('pageerror', (e) => { errs.push(String(e.message).slice(0, 200)); });

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 180000, polling: 500 });
  await page.mouse.click(800, 450);
  await sleep(1200);
  await page.evaluate(() => document.getElementById('btn-hunt-mode').click());
  await page.waitForFunction(() => document.getElementById('screen-hangar').classList.contains('active'), { timeout: 60000, polling: 300 });
  for (let i = 0; i < 12; i++) {
    const sel = await page.evaluate(() => window.__game.ui.selectedTank);
    if (sel === 'tiger2') break;
    await page.evaluate(() => document.querySelector('#screen-hangar [data-action="next"]').click());
    await sleep(400);
  }
  const sel = await page.evaluate(() => window.__game.ui.selectedTank);
  check('garage selected tiger2', sel === 'tiger2', sel);
  await page.evaluate(() => document.querySelector('[data-map="kursk"]').click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('.fh-start-btn').click());
  await sleep(9000);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 60000 });
  await sleep(2000);

  const eng = () => page.evaluate(() => {
    const e = window.__audio.extEngine;
    if (!e) return null;
    return {
      driveG: +e.driveG.gain.value.toFixed(3),
      accelG: e.accelG ? +e.accelG.gain.value.toFixed(3) : 0,
      idleG: +e.idleG.gain.value.toFixed(3),
      sp: +Math.abs(window.__game.player.speed).toFixed(2),
    };
  });

  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__audio.extEngine && window.__audio.extEngine.driveG, { timeout: 30000, polling: 300 })
    .catch(async () => {
      const d = await page.evaluate(() => ({
        started: window.__audio.started,
        extKey: window.__audio.ext ? window.__audio.ext._key : null,
        hasExtEngine: !!window.__audio.extEngine,
        state: window.__game.state,
      }));
      console.log('WARN extEngine not ready:', JSON.stringify(d));
    });
  await sleep(2500);   // 加速中（未达极速；前 3.5s 走 accelG 一次性段）
  let s = await eng();
  check('accelerating one-shot volume ≈0.8 (was 1.0)', s.accelG > 0.72 && s.accelG < 0.9, JSON.stringify(s));
  await sleep(13000);  // 达极速
  s = await eng();
  const kmh = s.sp * 3.6;
  check('reached top speed (>13km/h)', kmh > 13, 'speed=' + kmh.toFixed(1));
  check('top-speed cruise ≈0.64 (was 0.8)', s.driveG > 0.58 && s.driveG < 0.72, JSON.stringify(s));
  await page.keyboard.up('KeyW');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'NO ERRORS');
  console.log(failed === 0 && errs.length === 0 ? 'TIGER2 VOLUME PROBE: ALL PASS' : `FAILED (${failed})`);
  await browser.close();
  process.exit(failed || errs.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
