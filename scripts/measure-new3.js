// 新坦克 GLB 量测（marder_iiim / jagdpanzer_iv_late / is-2_1945）：世界包围盒 / 每网格节点世界中心 / 履带 UV 相关性
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');

function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function applyMat(m, v) {
  const [x, y, z] = v;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

async function inspect(file) {
  const io = new NodeIO();
  const doc = await io.read(file);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const rows = [];
  let gmn = [1e9, 1e9, 1e9], gmx = [-1e9, -1e9, -1e9];
  const walk = (node, parentMat) => {
    const m = matMul(parentMat, node.getMatrix());
    const mesh = node.getMesh();
    if (mesh) {
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      mesh.listPrimitives().forEach(p => {
        const pos = p.getAttribute('POSITION');
        if (!pos) return;
        const arr = pos.getArray();
        const step = Math.max(1, Math.floor(pos.getCount() / 2000)) * 3;
        for (let i = 0; i < arr.length; i += step) {
          const w = applyMat(m, [arr[i], arr[i + 1], arr[i + 2]]);
          for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
        }
      });
      for (let k = 0; k < 3; k++) { gmn[k] = Math.min(gmn[k], mn[k]); gmx[k] = Math.max(gmx[k], mx[k]); }
      const p0 = mesh.listPrimitives()[0];
      const uv = p0 && p0.getAttribute('TEXCOORD_0');
      let uvInfo = '';
      if (/track/i.test(node.getName()) && uv) {
        const pa = mesh.listPrimitives()[0].getAttribute('POSITION').getArray();
        const ua = uv.getArray();
        const n = Math.min(6000, uv.getCount());
        let mx2 = 0, mu = 0, mv = 0;
        for (let i = 0; i < n; i++) { mx2 += pa[i * 3]; mu += ua[i * 2]; mv += ua[i * 2 + 1]; }
        mx2 /= n; mu /= n; mv /= n;
        let sxx = 0, suu = 0, svv = 0, sxu = 0, sxv = 0;
        for (let i = 0; i < n; i++) {
          const x = pa[i * 3] - mx2, u = ua[i * 2] - mu, v = ua[i * 2 + 1] - mv;
          sxx += x * x; suu += u * u; svv += v * v; sxu += x * u; sxv += x * v;
        }
        const corr = (a, b, c) => (c / Math.sqrt(a * b + 1e-12)).toFixed(3);
        uvInfo = ` | UV corr(x,u)=${corr(sxx, suu, sxu)} corr(x,v)=${corr(sxx, svv, sxv)}`;
      }
      rows.push({ name: node.getName(), mn, mx, uvInfo });
    }
    node.listChildren().forEach(c => walk(c, m));
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  scene.listChildren().forEach(c => walk(c, I));
  console.log(`\n===== ${path.basename(file)} =====`);
  console.log('WORLD min:', gmn.map(v => v.toFixed(3)).join(', '), ' max:', gmx.map(v => v.toFixed(3)).join(', '));
  console.log('WORLD size:', gmx.map((v, i) => (v - gmn[i]).toFixed(3)).join(' x '));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  for (const r of rows) {
    const size = r.mx.map((v, i) => (v - r.mn[i]).toFixed(2)).join(',');
    console.log(`  ${r.name}  ctr=(${r.mn.map((v, i) => ((v + r.mx[i]) / 2).toFixed(2))}) size=(${size})${r.uvInfo}`);
  }
}
(async () => {
  for (const f of ['marder_iiim.glb', 'jagdpanzer_iv_late_prod..glb', 'is-2_1945.glb']) {
    await inspect(path.join(__dirname, '../tankModel/', f)).catch(e => console.error(f, e.message));
  }
})().catch(e => { console.error(e); process.exit(1); });
