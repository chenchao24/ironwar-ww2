// J 型 Object_12 连通分量（找油桶）+ 两车原型渲染
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function mulVec(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
function worldMat(nd) {
  const p = nd.listParents().filter(p => p.propertyType === 'Node');
  const m = nd.getMatrix();
  if (!p.length) return m;
  const pm = worldMat(p[0]);
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c*4+r] += pm[k*4+r]*m[c*4+k];
  return o;
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('tankModel/pz.iv_j_45.glb');
  const tris = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || node.getName() !== 'Object_12') continue;
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const idx = prim.getIndices() ? prim.getIndices().getArray() : null;
      const n = (idx ? idx.length : pos.length / 3) / 3;
      for (let t = 0; t < n; t++) {
        const wv = [], c = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx[t*3+k] : t*3+k;
          const p = mulVec(wm, [pos[v*3], pos[v*3+1], pos[v*3+2]]);
          wv.push(p); c[0]+=p[0]/3; c[1]+=p[1]/3; c[2]+=p[2]/3;
        }
        tris.push({ wv, c });
      }
    }
  }
  const v2t = new Map();
  const keyOf = p => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
  tris.forEach((t, i) => { for (const p of t.wv) { const k = keyOf(p); if (!v2t.has(k)) v2t.set(k, []); v2t.get(k).push(i); } });
  const comp = new Array(tris.length).fill(-1);
  let nc = 0;
  for (let i = 0; i < tris.length; i++) {
    if (comp[i] >= 0) continue;
    const q = [i]; comp[i] = nc;
    while (q.length) {
      const a = q.pop();
      for (const p of tris[a].wv) for (const j of v2t.get(keyOf(p)) || []) {
        if (comp[j] < 0) { comp[j] = nc; q.push(j); }
      }
    }
    nc++;
  }
  const groups = new Map();
  for (let i = 0; i < tris.length; i++) {
    if (!groups.has(comp[i])) groups.set(comp[i], []);
    groups.get(comp[i]).push(i);
  }
  const big = [...groups.values()].filter(g => g.length > 8).sort((a, b) => b.length - a.length);
  console.log(`Object_12: ${groups.size} 分量，>8 面 ${big.length} 个`);
  for (const g of big.slice(0, 25)) {
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9];
    for (const i of g) for (const p of tris[i].wv) {
      xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
      ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
      zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
    }
    console.log(`  n=${String(g.length).padStart(5)} x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}]`);
  }
  // 渲染
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 300)));
  const jobs = [
    ['tankModel/pz.iv_g.glb', '', 'shot-pz4g-src', [[5.5, 3, 6], [0, 1.0, 0]]],
    ['tankModel/pz.iv_g.glb', '', 'shot-pz4g-side', [[6, 1.3, 0], [0, 1.0, 0]]],
    ['tankModel/pz.iv_j_45.glb', '', 'shot-pz4j-src', [[5.5, 3, 6], [0, 1.0, 0]]],
    ['tankModel/pz.iv_j_45.glb', '', 'shot-pz4j-side', [[6, 1.3, 0], [0, 1.0, 0]]],
    ['tankModel/pz.iv_j_45.glb', 'Object_12', 'shot-pz4j-obj12', [[3.5, 2.5, 3], [0, 1.5, 1]]],
  ];
  for (const [glb, only, out, [pos, tgt]] of jobs) {
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent(glb) + (only ? '&only=' + only : ''), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready || window.__fail', { timeout: 60000 });
    if (await page.evaluate(() => window.__fail)) { console.log(out, 'LOAD FAILED'); continue; }
    await sleep(400);
    await page.evaluate(([p, t]) => window.__view(...p, ...t), [pos, tgt]);
    await sleep(250);
    await page.screenshot({ path: `scripts/${out}.png` });
    console.log(out, 'ok');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
