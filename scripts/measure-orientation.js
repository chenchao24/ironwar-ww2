// 量 GLB 整车包围盒：确认模型朝向（长轴应在 z = 前后）
const { NodeIO, getBounds } = require('@gltf-transform/core');
const path = require('path');

(async () => {
  const io = new NodeIO();
  for (const f of ['tiger1.glb', 'tiger2.glb']) {
    const doc = await io.read(path.join('model', f));
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    const b = getBounds(scene);
    const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(2));
    console.log(f, 'size[x,y,z] =', JSON.stringify(size), ' min =', JSON.stringify(b.min.map(v => +v.toFixed(2))), ' max =', JSON.stringify(b.max.map(v => +v.toFixed(2))));
  }
})();
