// 猎虎轮件连通分量分析（Object_8 / Object_10，世界坐标）——split-wheels-jt 锚点发现
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

function worldMat(node) {
  const parents = node.listParents().filter(p => p.propertyType === 'Node');
  const m = node.getMatrix();
  if (!parents.length) return m;
  const pm = worldMat(parents[0]);
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++)
    out[c * 4 + r] += pm[k * 4 + r] * m[c * 4 + k];
  return out;
}
function mulVec(m, v) {
  return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
}
const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('tankModel/jagdtiger.glb');
  const allTris = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!['Object_8', 'Object_10'].includes(node.getName()) || !node.getMesh()) continue;
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const pa = pos.getArray();
      const idx = prim.getIndices() ? prim.getIndices().getArray() : null;
      const n = (idx ? idx.length : pa.length / 3) / 3;
      for (let t = 0; t < n; t++) {
        const wv = [], c = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const v = idx ? idx[t * 3 + k] : t * 3 + k;
          const p = mulVec(wm, [pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]]);
          wv.push(p); c[0] += p[0] / 3; c[1] += p[1] / 3; c[2] += p[2] / 3;
        }
        allTris.push({ wv, c });
      }
    }
  }
  console.log('三角面总数', allTris.length);
  // 连通分量
  const v2t = new Map();
  allTris.forEach((t, i) => { for (const p of t.wv) { const k = keyOf(p); (v2t.get(k) || v2t.set(k, []).get(k)).push(i); } });
  const compId = new Array(allTris.length).fill(-1);
  const comps = [];
  for (let i = 0; i < allTris.length; i++) {
    if (compId[i] >= 0) continue;
    const id = comps.length, stack = [i], member = [];
    compId[i] = id;
    while (stack.length) {
      const cur = stack.pop(); member.push(cur);
      for (const p of allTris[cur].wv) for (const j of v2t.get(keyOf(p)) || [])
        if (compId[j] < 0) { compId[j] = id; stack.push(j); }
    }
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], mxs = 0;
    for (const ti of member) {
      for (const p of allTris[ti].wv) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
      mxs += allTris[ti].c[0] / member.length;
    }
    comps.push({ id, n: member.length, mn, mx,
      ctr: [(mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2],
      span: [mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]], side: mxs > 0 ? 'R' : 'L' });
  }
  console.log('连通分量', comps.length);
  // 满盘（候选轮）按 side/z 排序
  const discs = comps.filter(c => c.span[1] > 0.4 && c.span[2] > 0.4 && c.span[0] < 0.6)
    .sort((a, b) => a.ctr[0] - b.ctr[0] || a.ctr[2] - b.ctr[2]);
  console.log('满盘分量', discs.length);
  for (const c of discs)
    console.log(`  ${c.side} ctr=[${c.ctr.map(v=>v.toFixed(2))}] span=[${c.span.map(v=>v.toFixed(2))}] tris=${c.n}`);
  // 其余较大分量（可能的悬挂/摆臂）
  const rest = comps.filter(c => !discs.includes(c) && c.n > 200)
    .sort((a, b) => b.n - a.n).slice(0, 20);
  console.log('其余大件 top20:');
  for (const c of rest)
    console.log(`  ${c.side} ctr=[${c.ctr.map(v=>v.toFixed(2))}] span=[${c.span.map(v=>v.toFixed(2))}] tris=${c.n}`);
})();
