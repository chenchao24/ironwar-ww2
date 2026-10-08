// su152 加强筋定位：打印被剔除分量中、落在右前负重轮(z=-2.12,y=0.35)盘面 r0.33 内的几何特征
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
  const doc = await io.read('tankModel/su-152.glb');
  const tris = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || !['Object_12', 'Object_13', 'Object_18'].includes(node.getName())) continue;
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
        tris.push({ wv, c, node: node.getName() });
      }
    }
  }
  const keyOf = p => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
  const v2t = new Map();
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
  // 目标轮位（右前 z=-2.12 y=0.35, r=0.33）盘面内、x 1.0~1.5 的分量：打印几何（找筋）
  const CZ = -2.12, CY = 0.35, R = 0.33;
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) {
    // 分量顶点是否都在轮盘内 & 在 x 1.0~1.5
    let inDisc = 0, xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9], cx=0, cy=0, cz=0, maxVr=0;
    for (const i of g) for (const p of tris[i].wv) {
      const r = Math.hypot(p[2]-CZ, p[1]-CY);
      maxVr = Math.max(maxVr, r);
      if (r < R && Math.abs(p[0]) > 1.0 && Math.abs(p[0]) < 1.5) inDisc++;
      xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
      ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
      zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
    }
    if (inDisc < g.length * 3 * 0.5) continue;   // 半数以上顶点在盘面才相关（顶点计）
    for (const i of g) { cx+=tris[i].c[0]/g.length; cy+=tris[i].c[1]/g.length; cz+=tris[i].c[2]/g.length; }
    const ecc = Math.hypot(cz-CZ, cy-CY);
    const sec = new Set();
    for (const i of g) for (const p of tris[i].wv) sec.add(Math.floor((Math.atan2(p[1]-CY, p[2]-CZ)+Math.PI)/(Math.PI/6)));
    // 极坐标跨度
    let rMin=1e9, aMin=1e9, aMax=-1e9;
    for (const i of g) for (const p of tris[i].wv) {
      const r = Math.hypot(p[2]-CZ, p[1]-CY);
      rMin=Math.min(rMin,r);
      const a = Math.atan2(p[1]-CY, p[2]-CZ);
      aMin=Math.min(aMin,a); aMax=Math.max(aMax,a);
    }
    console.log(`n=${String(g.length).padStart(4)} 源=${tris[g[0]].node} x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] 质心ecc=${ecc.toFixed(3)} 扇区=${sec.size} 半径[${rMin.toFixed(2)},${maxVr.toFixed(2)}] 角跨=${((aMax-aMin)*57.3).toFixed(0)}° spanY=${(ys[1]-ys[0]).toFixed(2)} spanZ=${(zs[1]-zs[0]).toFixed(2)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
