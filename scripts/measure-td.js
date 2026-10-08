// M18/M36 配置点位量测：整车范围/炮塔座圈圆拟合/炮管轴线+炮口/履带UV/首上轮廓/侧壁
// 用法: node scripts/measure-td.js model/m18.glb Object_13,Object_16 Object_3,Object_4 barrelTube
//        （炮塔节点 履带节点 炮管节点）
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
const [SRC, TURRET, TRACK, BARREL] = [process.argv[2], process.argv[3].split(','), process.argv[4].split(','), process.argv[5].split(',')];
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(SRC);
  const root = doc.getRoot();
  const byName = (n) => root.listNodes().find(x => x.getName() === n);
  const nodePts = (node) => {
    const wm = worldMat(node);
    const pts = [];
    for (const prim of node.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) pts.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
    }
    return pts;
  };
  console.log('══', SRC, '══');
  // ① 整车范围
  {
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9];
    for (const node of root.listNodes()) {
      if (!node.getMesh()) continue;
      for (const p of nodePts(node)) {
        xs=[Math.min(xs[0],p[0]),Math.max(xs[1],p[0])];
        ys=[Math.min(ys[0],p[1]),Math.max(ys[1],p[1])];
        zs=[Math.min(zs[0],p[2]),Math.max(zs[1],p[2])];
      }
    }
    console.log(`① 整车: x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}] 全长含炮=${(zs[1]-zs[0]).toFixed(2)}m`);
  }
  // ② 炮塔座圈圆拟合（炮塔节点底环带，多带尝试）
  {
    const pts = [];
    for (const nm of TURRET) { const n = byName(nm); if (n) pts.push(...nodePts(n)); }
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
    let yMin=1e9, yMax=-1e9;
    for (const p of pts) { yMin=Math.min(yMin,p[1]); yMax=Math.max(yMax,p[1]); }
    for (let yLo = yMin + 0.05; yLo < yMin + 0.45; yLo += 0.1) {
      const ps = pts.filter(p => p[1] > yLo && p[1] < yLo + 0.15 && Math.hypot(p[0], p[2]) > 0.35 && Math.abs(p[2]) < 1.4);
      if (ps.length < 40) continue;
      const c = fit(ps);
      console.log(`② 座圈带 y[${yLo.toFixed(2)},${(yLo+0.15).toFixed(2)}] (n=${ps.length}): 圆心 x=${c.cx.toFixed(3)} z=${c.cz.toFixed(3)} r=${c.r.toFixed(3)}`);
    }
  }
  // ③ 炮管轴线+炮口（炮管节点前段顶点）
  {
    let pts = [];
    for (const nm of BARREL) { const n = byName(nm); if (n) pts.push(...nodePts(n)); }
    let zMax = -1e9;
    for (const p of pts) zMax = Math.max(zMax, p[2]);
    const front = pts.filter(p => p[2] > zMax - 1.2);
    let mx=0, my=0;
    for (const p of front) { mx+=p[0]/front.length; my+=p[1]/front.length; }
    console.log(`③ 炮管: 前段轴线 x=${mx.toFixed(3)} y=${my.toFixed(3)}，炮口 z=${zMax.toFixed(3)}`);
    // 炮盾/耳轴段：z 分桶 max|x|
    const bins = new Map();
    for (const p of pts) {
      if (p[2] > 2.5) continue;
      const b = Math.round(p[2] / 0.2) * 0.2;
      const e = bins.get(b) || { mx: 0, ys: [1e9, -1e9], n: 0 };
      e.mx = Math.max(e.mx, Math.abs(p[0]));
      e.ys = [Math.min(e.ys[0], p[1]), Math.max(e.ys[1], p[1])];
      e.n++;
      bins.set(b, e);
    }
    console.log('   沿 z 截面:');
    for (const [z, e] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`     z=${z.toFixed(1)} max|x|=${e.mx.toFixed(2)} y[${e.ys[0].toFixed(2)},${e.ys[1].toFixed(2)}] n=${e.n}`);
    }
  }
  // ④ 履带 UV（跨度 + 底段 dv/dz 分桶中位数符号）
  for (const nm of TRACK) {
    const node = byName(nm);
    if (!node) continue;
    const wm = worldMat(node);
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      if (!uvAcc) continue;
      const uv = uvAcc.getArray();
      let uMin=1e9,uMax=-1e9,vMin=1e9,vMax=-1e9;
      const rows = [];
      let yLo = 1e9;
      const all = [];
      for (let i = 0; i < pos.length; i += 3) {
        const w = mulVec(wm, [pos[i], pos[i+1], pos[i+2]]);
        const u = uv[i/3*2], v = uv[i/3*2+1];
        uMin=Math.min(uMin,u);uMax=Math.max(uMax,u);vMin=Math.min(vMin,v);vMax=Math.max(vMax,v);
        all.push({ z: w[2], y: w[1], u, v });
        yLo = Math.min(yLo, w[1]);
      }
      const bottom = all.filter(r => r.y < yLo + 0.3);
      const bins = new Map();
      for (const r of bottom) {
        const b = Math.round(r.z / 0.1) * 0.1;
        if (!bins.has(b)) bins.set(b, []);
        bins.get(b).push(r.v % 1);
      }
      const bRows = [...bins.entries()].sort((a, b) => a[0] - b[0])
        .map(([z, vs]) => { vs.sort((a, b) => a - b); return [z, vs[Math.floor(vs.length / 2)]]; });
      let pos2 = 0, neg = 0;
      for (let i = 1; i < bRows.length; i++) {
        const dv = bRows[i][1] - bRows[i-1][1];
        if (Math.abs(dv) > 0.5) continue;
        if (dv > 0) pos2++; else if (dv < 0) neg++;
      }
      console.log(`④ 履带 ${nm}: uRange=${(uMax-uMin).toFixed(2)} vRange=${(vMax-vMin).toFixed(2)} 底段桶=${bRows.length} dv正=${pos2} 负=${neg} → 纵向=${(uMax-uMin)>(vMax-vMin)?'U(x)':'V(y)'} ${neg>pos2?'flip=true':'flip=false'}`);
    }
  }
  // ⑤ 车体轮廓：首上前缘（y 分桶 z85）+ 侧壁 |x| 直方图 + 车尾
  {
    let hull = [];
    const SKIP = new RegExp(`^(${TRACK.join('|')}|wheel|coaxMg|roofMg|barrelTube|${TURRET.join('|')})$`);
    for (const node of root.listNodes()) {
      if (!node.getMesh() || SKIP.test(node.getName())) continue;
      hull.push(...nodePts(node));
    }
    const bins = new Map();
    for (const p of hull) {
      if (p[2] < 1.5 || Math.abs(p[0]) > 1.0 || p[1] < 0.3 || p[1] > 1.6) continue;
      const b = Math.round(p[1] / 0.1) * 0.1;
      if (!bins.has(b)) bins.set(b, []);
      bins.get(b).push(p[2]);
    }
    console.log('⑤ 前缘轮廓 (y → z50/z85):');
    for (const [y, zs] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
      zs.sort((a, b) => a - b);
      const q = (f) => zs[Math.min(zs.length - 1, Math.floor(zs.length * f))].toFixed(2);
      console.log(`   y=${y.toFixed(1)} z50=${q(0.5)} z85=${q(0.85)}`);
    }
    const hx = new Map();
    for (const p of hull) {
      if (p[1] < 0.9 || p[1] > 1.4 || p[2] < -2.2 || p[2] > 2.0 || Math.abs(p[0]) < 0.8) continue;
      const b = Math.round(Math.abs(p[0]) / 0.05) * 0.05;
      hx.set(b, (hx.get(b) || 0) + 1);
    }
    let top = '';
    for (const [b, c] of [...hx.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) top += `|x|=${b.toFixed(2)}(${c}) `;
    console.log('   侧壁主峰:', top);
    // 车尾
    const rear = hull.filter(p => p[2] < -2.2 && Math.abs(p[0]) < 1.0);
    if (rear.length) {
      const rb = new Map();
      for (const p of rear) {
        const b = Math.round(p[1] / 0.2) * 0.2;
        if (!rb.has(b)) rb.set(b, []);
        rb.get(b).push(p[2]);
      }
      console.log('   车尾轮廓 (y → z_15%):', [...rb.entries()].sort((a, b) => a[0] - b[0]).map(([y, zs]) => { zs.sort((a, b) => a - b); return `y${y.toFixed(1)}/z${zs[Math.floor(zs.length * 0.15)].toFixed(2)}`; }).join(' '));
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
