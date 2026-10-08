// 排气位置审计：12 辆车 GLB 实测排气口（车尾凸出物聚类，全局部空间）vs config.exhaustLocal
// 用法: node scripts/exhaust-audit.js
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const fs = require('fs');
const path = require('path');

// ── 从 config.js 文本解析每车的 model / forwardAxis / bakeY180 / exhaustLocal ──
const cfgText = fs.readFileSync(path.join(__dirname, '..', 'js/config.js'), 'utf8');
const tankBlocks = {};
{
  const re = /'([\w-]+)':\s*\{/g;
  let m;
  const positions = [];
  while ((m = re.exec(cfgText))) positions.push({ id: m[1], start: m.index });
  for (let i = 0; i < positions.length; i++) {
    const body = cfgText.slice(positions[i].start, i + 1 < positions.length ? positions[i + 1].start : undefined);
    if (!/exhaustLocal/.test(body)) continue;
    const model = (body.match(/model:\s*'([^']+)'/) || [])[1];
    if (!model) continue;
    const forwardAxis = (body.match(/forwardAxis:\s*'([^']+)'/) || [])[1] || null;
    const bakeY180 = /bakeY180:\s*true/.test(body);
    let exhaust = null;
    const exM = body.match(/exhaustLocal:\s*\[((?:\s*\[[^\]]*\]\s*,?\s*)+)\]/);
    if (exM) exhaust = [...exM[1].matchAll(/\[([^\]]+)\]/g)].map(m2 => m2[1].split(',').map(Number));
    tankBlocks[positions[i].id] = {
      model, forwardAxis, bakeY180, exhaust,
    };
  }
}

// GLB 模型空间 → 烘焙局部空间（与 tank.js 烘焙一致；局部 +z 前 / +x 右）
function toLocal(cfg, p) {
  if (cfg.forwardAxis === '+x') return [-p[2], p[1], p[0]];
  if (cfg.bakeY180) return [-p[0], p[1], -p[2]];
  return p;   // '+z' 无需烘焙
}

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
  console.log('车          | config 排气(局部)            | 车尾平面 z | 实测尾部凸出物聚类(局部 x,y,n)                    | 判定(配置点距最近簇)');
  console.log('-'.repeat(128));
  for (const [id, cfg] of Object.entries(tankBlocks)) {
    if (!cfg.exhaust) { console.log(id.padEnd(11), '| 缺 exhaustLocal'); continue; }
    const doc = await io.read(path.join(__dirname, '..', cfg.model));
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    const named = [];
    const pts = [];
    const walk = (node) => {
      const mesh = node.getMesh();
      if (mesh) {
        const wm = worldMat(node);
        if (/exh|muff|pipe|ausp|pot\b/i.test(node.getName())) {
          let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
          mesh.listPrimitives().forEach(p => {
            const pos = p.getAttribute('POSITION'); if (!pos) return;
            const arr = pos.getArray();
            const step = Math.max(1, Math.floor(pos.getCount() / 800)) * 3;
            for (let i = 0; i < arr.length; i += step) {
              const w = toLocal(cfg, mulVec(wm, [arr[i], arr[i+1], arr[i+2]]));
              for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], w[k]); mx[k] = Math.max(mx[k], w[k]); }
            }
          });
          named.push(`${node.getName()} 局部ctr(${mn.map((v, k) => ((v + mx[k]) / 2).toFixed(2))})`);
        }
        for (const prim of mesh.listPrimitives()) {
          const pos = prim.getAttribute('POSITION'); if (!pos) continue;
          const arr = pos.getArray();
          const step = Math.max(1, Math.floor(pos.getCount() / 1200)) * 3;
          for (let i = 0; i < arr.length; i += step) pts.push(toLocal(cfg, mulVec(wm, [arr[i], arr[i+1], arr[i+2]])));
        }
      }
      node.listChildren().forEach(walk);
    };
    scene.listChildren().forEach(walk);
    // 局部空间（+z 前）：车尾平面 = 车体中央区（|x|≤1.0, y 0.5~1.6）顶点的 -z 98% 分位
    const rs = pts.filter(p => Math.abs(p[0]) <= 1.0 && p[1] >= 0.5 && p[1] <= 1.6).map(p => -p[2]).sort((a, b) => a - b);
    const tailZ = -rs[Math.floor(rs.length * 0.98)];   // 尾平面局部 z（负值）
    // 尾部凸出物聚类：尾平面后方 14cm 内、y 0.35~2.0、|x| ≤ 1.3
    const cells = new Map();
    for (const p of pts) {
      const rear = -p[2];
      if (rear < -tailZ - 0.02 || rear > -tailZ + 0.14) continue;
      if (p[1] < 0.35 || p[1] > 2.0 || Math.abs(p[0]) > 1.3) continue;
      const key = Math.round(p[0] / 0.3) + '|' + Math.round(p[1] / 0.3);
      const cur = cells.get(key) || { n: 0, sx: 0, sy: 0 };
      cur.n++; cur.sx += p[0]; cur.sy += p[1];
      cells.set(key, cur);
    }
    const clusters = [...cells.values()].filter(c => c.n >= 20)
      .map(c => ({ x: +(c.sx / c.n).toFixed(2), y: +(c.sy / c.n).toFixed(2), n: c.n }))
      .sort((a, b) => b.n - a.n).slice(0, 5);
    // 判定：每个配置点 → 最近簇的 (x, y) 距离
    const verdicts = cfg.exhaust.map((el, i) => {
      if (!clusters.length) return `#${i + 1} 无凸出物簇`;
      const best = clusters.reduce((b, c) => Math.hypot(c.x - el[0], c.y - el[1]) < Math.hypot(b.x - el[0], b.y - el[1]) ? c : b,
        clusters[0]);
      const d = Math.hypot(best.x - el[0], best.y - el[1]).toFixed(2);
      const zOk = Math.abs(el[2] - tailZ) < 0.55 ? '' : `z差${(el[2] - tailZ).toFixed(1)}`;
      return `#${i + 1} d=${d}${best.n >= 100 ? '' : '(小簇)'} ${zOk}`;
    });
    console.log(id.padEnd(11), '|', JSON.stringify(cfg.exhaust).padEnd(30), '|', String(tailZ.toFixed(2)).padEnd(10), '|',
      clusters.map(c => `(${c.x},${c.y},n${c.n})`).join(' ').padEnd(48), '|', verdicts.join(' ; '));
    if (named.length) console.log('            └ 名字命中:', named.join(' ; '));
  }
})().catch(e => { console.error(e); process.exit(1); });
