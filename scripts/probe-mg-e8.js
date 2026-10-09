const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
// 元件级连通分量分析：列指定节点的分量质心/包围盒
function mulVec(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[1]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
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
  const doc = await io.read('tankModel/m4a3e8_thunderbolt_vii.glb');
  for (const name of ['Object_7', 'Object_4']) {
    const node = doc.getRoot().listNodes().find(n => n.getName() === name);
    if (!node || !node.getMesh()) { console.log(name, 'missing'); continue; }
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const idx = prim.getIndices() ? prim.getIndices().getArray() : null;
      const n = idx ? idx.length : pos.length / 3;
      const tris = [];
      for (let t = 0; t < n / 3; t++) tris.push(idx ? [idx[t*3], idx[t*3+1], idx[t*3+2]] : [t*3, t*3+1, t*3+2]);
      // 连通分量（共享顶点并查）
      const parent = new Map();
      const find = (a) => { let r = a; while (parent.get(r) !== r) r = parent.get(r); let cur = a; while (parent.get(cur) !== cur) { const nx = parent.get(cur); parent.set(cur, r); cur = nx; } return r; };
      const uni = (a, b) => parent.set(find(a), find(b));
      const vset = new Set();
      for (const t of tris) for (const v of t) { if (!parent.has(v)) parent.set(v, v); vset.add(v); }
      for (const t of tris) { uni(t[0], t[1]); uni(t[1], t[2]); }
      const comps = new Map();
      for (const v of vset) { const r = find(v); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(v); }
      const rows = [];
      for (const vs of comps.values()) {
        if (vs.length < 30) continue;
        let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], c = [0, 0, 0];
        for (const v of vs) {
          const p = mulVec(wm, [pos[v*3], pos[v*3+1], pos[v*3+2]]);
          for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); c[k] += p[k] / vs.length; }
        }
        rows.push({ n: vs.length, c: c.map(v => +v.toFixed(2)), mn: mn.map(v => +v.toFixed(2)), mx: mx.map(v => +v.toFixed(2)) });
      }
      rows.sort((a, b) => b.n - a.n);
      console.log(`══ ${name}（分量 ${comps.size}，>30 顶点 ${rows.length}）`);
      for (const r of rows.slice(0, 22)) {
        console.log(`  v=${String(r.n).padStart(5)} 质心(${r.c}) 盒 x[${r.mn[0]},${r.mx[0]}] y[${r.mn[1]},${r.mx[1]}] z[${r.mn[2]},${r.mx[2]}]`);
      }
    }
  }
})();
