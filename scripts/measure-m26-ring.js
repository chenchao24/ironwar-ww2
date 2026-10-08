// M26 炮塔座圈圆拟合：Object_9 底环顶点代数圆拟合（Kasa 法）
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
  const n9 = root.listNodes().find(x => x.getName() === 'Object_9');
  const wm = worldMat(n9);
  const pts = [];
  for (const prim of n9.getMesh().listPrimitives()) {
    const arr = prim.getAttribute('POSITION').getArray();
    for (let i = 0; i < arr.length; i += 3) pts.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
  }
  // Object_9 y 分布直方图，找座圈环带（底部圆环边）
  const hy = new Map();
  for (const p of pts) { const b = Math.round(p[1] / 0.05) * 0.05; hy.set(b, (hy.get(b) || 0) + 1); }
  console.log('Object_9 y 直方图:');
  for (const [b, c] of [...hy.entries()].sort((a, b) => a[0] - b[0])) console.log(`  y=${b.toFixed(2)}: ${'#'.repeat(Math.min(70, Math.ceil(c/20)))} ${c}`);
  // 圆拟合函数
  const fitCircle = (ps) => {
    // Kasa: minimize Σ((x-cx)²+(z-cz)²-r²)²
    let sx=0, sz=0, sxx=0, szz=0, sxz=0, sxz2=0, szz2=0, sx2z=0, n=ps.length;
    let mx=0, mz=0;
    for (const p of ps) { mx+=p[0]/n; mz+=p[2]/n; }
    let u=0, v=0, uu=0, vv=0, uv=0, uuu=0, vvv=0, uvv=0, vuu=0;
    for (const p of ps) {
      const a=p[0]-mx, b=p[2]-mz;
      u+=a; v+=b; uu+=a*a; vv+=b*b; uv+=a*b;
      uuu+=a*a*a; vvv+=b*b*b; uvv+=a*b*b; vuu+=a*a*b;
    }
    // 解 2x2 线性方程
    const A=[[uu,uv],[uv,vv]], B=[(uuu+uvv)/2,(vvv+vuu)/2];
    const det=A[0][0]*A[1][1]-A[0][1]*A[1][0];
    const uc=(B[0]*A[1][1]-B[1]*A[0][1])/det, vc=(A[0][0]*B[1]-A[1][0]*B[0])/det;
    const cx=mx+uc, cz=mz+vc;
    const r=Math.sqrt(uc*uc+vc*vc+(uu+vv)/n);
    return { cx, cz, r, n };
  };
  for (const [yLo, yHi, rMin] of [[1.50,1.65,0.5],[1.55,1.70,0.5],[1.60,1.75,0.5],[1.30,1.45,0.4]]) {
    const ps = pts.filter(p => p[1]>yLo && p[1]<yHi && Math.hypot(p[0], p[2]) > rMin && Math.abs(p[2])<1.3);
    if (ps.length < 30) { console.log(`带 y[${yLo},${yHi}]: n=${ps.length} 太少`); continue; }
    const c = fitCircle(ps);
    console.log(`带 y[${yLo},${yHi}] (n=${ps.length}): 圆心 x=${c.cx.toFixed(3)} z=${c.cz.toFixed(3)} r=${c.r.toFixed(3)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
