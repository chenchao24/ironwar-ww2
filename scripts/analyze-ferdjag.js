// 费迪南/猎豹 轮系连通分量分析（playbook §3）+ 履带底段 UV 斜率（flip 判据）
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const path = require('path');

const WHEEL_NODES = {
  'tankModel/ferdinand.glb': ['Object_5', 'Object_6', 'Object_7', 'Object_8', 'Object_9', 'Object_10'],
  'tankModel/jagdpanther_g1.glb': ['Object_9', 'Object_14', 'Object_15', 'Object_16', 'Object_17'],
};
const TRACK_NODES = {
  'tankModel/ferdinand.glb': ['Object_18', 'Object_19'],
  'tankModel/jagdpanther_g1.glb': ['Object_8'],
};

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
const key3 = (v) => v.map(n => Math.round(n * 1000)).join(',');

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const file of Object.keys(WHEEL_NODES)) {
    const doc = await io.read(path.join(__dirname, '..', file));
    const root = doc.getRoot();
    console.log(`\n===== ${path.basename(file)} 轮系分量 =====`);
    for (const node of root.listNodes()) {
      const name = node.getName();
      if (!WHEEL_NODES[file].includes(name)) continue;
      const mesh = node.getMesh();
      if (!mesh) continue;
      const wm = worldMat(node);
      // 收集三角面（世界坐标顶点 + 顶点索引）
      const verts = [], tris = [];
      mesh.listPrimitives().forEach(p => {
        const pos = p.getAttribute('POSITION');
        const idx = p.getIndices();
        const arr = pos.getArray();
        const base = verts.length / 3;
        for (let i = 0; i < arr.length; i += 3) verts.push(mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
        const ia = idx ? idx.getArray() : null;
        const n = ia ? ia.length : arr.length / 3;
        for (let i = 0; i < n; i += 3) tris.push(base + (ia ? ia[i] : i / 3), base + (ia ? ia[i+1] : i / 3 + 1), base + (ia ? ia[i+2] : i / 3 + 2));
      });
      // 共享顶点连通分量
      const vkey = new Map();
      for (let i = 0; i < verts.length; i++) {
        const k = key3(verts[i]);
        if (!vkey.has(k)) vkey.set(k, []);
        vkey.get(k).push(i);
      }
      const triOf = new Map();
      for (let t = 0; t < tris.length / 3; t++) {
        for (let j = 0; j < 3; j++) {
          const k = key3(verts[tris[t * 3 + j]]);
          if (!triOf.has(k)) triOf.set(k, []);
          triOf.get(k).push(t);
        }
      }
      const comp = new Int32Array(tris.length / 3).fill(-1);
      const comps = [];
      for (let t = 0; t < comp.length; t++) {
        if (comp[t] >= 0) continue;
        const id = comps.length;
        const stack = [t]; comp[t] = id;
        const member = [];
        while (stack.length) {
          const cur = stack.pop(); member.push(cur);
          for (let j = 0; j < 3; j++) {
            for (const t2 of (triOf.get(key3(verts[tris[cur * 3 + j]])) || [])) {
              if (comp[t2] < 0) { comp[t2] = id; stack.push(t2); }
            }
          }
        }
        // bbox + 中心
        let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
        for (const ti of member) for (let j = 0; j < 3; j++) {
          const v = verts[tris[ti * 3 + j]];
          for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); }
        }
        comps.push({ n: member.length, mn, mx });
      }
      comps.sort((a, b) => b.n - a.n);
      console.log(`  [${name}] tri=${tris.length / 3} 分量数=${comps.length}`);
      for (const c of comps.slice(0, 24)) {
        const ctr = c.mn.map((v, i) => ((v + c.mx[i]) / 2).toFixed(2));
        const size = c.mx.map((v, i) => (v - c.mn[i]).toFixed(2));
        console.log(`    n=${c.n} ctr=(${ctr}) size=(${size}) x[${c.mn[0].toFixed(2)},${c.mx[0].toFixed(2)}] z[${c.mn[2].toFixed(2)},${c.mx[2].toFixed(2)}]`);
      }
    }
    // 履带底段 UV 斜率
    for (const node of root.listNodes()) {
      if (!TRACK_NODES[file].includes(node.getName()) || !node.getMesh()) continue;
      const wm = worldMat(node);
      const mesh = node.getMesh();
      const p = mesh.listPrimitives()[0];
      const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0');
      const arr = pos.getArray(), ua = uv.getArray();
      // 世界 y 最小 15% 顶点 = 底段；分 x<0 / x>0 两侧各自算 corr(z, v)
      const pts = [];
      for (let i = 0; i < arr.length / 3; i++) pts.push([...mulVec(wm, [arr[i*3], arr[i*3+1], arr[i*3+2]]), ua[i*2+1]]);
      const ys = pts.map(q => q[1]).sort((a, b) => a - b);
      const yCut = ys[Math.floor(ys.length * 0.15)];
      for (const [label, sel] of [['左', q => q[0] < 0], ['右', q => q[0] > 0]]) {
        const rows = pts.filter(q => q[1] < yCut && sel(q)).map(q => [q[2], q[3]]);
        if (rows.length < 10) { console.log(`  履带[${node.getName()}] ${label} 底段点不足`); continue; }
        let mz = 0, mv = 0; for (const [z, v] of rows) { mz += z; mv += v; }
        mz /= rows.length; mv /= rows.length;
        let szz = 0, svv = 0, szv = 0;
        for (const [z, v] of rows) { const dz = z - mz, dv = v - mv; szz += dz*dz; svv += dv*dv; szv += dz*dv; }
        console.log(`  履带[${node.getName()}] ${label}底段 ${rows.length} 点 corr(z,v)=${(szv/Math.sqrt(szz*svv+1e-12)).toFixed(3)}（车头=+Z：V 朝车头递增=${szv > 0 ? '是→不翻' : '否→flip'}）`);
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
