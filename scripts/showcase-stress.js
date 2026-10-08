// 50 丛灌木压力实测（三方案对比）：
//   A. 朴素克隆：每丛 6 个 InstancedMesh 节点（几何/实例缓冲共享）→ draw call ×50，能视锥剔除
//   B. 整图合并：每变体 1 个大 InstancedMesh → draw call 不变，但包围球跨全图 → 无法剔除（反面教材）
//   C. 分块合并：22m 网格分块、每变体×每块 1 个 InstancedMesh → draw call 少量增加 + 可剔除（正确做法，同 PROJECT.md 旧灌木带教训）
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
  const info = () => page.evaluate(() => {
    const i = window.__showcase.renderer.info;
    return { calls: i.render.calls, tris: +(i.render.triangles / 1000).toFixed(0) + 'k' };
  });
  const view = async (v) => { await page.evaluate((v) => window.__showcase.setView(v), v); await sleep(800); };

  // ── 基线：1 丛 ──
  await view('overview');
  const base = { fps: await measure(3000), ...(await info()) };
  await view('hedge');
  const baseClose = { fps: await measure(3000), ...(await info()) };

  // ── 布置点：49 个（7×7 网格 ±33m，随机朝向）+ 原点 1 = 50 ──
  await page.evaluate(() => {
    const w = window.__showcase;
    const pts = [];
    for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
      if (gx === 0 && gz === 0) continue;
      pts.push({ x: gx * 11 + (Math.random() - 0.5) * 3, z: -2.5 + gz * 11 + (Math.random() - 0.5) * 3, yaw: Math.random() * Math.PI * 2 });
    }
    w.__pts = [{ x: 0, z: -2.5, yaw: 0 }, ...pts];

    // 通用：为变体 mesh × 布置点列表构建合并实例（yaw+平移烘焙进实例矩阵）
    w.__buildInst = (m, plist) => {
      const T = w.THREE;
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
  });

  // ── 方案A：朴素节点克隆（50×6 个 draw call） ──
  await page.evaluate(() => {
    const w = window.__showcase, T = w.THREE;
    window.__naive = new T.Group();
    const srcMeshes = [...w.hedgeGroup.children];
    for (const p of w.__pts.slice(1)) {
      for (const m of srcMeshes) {
        const c = new T.InstancedMesh(m.geometry, m.material, m.count);
        c.instanceMatrix = m.instanceMatrix;
        if (m.instanceColor) c.instanceColor = m.instanceColor;
        c.customDepthMaterial = m.customDepthMaterial;
        c.castShadow = m.castShadow; c.receiveShadow = m.receiveShadow;
        c.position.set(p.x, 0, p.z); c.rotation.y = p.yaw;
        window.__naive.add(c);
      }
    }
    w.scene.add(window.__naive);
  });
  await view('overview');
  const naive = { fps: await measure(3000), ...(await info()) };
  await page.evaluate(() => { window.__showcase.scene.remove(window.__naive); });

  // ── 方案B：整图合并（每变体 1 个大实例网格，无剔除） ──
  await page.evaluate(() => {
    const w = window.__showcase;
    window.__merged = new w.THREE.Group();
    for (const m of [...w.hedgeGroup.children]) window.__merged.add(w.__buildInst(m, w.__pts));
    w.hedgeGroup.visible = false;
    w.scene.add(window.__merged);
  });
  await sleep(500);
  await view('overview');
  const merged = { fps: await measure(3000), ...(await info()) };

  // ── 方案C：22m 分块合并（每块独立包围球，可剔除） ──
  await page.evaluate(() => {
    const w = window.__showcase;
    w.scene.remove(window.__merged);
    const CELL = 22;
    const chunks = new Map();
    for (const p of w.__pts) {
      const k = Math.floor((p.x + 60) / CELL) + ',' + Math.floor((p.z + 60) / CELL);
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k).push(p);
    }
    w.__nChunks = chunks.size;
    window.__chunked = new w.THREE.Group();
    for (const m of [...w.hedgeGroup.children])
      for (const plist of chunks.values()) window.__chunked.add(w.__buildInst(m, plist));
    w.scene.add(window.__chunked);
  });
  await sleep(500);
  const nChunks = await page.evaluate(() => window.__showcase.__nChunks);
  await view('overview');
  const chunked = { fps: await measure(3000), ...(await info()) };
  await view('hedge');
  const chunkedClose = { fps: await measure(3000), ...(await info()) };

  console.log(JSON.stringify({
    '基线_1丛_全景': base, '基线_1丛_特写': baseClose,
    'A_朴素克隆50_全景': naive,
    'B_整图合并50_全景': merged,
    ['C_分块合并50(' + nChunks + '块)_全景']: chunked,
    'C_分块合并50_特写': chunkedClose,
  }, null, 1));
  await browser.close();
})();
