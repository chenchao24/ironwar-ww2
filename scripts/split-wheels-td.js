// M18 地狱猫 / M36 GMC 离线预处理（参数化，node scripts/split-wheels-td.js m18|m36）
// ① 材质 specGloss → metalRough
// ② 轮系切割：
//   M18（分量岛模式，同 M26）：满盘种子+同心环归桶+支臂碎件剔除
//     实测（2026-09-22 analyze）：负重轮×5/侧 y=0.37 r=0.33（外圈 n=666 + 内圈 n=188 同心分量），
//     前主动轮 z=2.01 y=0.72 r=0.35（双环/侧）、后诱导轮 z=-2.27 y=0.70 r=0.28（双环/侧）、
//     回转轮×4/侧 y=0.88 r=0.14
//   M36（圆盘分类模式，VVSS 平衡肘合并）：负重轮×6/侧 z=-1.84/-1.00/-0.40/0.44/1.05/1.89
//     y=0.29 r=0.25（轮盘顶半与平衡肘连通 → 三角面级圆盘分类+连通精滤+叶剥离+弧段剔除）；
//     前主动轮 z=2.38 y=0.65 r=0.35、后诱导轮 z=-2.55 y=0.60 r=0.28、回转轮×3/侧 z=-1.87/-0.43/1.02 y=0.85 r=0.11
// ③ M18 炮管拆分：Object_14（炮管+炮塔储物杂件合并）质心 z>0.6 的炮管/制退器 → barrelTube
// ④ M36 车顶机枪清理：Object_8 质心 y>2.7（机枪+座圈）→ roofMg，散落碎件留 Object_8 静态
// 输出：model/m18.glb / model/m36_gmc.glb
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { metalRough, prune } = require('@gltf-transform/functions');

const V = process.argv[2];
const CFG = {
  m18: {
    SRC: 'tankModel/m18.glb', OUT: 'model/m18.glb',
    wheelNodes: ['Object_18', 'Object_21', 'Object_22', 'Object_23'],
    mode: 'bucket',
    driveFront: true,          // 主动轮在前（z 大端）
    discSpan: [0.55, 0.8],     // 满盘 y/z 跨度区间
    rollerSpan: [0.25, 0.5],   // 回转轮跨度区间
    rollerMinAx: 1.1, rollerY: [0, 1.3],
    rollerMinComponents: 2,    // 真回转轮必有同心双环（M18 泥瓦弧为单分量）
    rollerMinDist: 0.30,
    barrelSplit: { node: 'Object_14', newName: 'barrelTube', test: (c) => c[2] > 0.6 },
  },
  pz4g: {
    SRC: 'tankModel/pz.iv_g.glb', OUT: 'model/pz4g.glb',
    wheelNodes: ['Object_13', 'Object_14'],
    mode: 'bucket',
    driveFront: true,
    // 实测（2026-09-22 analyze）：负重轮×8/侧 y=0.27 r=0.24（span 0.47）；前主动轮 z=2.52 y=0.68 r=0.39、
    // 后诱导轮 z=-2.20 y=0.56 r=0.33；回转轮×4/侧 y=0.88 span 0.12~0.14；
    // 备用负重轮平放在两侧翼子板上（y≥1.2、扁平 spanY<0.1）→ 自动不成种子，留车体静态（用户指定）
    discSpan: [0.4, 0.85],
    rollerSpan: [0.08, 0.3],
    rollerMinAx: 0.9, rollerY: [0.6, 1.15],
    rollerMinComponents: 1,    // 四号回转轮为单分量
    rollerMinDist: 0.30,
  },
  pz4j: {
    SRC: 'tankModel/pz.iv_j_45.glb', OUT: 'model/pz4j.glb',
    wheelNodes: ['Object_6', 'Object_7', 'Object_9', 'Object_10'],
    mode: 'bucket',
    driveFront: true,
    discSpan: [0.4, 0.85],
    rollerSpan: [0.08, 0.3],
    rollerMinAx: 0.9, rollerY: [0.6, 1.15],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
    // Object_12（车体首上/甲板件）内的炮塔油桶（x0.56~0.85, y1.75~2.25, z-1.12~-0.69，炮塔右后侧）
    // → 拆出 jerryCan 节点，config 挂炮塔组随炮塔旋转（用户指定）
    jerrySplit: { node: 'Object_12', newName: 'jerryCan', test: (c) => c[1] > 1.65 && c[0] > 0.4 && c[2] < -0.5 },
  },
  kv1: {
    SRC: 'tankModel/kv-1.glb', OUT: 'model/kv1.glb',
    wheelNodes: ['Object_8', 'Object_13'],
    mode: 'bucket',
    driveFront: false,         // 主动轮在后（z 小端）
    // 实测（2026-09-22 analyze）：负重轮×6/侧 y=0.35（span 0.61）；后主动轮 z=-2.82 y=0.75（span 0.96）、
    // 前诱导轮 z=2.96 y=0.85（span 0.67）；回转轮×3/侧 y=1.01（span 0.41）
    discSpan: [0.45, 1.0],
    spanXCap: 0.6,             // 主动轮环 spanX 0.57（默认 0.5 会漏种子）
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.3],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
    // Object_10 双 DT 合并件（用户指定）：下簇 y<1.7 车体机枪 → hullMgDt（固定车体 F 发射）；
    // 上簇 y>1.8 同轴机枪留 Object_10（随炮塔右键发射）
    mgSplit: { node: 'Object_10', newName: 'hullMgDt', test: (c) => c[1] < 1.7 },
  },
  is1: {
    SRC: 'tankModel/is-1.glb', OUT: 'model/is1.glb',
    wheelNodes: ['Object_15', 'Object_16', 'Object_17', 'Object_18', 'Object_19', 'Object_20', 'Object_21'],   // Object_21 含左侧回转轮（md 标注遗漏，2026-09-22 实测）
    mode: 'bucket',
    driveFront: false,
    // 实测：负重轮×6/侧 y=0.33（span 0.55）；后主动轮 z=-2.88 y=0.70（span 0.84）、
    // 前诱导轮 z=2.96 y=0.76（span 0.55）；回转轮×3/侧 y=0.86（span 0.38）
    discSpan: [0.45, 1.0],
    spanXCap: 0.6,
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.1],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
    // Object_10 同款双 DT 合并件（与 kv1 同源模型族）：下簇 y<1.8 车体机枪 → hullMgDt
    mgSplit: { node: 'Object_10', newName: 'hullMgDt', test: (c) => c[1] < 1.8 },
  },
  is2m: {
    SRC: 'tankModel/is-2.glb', OUT: 'model/is2m.glb',
    wheelNodes: ['Object_9', 'Object_10', 'Object_11', 'Object_12', 'Object_13', 'Object_14', 'Object_15'],   // Object_15 含左侧回转轮（md 标注遗漏，2026-09-22 实测）
    mode: 'bucket',
    driveFront: false,
    discSpan: [0.45, 1.0],
    spanXCap: 0.6,
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.1],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
    // Object_25 三 DT 合并件之一：下簇 y<1.7 车体机枪 → hullMgDt；
    // 上簇（炮塔后向 DT）留 Object_25 挂炮塔组；同轴机枪是独立节点 Object_26
    mgSplit: { node: 'Object_25', newName: 'hullMgDt', test: (c) => c[1] < 1.7 },
  },
  // ── 自行火炮三车（2026-09-23）：SU-100(T34底盘) / ISU-152(IS底盘) / SU-152(KV底盘) ──
  su100: {
    SRC: 'tankModel/su-100 .glb', OUT: 'model/su100.glb',
    wheelNodes: ['Object_8', 'Object_14'],
    mode: 'bucket',
    driveFront: false,
    // 实测：负重轮×5/侧 y=0.45（span 0.84，n=188 内外双盘）；后主动轮 z=-2.61 y=0.59（span 0.62）、
    // 前诱导轮 z=2.62 y=0.70（span 0.49）；T-34 底盘无回转轮
    discSpan: [0.4, 0.9],
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.3],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
  },
  isu152: {
    SRC: 'tankModel/isu-152.glb', OUT: 'model/isu152.glb',
    wheelNodes: ['Object_11', 'Object_12', 'Object_15', 'Object_16', 'Object_17'],
    mode: 'bucket',
    driveFront: false,
    // 实测（IS 底盘同族）：负重轮×6/侧 y=0.33（span 0.54）；后主动轮 z=-2.78 y=0.68（span 0.83）、
    // 前诱导轮 z=2.86 y=0.73（span 0.54）；回转轮×3/侧 y=0.84（span 0.21）
    discSpan: [0.45, 1.0],
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.1],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
  },
  su152: {
    SRC: 'tankModel/su-152.glb', OUT: 'model/su152.glb',
    wheelNodes: ['Object_12', 'Object_13', 'Object_18'],
    mode: 'bucket',
    driveFront: false,
    // 实测（KV 底盘同 kv1）：负重轮×6/侧 y=0.35（span 0.61）；后主动轮 z=-2.82 y=0.75（span 0.96）、
    // 前诱导轮 z=2.96 y=0.85（span 0.67）；回转轮×3/侧 y=1.01（span 0.41）
    discSpan: [0.45, 1.0],
    spanXCap: 0.6,
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.3],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
  },
  // ── 2026-10-09 M4 三连（Jumbo/Thunderbolt/Firefly）：谢尔曼系合并轮件，bucket 归桶 ──
  // 实测（analyze-td）：HVSS（E8）轮 span 0.5 / 前主动轮 z2.36 span 0.63 / 后诱导轮 z-2.53 span 0.56；
  // VVSS（Jumbo/Firefly）轮对成组、前主动 z≈2.5 span 0.71/0.72——discSpan 下放到 0.45 兼容小车轮回转轮
  jumbo: {
    SRC: 'tankModel/m4a3e2_76_w_jumbo.glb', OUT: 'model/m4a3e2_jumbo.glb',
    wheelNodes: ['Object_15', 'Object_14', 'Object_16'],
    mode: 'bucket',
    driveFront: true,
    discSpan: [0.45, 0.85],
    discMinAx: 0.8,
  },
  thunderbolt: {
    SRC: 'tankModel/m4a3e8_thunderbolt_vii.glb', OUT: 'model/m4a3e8.glb',
    wheelNodes: ['Object_5', 'Object_6'],
    mode: 'bucket',
    driveFront: true,
    discSpan: [0.45, 0.85],
    discMinAx: 0.8,
    discRoundTol: 0.06,   // HVSS 平衡肘枢轴座不圆（y 跨 0.60 vs z 跨 0.45），剔除误种
    // Object_7 整塔合并件（含车顶 M2HB）：按三角面质心切车顶机枪（roofMg）——
    // 目标件 y2.79~3.02 z-1.43~-1.2（塔顶后左侧）；y>2.66 且 z<-0.85 避开舱盖/储物箱
    roofMgSplit: { node: 'Object_7', newName: 'roofMg', test: (c) => c[1] > 2.66 && c[2] < -0.85 },
  },
  firefly: {
    SRC: 'tankModel/sherman_firefly.glb', OUT: 'model/sherman_firefly.glb',
    wheelNodes: ['Object_25', 'Object_24'],
    mode: 'bucket',
    driveFront: true,
    discSpan: [0.45, 0.85],
    discMinAx: 0.8,
  },
  // ── 2026-10-09 T-34 三连（85精英/57/41）：T-34 底盘轮系同 su100（5 负重轮/后主动/前诱导，无回转轮）──
  // 实测（analyze-td）：负重轮×5/侧 y=0.45（span 0.84）；后主动轮 z=-2.61 y=0.59（span 0.62）、
  // 前诱导轮 z=2.62 y=0.70（span 0.49）；轮毂盖/泥瓦弧碎件靠三道门剔除
  t3485e: {
    SRC: 'tankModel/t-34-85.glb', OUT: 'model/t3485e.glb',
    // Object_20/25 各含前诱导轮+后主动轮合并；Object_24/30 混入塔顶/后翼子板散件（靠归桶剔除留车体）
    wheelNodes: ['Object_17', 'Object_20', 'Object_21', 'Object_22', 'Object_23', 'Object_24',
                 'Object_25', 'Object_26', 'Object_27', 'Object_28', 'Object_29', 'Object_30'],
    mode: 'bucket',
    driveFront: false,
    discSpan: [0.4, 0.9],
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.3],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
    // Object_13 双 DT 合并件（同 kv1 族）：下簇 y<1.6 车体机枪 → hullMgDt（F 发射）；上簇同轴留原节点
    mgSplit: { node: 'Object_13', newName: 'hullMgDt', test: (c) => c[1] < 1.6 },
  },
  t3457: {
    SRC: 'tankModel/t-34-57_1943.glb', OUT: 'model/t3457.glb',
    wheelNodes: ['Object_11', 'Object_14'],
    mode: 'bucket',
    driveFront: false,
    discSpan: [0.4, 0.9],
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.3],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
    // Object_10 双 DT 合并件：下簇 y<1.6 → hullMgDt
    mgSplit: { node: 'Object_10', newName: 'hullMgDt', test: (c) => c[1] < 1.6 },
  },
  t3441: {
    SRC: 'tankModel/t-34_1941.glb', OUT: 'model/t3441.glb',
    // Object_7 全轮系+前翼子板/首上杂件合并（杂件非圆不成种子、归桶退回车体）
    // radialCap 1.05（本车轮间有悬挂短杆连通分量伸到 r0.44>1.35 帽内会被误收；
    // 轮缘真顶点 r≤0.417，1.05 帽既保轮缘又把 0.44 短杆退回车体静态）
    radialCap: 1.05,
    wheelNodes: ['Object_7'],
    mode: 'bucket',
    driveFront: false,
    discSpan: [0.4, 0.9],
    rollerSpan: [0.15, 0.45],
    rollerMinAx: 1.1, rollerY: [0.6, 1.3],
    rollerMinComponents: 1,
    rollerMinDist: 0.30,
    // Object_11 双 DT 合并件（1941 炮塔矮，上簇 y1.65 起）：下簇 y<1.5 → hullMgDt
    mgSplit: { node: 'Object_11', newName: 'hullMgDt', test: (c) => c[1] < 1.5 },
  },
  m36: {
    SRC: 'tankModel/m36_gmc.glb', OUT: 'model/m36_gmc.glb',
    wheelNodes: ['Object_14', 'Object_17', 'Object_18'],
    mode: 'disk',
    driveFront: true,
    roadWheels: {              // 圆盘分类参数（实测）
      centers: [-1.84, -1.00, -0.40, 0.44, 1.05, 1.89], y: 0.29, r: 0.25,
    },
    roofMgSplit: { node: 'Object_8', newName: 'roofMg', test: (c) => c[1] > 2.7 },
  },
}[V];
if (!CFG) { console.error('用法: node scripts/split-wheels-td.js m18|m36'); process.exit(1); }

function mulVec(m, v) {
  return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
}
function worldMat(node) {
  const parents = node.listParents().filter(p => p.propertyType === 'Node');
  const m = node.getMatrix();
  if (!parents.length) return m;
  const pm = worldMat(parents[0]);
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c*4+r] += pm[k*4+r]*m[c*4+k];
  return out;
}

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(CFG.SRC);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0] || doc.createBuffer();

  // ── 收集轮件三角面（世界坐标）──
  const primJobs = [];
  const allTris = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    if (!CFG.wheelNodes.includes(node.getName())) continue;
    const wm = worldMat(node);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const posArr = pos.getArray();
      const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
      const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
      const attrInfo = [];
      for (const sem of prim.listSemantics()) {
        const acc = prim.getAttribute(sem);
        attrInfo.push({ sem, acc, arr: acc.getArray(), n: acc.getElementSize(), ArrayType: acc.getArray().constructor, type: acc.getType() });
      }
      const tris = [];
      for (let t = 0; t < triCount; t++) {
        const vs = [];
        for (let k = 0; k < 3; k++) vs.push(idxArr ? idxArr[t * 3 + k] : t * 3 + k);
        const wv = [], c = [0, 0, 0];
        for (const v of vs) {
          const p = mulVec(wm, [posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]]);
          wv.push(p); c[0] += p[0] / 3; c[1] += p[1] / 3; c[2] += p[2] / 3;
        }
        const tri = { vs, wv, c, bucket: null };
        tris.push(tri); allTris.push(tri);
      }
      primJobs.push({ node, prim, attrInfo, mat: prim.getMaterial(), tris });
    }
  }
  console.log('轮件三角面:', allTris.length);

  // ── 连通分量（共享顶点）──
  const v2t = new Map();
  const keyOf = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;
  allTris.forEach((t, i) => {
    for (const p of t.wv) {
      const k = keyOf(p);
      if (!v2t.has(k)) v2t.set(k, []);
      v2t.get(k).push(i);
    }
  });
  const comp = new Array(allTris.length).fill(-1);
  let nc = 0;
  for (let i = 0; i < allTris.length; i++) {
    if (comp[i] >= 0) continue;
    const q = [i]; comp[i] = nc;
    while (q.length) {
      const a = q.pop();
      for (const p of allTris[a].wv) for (const j of v2t.get(keyOf(p)) || []) {
        if (comp[j] < 0) { comp[j] = nc; q.push(j); }
      }
    }
    nc++;
  }
  const groups = new Map();
  for (let i = 0; i < allTris.length; i++) {
    if (!groups.has(comp[i])) groups.set(comp[i], []);
    groups.get(comp[i]).push(i);
  }
  const comps = [...groups.values()].map(g => {
    let xs = [1e9, -1e9], ys = [1e9, -1e9], zs = [1e9, -1e9], cx = 0, cy = 0, cz = 0;
    for (const i of g) for (const p of allTris[i].wv) {
      xs = [Math.min(xs[0], p[0]), Math.max(xs[1], p[0])];
      ys = [Math.min(ys[0], p[1]), Math.max(ys[1], p[1])];
      zs = [Math.min(zs[0], p[2]), Math.max(zs[1], p[2])];
    }
    for (const i of g) { cx += allTris[i].c[0] / g.length; cy += allTris[i].c[1] / g.length; cz += allTris[i].c[2] / g.length; }
    return { idxs: g, c: [cx, cy, cz], bbox: { xs, ys, zs }, spanX: xs[1] - xs[0], spanY: ys[1] - ys[0], spanZ: zs[1] - zs[0] };
  });
  console.log(`连通分量: ${comps.length} 个`);

  const seeds = [];   // {z, y, r, side, kind, maxAx}
  if (CFG.mode === 'bucket') {
    const DS = CFG.discSpan || [0.55, 0.8], RS = CFG.rollerSpan || [0.25, 0.5];
    const SX = CFG.spanXCap != null ? CFG.spanXCap : 0.5;
    const RMINAX = CFG.rollerMinAx != null ? CFG.rollerMinAx : 1.1;
    const RY = CFG.rollerY || [0, 1.3];
    // 满盘分量（spanY,spanZ ∈ discSpan）或回转轮盘（span ∈ rollerSpan 且 |x|>rollerMinAx）发现种子
    for (const cp of comps) {
      const discR = Math.max(cp.spanY, cp.spanZ) / 2;
      // discMinAx（2026-10-09 新增，缺省 0 不影响既有车型）：满盘种子要求 |质心x| 达标——
      // 排除车体中线的扁平件（M4 首下牵引钩座 y0.49~1.04 x±0.24 被误种为"轮"）
      // discRoundTol（同日，缺省 ∞）：满盘种子要求 spanY≈spanZ（真轮必圆）——
      // 排除 HVSS 平衡肘枢轴座（thunderbolt：y 跨 0.60 vs z 跨 0.45 不圆，误种在轮对中间）
      const isFullDisc = cp.spanY >= DS[0] && cp.spanZ >= DS[0] && cp.spanY <= DS[1] && cp.spanZ <= DS[1] && cp.spanX <= SX
        && Math.abs(cp.c[0]) > (CFG.discMinAx || 0)
        && Math.abs(cp.spanY - cp.spanZ) <= (CFG.discRoundTol ?? Infinity);
      const isRoller = cp.spanY >= RS[0] && cp.spanZ >= RS[0] && cp.spanY < RS[1] && cp.spanZ < RS[1]
        && Math.abs(cp.c[0]) > RMINAX && cp.c[1] > RY[0] && cp.c[1] < RY[1];
      if (!isFullDisc && !isRoller) continue;
      const zc = (cp.bbox.zs[0] + cp.bbox.zs[1]) / 2, yc = (cp.bbox.ys[0] + cp.bbox.ys[1]) / 2;
      if (isFullDisc && yc > (CFG.discYMax != null ? CFG.discYMax : 1.1)) continue;   // 翼子板上的备用轮（竖放/斜放）不成轮种子，留车体
      let s = seeds.find(s => Math.hypot(s.z - zc, s.y - yc) < 0.1 && (s.side === (cp.c[0] > 0 ? 'R' : 'L')));
      if (!s) {
        s = { z: zc, y: yc, r: 0, side: cp.c[0] > 0 ? 'R' : 'L', kind: isRoller ? 'roller' : 'disc', maxAx: 0, n: 0 };
        seeds.push(s);
      }
      if (isFullDisc) s.kind = 'disc';
      s.r = Math.max(s.r, discR); s.n++;
    }
    // 假回转轮种子剔除（翼子板泥瓦弧假种子；真回转轮同心分量数达标且离主/诱导轮足够远）
    const minComp = CFG.rollerMinComponents != null ? CFG.rollerMinComponents : 2;
    const minDist = CFG.rollerMinDist != null ? CFG.rollerMinDist : 0.30;
    for (const s of [...seeds]) {
      if (s.kind !== 'roller') continue;
      const dDisc = Math.min(...seeds.filter(d => d.kind === 'disc' && d.side === s.side).map(d => Math.hypot(d.z - s.z, d.y - s.y)));
      if ((s.n || 1) < minComp || dDisc < minDist) seeds.splice(seeds.indexOf(s), 1);
    }
    // 分量归桶：最近种子 + 径向帽 + spanX 帽 + 碎件剔除（同 M26）
    for (const cp of comps) {
      if (cp.spanX > SX) continue;
      let best = null, bestD = 1e9;
      for (const s of seeds) {
        if ((s.side === 'R') !== (cp.c[0] > 0)) continue;
        const d = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
        const lim = s.kind === 'roller' ? s.r + 0.08 : s.r + 0.12;
        if (d < lim && d < bestD) { bestD = d; best = s; }
      }
      if (!best) continue;
      const cap = best.r * (CFG.radialCap || 1.35);
      let ok = true;
      for (const i of cp.idxs) for (const p of allTris[i].wv) {
        if (Math.hypot(p[2] - best.z, p[1] - best.y) > cap) { ok = false; break; }
      }
      if (!ok) continue;
      cp.seed = best;
    }
    for (const cp of comps) {
      if (!cp.seed) continue;
      const s = cp.seed;
      const mx = Math.max(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
      const mn = Math.min(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
      if (cp.spanY >= 0.5 * s.r * 2) {
        s.maxAx = Math.max(s.maxAx, mx);
        s.discMinX = Math.min(s.discMinX != null ? s.discMinX : 1e9, mn);
      }
    }
    let droppedJunk = 0;
    for (const cp of comps) {
      const s = cp.seed;
      if (!s) continue;
      const minAx = Math.min(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
      let maxVr = 0;
      const sec = new Set();
      for (const i of cp.idxs) for (const p of allTris[i].wv) {
        maxVr = Math.max(maxVr, Math.hypot(p[2] - s.z, p[1] - s.y));
        sec.add(Math.floor((Math.atan2(p[1] - s.y, p[2] - s.z) + Math.PI) / (Math.PI / 6)));
      }
      const ecc = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
      // 盘面筋件豁免（2026-09-23 SU-152 加强筋实测）：x 在盘上（≥盘内缘）、顶点不出轮缘、
      // 偏心 ≤0.9r 的窄角跨径向件（加强筋/螺栓），弧段规则不得误杀；支臂件（在盘内侧）仍剔除
      const onDisc = maxVr <= s.r * 1.15 && minAx >= (s.discMinX != null ? s.discMinX : 0) - 0.02 && ecc <= s.r * 0.9;
      const junkArc = sec.size < 6 && ecc > Math.max(s.r * 0.6, 0.12) && !onDisc;
      const junkOutboard = minAx > s.maxAx + 0.05;
      if (junkArc || junkOutboard) { cp.seed = null; droppedJunk++; }
    }
    const bucketed = comps.filter(c => c.seed);
    console.log(`归桶分量 ${bucketed.length}/${comps.length}（剔除碎件 ${droppedJunk} 个）`);
    for (const cp of bucketed) for (const i of cp.idxs) allTris[i].bucket = cp.seed;
    console.log('种子轮:');
    for (const s of seeds.sort((a, b) => a.side.localeCompare(b.side) || a.z - b.z))
      console.log(`  ${s.side} z=${s.z.toFixed(2)} y=${s.y.toFixed(2)} r=${s.r.toFixed(2)} kind=${s.kind}`);
  } else {
    // ── disk 模式：主/诱导轮/回转轮走分量归桶；负重轮走三角面级圆盘分类+精滤 ──
    const RW = CFG.roadWheels;
    // ① 主/诱导/回转轮种子：从满盘/环分量发现（排除负重轮位，负重轮走 disk 分类）
    const roadZ = RW.centers;
    for (const cp of comps) {
      const discR = Math.max(cp.spanY, cp.spanZ) / 2;
      const zc = (cp.bbox.zs[0] + cp.bbox.zs[1]) / 2, yc = (cp.bbox.ys[0] + cp.bbox.ys[1]) / 2;
      // 主/诱导轮环（spanY,spanZ ∈[0.5,0.8]）
      const isFullDisc = cp.spanY >= 0.5 && cp.spanZ >= 0.5 && cp.spanY <= 0.8 && cp.spanZ <= 0.8 && cp.spanX <= 0.5;
      // 回转轮（span 0.15~0.3，|x|>0.85，y 0.7~1.1——y>0.7 排掉平衡肘臂尖 0.64 假种子）
      const isRoller = cp.spanY >= 0.15 && cp.spanZ >= 0.15 && cp.spanY < 0.35 && cp.spanZ < 0.35 && Math.abs(cp.c[0]) > 0.85 && cp.c[1] > 0.7 && cp.c[1] < 1.1;
      if (isFullDisc) {
        // 负重轮盘位排除（|z-负重轮心|<0.2 且 y<0.55 → 交给 disk 分类）
        if (roadZ.some(z => Math.abs(z - zc) < 0.25) && yc < 0.55) continue;
        let s = seeds.find(s => Math.hypot(s.z - zc, s.y - yc) < 0.1 && (s.side === (cp.c[0] > 0 ? 'R' : 'L')));
        if (!s) { s = { z: zc, y: yc, r: 0, side: cp.c[0] > 0 ? 'R' : 'L', kind: 'disc', maxAx: 0 }; seeds.push(s); }
        s.r = Math.max(s.r, discR);
      } else if (isRoller) {
        let s = seeds.find(s => Math.hypot(s.z - zc, s.y - yc) < 0.08 && (s.side === (cp.c[0] > 0 ? 'R' : 'L')));
        if (!s) { s = { z: zc, y: yc, r: 0, side: cp.c[0] > 0 ? 'R' : 'L', kind: 'roller', maxAx: 0 }; seeds.push(s); }
        s.r = Math.max(s.r, discR);
      }
    }
    // 假回转轮种子剔除（距离判据；M36 回转轮为单环，不卡分量数）
    for (const s of [...seeds]) {
      if (s.kind !== 'roller') continue;
      const dDisc = Math.min(...seeds.filter(d => d.kind === 'disc' && d.side === s.side).map(d => Math.hypot(d.z - s.z, d.y - s.y)));
      if (dDisc < 0.30) seeds.splice(seeds.indexOf(s), 1);
    }
    // ② 主/诱导/回转轮分量归桶（同 bucket 逻辑；S/I 桶加 minAx≥0.80 排传动壳内伸件）
    for (const cp of comps) {
      if (cp.spanX > 0.5) continue;
      let best = null, bestD = 1e9;
      for (const s of seeds) {
        if ((s.side === 'R') !== (cp.c[0] > 0)) continue;
        const d = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
        const lim = s.kind === 'roller' ? s.r + 0.06 : s.r + 0.12;
        if (d < lim && d < bestD) { bestD = d; best = s; }
      }
      if (!best) continue;
      const cap = best.r * (CFG.radialCap || 1.35);
      let ok = true;
      for (const i of cp.idxs) for (const p of allTris[i].wv) {
        if (Math.hypot(p[2] - best.z, p[1] - best.y) > cap) { ok = false; break; }
      }
      if (!ok) continue;
      if (best.kind === 'disc' && Math.min(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1])) < 0.80) continue;   // 传动壳/制动鼓内伸件
      cp.seed = best;
    }
    for (const cp of comps) {
      if (!cp.seed) continue;
      const s = cp.seed;
      const mx = Math.max(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
      const mn = Math.min(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
      if (cp.spanY >= 0.5 * s.r * 2) {
        s.maxAx = Math.max(s.maxAx, mx);
        s.discMinX = Math.min(s.discMinX != null ? s.discMinX : 1e9, mn);
      }
    }
    let droppedJunk = 0;
    for (const cp of comps) {
      const s = cp.seed;
      if (!s) continue;
      const minAx = Math.min(Math.abs(cp.bbox.xs[0]), Math.abs(cp.bbox.xs[1]));
      let maxVr = 0;
      const sec = new Set();
      for (const i of cp.idxs) for (const p of allTris[i].wv) {
        maxVr = Math.max(maxVr, Math.hypot(p[2] - s.z, p[1] - s.y));
        sec.add(Math.floor((Math.atan2(p[1] - s.y, p[2] - s.z) + Math.PI) / (Math.PI / 6)));
      }
      const ecc = Math.hypot(cp.c[2] - s.z, cp.c[1] - s.y);
      // 盘面筋件豁免（2026-09-23 SU-152 加强筋实测）：x 在盘上（≥盘内缘）、顶点不出轮缘、
      // 偏心 ≤0.9r 的窄角跨径向件（加强筋/螺栓），弧段规则不得误杀；支臂件（在盘内侧）仍剔除
      const onDisc = maxVr <= s.r * 1.15 && minAx >= (s.discMinX != null ? s.discMinX : 0) - 0.02 && ecc <= s.r * 0.9;
      const junkArc = sec.size < 6 && ecc > Math.max(s.r * 0.6, 0.12) && !onDisc;
      const junkOutboard = minAx > s.maxAx + 0.05;
      if (junkArc || junkOutboard) { cp.seed = null; droppedJunk++; }
    }
    for (const cp of comps.filter(c => c.seed)) for (const i of cp.idxs) allTris[i].bucket = cp.seed;
    console.log(`主/诱导/回转轮种子 ${seeds.length} 个，剔除碎件 ${droppedJunk} 个`);
    // ③ 负重轮：分量 bbox 中心贴轮心归桶（≤0.08）——VVSS 轮盘(n=192 满盘+轮毂 n=126)与
    //    平衡肘焊死但 bbox 中心偏离轮心（臂板偏心 0.19/肘架 0.47），连通法必混臂/叶剥离必吃掉
    //    轮辐盘（2026-09-22 实测），故只做中心贴近归桶 + spanX/逐顶点 r×1.35 帽，不做连通精滤
    const roadSeeds = [];
    for (const side of ['R', 'L']) for (const z of roadZ) roadSeeds.push({ z, y: RW.y, r: RW.r, side, kind: 'road', maxAx: 0 });
    for (const cp of comps) {
      if (cp.seed) continue;                 // 已入主/诱导/回转桶
      if (cp.spanX > 0.5) continue;
      const zc = (cp.bbox.zs[0] + cp.bbox.zs[1]) / 2, yc = (cp.bbox.ys[0] + cp.bbox.ys[1]) / 2;
      let best = null, bestD = 1e9;
      for (const s of roadSeeds) {
        if ((s.side === 'R') !== (cp.c[0] > 0)) continue;
        const d = Math.hypot(zc - s.z, yc - s.y);
        if (d < 0.08 && d < bestD) { bestD = d; best = s; }
      }
      if (!best) continue;
      const cap = best.r * (CFG.radialCap || 1.35);
      let ok = true;
      for (const i of cp.idxs) for (const p of allTris[i].wv) {
        if (Math.hypot(p[2] - best.z, p[1] - best.y) > cap) { ok = false; break; }
      }
      if (!ok) continue;
      cp.seed = best;
      for (const i of cp.idxs) allTris[i].bucket = best;
    }
    for (const s of roadSeeds) {
      s.nTris = comps.filter(c => c.seed === s).reduce((a, c) => a + c.idxs.length, 0);
      seeds.push(s);
    }
    console.log('负重轮归桶完成:', roadSeeds.map(s => `${s.side}${s.z.toFixed(2)}(${s.nTris}面)`).join(' '));
  }

  // ── 命名：disc 按 z 排序，主动轮在 z 大端（driveFront）──
  for (const side of ['R', 'L']) {
    const ss = seeds.filter(s => s.side === side).sort((a, b) => a.z - b.z);
    const discs = ss.filter(s => s.kind === 'disc' || s.kind === 'road');
    const rollers = ss.filter(s => s.kind === 'roller');
    discs.forEach((s, i) => {
      let nm;
      if (CFG.driveFront) nm = i === 0 ? 'I' : i === discs.length - 1 ? 'S' : String(i);
      else nm = i === 0 ? 'S' : i === discs.length - 1 ? 'I' : String(i);
      s.name = 'wheel' + side + nm;
    });
    rollers.forEach((s, i) => { s.name = 'wheel' + side + 'T' + (i + 1); });
  }
  console.log('命名:');
  for (const s of seeds) if (s.name) console.log(`  ${s.name} z=${s.z.toFixed(2)} y=${s.y.toFixed(2)} r=${s.r.toFixed(2)}`);
  const wheelTris = new Map();   // name -> { mat, data, types, node }
  let extracted = 0, kept = 0;
  for (const t of allTris) if (t.bucket && t.bucket.name) t.bucketName = t.bucket.name;

  // ── 逐 primitive 重建 ──
  for (const job of primJobs) {
    const { node, prim, attrInfo, mat, tris } = job;
    const keepTris = [], wheelBuckets = new Map();
    for (const t of tris) {
      if (!t.bucketName) { keepTris.push(t.vs); continue; }
      if (!wheelBuckets.has(t.bucketName)) wheelBuckets.set(t.bucketName, []);
      wheelBuckets.get(t.bucketName).push(t);
    }
    kept += keepTris.length;
    if (keepTris.length === tris.length) continue;
    const build = (triList) => {
      const out = {};
      for (const a of attrInfo) out[a.sem] = [];
      for (const vs of triList) for (const v of vs)
        for (const a of attrInfo)
          for (let k = 0; k < a.n; k++) out[a.sem].push(a.arr[v * a.n + k]);
      return out;
    };
    const drain = (target) => {
      for (const [key, tris2] of wheelBuckets) {
        if (!tris2.length) continue;
        extracted += tris2.length;
        if (!wheelTris.has(key)) wheelTris.set(key, { mat, data: {}, types: {}, node });
        const entry = wheelTris.get(key);
        const builtW = build(tris2.map(t => t.vs));
        for (const a of attrInfo) {
          if (!entry.data[a.sem]) { entry.data[a.sem] = []; entry.types[a.sem] = { ArrayType: a.ArrayType, type: a.type }; }
          entry.data[a.sem].push(...builtW[a.sem]);
        }
      }
    };
    if (keepTris.length === 0) {
      drain();
      const mesh = node.getMesh();
      mesh.removePrimitive(prim);
      prim.dispose();
      continue;
    }
    const built = build(keepTris);
    for (const a of attrInfo) {
      if (a.acc.listParents().filter(p => p.propertyType === 'Primitive').length > 1) {
        const clone = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(built[a.sem])).setBuffer(a.acc.getBuffer());
        prim.setAttribute(a.sem, clone);
      } else {
        a.acc.setArray(new a.ArrayType(built[a.sem]));
      }
    }
    prim.setIndices(null);
    drain();
  }
  console.log(`轮系切割完成：抽出 ${extracted} 三角面，车体保留 ${kept}`);

  // ── 附属拆分（M18 炮管 / M36 车顶机枪）：质心 test 通过的三角面 → 新节点 ──
  const doSplit = (opt) => {
    const n = root.listNodes().find(x => x.getName() === opt.node);
    if (!n || !n.getMesh()) { console.log(`  缺节点 ${opt.node}`); return; }
    const wm = worldMat(n);
    let nNew = 0, nKeep = 0;
    for (const prim of [...n.getMesh().listPrimitives()]) {
      const pos = prim.getAttribute('POSITION'); if (!pos) continue;
      const posArr = pos.getArray();
      const idxArr = prim.getIndices() ? prim.getIndices().getArray() : null;
      const triCount = (idxArr ? idxArr.length : posArr.length / 3) / 3;
      const attrInfo = [];
      for (const sem of prim.listSemantics()) {
        const acc = prim.getAttribute(sem);
        attrInfo.push({ sem, acc, arr: acc.getArray(), n: acc.getElementSize(), ArrayType: acc.getArray().constructor, type: acc.getType() });
      }
      const keepTris = [], newTris = [];
      for (let t = 0; t < triCount; t++) {
        const vs = [];
        for (let k = 0; k < 3; k++) vs.push(idxArr ? idxArr[t * 3 + k] : t * 3 + k);
        const c = [0, 0, 0];
        for (const v of vs) {
          const p = mulVec(wm, [posArr[v * 3], posArr[v * 3 + 1], posArr[v * 3 + 2]]);
          c[0] += p[0] / 3; c[1] += p[1] / 3; c[2] += p[2] / 3;
        }
        (opt.test(c) ? newTris : keepTris).push(vs);
      }
      if (!newTris.length) continue;
      const build = (triList) => {
        const out = {};
        for (const a of attrInfo) out[a.sem] = [];
        for (const vs of triList) for (const v of vs)
          for (const a of attrInfo)
            for (let k = 0; k < a.n; k++) out[a.sem].push(a.arr[v * a.n + k]);
        return out;
      };
      if (keepTris.length === 0) {
        // 整 prim 全归新节点：直接建新 prim，移除原 prim
        const mesh = doc.createMesh(opt.newName);
        const p2 = doc.createPrimitive().setMaterial(prim.getMaterial());
        const builtN = build(newTris);
        for (const a of attrInfo) {
          const acc = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(builtN[a.sem])).setBuffer(buffer);
          p2.setAttribute(a.sem, acc);
        }
        mesh.addPrimitive(p2);
        const node2 = doc.createNode(opt.newName).setMesh(mesh).setMatrix(n.getMatrix());
        const parents = n.listParents().filter(p => p.propertyType === 'Node');
        (parents[0] || root.listScenes()[0]).addChild(node2);
        n.getMesh().removePrimitive(prim);
        prim.dispose();
        nNew += newTris.length;
        continue;
      }
      const built = build(keepTris);
      for (const a of attrInfo) {
        if (a.acc.listParents().filter(p => p.propertyType === 'Primitive').length > 1) {
          const clone = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(built[a.sem])).setBuffer(a.acc.getBuffer());
          prim.setAttribute(a.sem, clone);
        } else {
          a.acc.setArray(new a.ArrayType(built[a.sem]));
        }
      }
      prim.setIndices(null);
      const mesh = doc.createMesh(opt.newName);
      const p2 = doc.createPrimitive().setMaterial(prim.getMaterial());
      const builtN = build(newTris);
      for (const a of attrInfo) {
        const acc = doc.createAccessor().setType(a.type).setArray(new a.ArrayType(builtN[a.sem])).setBuffer(buffer);
        p2.setAttribute(a.sem, acc);
      }
      mesh.addPrimitive(p2);
      const node2 = doc.createNode(opt.newName).setMesh(mesh).setMatrix(n.getMatrix());
      const parents = n.listParents().filter(p => p.propertyType === 'Node');
      (parents[0] || root.listScenes()[0]).addChild(node2);
      nNew += newTris.length; nKeep += keepTris.length;
    }
    console.log(`  ${opt.node} 拆分：${opt.newName} ${nNew} 面 / 保留 ${nKeep} 面`);
  };
  if (CFG.barrelSplit) doSplit(CFG.barrelSplit);
  if (CFG.roofMgSplit) doSplit(CFG.roofMgSplit);
  if (CFG.jerrySplit) doSplit(CFG.jerrySplit);
  if (CFG.mgSplit) doSplit(CFG.mgSplit);

  // ── 生成轮节点（同父同矩阵）──
  for (const [key, entry] of wheelTris) {
    const mesh = doc.createMesh(key);
    const prim = doc.createPrimitive().setMaterial(entry.mat);
    for (const sem of Object.keys(entry.data)) {
      const t = entry.types[sem];
      const acc = doc.createAccessor().setType(t.type)
        .setArray(new t.ArrayType(entry.data[sem])).setBuffer(buffer);
      prim.setAttribute(sem, acc);
    }
    mesh.addPrimitive(prim);
    const node = doc.createNode(key).setMesh(mesh).setMatrix(entry.node.getMatrix());
    const parents = entry.node.listParents().filter(p => p.propertyType === 'Node');
    (parents[0] || root.listScenes()[0]).addChild(node);
    const n = entry.data.POSITION.length / 3;
    console.log(`  ${key}: ${n} verts`);
  }

  await doc.transform(metalRough(), prune());
  await io.write(CFG.OUT, doc);
  console.log('已写出 ' + CFG.OUT);
})().catch(e => { console.error(e); process.exit(1); });
