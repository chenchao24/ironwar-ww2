// M26 前缘重测：除履带/轮/炮塔/炮管/机枪外的全部静态节点
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
  const doc = await io.read('model/m26_pershing.glb');
  const root = doc.getRoot();
  const SKIP = /^(Object_4|Object_6|Object_9|Object_10|Object_22|Object_23|coaxMg|Object_2|Object_3|Object_5|Object_7|Object_19|Object_21|wheel)/;
  let hull = [];
  for (const n of root.listNodes()) {
    if (!n.getMesh() || SKIP.test(n.getName())) continue;
    const wm = worldMat(n);
    for (const prim of n.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) hull.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
    }
  }
  console.log('静态车体顶点数:', hull.length);
  // 前缘：|x|<1.05，y 桶 0.05，z 取 50/85 分位
  const bins = new Map();
  for (const p of hull) {
    if (p[2] < 1.8 || Math.abs(p[0]) > 1.05 || p[1] < 0.3 || p[1] > 1.7) continue;
    const b = Math.round(p[1] / 0.05) * 0.05;
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(p[2]);
  }
  console.log('前缘轮廓 (y → z50/z85/z100):');
  for (const [y, zs] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    zs.sort((a, b) => a - b);
    const q = (f) => zs[Math.min(zs.length - 1, Math.floor(zs.length * f))].toFixed(2);
    console.log(`  y=${y.toFixed(2)} n=${zs.length} z50=${q(0.5)} z85=${q(0.85)} z100=${q(1)}`);
  }
  // 车体侧壁 y∈[1.0,1.45] 重测（含全部静态件）
  const hx = new Map();
  for (const p of hull) {
    if (p[1] < 1.0 || p[1] > 1.45 || p[2] < -2.4 || p[2] > 2.2 || Math.abs(p[0]) < 0.9) continue;
    const b = Math.round(Math.abs(p[0]) / 0.05) * 0.05;
    hx.set(b, (hx.get(b) || 0) + 1);
  }
  console.log('侧上带 |x| 直方图:');
  for (const [b, c] of [...hx.entries()].sort((a, b) => a[0] - b[0])) console.log(`  |x|=${b.toFixed(2)}: ${'#'.repeat(Math.min(60, Math.ceil(c / 60)))} ${c}`);
})().catch(e => { console.error(e); process.exit(1); });
