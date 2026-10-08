// GLB 结构探查：节点树 / 世界包围盒 / 材质类型
const { NodeIO } = require('@gltf-transform/core');
const { getBounds } = require('@gltf-transform/functions');
const path = require('path');

async function inspect(file) {
  const io = new NodeIO();
  const doc = await io.read(file);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const size = [b.max[0]-b.min[0], b.max[1]-b.min[1], b.max[2]-b.min[2]];
  console.log(`\n===== ${path.basename(file)} =====`);
  console.log('world bounds min:', b.min.map(v=>v.toFixed(3)).join(', '));
  console.log('world bounds max:', b.max.map(v=>v.toFixed(3)).join(', '));
  console.log('world size    :', size.map(v=>v.toFixed(3)).join(', '));
  // 材质
  const mats = doc.getRoot().listMaterials().map(m => m.getName());
  console.log('materials:', mats.join(' | '));
  // 节点树（深度2层 + 网格节点）
  function walk(node, depth) {
    const t = node.getTranslation().map(v=>+v.toFixed(3));
    const r = node.getRotation().map(v=>+v.toFixed(3));
    const s = node.getScale().map(v=>+v.toFixed(3));
    const mesh = node.getMesh();
    let meshInfo = '';
    if (mesh) {
      let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
      mesh.listPrimitives().forEach(p=>{
        const pos = p.getAttribute('POSITION');
        if (pos) { const pmn=pos.getMin([]), pmx=pos.getMax([]); for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],pmn[i]);mx[i]=Math.max(mx[i],pmx[i]);} }
      });
      meshInfo = ` MESH[${mesh.getName()}] localBounds=(${mn.map(v=>v.toFixed(2))})~(${mx.map(v=>v.toFixed(2))})`;
    }
    console.log(`${'  '.repeat(depth)}${node.getName()} t=[${t}] r=[${r}] s=[${s}]${meshInfo}`);
    if (depth < 2) node.listChildren().forEach(c => walk(c, depth+1));
    else if (node.listChildren().length) console.log(`${'  '.repeat(depth+1)}... ${node.listChildren().length} children: ${node.listChildren().map(c=>c.getName()).slice(0,12).join(', ')}${node.listChildren().length>12?' ...':''}`);
  }
  scene.listChildren().forEach(c => walk(c, 0));
}
(async () => {
  await inspect(path.join(__dirname, '../model/tiger1.glb'));
  await inspect(path.join(__dirname, '../model/m4a376w.glb'));
})().catch(e => { console.error(e); process.exit(1); });
