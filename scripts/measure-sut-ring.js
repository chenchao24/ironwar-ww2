// is1/is2m 炮塔壳底环带圆拟合（炮塔壳 y 起始处）
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
const fit = (ps) => {
  let mx=0, mz=0; const n=ps.length;
  for (const p of ps) { mx+=p[0]/n; mz+=p[2]/n; }
  let uu=0, vv=0, uv=0, uuu=0, vvv=0, uvv=0, vuu=0;
  for (const p of ps) {
    const a=p[0]-mx, b=p[2]-mz;
    uu+=a*a; vv+=b*b; uv+=a*b; uuu+=a*a*a; vvv+=b*b*b; uvv+=a*b*b; vuu+=a*a*b;
  }
  const A=[[uu,uv],[uv,vv]], B=[(uuu+uvv)/2,(vvv+vuu)/2];
  const det=A[0][0]*A[1][1]-A[0][1]*A[1][0];
  const uc=(B[0]*A[1][1]-B[1]*A[0][1])/det, vc=(A[0][0]*B[1]-A[1][0]*B[0])/det;
  return { cx: mx+uc, cz: mz+vc, r: Math.sqrt(uc*uc+vc*vc+(uu+vv)/n), n };
};
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const [glb, node, bands] of [
    ['model/is1.glb', 'Object_13', [[1.62, 1.76], [1.62, 1.90], [1.76, 1.90]]],
    ['model/is2m.glb', 'Object_23', [[1.51, 1.65], [1.51, 1.80], [1.65, 1.80]]],
    ['model/kv1.glb', 'Object_12', [[1.60, 1.75], [1.60, 1.90], [1.75, 1.90]]],
  ]) {
    const doc = await io.read(glb);
    const n = doc.getRoot().listNodes().find(x => x.getName() === node);
    const wm = worldMat(n);
    const pts = [];
    for (const prim of n.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) pts.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
    }
    for (const [yLo, yHi] of bands) {
      const ps = pts.filter(p => p[1] > yLo && p[1] < yHi && Math.hypot(p[0], p[2]) > 0.3);
      if (ps.length < 40) { console.log(`${glb} 带 y[${yLo},${yHi}]: n=${ps.length} 太少`); continue; }
      const c = fit(ps);
      console.log(`${glb} ${node} 带 y[${yLo},${yHi}] (n=${ps.length}): 圆心 x=${c.cx.toFixed(3)} z=${c.cz.toFixed(3)} r=${c.r.toFixed(3)}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
