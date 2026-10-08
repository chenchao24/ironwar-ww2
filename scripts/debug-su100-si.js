// su100 主/诱导轮归桶诊断：复跑 bucket 逻辑，打印两侧 S/I 桶的分量明细
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
function mulVec(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
function worldMat(node) {
  const parents = node.listParents().filter(p => p.propertyType === 'Node');
  const m = node.getMatrix();
  if (!parents.length) return m;
  const pm = worldMat(parents[0]);
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += pm[k * 4 + r] * m[c * 4 + k];
  return out;
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('tankModel/su-100 .glb');
  const root = doc.getRoot();
  const allTris = [];
  for (const node of root.listNodes()) {
    if (!node.getMesh() || !['Object_8', 'Object_14'].includes(node.getName())) continue;
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const idx = prim.getIndices() ? prim.getIndices().getArray() : null;
      const n = (idx ? idx.length : pos.length / 3) / 3;
      for (let t = 0; t < n; t++) {
        const vs = [];
        for (let k = 0; k < 3; k++) vs.push(idx ? idx[t*3+k] : t*3+k);
        const wv = [], c = [0, 0, 0];
        for (const v of vs) {
          const p = mulVec(wm, [pos[v*3], pos[v*3+1], pos[v*3+2]]);
          wv.push(p); c[0]+=p[0]/3; c[1]+=p[1]/3; c[2]+=p[2]/3;
        }
        allTris.push({ vs, wv, c, node: node.getName() });
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
  // 打印 S/I 附近（|z+2.61|<0.7 或 |z-2.62|<0.7，y<1.4）的所有分量
  const near = [...groups.values()].filter(g => {
    const cz = g.reduce((a, i) => a + allTris[i].c[2], 0) / g.length;
    const cy = g.reduce((a, i) => a + allTris[i].c[1], 0) / g.length;
    return (Math.abs(cz + 2.61) < 0.7 || Math.abs(cz - 2.62) < 0.7) && cy < 1.4;
  });
  for (const g of near.sort((a, b) => b.length - a.length)) {
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9], cx=0, cy=0, cz=0;
    for (const i of g) for (const p of allTris[i].wv) {
      xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
      ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
      zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
    }
    for (const i of g) { cx+=allTris[i].c[0]/g.length; cy+=allTris[i].c[1]/g.length; cz+=allTris[i].c[2]/g.length; }
    console.log(`n=${String(g.length).padStart(4)} 源=${allTris[g[0]].node} x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}] 质心(${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)})`);
  }
})().catch(e => { console.error(e); process.exit(1); });
