// 三辆新车结构探查：深层节点树 / 世界包围盒 / 材质类型 / 关键节点世界位置
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');

const FILES = [
  'tankModel/marder_iiim.glb',
  'tankModel/jagdpanzer_iv_late_prod..glb',
  'tankModel/is-2_1945.glb',
];

async function inspect(io, file) {
  const doc = await io.read(path.join(__dirname, '..', file));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const mats = root.listMaterials();
  console.log(`\n===== ${path.basename(file)} =====`);
  for (const m of mats) {
    const ext = m.getExtension('KHR_materials_pbrSpecularGlossiness');
    console.log(`  mat ${m.getName()}: ${ext ? 'SPEC_GLOSS(需转换)' : 'metalRough'} doubleSided=${m.getDoubleSided()}`);
  }
  // 世界矩阵遍历
  function wmat(node, parent) {
    const t = node.getTranslation(), r = node.getRotation(), s = node.getScale();
    const m = parent.clone();
    const q = new (require('@gltf-transform/core').MathUtils ? Object : Object)(); // noop
    return m;
  }
  // 简化：用递归矩阵
  const THREE = { Matrix: null };
  function walk(node, parentMat, depth) {
    const t = node.getTranslation(), r = node.getRotation(), s = node.getScale();
    const local = new Array(16);
    const M4 = global.__M4;
    const lm = new M4().compose(t, r, s);
    const wm = new M4().multiplyMatrices(parentMat, lm);
    const mesh = node.getMesh();
    let info = '';
    if (mesh) {
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      mesh.listPrimitives().forEach(p => {
        const pos = p.getAttribute('POSITION');
        if (pos) { const a = pos.getMin([]), b = pos.getMax([]); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a[i]); mx[i] = Math.max(mx[i], b[i]); } }
      });
      let tri = 0;
      mesh.listPrimitives().forEach(p => { const idx = p.getIndices(); tri += (idx ? idx.getCount() : pos.getAttribute ? pos.getAttribute('POSITION').getCount() / 3 : 0) / 3; });
      const e = wm.elements;
      info = ` MESH tri≈${tri | 0} bounds=(${mn.map(v => v.toFixed(2))})~(${mx.map(v => v.toFixed(2))}) worldPos=(${e[12].toFixed(2)},${e[13].toFixed(2)},${e[14].toFixed(2)})`;
    }
    console.log(`${'  '.repeat(depth)}${node.getName()} t=[${t.map(v => +v.toFixed(3))}] s=[${s.map(v => +v.toFixed(3))}]${info}`);
    if (depth < 3) node.listChildren().forEach(c => walk(c, wm, depth + 1));
    else if (node.listChildren().length) console.log(`${'  '.repeat(depth + 1)}... ${node.listChildren().length} children: ${node.listChildren().map(c => c.getName()).slice(0, 14).join(', ')}${node.listChildren().length > 14 ? ' ...' : ''}`);
  }
  // 手写 Matrix4（避免引 three 的 node 环境）——用 gltf-transform 内部依赖的 @math.gl? 直接自实现
  class M4 {
    constructor() { this.elements = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
    compose(t, q, s) {
      const [x, y, z] = t, [qx, qy, qz, qw] = q, [sx, sy, sz] = s;
      const x2 = qx+qx, y2 = qy+qy, z2 = qz+qz;
      const xx = qx*x2, xy = qx*y2, xz = qx*z2, yy = qy*y2, yz = qy*z2, zz = qz*z2, wx = qw*x2, wy = qw*y2, wz = qw*z2;
      // 列主序 elements（three 约定）
      this.elements = [
        (1-(yy+zz))*sx, (xy+wz)*sx, (xz-wy)*sx, 0,
        (xy-wz)*sy, (1-(xx+zz))*sy, (yz+wx)*sy, 0,
        (xz+wy)*sz, (yz-wx)*sz, (1-(xx+yy))*sz, 0,
        x, y, z, 1,
      ];
      return this;
    }
    multiplyMatrices(a, b) {
      const ae = a.elements, be = b.elements, te = this.elements;
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        te[c*4+r] = be[c*4]*ae[r] + be[c*4+1]*ae[4+r] + be[c*4+2]*ae[8+r] + be[c*4+3]*ae[12+r];
      }
      return this;
    }
  }
  global.__M4 = M4;
  const I = new M4();
  scene.listChildren().forEach(c => walk(c, I, 0));
}

(async () => {
  const io = new NodeIO();
  for (const f of FILES) await inspect(io, f);
})().catch(e => { console.error(e); process.exit(1); });
