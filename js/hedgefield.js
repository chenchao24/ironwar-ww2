// ═══ 地图灌木带系统：程序化灌木丛（js/hedge.js）静态布置到「库尔斯克」中央交战区 ═══
// 定位：双方出生点恒为跨地图中心对峙 → 中心环带即"双方出生点中间区域"，与出生角无关。
//   故灌木带**静态布置、不随出生角旋转**（旧旋转方案下避路/避障/贴地在校验后全部失效，
//   属根因缺陷）；静态化后避路/贴地/伴生石（maps.js）在构建期一次生效，永久成立。
//   · 挡视线（world.sightBlockers 软遮挡圆链：挡视线，不挡移动、不挡炮弹）
//   · 坦克可穿越：穿越扬尘（大烟团）+ 碾木声（crushWood，playProp 自节流不重叠）
//     + 小剂量落叶（destructibles.leafBurst 小叶薄片、不夹土块）
//   · 开火震落：炮口 5m 内有灌木丛时 muzzleShake() 沿丛抖落尘埃（玩家/AI 开炮均触发）
// 性能：中央 26 丛密度 0.42 ≈ 10.5 万卡；外围 30 丛（10~16m，出生区 ±300m 全周散布）密度 0.36 ≈ 9.7 万卡；
//   合计 ≈20 万卡 / 80 万三角，6 draw call/丛，视锥外剔除。外围丛不放伴生石（防硬障碍压出生位）。
import * as THREE from 'three';
import { buildHedgeTemplate, instantiateHedges } from './hedge.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// 扬尘配色（与 destructibles 灰土系一致）
const DUST = [
  { c0: [0.66, 0.62, 0.55], c1: [0.55, 0.52, 0.47] },
  { c0: [0.58, 0.53, 0.46], c1: [0.47, 0.43, 0.38] },
];

export class HedgeField {
  // opts: { root(挂载=world.root), world, ps, destructibles, audio, groundY, roadDist,
  //         rand(种子化随机), avoid(x,z)=>bool 可选额外避让 }
  constructor(opts) {
    this.root = opts.root;
    this.world = opts.world;
    this.ps = opts.ps;
    this.des = opts.destructibles;
    this.audio = opts.audio;
    this.groundY = opts.groundY;
    this.roadDist = opts.roadDist;
    this.rand = opts.rand;
    this.avoid = opts.avoid || null;
    this.group = new THREE.Group();       // 静态布置，不旋转
    this.root.add(this.group);
    this.hedges = [];                     // { cx, cz, yaw, len, halfLen, blockers }（即战场系 wcx/wcz/wyaw）
    this._sight = [];                     // 视线遮挡圆链（带 hedge 标记，便于 dispose 整组摘除）
    this._state = new Map();              // tank → 穿越特效状态
    this.onTankCross = null;              // 穿越事件钩子（t, x, z），main.js 挂侦查怀疑度
    this.stats = { hedges: 0, cards: 0, tris: 0 };
  }

  // ── 构建灌木带（地图构建期调用一次）：中央环带 + 出生区外围散布，均静态布置 ──
  build(count = 26, outer = 30) {
    const rand = this.rand;
    const R_MIN = 60, R_MAX = 340;        // 中央环带：双方出生点中间区域
    const O_MIN = 420, O_MAX = 1000;      // 外围散布环带：覆盖出生半径 650/750 ±300m 全周（出生角随机 → 整环覆盖）
    // 8 个固定种子模板（长度 12/14/16m 混合，密度 0.42），摆位/朝向各异即可
    const templates = [12, 14, 16, 14, 12, 16, 14, 12].map((len, i) =>
      buildHedgeTemplate({ len, seed: 0x51de00 + i * 131, cardDensity: 0.42 }));
    // 外围模板：10/12/14/16m 混合，密度降至 0.36 控制卡片预算（外围丛零散、视觉密度要求低）
    const outerTemplates = [10, 12, 14, 16, 10, 14, 12, 16].map((len, i) =>
      buildHedgeTemplate({ len, seed: 0x51de40 + i * 97, cardDensity: 0.36 }));

    // 校验：整丛不跨路（沿长轴 5 点采样）、避村落/障碍、丛间距 ≥20m
    const okSpot = (x, z, yaw, halfLen) => {
      const ax = Math.cos(yaw), az = -Math.sin(yaw);      // 长轴世界方向（同 instantiate 约定）
      for (const t of [-0.9, -0.45, 0, 0.45, 0.9]) {
        if (this.roadDist(x + ax * t * halfLen, z + az * t * halfLen) < 9.5) return false;
      }
      if (this.avoid && this.avoid(x, z)) return false;
      for (const o of this.world.obstacles) {             // 不与建筑/巨石/树重叠（按丛半长放宽）
        if (Math.hypot(o.x - x, o.z - z) < o.r + halfLen * 0.7 + 3) return false;
      }
      for (const p of this.hedges) {
        if (Math.hypot(p.cx - x, p.cz - z) < 20) return false;
      }
      return true;
    };
    const place = (x, z, a, tpl, isOuter) => {
      // 朝向：60% 长轴垂直于半径（横在推进路线上）±0.35rad，40% 随机
      const yaw = rand() < 0.6 ? a + rr(rand, -0.35, 0.35) : rand() * Math.PI * 2;
      if (!okSpot(x, z, yaw, tpl.len / 2)) return false;
      const { stats } = instantiateHedges(this.group, tpl, [{ x, z, yaw: yaw * 180 / Math.PI }], {
        chunkSize: Infinity, mipmaps: false, groundY: this.groundY,
      });
      this.stats.cards += stats.cards;
      this.stats.tris += stats.tris;
      // 软视线遮挡圆链：沿长轴每 ~1.7m 一个重叠圆（静态布置，直接注册）。
      // 半径贴丛体实际半厚（~0.8m）+ 少量重叠余量——可以小不能大，超出丛缘即空气墙
      const n = Math.max(3, Math.ceil(tpl.len * 0.97 / 1.7));
      const spacing = tpl.len * 0.97 / n;
      const br = Math.min(spacing / 2 + 0.15, 1.05);
      const blockers = [];
      for (let i = 0; i < n; i++) {
        const lx = ((i + 0.5) / n - 0.5) * tpl.len * 0.97;
        const lz = tpl.wanderAt(lx);
        const sbx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
        const sbz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
        const sb = {
          x: sbx,
          z: sbz,
          r: br, hedge: true,
          topY: this.groundY(sbx, sbz) + tpl.hMax,   // 遮挡顶高（本圆坡位地面 + 丛高）：坡上可越过坡下丛顶
        };
        blockers.push(sb);
        this._sight.push(sb);
        this.world.addSightBlocker(sb);
      }
      const h = { cx: x, cz: z, yaw, len: tpl.len, halfLen: tpl.len / 2, blockers };
      h.wcx = x; h.wcz = z; h.wyaw = yaw;   // 静态：战场系即布置系
      h.outer = !!isOuter;                  // 外围丛：不放伴生石（出生点可能落在旁边，免硬障碍压出生位）
      this.hedges.push(h);
      return true;
    };

    // 分层网格：sqrt 均匀分 2 环（面积等分）× 每环 13 扇区 = 26 格，格内抖动放 1 丛
    const rB = [R_MIN, Math.sqrt((R_MIN * R_MIN + R_MAX * R_MAX) / 2), R_MAX];
    const perRing = Math.ceil(count / 2);
    for (let ring = 0; ring < 2; ring++) {
      const stagger = ring * 0.5 / perRing * Math.PI * 2;
      for (let i = 0; i < perRing; i++) {
        const a0 = (i / perRing) * Math.PI * 2 + stagger, a1 = ((i + 1) / perRing) * Math.PI * 2 + stagger;
        for (let attempt = 0; attempt < 6; attempt++) {
          const a = lerp(a0, a1, 0.18 + rand() * 0.64);
          const r = Math.sqrt(lerp(rB[ring] ** 2, rB[ring + 1] ** 2, 0.15 + rand() * 0.7));
          if (place(Math.sin(a) * r, Math.cos(a) * r, a, templates[this.hedges.length % templates.length], false)) break;
        }
      }
    }
    // 兜底：格内全失败的空缺用全环随机补齐
    let tries = 0;
    while (this.hedges.length < count && tries < 1200) {
      tries++;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(lerp(R_MIN * R_MIN, R_MAX * R_MAX, rand()));
      place(Math.sin(a) * r, Math.cos(a) * r, a, templates[this.hedges.length % templates.length], false);
    }
    // ── 外围散布：出生区 ±300m 零散灌木（3 环 × 10 扇区分层网格，10~16m 短丛） ──
    const oB = [O_MIN, Math.sqrt(lerp(O_MIN * O_MIN, O_MAX * O_MAX, 1 / 3)),
                Math.sqrt(lerp(O_MIN * O_MIN, O_MAX * O_MAX, 2 / 3)), O_MAX];
    const perORing = Math.ceil(outer / 3);
    const outerTarget = this.hedges.length + outer;
    for (let ring = 0; ring < 3; ring++) {
      const stagger = ring * 0.37 / perORing * Math.PI * 2;
      for (let i = 0; i < perORing; i++) {
        const a0 = (i / perORing) * Math.PI * 2 + stagger, a1 = ((i + 1) / perORing) * Math.PI * 2 + stagger;
        for (let attempt = 0; attempt < 6; attempt++) {
          const a = lerp(a0, a1, 0.18 + rand() * 0.64);
          const r = Math.sqrt(lerp(oB[ring] ** 2, oB[ring + 1] ** 2, 0.15 + rand() * 0.7));
          if (place(Math.sin(a) * r, Math.cos(a) * r, a,
                    outerTemplates[(this.hedges.length - count) % outerTemplates.length], true)) break;
        }
      }
    }
    // 兜底补齐
    tries = 0;
    while (this.hedges.length < outerTarget && tries < 1200) {
      tries++;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(lerp(O_MIN * O_MIN, O_MAX * O_MAX, rand()));
      place(Math.sin(a) * r, Math.cos(a) * r, a,
            outerTemplates[(this.hedges.length - count) % outerTemplates.length], true);
    }
    this.stats.hedges = this.hedges.length;
  }

  // ── bocage 树篱网（诺曼底）：沿田界线段布置长直篱段（更高 2.3~3.2m、更直 wander 0.35）。
  //    pieces: [{ x, z, yaw(rad), len }]，由地图按田界网格生成（已避路/避镇/端头留口）。
  //    与 build() 共用：软遮挡圆链（间距 2.6m r1.3，长直篱可比波浪丛稀）+ this.hedges
  //    （update 穿越特效 / muzzleShake 开火震落直接复用）。模板 44/56/64m × 2 变体，
  //    每变体一次 instantiateHedges 全量摆放（chunkSize 250 分块，防 draw call 爆炸） ──
  buildBocage(pieces, { cardDensity = 0.095, hMin = 2.3, hMax = 3.2, chunkSize = 250, cullFar = 400 } = {}) {
    const lens = [...new Set(pieces.map(p => p.len))].sort((a, b) => a - b);
    const templates = [];
    for (const len of lens) {
      for (let v = 0; v < 2; v++) {
        templates.push({
          len,
          // 密度 0.095 + 卡片放大（[0.47,0.82]）：覆盖率不变、卡片数再降——实测顶点量为最大瓶颈
          tpl: buildHedgeTemplate({
            len, seed: 0xb0ca00 + len * 131 + v * 7919,
            cardDensity, hMin, hMax, wander: 0.35, cardSize: [0.47, 0.82],
          }),
          placements: [],
          pieces: [],
        });
      }
    }
    for (const p of pieces) {
      const g = templates[(lens.indexOf(p.len) * 2) + ((this.rand() * 2) | 0)];
      g.placements.push({ x: p.x, z: p.z, yaw: p.yaw * 180 / Math.PI });
      g.pieces.push(p);
    }
    if (!this.world._extraCull) this.world._extraCull = [];
    for (const g of templates) {
      if (!g.placements.length) continue;
      const { group: g3, stats } = instantiateHedges(this.group, g.tpl, g.placements, {
        chunkSize, mipmaps: false, groundY: this.groundY,
      });
      // 距离剔除：500m 外篱段不足 7px 高，地面贴图篱线仍在，3D 卡片整 chunk 隐藏（顶点量大头）
      for (const ch of g3.children) this.world._extraCull.push({ obj: ch, far: cullFar });
      this.stats.cards += stats.cards;
      this.stats.tris += stats.tris;
      // 软视线遮挡圆链：间距 2.6m、r 1.3（贴篱体半厚+少量余量；长直篱比波浪丛容错高）
      for (const p of g.pieces) {
        const n = Math.max(3, Math.ceil(g.tpl.len / 2.6));
        const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
        const blockers = [];
        for (let i = 0; i < n; i++) {
          const lx = ((i + 0.5) / n - 0.5) * g.tpl.len;
          const lz = g.tpl.wanderAt(lx);
          const sbx = p.x + lx * cy + lz * sy;
          const sbz = p.z - lx * sy + lz * cy;
          const sb = {
            x: sbx, z: sbz, r: 1.3, hedge: true,
            topY: this.groundY(sbx, sbz) + g.tpl.hMax,   // 遮挡顶高：坡上可越过坡下篱顶
          };
          blockers.push(sb);
          this._sight.push(sb);
          this.world.addSightBlocker(sb);
        }
        const h = { cx: p.x, cz: p.z, yaw: p.yaw, len: g.tpl.len, halfLen: g.tpl.len / 2, blockers };
        h.wcx = p.x; h.wcz = p.z; h.wyaw = p.yaw;   // 静态：战场系即布置系
        h.outer = true;                             // 诺曼底无伴生石（bocage 不典型）
        this.hedges.push(h);
      }
    }
    this.stats.hedges = this.hedges.length;
  }

  // ── 每场开局：静态布置无需旋转/重注册（保留接口兼容 main.js 调用） ──
  applyBattle(angle) {
    void angle;   // 灌木带静态分布于中央环带（双方出生点中间区域与出生角无关）
    this._state.clear();
  }

  // ── 开火震落：炮口 5m 内有灌木丛时，沿丛长轴近炮口段抖落尘埃 ──
  muzzleShake(pos) {
    if (!this.hedges.length) return;
    for (const h of this.hedges) {
      const dx = pos.x - h.wcx, dz = pos.z - h.wcz;
      if (Math.abs(dx) > h.halfLen + 10 || Math.abs(dz) > h.halfLen + 10) continue;
      const cy = Math.cos(h.wyaw), sy = Math.sin(h.wyaw);
      // 世界 → 丛局部（instantiate 约定：世界偏移 = (cy·lx + sy·lz, -sy·lx + cy·lz)）
      const lx = dx * cy - dz * sy;
      const lz = dx * sy + dz * cy;
      // 距丛体（旋转矩形：长 halfLen × 半宽 1.3）的水平距离 ≤ 5m 才触发
      const ex = Math.max(0, Math.abs(lx) - h.halfLen);
      const ez = Math.max(0, Math.abs(lz) - 1.3);
      if (Math.hypot(ex, ez) > 5) continue;
      const n = 5 + (Math.random() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const t = clamp(lx + (Math.random() - 0.5) * h.len * 0.6, -h.halfLen, h.halfLen);
        const u = (Math.random() - 0.5) * 1.8;
        const wx = h.wcx + t * cy + u * sy;
        const wz = h.wcz - t * sy + u * cy;
        const col = DUST[(Math.random() * DUST.length) | 0];
        this.ps.spawn('smoke', {
          x: wx, y: this.groundY(wx, wz) + 0.7 + Math.random() * 1.6, z: wz,
          vx: (Math.random() - 0.5) * 0.9, vy: -0.15 - Math.random() * 0.35, vz: (Math.random() - 0.5) * 0.9,
          life: 1.0 + Math.random() * 0.7, size0: 0.5, size1: 1.9 + Math.random() * 0.9,
          alpha: 0.30, drag: 0.9, windK: 0.6, fadeIn: 0.06, sizeEase: 1.6,
          c0: col.c0, c1: col.c1,
        });
      }
    }
  }

  // ── 每帧：坦克穿越特效（尘土 / 碾木声 / 少量落叶） ──
  update(dt, player, enemies) {
    if (!this.hedges.length) return;
    const tanks = player ? [player, ...(enemies || [])] : (enemies || []);
    for (const t of tanks) {
      if (!t || t.destroyed) continue;
      let st = this._state.get(t);
      if (!st) { st = { dustAcc: 0, leafAcc: 0.2, sndAcc: 0 }; this._state.set(t, st); }
      const px = t.root.position.x, pz = t.root.position.z;
      // 命中检测：AABB 粗筛 → 旋转矩形（含车体半径放宽）
      let hit = false;
      for (const h of this.hedges) {
        const dx = px - h.wcx, dz = pz - h.wcz;
        if (Math.abs(dx) > h.halfLen + 8 || Math.abs(dz) > h.halfLen + 8) continue;
        const cy = Math.cos(h.wyaw), sy = Math.sin(h.wyaw);
        const lx = dx * cy - dz * sy;   // 世界 → 丛局部（与 muzzleShake 同约定）
        const lz = dx * sy + dz * cy;
        if (Math.abs(lx) <= h.halfLen + 1.2 && Math.abs(lz) <= 2.1) { hit = true; break; }
      }
      if (!hit) continue;
      const spd = Math.abs(t.speed || 0);
      if (spd < 0.8) continue;   // 静止不触发
      // 穿越事件（侦查怀疑度注入用，1s 节流；main.js 挂接到 visibility.suspicion）
      st.crossAcc = (st.crossAcc || 0) - dt;
      if (st.crossAcc <= 0) {
        st.crossAcc = 1;
        if (this.onTankCross) this.onTankCross(t, px, pz);
      }
      const gy = this.groundY(px, pz);

      // 碾木声：playProp 自节流（整遍播完才接下一遍），音量按车速与距离
      st.sndAcc -= dt;
      if (st.sndAcc <= 0) {
        st.sndAcc = 0.1;
        let vol = t.isPlayer ? 0.5 : (player ? clamp(1 - t.pos.distanceTo(player.pos) / 300, 0, 1) * 0.55 : 0);
        vol *= 0.5 + 0.5 * Math.min(spd / 8, 1);
        if (vol > 0.02) this.audio.playProp('crushWood', vol);
      }
      // 扬尘：沿车体两侧履带位置冒灰土（大烟团）
      st.dustAcc += dt * (0.5 + Math.min(spd / 7, 1.4));
      const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(t.root.quaternion);
      const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(t.root.quaternion);
      while (st.dustAcc > 0.085) {
        st.dustAcc -= 0.085;
        const col = DUST[(Math.random() * DUST.length) | 0];
        const side = Math.random() < 0.5 ? 1 : -1;
        this.ps.spawn('smoke', {
          x: px + rt.x * side * 1.15 - fw.x * 2.2 + (Math.random() - 0.5) * 0.8,
          y: gy + 0.25 + Math.random() * 0.3,
          z: pz + rt.z * side * 1.15 - fw.z * 2.2 + (Math.random() - 0.5) * 0.8,
          vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random() * 1.0, vz: (Math.random() - 0.5) * 1.2,
          life: 1.6 + Math.random() * 1.1, size0: 1.3, size1: 5.4 + Math.random() * 2.6,
          alpha: 0.38, drag: 0.55, windK: 0.8, fadeIn: 0.1, sizeEase: 1.8,
          c0: col.c0, c1: col.c1,
        });
      }
      // 落叶：复用树木落叶效果，小剂量小薄片、不夹土块（0.45~0.8s 一小撮）
      st.leafAcc -= dt;
      if (st.leafAcc <= 0) {
        st.leafAcc = 0.45 + Math.random() * 0.35;
        this.des.leafBurst(
          px + (Math.random() - 0.5) * 2.4, gy + 1.1 + Math.random() * 0.9, pz + (Math.random() - 0.5) * 2.4,
          3 + (Math.random() * 4 | 0), false, 1.15, { leafScale: 0.85, dirt: false }
        );
      }
    }
    // 清理已销毁坦克的状态
    for (const t of [...this._state.keys()]) {
      if (t.destroyed) this._state.delete(t);
    }
  }

  dispose() {
    const w = this.world;
    for (const s of this._sight) w.removeSightBlocker(s);
    this._sight.length = 0;
    this._state.clear();
  }
}

function rr(rng, a, b) { return a + rng() * (b - a); }
