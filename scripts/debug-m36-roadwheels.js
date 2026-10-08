// M36 负重轮：逐轮位统计各连通分量在 r 帽内的三角面占比 → 定切分规则
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
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
  const doc = await io.read('tankModel/m36_gmc.glb');
  const WN = ['Object_14', 'Object_17', 'Object_18'];
  const allTris = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || !WN.includes(node.getName())) continue;
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
        allTris.push({ wv, c, node: node.getName() });
      }
    }
  }
  // 连通分量
  const v2t = new Map();
  const keyOf = p => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
  allTris.forEach((t, i) => { for (const p of t.wv) { const k = keyOf(p); if (!v2t.has(k)) v2t.set(k, []); v2t.get(k).push(i); } });
  const comp = new Array(allTris.length).fill(-1);
  let nc = 0;
  for (let i = 0; i < allTris.length; i++) {
    if (comp[i] >= 0) continue;
    const q = [i]; comp[i] = nc;
    while (q.length) {
      const a = q.pop();
      for (const p of allTris[a].wv) for (const j of v2t.get(keyOf(p)) || []) {
        if (comp[j] < 0) { comp[j] = nc; q.push(j); }
      }
    }
    nc++;
  }
  const groups = new Map();
  for (let i = 0; i < allTris.length; i++) {
    if (!groups.has(comp[i])) groups.set(comp[i], []);
    groups.get(comp[i]).push(i);
  }
  const CENTERS = [-1.84, -1.00, -0.40, 0.44, 1.05, 1.89], CY = 0.29, R = 0.25;
  // 只看 >50 面、且至少有 5 面落在某轮 r×1.2 内的分量
  const rows = [];
  for (const g of groups.values()) {
    if (g.length < 50) continue;
    const perWheel = CENTERS.map(z => {
      let cnt = 0;
      for (const i of g) if (Math.hypot(allTris[i].c[2] - z, allTris[i].c[1] - CY) < R * 1.2) cnt++;
      return cnt;
    });
    if (Math.max(...perWheel) < 5) continue;
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9];
    for (const i of g) for (const p of allTris[i].wv) {
      xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
      ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
      zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
    }
    rows.push({ n: g.length, node: allTris[g[0]].node, xs, ys, zs, perWheel });
  }
  console.log('轮心 z:', CENTERS.join(' '), ' y=0.29 r=0.25, 帽 r×1.2');
  for (const r2 of rows.sort((a, b) => b.n - a.n)) {
    const pct = r2.perWheel.map(c => `${c}(${(100 * c / r2.n).toFixed(0)}%)`);
    console.log(`n=${String(r2.n).padStart(5)} 源=${r2.node} x[${r2.xs[0].toFixed(2)},${r2.xs[1].toFixed(2)}] y[${r2.ys[0].toFixed(2)},${r2.ys[1].toFixed(2)}] z[${r2.zs[0].toFixed(2)},${r2.zs[1].toFixed(2)}] 各轮内面数: ${pct.join(' ')}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
