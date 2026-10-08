const { NodeIO } = require('@gltf-transform/core');
(async () => {
  const io = new NodeIO();
  for (const f of process.argv.slice(2)) {
    const doc = await io.read(f);
    let tris = 0, verts = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const p of mesh.listPrimitives()) {
        const idx = p.getIndices();
        const pos = p.getAttribute('POSITION');
        if (idx) tris += idx.getCount() / 3; else if (pos) tris += pos.getCount() / 3;
        if (pos) verts += pos.getCount();
      }
    }
    console.log(`${f}: ${(tris/1000).toFixed(0)}k tris, ${(verts/1000).toFixed(0)}k verts`);
  }
})();
