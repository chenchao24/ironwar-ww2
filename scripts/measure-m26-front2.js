// M26 前缘分带重测：中央带 vs 侧翼带
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
  for (const [xLo, xHi, label] of [[0, 0.7, '中央带'], [0.7, 1.3, '侧翼带'], [1.3, 1.9, '翼子板带']]) {
    console.log(`── ${label} |x|∈[${xLo},${xHi}] ──`);
    const bins = new Map();
    for (const p of hull) {
      const ax = Math.abs(p[0]);
      if (p[2] < 1.8 || ax < xLo || ax > xHi || p[1] < 0.3 || p[1] > 1.7) continue;
      const b = Math.round(p[1] / 0.1) * 0.1;
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(p[2]);
    }
    for (const [y, zs] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
      zs.sort((a, b) => a - b);
      const q = (f) => zs[Math.min(zs.length - 1, Math.floor(zs.length * f))].toFixed(2);
      console.log(`  y=${y.toFixed(1)} n=${String(zs.length).padStart(4)} z50=${q(0.5)} z85=${q(0.85)}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
