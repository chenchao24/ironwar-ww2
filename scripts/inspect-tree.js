// GLB 全节点树 + 每节点世界包围盒（组合世界矩阵）
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');

function mat4Mul(a, b) { // a*b, column-major
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c*4+r] += a[k*4+r] * b[c*4+k];
  return o;
}
function xform(m, v) {
  return [
    m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],
    m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],
    m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14],
  ];
}

async function inspect(file) {
  const io = new NodeIO();
  const doc = await io.read(file);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  console.log(`\n===== ${path.basename(file)} =====`);
  const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  function walk(node, depth, parentM) {
    const m = mat4Mul(parentM, node.getMatrix());
    const mesh = node.getMesh();
    let info = '';
    if (mesh) {
      let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
      mesh.listPrimitives().forEach(p=>{
        const pos = p.getAttribute('POSITION');
        if (!pos) return;
        const pmn=pos.getMin([]), pmx=pos.getMax([]);
        for (let i=0;i<8;i++) {
          const corner=[(i&1)?pmx[0]:pmn[0], (i&2)?pmx[1]:pmn[1], (i&4)?pmx[2]:pmn[2]];
          const w = xform(m, corner);
          for (let k=0;k<3;k++){ mn[k]=Math.min(mn[k],w[k]); mx[k]=Math.max(mx[k],w[k]); }
        }
      });
      info = ` wb=(${mn.map(v=>v.toFixed(2))})~(${mx.map(v=>v.toFixed(2))})`;
    }
    const wt = xform(m, [0,0,0]);
    console.log(`${'  '.repeat(depth)}${node.getName()} wt=(${wt.map(v=>v.toFixed(2))})${info}`);
    node.listChildren().forEach(c => walk(c, depth+1, m));
  }
  scene.listChildren().forEach(c => walk(c, 0, I));
}
(async () => {
  await inspect(path.join(__dirname, '../model/tiger1.glb'));
  await inspect(path.join(__dirname, '../model/m4a376w.glb'));
})().catch(e => { console.error(e); process.exit(1); });
