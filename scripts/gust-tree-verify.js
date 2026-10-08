// 间歇阵风 + 树木风摆验证：
//  A) 采样 uWindAmp 36s：应见 ~0.16 间歇微动 + 偶发 0.7+ 阵风平台，起停平滑
//  B) 传送到最近树旁，阵风峰值期连拍两帧，页面内 canvas 差分：树冠区域变化明显、树干区域≈0
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });

  // ── A) 封面态即可采样（主循环已驱动 updateHedge）──
  const samples = await page.evaluate(async () => {
    const hedge = await import('./js/hedge.js');
    const out = [];
    for (let i = 0; i < 72; i++) {
      out.push(+hedge.hedgeUniforms.uWindAmp.value.toFixed(3));
      await new Promise(r => setTimeout(r, 500));
    }
    return out;
  });
  const mn = Math.min(...samples), mx = Math.max(...samples);
  let gusts = 0, inG = false;
  for (const a of samples) { if (!inG && a > 0.45) { gusts++; inG = true; } else if (inG && a < 0.25) inG = false; }
  let maxStep = 0;
  for (let i = 1; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
  console.log(`阵风包络: min=${mn} max=${mx} 阵风次数=${gusts} 最大步进(0.5s)=${maxStep.toFixed(3)}`);
  console.log('采样序列:', JSON.stringify(samples));

  // ── B) 进战斗，传送到最近树旁 ──
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(1200);

  const tree = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player.root.position;
    let best = null, bd = 1e9;
    for (const d of g.world.destructibles.list) {
      if ((d.type !== 'leaf' && d.type !== 'pine') || d.alive === false) continue;
      const dd = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return null;
    const h = best.height || 12;
    const dist = Math.max(18, h * 1.6);
    const ang = Math.random() * 6.28;
    const x = best.x + Math.sin(ang) * dist, z = best.z + Math.cos(ang) * dist;
    g.player.pos.set(x, 0, z);
    g.player.root.position.set(x, g.world.groundY(x, z), z);
    g.player.heading = Math.atan2(best.x - x, best.z - z);
    g.rig.aimYaw = g.player.heading;
    g.rig.aimPitch = Math.atan2(h * 0.5, dist) * 0.8;
    return { type: best.type, height: +h.toFixed(1), dist: +dist.toFixed(0), x: +best.x.toFixed(0), z: +best.z.toFixed(0) };
  });
  console.log('最近树:', JSON.stringify(tree));
  await sleep(1200);   // 等相机 lerp 稳定

  // 投影树冠/树干到屏幕坐标
  const pts = await page.evaluate(async () => {
    const g = window.__game;
    const THREE = await import('./lib/three.module.js').catch(() => null);
    const p = g.player.root.position;
    let best = null, bd = 1e9;
    for (const d of g.world.destructibles.list) {
      if ((d.type !== 'leaf' && d.type !== 'pine') || d.alive === false) continue;
      const dd = (d.x - p.x) ** 2 + (d.z - p.z) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return null;
    const cam = g.camera;
    const proj = (wx, wy, wz) => {
      const v = new cam.position.constructor(wx, wy, wz);   // Vector3
      v.project(cam);
      return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, behind: v.z > 1 };
    };
    const h = best.height || 12, gy = g.world.groundY(best.x, best.z);
    return {
      crown: proj(best.x, gy + h * 0.85, best.z),
      trunk: proj(best.x, gy + h * 0.12, best.z),
      camPos: { x: +cam.position.x.toFixed(1), y: +cam.position.y.toFixed(1), z: +cam.position.z.toFixed(1) },
    };
  });
  console.log('屏幕投影:', JSON.stringify(pts));
  if (!pts || pts.crown.behind) { console.log('SKIP: 树不在视野'); await browser.close(); return; }

  // 等阵风峰值
  const got = await page.evaluate(async () => {
    const hedge = await import('./js/hedge.js');
    const t0 = performance.now();
    while (performance.now() - t0 < 25000) {
      if (hedge.hedgeUniforms.uWindAmp.value > 0.55) return +hedge.hedgeUniforms.uWindAmp.value.toFixed(2);
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  });
  console.log('阵风峰值 amp =', got);

  const shotA = await page.screenshot({ encoding: 'base64' });
  await sleep(420);
  const ampB = await page.evaluate(async () => (await import('./js/hedge.js')).hedgeUniforms.uWindAmp.value.toFixed(2));
  const shotB = await page.screenshot({ encoding: 'base64' });
  fs.writeFileSync('scripts/shot-gust-a.png', Buffer.from(shotA, 'base64'));
  fs.writeFileSync('scripts/shot-gust-b.png', Buffer.from(shotB, 'base64'));
  console.log('第二帧 amp =', ampB);

  // 页面内差分：树冠盒 vs 树干盒
  const diff = await page.evaluate(async (a, b, crown, trunk) => {
    const load = (s) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const W = ia.width, H = ia.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(ia, 0, 0);
    const da = cx.getImageData(0, 0, W, H).data;
    cx.clearRect(0, 0, W, H); cx.drawImage(ib, 0, 0);
    const db = cx.getImageData(0, 0, W, H).data;
    const box = (cxp, cyp, r) => {
      let sum = 0, n = 0, big = 0;
      const x0 = Math.max(0, cxp - r), x1 = Math.min(W - 1, cxp + r);
      const y0 = Math.max(0, cyp - r), y1 = Math.min(H - 1, cyp + r);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        sum += d; n++; if (d > 40) big++;
      }
      return { mean: +(sum / n).toFixed(2), changedPct: +(big / n * 100).toFixed(1) };
    };
    return {
      crown: box(Math.round(crown.x), Math.round(crown.y), 60),
      trunk: box(Math.round(trunk.x), Math.round(trunk.y), 60),
    };
  }, shotA, shotB, pts.crown, pts.trunk);
  console.log('差分 树冠区:', JSON.stringify(diff.crown), ' 树干区:', JSON.stringify(diff.trunk));

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
