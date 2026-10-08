// 履带 UV 量程与相关性补充（marder/jpz/is-2）：定 trackScrollAxis
const { NodeIO } = require('@gltf-transform/core');
const path = require('path');

const TARGETS = {
  'tankModel/marder_iiim.glb': /^track[12]_/,
  'tankModel/jagdpanzer_iv_late_prod..glb': /^track[12]_/,
  'tankModel/is-2_1945.glb': /^Object_(28|40)$/,
};

function stats(pa, ua, sel) {
  let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
  let mX = 0, mY = 0, mU = 0, mV = 0, n = 0;
  const rows = [];
  for (let i = 0; i < pa.length / 3; i++) {
    if (sel && !sel(i)) continue;
    const x = pa[i * 3], y = pa[i * 3 + 1];
    const u = ua[i * 2], v = ua[i * 2 + 1];
    umin = Math.min(umin, u); umax = Math.max(umax, u);
    vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    mX += x; mY += y; mU += u; mV += v; n++;
    rows.push([x, y, u, v]);
  }
  mX /= n; mY /= n; mU /= n; mV /= n;
  let sxx = 0, syy = 0, suu = 0, svv = 0, sxu = 0, sxv = 0, syu = 0, syv = 0;
  for (const [x, y, u, v] of rows) {
    const dx = x - mX, dy = y - mY, du = u - mU, dv = v - mV;
    sxx += dx * dx; syy += dy * dy; suu += du * du; svv += dv * dv;
    sxu += dx * du; sxv += dx * dv; syu += dy * du; syv += dy * dv;
  }
  const corr = (a, b, c) => +(c / Math.sqrt(a * b + 1e-12)).toFixed(3);
  return { uRange: [+(umin).toFixed(2), +(umax).toFixed(2)], vRange: [+(vmin).toFixed(2), +(vmax).toFixed(2)],
    corrXU: corr(sxx, suu, sxu), corrXV: corr(sxx, svv, sxv), corrYU: corr(syy, suu, syu), corrYV: corr(syy, svv, syv) };
}

(async () => {
  const io = new NodeIO();
  for (const [file, re] of Object.entries(TARGETS)) {
    const doc = await io.read(path.join(__dirname, '..', file));
    const scene = doc.getRoot().getDefaultScene();
    console.log(`\n===== ${path.basename(file)} =====`);
    const walk = (node) => {
      if (re.test(node.getName()) && node.getMesh()) {
        for (const p of node.getMesh().listPrimitives()) {
          const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0');
          if (!pos || !uv) continue;
          console.log(`  ${node.getName()} [${p.getMaterial().getName()}]`, JSON.stringify(stats(pos.getArray(), uv.getArray())));
        }
      }
      node.listChildren().forEach(walk);
    };
    scene.listChildren().forEach(walk);
  }
})().catch(e => { console.error(e); process.exit(1); });

// IS-2 flip 判定：底段（接地段 y<0.25）V 对模型 Z 的斜率符号（前进=模型 -Z；t34 规则：UV 朝车头递增→不翻）
(async () => {
  const io = new NodeIO();
  const doc = await io.read(path.join(__dirname, '..', 'tankModel/is-2_1945.glb'));
  const scene = doc.getRoot().getDefaultScene();
  const walk = (node) => {
    if (/^Object_(28|40)$/.test(node.getName()) && node.getMesh()) {
      const p = node.getMesh().listPrimitives()[0];
      const pa = p.getAttribute('POSITION').getArray(), ua = p.getAttribute('TEXCOORD_0').getArray();
      let mZ = 0, mV = 0, n = 0;
      const rows = [];
      for (let i = 0; i < pa.length / 3; i++) {
        if (pa[i * 3 + 1] > 0.25) continue;   // 仅底段
        const z = pa[i * 3 + 2], v = ua[i * 2 + 1];
        mZ += z; mV += v; n++; rows.push([z, v]);
      }
      mZ /= n; mV /= n;
      let szz = 0, svv = 0, szv = 0;
      for (const [z, v] of rows) { const dz = z - mZ, dv = v - mV; szz += dz * dz; svv += dv * dv; szv += dz * dv; }
      console.log(`${node.getName()} 底段 ${n} 点 corr(z,v)=${(szv / Math.sqrt(szz * svv + 1e-12)).toFixed(3)} → V 随 +Z 递增=${szv > 0 ? '是(朝车尾)' : '否(朝车头)'}；模型车头=-Z`);
    }
    node.listChildren().forEach(walk);
  };
  scene.listChildren().forEach(walk);
})();
