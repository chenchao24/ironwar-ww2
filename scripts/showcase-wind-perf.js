// 风摆性能隔离实测：50 丛分块合并状态下，
//   ① 带风摆材质（逐顶点 3×sin + aPhase） vs ② 同几何换纯 Lambert 材质（无注入）
//   ③ 顺带证明 uWindAmp=0 不省性能（sin 仍在执行）
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 300)));
  await page.goto('http://localhost:8081/showcase.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__showcase && window.__showcase.ready', { timeout: 90000 });
  await sleep(1500);

  const measure = (ms) => page.evaluate((ms) => new Promise(res => {
    let frames = 0; const t0 = performance.now();
    (function tick() { frames++; performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(+(frames / (performance.now() - t0) * 1000).toFixed(1)); })();
  }), ms);
  const view = async (v) => { await page.evaluate((v) => window.__showcase.setView(v), v); await sleep(800); };

  // ── 构建 50 丛分块合并（与 stress 脚本同款） ──
  await page.evaluate(() => {
    const w = window.__showcase, T = w.THREE;
    const pts = [];
    for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
      if (gx === 0 && gz === 0) continue;
      pts.push({ x: gx * 11 + (Math.random() - 0.5) * 3, z: -2.5 + gz * 11 + (Math.random() - 0.5) * 3, yaw: Math.random() * Math.PI * 2 });
    }
    const all = [{ x: 0, z: -2.5, yaw: 0 }, ...pts];
    const buildInst = (m, plist) => {
      const n = m.count * plist.length;
      const geo = m.geometry.clone();
      const phases = new Float32Array(n);
      for (let i = 0; i < n; i++) phases[i] = Math.random() * Math.PI * 2;
      geo.setAttribute('aPhase', new T.InstancedBufferAttribute(phases, 1));
      const im = new T.InstancedMesh(geo, m.material, n);
      const col = m.instanceColor ? m.instanceColor.array : null;
      if (col) im.instanceColor = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      const src = m.instanceMatrix.array;
      const dst = im.instanceMatrix.array;
      const dstCol = col ? im.instanceColor.array : null;
      let k = 0;
      for (const p of plist) {
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        for (let i = 0; i < m.count; i++, k++) {
          const o = i * 16, d = k * 16;
          dst[d]      = c * src[o]      + s * src[o + 2];
          dst[d + 1]  = src[o + 1];
          dst[d + 2]  = -s * src[o]     + c * src[o + 2];
          dst[d + 4]  = c * src[o + 4]  + s * src[o + 6];
          dst[d + 5]  = src[o + 5];
          dst[d + 6]  = -s * src[o + 4] + c * src[o + 6];
          dst[d + 8]  = c * src[o + 8]  + s * src[o + 10];
          dst[d + 9]  = src[o + 9];
          dst[d + 10] = -s * src[o + 8] + c * src[o + 10];
          dst[d + 12] = c * src[o + 12] + s * src[o + 14] + p.x;
          dst[d + 13] = src[o + 13];
          dst[d + 14] = -s * src[o + 12] + c * src[o + 14] + p.z;
          dst[d + 15] = 1;
          if (col) { dstCol[k * 3] = col[i * 3]; dstCol[k * 3 + 1] = col[i * 3 + 1]; dstCol[k * 3 + 2] = col[i * 3 + 2]; }
        }
      }
      im.customDepthMaterial = m.customDepthMaterial;
      im.castShadow = m.castShadow; im.receiveShadow = m.receiveShadow;
      im.computeBoundingSphere();
      return im;
    };
    const CELL = 22;
    const chunks = new Map();
    for (const p of all) {
      const k = Math.floor((p.x + 60) / CELL) + ',' + Math.floor((p.z + 60) / CELL);
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k).push(p);
    }
    window.__chunked = new T.Group();
    const srcMeshes = [...w.hedgeGroup.children];
    for (const m of srcMeshes) for (const plist of chunks.values()) window.__chunked.add(buildInst(m, plist));
    w.hedgeGroup.visible = false;
    w.scene.add(window.__chunked);
    // 记住原材质，准备纯 Lambert 对照
    window.__windMats = [...new Set(srcMeshes.map(m => m.material))];
  });
  await sleep(500);

  // ── ① 带风摆 ──
  await view('overview');
  const windOn = await measure(3000);
  await view('hedge');
  const windOnClose = await measure(3000);

  // ── ③ uWindAmp=0（sin 仍在跑，理论上无差别） ──
  await page.evaluate(() => { window.__showcase.uWindAmp.value = 0; });
  await sleep(400);
  await view('overview');
  const ampZero = await measure(2500);
  await page.evaluate(() => { window.__showcase.uWindAmp.value = 1; });

  // ── ② 换纯 Lambert 材质（真正去掉逐顶点 sin） ──
  await page.evaluate(() => {
    const w = window.__showcase, T = w.THREE;
    window.__plainMats = window.__windMats.map(m => new T.MeshLambertMaterial({
      map: m.map, alphaTest: m.alphaTest, side: m.side,
    }));
    const matMap = new Map(window.__windMats.map((m, i) => [m, window.__plainMats[i]]));
    window.__origMats = [];
    window.__chunked.traverse(o => {
      if (o.isInstancedMesh) { window.__origMats.push([o, o.material]); o.material = matMap.get(o.material); }
    });
  });
  await sleep(600);   // 编译新 shader
  await view('overview');
  const windOff = await measure(3000);
  await view('hedge');
  const windOffClose = await measure(3000);

  console.log(JSON.stringify({
    '全景_带风摆': windOn, '全景_幅度归零': ampZero, '全景_纯材质无风摆': windOff,
    '特写_带风摆': windOnClose, '特写_纯材质无风摆': windOffClose,
    '全景_风摆shader开销': +(windOff - windOn).toFixed(1),
    '特写_风摆shader开销': +(windOffClose - windOnClose).toFixed(1),
  }, null, 1));
  await browser.close();
})();
