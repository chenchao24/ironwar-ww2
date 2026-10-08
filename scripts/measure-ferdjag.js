// 费迪南/猎豹 结构探查：节点树 / 每网格世界 bbox / 材质 / 履带 UV 量程
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const path = require('path');

const FILES = process.argv[2] ? [process.argv[2]] : ['model/ferdinand.glb', 'model/jagdpanther_g1.glb'];

function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function applyMat(m, v) {
  const [x, y, z] = v;
  return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
}

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const file of FILES) {
    const doc = await io.read(path.join(__dirname, '..', file));
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    console.log(`\n===== ${path.basename(file)} =====`);
    for (const m of doc.getRoot().listMaterials()) {
      const ext = m.getExtension('KHR_materials_pbrSpecularGlossiness');
      console.log(`  mat ${m.getName()}: ${ext ? 'SPEC_GLOSS(需转换)' : 'metalRough'}`);
    }
    const walk = (node, pm, depth) => {
      const m = matMul(pm, node.getMatrix());
      const mesh = node.getMesh();
      let info = '';
      if (mesh) {
        let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], tri = 0;
        mesh.listPrimitives().forEach(p => {
          const pos = p.getAttribute('POSITION');
          if (!pos) return;
          const idx = p.getIndices();
          tri += (idx ? idx.getCount() : pos.getCount()) / 3;
          const arr = pos.getArray();
          const step = Math.max(1, Math.floor(pos.getCount() / 1500)) * 3;
          for (let i = 0; i < arr.length; i += step) {
            const w = applyMat(m, [arr[i], arr[i+1], arr[i+2]]);
            for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
          }
        });
        // 履带 UV 量程
        let uvInfo = '';
        const p0 = mesh.listPrimitives()[0];
        const uv = p0 && p0.getAttribute('TEXCOORD_0');
        if (/wheel|sprocket|idler|Object_(18|19|8)/.test(node.getName()) && uv) {
          let umin=1e9,umax=-1e9,vmin=1e9,vmax=-1e9;
          const ua = uv.getArray();
          for (let i = 0; i < ua.length; i += 2) {
            umin=Math.min(umin,ua[i]); umax=Math.max(umax,ua[i]);
            vmin=Math.min(vmin,ua[i+1]); vmax=Math.max(vmax,ua[i+1]);
          }
          uvInfo = ` | UV u[${umin.toFixed(2)},${umax.toFixed(2)}] v[${vmin.toFixed(2)},${vmax.toFixed(2)}]`;
        }
        const ctr = mn.map((v, i) => ((v + mx[i]) / 2).toFixed(2));
        info = ` MESH tri=${tri|0} bbox=(${mn.map(v=>v.toFixed(2))})~(${mx.map(v=>v.toFixed(2))}) ctr=(${ctr})${uvInfo}`;
      }
      console.log(`${'  '.repeat(depth)}${node.getName()} t=[${node.getTranslation().map(v=>+v.toFixed(3))}]${info}`);
      if (depth < 4) node.listChildren().forEach(c => walk(c, m, depth + 1));
      else if (node.listChildren().length) console.log(`${'  '.repeat(depth+1)}... ${node.listChildren().length} children`);
    };
    scene.listChildren().forEach(c => walk(c, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], 0));
  }
})().catch(e => { console.error(e); process.exit(1); });
