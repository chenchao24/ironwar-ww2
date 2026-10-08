// 列出 wheelRS 中质心 y>0.92 的全部三角面（碎条区域）
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
function mulVec(m, v) {
  return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],
          m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],
          m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
}
function worldMat(nd) {
  const parents = nd.listParents().filter(p => p.propertyType === 'Node');
  const m = nd.getMatrix();
  if (!parents.length) return m;
  const pm = worldMat(parents[0]);
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c*4+r] += pm[k*4+r] * m[c*4+k];
  return out;
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('model/tiger2.glb');
  const node = doc.getRoot().listNodes().find(n => n.getName() === 'wheelRS');
  const wm = worldMat(node);
  const prim = node.getMesh().listPrimitives()[0];
  const arr = prim.getAttribute('POSITION').getArray();
  const rows = [];
  for (let t = 0; t < arr.length / 9; t++) {
    const wv = [];
    for (let k = 0; k < 3; k++) wv.push(mulVec(wm, [arr[t*9+k*3], arr[t*9+k*3+1], arr[t*9+k*3+2]]));
    const c = [(wv[0][0]+wv[1][0]+wv[2][0])/3, (wv[0][1]+wv[1][1]+wv[2][1])/3, (wv[0][2]+wv[1][2]+wv[2][2])/3];
    if (c[1] < 0.92) continue;
    rows.push({ c, wv });
  }
  console.log(`y>0.92 三角面 ${rows.length} 个:`);
  for (const r of rows) {
    console.log(`  c=(${r.c.map(v=>v.toFixed(2))}) verts=${r.wv.map(p=>'('+p.map(v=>v.toFixed(2)).join(',')+')').join(' ')}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
