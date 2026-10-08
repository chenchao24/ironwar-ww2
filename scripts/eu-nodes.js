const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const f of process.argv.slice(2)) {
    const doc = await io.read(f);
    console.log('\n=== ' + f);
    const walk = (n, d) => {
      if (d > 3) return;
      console.log('  '.repeat(d) + n.getName() + ' s=[' + n.getScale().map(v => v.toFixed(3)) + '] t=[' + n.getTranslation().map(v => +v.toFixed(1)) + ']');
      n.listChildren().forEach(c => walk(c, d + 1));
    };
    (doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]).listChildren().forEach(n => walk(n, 0));
  }
})();
