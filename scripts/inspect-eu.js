// 欧洲小镇建筑批量探查：尺寸/三角量/节点结构
const { NodeIO } = require('@gltf-transform/core');
const { getBounds } = require('@gltf-transform/functions');
const fs = require('fs');
const path = require('path');
(async () => {
  const io = new NodeIO();
  const dir = 'otherModel/EuropeCity';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort();
  for (const f of files) {
    let doc;
    try { doc = await io.read(path.join(dir, f)); }
    catch (e) { console.log('READ_FAIL ' + f + ': ' + e.message.split('\n')[0].slice(0, 200)); continue; }
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    const b = getBounds(scene);
    let tris = 0, meshNodes = 0;
    const nodeNames = [];
    const walk = (n) => {
      const m = n.getMesh();
      if (m) {
        meshNodes++;
        m.listPrimitives().forEach(p => { const i2 = p.getIndices(); if (i2) tris += i2.getCount() / 3; });
        nodeNames.push(n.getName());
      }
      n.listChildren().forEach(walk);
    };
    scene.listChildren().forEach(walk);
    console.log(JSON.stringify({
      file: f,
      size: [(b.max[0] - b.min[0]), (b.max[1] - b.min[1]), (b.max[2] - b.min[2])].map(v => +v.toFixed(1)),
      minY: +b.min[1].toFixed(2),
      tris: Math.round(tris), meshes: meshNodes,
      nodes: nodeNames.slice(0, 3).join(','),
      kb: Math.round(fs.statSync(path.join(dir, f)).size / 1024),
    }));
  }
})();
