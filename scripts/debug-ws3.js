// wheelRS 外圈(rc>0.42)三角面按角度扇区统计：找挡泥弧板的角度签名
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
  for (const NAME of ['wheelRI', 'wheelLI']) {
    const node = doc.getRoot().listNodes().find(n => n.getName() === NAME);
    const wm = worldMat(node);
    const prim = node.getMesh().listPrimitives()[0];
    const arr = prim.getAttribute('POSITION').getArray();
    const WC = { z: 3.03, y: 0.84 };
    const sectors = new Map();
    for (let t = 0; t < arr.length / 9; t++) {
      const wv = [];
      for (let k = 0; k < 3; k++) wv.push(mulVec(wm, [arr[t*9+k*3], arr[t*9+k*3+1], arr[t*9+k*3+2]]));
      const c = [(wv[0][0]+wv[1][0]+wv[2][0])/3, (wv[0][1]+wv[1][1]+wv[2][1])/3, (wv[0][2]+wv[1][2]+wv[2][2])/3];
      const rc = Math.hypot(c[2]-WC.z, c[1]-WC.y);
      if (rc < 0.42) continue;
      const u = [wv[1][0]-wv[0][0], wv[1][1]-wv[0][1], wv[1][2]-wv[0][2]];
      const v = [wv[2][0]-wv[0][0], wv[2][1]-wv[0][1], wv[2][2]-wv[0][2]];
      const cr = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const area = Math.hypot(...cr)/2;
      const ang = Math.atan2(c[1]-WC.y, c[2]-WC.z) * 180 / Math.PI;   // -180..180，0=车尾方向(-z 是 180/−180… 注意 z 轴)
      const sec = Math.round(ang / 15) * 15;
      if (!sectors.has(sec)) sectors.set(sec, { n: 0, area: 0, xs: [], maxA: 0 });
      const s = sectors.get(sec);
      s.n++; s.area += area; s.xs.push(c[0]); s.maxA = Math.max(s.maxA, area);
    }
    console.log(`\n${NAME} 外圈扇区（角度: 数量 总面积 最大单面 x范围）  [0°=+z 车头, ±180°=-z 车尾, 90°=顶]`);
    for (const [sec, s] of [...sectors.entries()].sort((a,b)=>a[0]-b[0])) {
      s.xs.sort((a,b)=>a-b);
      console.log(`  ${String(sec).padStart(5)}°: n=${String(s.n).padStart(3)} area=${s.area.toFixed(3)} max=${s.maxA.toFixed(3)} x[${s.xs[0].toFixed(2)},${s.xs[s.xs.length-1].toFixed(2)}]`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
