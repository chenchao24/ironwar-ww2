// 猎虎 model/jagdtiger.glb 全节点世界包围盒 + 履带 UV 量程探针
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');

function worldMat(node) {
  const parents = node.listParents().filter(p => p.propertyType === 'Node');
  const m = node.getMatrix();
  if (!parents.length) return m;
  const pm = worldMat(parents[0]);
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++)
    out[c * 4 + r] += pm[k * 4 + r] * m[c * 4 + k];
  return out;
}
function mulVec(m, v) {
  return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
}

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('model/jagdtiger.glb');
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const wm = worldMat(node);
    const uvs = [];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const pa = pos.getArray();
      for (let v = 0; v < pa.length; v += 3) {
        const p = mulVec(wm, [pa[v], pa[v + 1], pa[v + 2]]);
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
      }
      const uv = prim.getAttribute('TEXCOORD_0');
      if (uv) { const ua = uv.getArray(); let umn = 1e9, umx = -1e9, vmn = 1e9, vmx = -1e9;
        for (let i = 0; i < ua.length; i += 2) { umn = Math.min(umn, ua[i]); umx = Math.max(umx, ua[i]); vmn = Math.min(vmn, ua[i+1]); vmx = Math.max(vmx, ua[i+1]); }
        uvs.push(`U[${umn.toFixed(2)}~${umx.toFixed(2)}] V[${vmn.toFixed(2)}~${vmx.toFixed(2)}]`); }
    }
    console.log(`${node.getName()}  bbox [${mn.map(v=>v.toFixed(2))}] ~ [${mx.map(v=>v.toFixed(2))}]  size ${(mx[0]-mn[0]).toFixed(2)}x${(mx[1]-mn[1]).toFixed(2)}x${(mx[2]-mn[2]).toFixed(2)}` + (uvs.length ? '  uv: ' + uvs.join(' ') : ''));
  }
})();
