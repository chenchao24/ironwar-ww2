// 新增资产探查：bbox / 节点名 / 材质 / 网格数
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');
async function inspect(file) {
  const io = new NodeIO();
  const doc = await io.read(file);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const b = (() => {
    // 手动算世界包围盒
    let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
    scene.listChildren().forEach(c => {
      c.traverse(n => {
        const mesh = n.getMesh();
        if (!mesh) return;
        // 简化：用局部 bounds + 节点世界变换近似（大多数资产根无缩放）
        mesh.listPrimitives().forEach(p => {
          const pos = p.getAttribute('POSITION');
          if (!pos) return;
          const pmn = pos.getMin([]), pmx = pos.getMax([]);
          const t = n.getWorldTranslation ? null : null;
          for (let i = 0; i < 3; i++) {
            // 粗略：取节点世界矩阵平移 + 局部范围
            mn[i] = Math.min(mn[i], pmn[i] + (n.getTranslation()[i] || 0));
            mx[i] = Math.max(mx[i], pmx[i] + (n.getTranslation()[i] || 0));
          }
        });
      });
    });
    return { mn, mx };
  })();
  const meshes = doc.getRoot().listMeshes();
  const mats = doc.getRoot().listMaterials().map(m => m.getName());
  console.log(`\n===== ${path.basename(file)} =====`);
  console.log('approx bounds min:', b.mn.map(v=>v.toFixed(2)).join(','), ' max:', b.mx.map(v=>v.toFixed(2)).join(','));
  console.log('approx size:', b.mx.map((v,i)=>(v-b.mn[i]).toFixed(2)).join(' x '));
  console.log('meshes:', meshes.length, ' materials:', mats.join(' | '));
  // 节点名（含 mesh 的）
  const nodeInfo = [];
  scene.listChildren().forEach(c => c.traverse(n => {
    if (n.getMesh()) nodeInfo.push(`${n.getName()} [tr=(${n.getTranslation().map(v=>+v.toFixed(2))})]`);
  }));
  console.log('mesh nodes:', nodeInfo.slice(0, 40).join('\n  '));
}
(async () => {
  for (const f of ['bush1.glb', 'bush2.glb', 'bush3.glb', 'rocks.glb', 'coniferous_forest_assets_pack.glb']) {
    await inspect(path.join(__dirname, '../otherModel/', f)).catch(e => console.error(f, e.message));
  }
})();
