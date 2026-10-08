// 分析 wheelRS 中 rc>0.45 的三角面：x 分布、面积、法线方向，找挡泥弧板特征
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
  const WC = { z: -2.54, y: 0.64 };
  const out = [];
  for (let t = 0; t < arr.length / 9; t++) {
    const wv = [];
    for (let k = 0; k < 3; k++) wv.push(mulVec(wm, [arr[t*9+k*3], arr[t*9+k*3+1], arr[t*9+k*3+2]]));
    const c = [(wv[0][0]+wv[1][0]+wv[2][0])/3, (wv[0][1]+wv[1][1]+wv[2][1])/3, (wv[0][2]+wv[1][2]+wv[2][2])/3];
    const rc = Math.hypot(c[2] - WC.z, c[1] - WC.y);
    const rv = Math.max(...wv.map(p => Math.hypot(p[2] - WC.z, p[1] - WC.y)));
    if (rv < 0.44) continue;
    const u = [wv[1][0]-wv[0][0], wv[1][1]-wv[0][1], wv[1][2]-wv[0][2]];
    const v = [wv[2][0]-wv[0][0], wv[2][1]-wv[0][1], wv[2][2]-wv[0][2]];
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const l = Math.hypot(...n) || 1;
    const area = l / 2;
    // 法线的径向度：法线 vs 轮心→质心方向
    const rad = [0, c[1] - WC.y, c[2] - WC.z];
    const rl = Math.hypot(...rad) || 1;
    const radial = Math.abs((n[1]*rad[1] + n[2]*rad[2]) / (l * rl));
    out.push({ area, c, rc, rv, nx: Math.abs(n[0]/l), radial });
  }
  out.sort((a, b) => b.rv - a.rv);
  console.log(`rv>0.44 三角面共 ${out.length}`);
  console.log('按最大顶点半径前 25：rv / rc / area / 质心(x,y,z) / |nx| / 径向度');
  for (const t of out.slice(0, 25))
    console.log(`  rv=${t.rv.toFixed(2)} rc=${t.rc.toFixed(2)} a=${t.area.toFixed(4)} c=(${t.c.map(v=>v.toFixed(2))}) |nx|=${t.nx.toFixed(2)} rad=${t.radial.toFixed(2)}`);
  // x 分布直方图（面积加权）
  const hist = {};
  for (const t of out) {
    const b = (Math.round(t.c[0] * 10) / 10).toFixed(1);
    hist[b] = (hist[b] || 0) + t.area;
  }
  console.log('x 质心面积分布:', Object.entries(hist).sort().map(([k, v]) => `${k}:${v.toFixed(3)}`).join(' '));
})().catch(e => { console.error(e); process.exit(1); });
