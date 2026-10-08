import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['houseModel/oject/leaf_tree.glb','houseModel/oject/pine_tree.glb','houseModel/oject/rock.glb','houseModel/oject/rock2.glb','houseModel/oject/wood_log.glb'];
function mul(a, b) { // column-major 4x4
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
}
for (const f of files) {
  try {
    const doc = await io.read(f);
    const scene = doc.getRoot().getDefaultScene();
    let min = [1e9,1e9,1e9], max = [-1e9,-1e9,-1e9], tris = 0, mats = new Set();
    const walk = (node, m) => {
      const mm = mul(m, node.getMatrix());
      for (const c of node.listChildren()) walk(c, mm);
      const mesh = node.getMesh();
      if (mesh) for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
        mats.add(prim.getMaterial().getName());
        const pos = prim.getAttribute('POSITION');
        const e = [0,0,0];
        for (let i = 0; i < pos.getCount(); i++) {
          pos.getElement(i, e);
          const x = mm[0]*e[0]+mm[4]*e[1]+mm[8]*e[2]+mm[12];
          const y = mm[1]*e[0]+mm[5]*e[1]+mm[9]*e[2]+mm[13];
          const z = mm[2]*e[0]+mm[6]*e[1]+mm[10]*e[2]+mm[14];
          min = [Math.min(min[0],x),Math.min(min[1],y),Math.min(min[2],z)];
          max = [Math.max(max[0],x),Math.max(max[1],y),Math.max(max[2],z)];
        }
      }
    };
    const I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    for (const n of scene.listChildren()) walk(n, I);
    console.log(f.padEnd(38),
      'size: ' + max.map((v,i)=>(v-min[i]).toFixed(2)).join(' x '),
      ' minY:' + min[1].toFixed(2), ' tris:' + Math.round(tris),
      ' mats:[' + [...mats].join(', ') + ']');
  } catch (e) { console.log(f, 'ERR', e.message); }
}
