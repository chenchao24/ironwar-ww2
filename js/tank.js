// ═══ 坦克：GLB 部件拆分（炮塔/炮管/轮履）、行驶物理、装甲命中判定、乘员+模块损伤（无血条） ═══
import * as THREE from 'three';
import { GAME, SHELL_TYPES, DAMAGE_RULES, TERRAIN_RULES, mgOpticsChance, buildShellLoadout } from './config.js';
import { applyCamo } from './camo.js';
import { applySnowWash } from './snowwash.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _lat = new THREE.Vector3();   // fire() 高斯散布基：炮线水平横向
const _vup = new THREE.Vector3();   // fire() 高斯散布基：炮线竖向
const _q1 = new THREE.Quaternion();

// ── 线段 × 自由四边形板求交（装甲板图判定用）：返回 t∈[0,1] 或 -1 ──
// P: { c: 中心 Vector3, n/u/v: 法线与面内两轴（单位向量）, w2/h2: 半宽半高 }
function _segPlateT(a, b, P) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const denom = dx * P.n.x + dy * P.n.y + dz * P.n.z;
  if (Math.abs(denom) < 1e-9) return -1;
  const t = ((P.c.x - a.x) * P.n.x + (P.c.y - a.y) * P.n.y + (P.c.z - a.z) * P.n.z) / denom;
  if (t < 0 || t > 1) return -1;
  const hx = a.x + dx * t - P.c.x, hy = a.y + dy * t - P.c.y, hz = a.z + dz * t - P.c.z;
  const qu = hx * P.u.x + hy * P.u.y + hz * P.u.z;
  const qv = hx * P.v.x + hy * P.v.y + hz * P.v.z;
  if (Math.abs(qu) > P.w2 + 1e-4 || Math.abs(qv) > P.h2 + 1e-4) return -1;
  return t;
}

// ── 线段 × 轴对齐盒求交（附加盒：车长塔等）：返回 { t, axis, sign } 或 null ──
function _segBoxT(a, b, box) {
  const o = [a.x, a.y, a.z], d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const mn = [box.x0, box.y0, box.z0], mx = [box.x1, box.y1, box.z1];
  let tmin = 0, tmax = 1, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i], s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (axis < 0) return null;   // 起点在盒内（理论上不该发生：段从车外起）
  return { t: tmin, axis, sign };
}

// 角度工具
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export function approachAngle(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  return cur + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}

export class Tank {
  /**
   * @param cfg      config.js 中 TANKS 条目
   * @param gltfScene 已加载的 gltf.scene
   * @param world    World 实例（地形高度/碰撞）
   */
  constructor(cfg, gltfScene, world) {
    this.cfg = cfg;
    this.world = world;

    // ── 层级：root(世界,米) → model(缩放) → 各部件组 ──
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.model.scale.setScalar(cfg.scale);
    this.model.add(gltfScene);
    this.root.add(this.model);

    // 模型朝向预烘焙：forwardAxis '+x' 的模型绕Y -90° 烘焙到 +Z 朝前（之后所有逻辑按 +Z）
    if (cfg.forwardAxis === '+x') {
      gltfScene.rotation.y = -Math.PI / 2;
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.y = 0;
      gltfScene.updateMatrixWorld(true);
    }
    // forwardAxis '+y'：模型 +Y 朝前、+Z 朝上 → 绕X -90° 再绕Y 180° 烘焙到 +Z 朝前、+Y 朝上
    if (cfg.forwardAxis === '+y') {
      gltfScene.rotation.set(-Math.PI / 2, Math.PI, 0, 'YXZ');
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.set(0, 0, 0);
      gltfScene.updateMatrixWorld(true);
    }
    // bakeY180：模型前后反 180°，绕 Y 轴烘焙到 +Z 朝前
    if (cfg.bakeY180) {
      gltfScene.rotation.y = Math.PI;
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.set(0, 0, 0);
      gltfScene.updateMatrixWorld(true);
    }
    // bakeX90：根节点 matrix 将 +Z→+Y、+Y→-Z，绕 X 轴 +90° 烘焙还原到 +Z 朝前 +Y 朝上
    if (cfg.bakeX90) {
      gltfScene.rotation.x = Math.PI / 2;
      gltfScene.updateMatrixWorld(true);
      for (const child of gltfScene.children) {
        child.matrix.copy(child.matrixWorld);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
      }
      gltfScene.rotation.set(0, 0, 0);
      gltfScene.updateMatrixWorld(true);
    }

    // 模型 Y 偏移（履带底部抬高到地面）
    if (cfg.modelYOffset) {
      this.model.position.y = cfg.modelYOffset * cfg.scale;
    }

    // 材质独立化（便于烧毁变色/履带滚动）
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone()) : o.material.clone();
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    // 内部件染色：部分模型内衬贴图为白色，从舱口/炮塔缝穿帮 → 染成与车体接近的颜色（与贴图相乘）
    if (cfg.interiorTint) {
      this.model.traverse((o) => {
        if (!o.isMesh || !/interior|internal/i.test(o.name)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.color.set(cfg.interiorTint);
      });
    }

    // 程序化迷彩（素模车：cfg.camo 指定方案；履带网格名单不上迷彩）
    if (cfg.camo) applyCamo(this.model, cfg.camo, cfg.parts.track || []);
    // 冬季白洗（snow 图：maps.js 置 world.snowWash；履带/负重轮/内衬跳过）
    if (world.snowWash) {
      applySnowWash(this.model, { skip: [...(cfg.parts.track || []), ...(cfg.parts.wheels || [])] });
    }

    this._splitParts(gltfScene);

    // ── 运动状态 ──
    this.pos = new THREE.Vector3();
    this.heading = 0;            // 车体朝向（绕 y，0 = +z）
    this.speed = 0;              // 带符号 m/s
    this.throttle = 0;
    this.steer = 0;
    this.pitch = 0;              // 地形姿态
    this.roll = 0;
    // ── 驾驶/悬挂状态 ──
    this.clutchT = 0;            // 离合器接合计时
    this.accelSm = 0;            // 平滑纵向加速度（悬挂俯仰用）
    this.time = 0;               // 累计行驶时间（颠簸相位）
    this.bumpPhase = Math.random() * 100;   // 每车随机固定颠簸相位
    this.susPitch = 0; this.susPitchV = 0;  // 悬挂附加姿态（相对地形）
    this.susRoll = 0; this.susRollV = 0;
    this.startK = 0;             // 起步浓烟工况 0~1（main 排气用）

    // ── 炮塔状态 ──
    this.turretYaw = 0;
    this.gunPitch = 0;           // 正 = 抬升
    this.recoil = 0;
    this.barrelBasePos = this.barrelGroup.position.clone();
    this.aimPoint = new THREE.Vector3();   // 世界瞄准点（伺服目标）
    this.aimOffset = 0;          // 炮线与瞄准点角差（供 AI/散布）

    // ── 火控 ──
    this.reload = 0;             // 剩余装填时间
    this.dispersion = cfg.dispersion * 4;  // 当前散布 rad（会收敛）

    // ── 战斗状态：乘员 + 模块（无 HP 血条） ──
    // 乘员：state 0=完好 1=受伤 2=阵亡（不可恢复；全员阵亡=击毁）
    this.crew = (cfg.internal.crew || []).map((c) => ({ ...c, state: 0 }));
    // 模块：HP 制三档（完好 >50% / 受损 <50% / 损毁 0）
    this.modules = {};
    for (const key in DAMAGE_RULES.modules) {
      const def = DAMAGE_RULES.modules[key];
      this.modules[key] = {
        hp: def.hp, maxHp: def.hp, name: def.name,
        spots: (cfg.internal.modules && cfg.internal.modules[key]) || [],
      };
    }
    this.burning = 0;            // 剩余起火时间
    this._burnAcc = 0;           // 起火乘员杀伤秒级判定累计
    this.destroyed = false;
    this.ammoDetonated = false;
    this.turretFly = null;
    this.pendingEvents = [];     // 起火等异步事件（main 每帧取走做 HUD 反馈）
    // ── 点亮状态（由 VisibilityManager 管理；敌车=玩家观察通道，玩家车=被敌发现程度） ──
    this.spotted = false;        // 确认点亮
    this.suspected = false;      // 疑似接触（橙色「疑似目标」标记）
    this.lostContact = false;    // 失联（显示最后已知位置）
    this.lastKnownPos = null;    // 最后已知位置
    this.lastKnownHeading = 0;   // 最后已知朝向
    // ── 履带（定时器自修；维修包立即修复）──
    this.mods = { tracks: 0 };
    this.dustTimer = 0;
    this.exhaustTimer = 0;
    // ── 物件音效状态 ──
    this._ramHit = null;       // 本帧撞击障碍物 { time, impact, type }（drive 记录，update 播声）
    this.ramCd = 0;            // 撞击碰撞音冷却
    this.rubbleCd = 0;        // 碾废墟音冷却
    // ── 坦克间碰撞（OBB 近似：车体旋转矩形，车长×车宽） ──
    this.colHalfW = (cfg.dims.width + 0.25) / 2;    // 半宽（含履带余量）
    this.colHalfL = (cfg.dims.length + 0.25) / 2;  // 半长
    // ── 特效状态（effects 在每帧 update 注入） ──
    this.effects = null;
    this.evacT = 0;            // 火药残烟延时（开炮 0.5s 后炮口喷烟）
    this.barrelSmokeT = 0;     // 炮管余烟窗口
    this._bsAcc = 0;
    this.holeSmoke = null;     // 击穿孔冒烟 { local: root 局部坐标, t }
    this._hsAcc = 0;
    this.jetFireT = 0;         // 殉爆炮塔顶端喷火剩余时间（不飞炮塔的分支）
    this.jetFireDir = null;
    this.jetFirePos = null;
    this._jetAcc = 0;
    this._wreckAge = 0;        // 残骸燃烧计时（大火段 → 余烬薄烟段）
    this._wreckBigT = 25;
    this._wreckFires = null;   // 残骸持续小火点（40% 残骸 1~2 处，局部坐标）
    this._bailSmokeT = 0;      // 弃车舱口烟剩余时间
    this._bailSmokeLocal = null;
    this._bailAcc = 0;
    this.mgTimer = 0;             // 机枪射击节流
    this.mgAmmo = (cfg.mg && cfg.mg.ammoMax) || 2000;
    this.mgAmmoMax = this.mgAmmo;
    // ── 弹种池：AP/HE 各自携带量（切弹不共享弹药） ──
    this.shellPool = buildShellLoadout(cfg.shellAmmoMax || 30, cfg.loadout);   // 史实逐车分配（含 APCR）
    this.shellType = cfg.defaultShell || 'ap';        // 当前装填弹种（isu152/su152 史实默认 HE 高爆）
    this.shellAmmoMax = cfg.shellAmmoMax || 30;
    this.mgYaw = 0;               // 机枪独立方位（相对炮塔局部）
    this.modelYaw = 0;            // 预烘焙已处理朝向，model 不再旋转
    // ── 消耗品：维修包（读条制）/ 灭火器（每场次数见 DAMAGE_RULES.repair / 灭火器 1 次） ──
    this.consumables = { repair: DAMAGE_RULES.repair.uses, ext: 1 };
    // ── 拟真状态：瘫痪 / 修理读条 / 弃车 ──
    this.immobilized = false;       // 永久瘫痪（驾驶员亡/发动机毁/油泵毁）
    this._fuelPumpDead = false;     // 油箱损毁趴窝检定结果
    this.repairing = null;          // { t, dur, items:[{key,label}] } 修理读条中
    this.bailedOut = false;         // 车组弃车（计为击毁，残骸中立）
    this._bailChecks = 0;           // 已检定次数（每场最多 bail.maxChecks）
    this._recentPens = [];          // 近 10s 被击穿时间戳（弃车检定用）
    this._lastCritical = 'turret';  // 最近关键损伤源（弃车表现用：engine/track/turret）
    this.mgCaliber = cfg.mgCaliber || '7.92';
  }

  _splitParts(sceneRoot) {
    const cfg = this.cfg;
    const findMeshes = (names, flatten = false) => {
      const out = [];
      for (const n of names) {
        const o = this.model.getObjectByName(n);
        if (o) {
          if (flatten && !o.isMesh) {
            o.traverse((c) => { if (c.isMesh) out.push(c); });
          } else {
            out.push(o);
          }
        }
      }
      return out;
    };

    // 固定到车体件（不随炮塔转，先脱离原父挂到 model）
    if (cfg.parts.fixedToHull) {
      this.model.updateMatrixWorld(true);
      for (const n of cfg.parts.fixedToHull) {
        const o = sceneRoot.getObjectByName(n);
        if (o) this.model.attach(o);
      }
    }

    // 炮塔组（枢轴在模型局部坐标）
    this.turretGroup = new THREE.Group();
    this.turretGroup.position.fromArray(cfg.turretPivot);
    this.model.add(this.turretGroup);
    const turretMeshes = findMeshes(cfg.parts.turret);
    for (const m of turretMeshes) this.turretGroup.attach(m);

    // 炮管组（挂在炮塔组内，随炮塔旋转 + 独立俯仰）
    this.barrelGroup = new THREE.Group();
    this.barrelGroup.position.fromArray(cfg.barrelPivot).sub(this.turretGroup.position);
    this.turretGroup.add(this.barrelGroup);
    for (const m of findMeshes(cfg.parts.barrel)) this.barrelGroup.attach(m);

    // 机枪组（同轴/车顶机枪，挂炮塔组随炮塔旋转；独立 yaw 伺服供 AI 瞄准）
    this.mgGroup = null;
    this.mgMuzzleLocal = null;
    this.mgFlip = 1;
    this.mgBaseYaw = 0;
    if (cfg.parts.mg && cfg.parts.mg.length) {
      const mounted = this._mountGun(cfg.parts.mg, this.turretGroup, !!cfg.mgFlipY);
      if (mounted) {
        this.mgGroup = mounted.group;
        this.mgMuzzleLocal = mounted.muzzleLocal;
        this.mgFlip = mounted.flip;
        this.mgBaseYaw = mounted.baseYaw;
      }
    } else if (cfg.mgMuzzleLocal) {
      // 虚拟机枪：无单独 mesh 节点，用配置位置创建枪口点
      this.mgGroup = new THREE.Group();
      this.turretGroup.add(this.mgGroup);
      this.mgGroup.position.fromArray(cfg.mgMuzzleLocal).sub(this.turretGroup.position);
      this.mgMuzzleLocal = new THREE.Vector3(0, 0, 0);
    }

    // 前机枪组（车体固定，不随炮塔；射界 cfg.hullMgArc，F 发射）
    this.hullMgGroup = null;
    this.hullMgMuzzleLocal = null;
    this.hullYaw = 0;             // 前机枪独立方位（相对车体）
    this.hullMgTimer = 0;         // 前机枪射击节流
    this.hullAimPt = new THREE.Vector3();   // 前机枪当前瞄准点
    this.hullInArc = false;       // 目标是否在射界内（超出则不能开火）
    if (cfg.parts.hullMg && cfg.parts.hullMg.length) {
      const mounted = this._mountGun(cfg.parts.hullMg, this.model, false);
      if (mounted) {
        this.hullMgGroup = mounted.group;
        this.hullMgMuzzleLocal = mounted.muzzleLocal;
      }
    }

    // 隐藏件
    if (cfg.parts.hidden) {
      for (const n of cfg.parts.hidden) {
        const o = this.root.getObjectByName(n);
        if (o) o.visible = false;
      }
    }

    // 负重轮（独立网格才建枢轴旋转；单一整体网格不能转）
    this.wheelGroups = [];
    if (cfg.wheelsRotate !== false) {
      for (const m of findMeshes(cfg.parts.wheels)) {
        const box = new THREE.Box3().setFromObject(m);
        const center = box.getCenter(new THREE.Vector3());
        const g = new THREE.Group();
        g.position.copy(center);
        this.model.add(g);
        g.attach(m);
        this.wheelGroups.push({ group: g, radius: Math.max((box.max.y - box.min.y) / 2, 0.2) });
      }
    }

    // 履带：克隆贴图以便 UV 滚动
    this.trackMaterials = [];
    for (const m of findMeshes(cfg.parts.track, true)) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat.map) {
          mat.map = mat.map.clone();
          mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
          this.trackMaterials.push(mat.map);
        }
      }
    }

    // ── 装甲板几何缓存（armorModel v2：自由四边形板，镜像展开；炮塔板在炮塔系求交） ──
    this._armorPlates = { hull: [], turret: [] };
    this._armorExtras = { hull: [], turret: [] };
    const am = cfg.armorModel;
    if (am) {
      const D2R = Math.PI / 180;
      for (const partKey of ['hull', 'turret']) {
        const part = am[partKey];
        // 炮塔板缓存为枢轴相对坐标（求交段同系：减枢轴 + rotY(-yaw)，绕枢轴旋转才正确）
        const pv = partKey === 'turret' ? this.turretGroup.position : null;
        for (const p of part.plates || []) {
          for (const mx of (p.mirror ? [1, -1] : [1])) {
            const e = new THREE.Euler(
              (p.rot?.[0] || 0) * D2R, (p.rot?.[1] || 0) * mx * D2R, (p.rot?.[2] || 0) * mx * D2R);
            this._armorPlates[partKey].push({
              plate: p,
              c: new THREE.Vector3(p.pos[0] * mx - (pv ? pv.x : 0), p.pos[1] - (pv ? pv.y : 0), p.pos[2] - (pv ? pv.z : 0)),
              n: new THREE.Vector3(0, 0, 1).applyEuler(e),
              u: new THREE.Vector3(1, 0, 0).applyEuler(e),
              v: new THREE.Vector3(0, 1, 0).applyEuler(e),
              w2: p.size[0] / 2, h2: p.size[1] / 2,
            });
          }
        }
        for (const ex of part.extras || []) {
          // 炮塔附加盒同样转枢轴相对坐标
          if (pv) {
            const b0 = ex.box;
            this._armorExtras[partKey].push({ ...ex, box: {
              x0: b0.x0 - pv.x, x1: b0.x1 - pv.x, y0: b0.y0 - pv.y, y1: b0.y1 - pv.y,
              z0: b0.z0 - pv.z, z1: b0.z1 - pv.z } });
          } else {
            this._armorExtras[partKey].push(ex);
          }
        }
      }
    }
  }

  // 机枪挂载：节点脱离原父挂到 parent 下的回转组；返回 { group, muzzleLocal, flip, baseYaw }
  // 伺服支点兜底：合并网格导出的节点原点在模型原点（单位 TRS）时，
  // 用首件包围盒底面中心作枪架回转中心
  _mountGun(names, parent, flipY) {
    const meshes = [];
    for (const n of names) {
      const o = this.model.getObjectByName(n);
      if (o) meshes.push(o);
    }
    if (!meshes.length) return null;
    const g = new THREE.Group();
    parent.add(g);
    this.model.updateMatrixWorld(true);
    meshes[0].getWorldPosition(_v1);
    const _mgBox = new THREE.Box3();
    for (const m of meshes) _mgBox.expandByObject(m);
    if (!_mgBox.containsPoint(_v1)) {
      const _mg0 = new THREE.Box3().setFromObject(meshes[0]);
      _v1.set((_mg0.min.x + _mg0.max.x) / 2, _mg0.min.y, (_mg0.min.z + _mg0.max.z) / 2);
    }
    parent.worldToLocal(_v1);
    g.position.copy(_v1);
    for (const m of meshes) g.attach(m);
    const flip = flipY ? -1 : 1;
    g.rotation.set(0, 0, 0);
    this.model.updateMatrixWorld(true);
    const _box = new THREE.Box3().setFromObject(g);
    const _mn = _box.min.clone(), _mx = _box.max.clone();
    g.worldToLocal(_mn);
    g.worldToLocal(_mx);
    const muzzleLocal = new THREE.Vector3(
      (_mn.x + _mx.x) * 0.5,
      _mn.y + (_mx.y - _mn.y) * 0.72,
      flip > 0 ? _mx.z : _mn.z
    );
    return { group: g, muzzleLocal, flip, baseYaw: flipY ? Math.PI : 0 };
  }

  dispose() {
    // 殉爆飞头：炮塔被 attach 到场景根，已不在 model 树内——须单独摘除+释放，否则跨局残留
    if (this.turretFly && this.turretGroup && this.turretGroup.parent) {
      this.turretGroup.parent.remove(this.turretGroup);
      this.turretGroup.traverse((o) => {
        if (o.isMesh) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      this.turretFly = null;
    }
    this.model.traverse((o) => {
      if (o.isMesh) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    for (const tex of this.trackMaterials || []) tex.dispose();
  }

  place(x, z, headingDeg) {
    this.pos.set(x, 0, z);
    this.heading = THREE.MathUtils.degToRad(headingDeg);
    this._syncTransform(1);
  }

  // ─────────────── 坦克间碰撞（旋转矩形 OBB / SAT） ───────────────
  collideTank(other) {
    const dx = other.pos.x - this.pos.x;
    const dz = other.pos.z - this.pos.z;
    if (Math.abs(dx) > 14 || Math.abs(dz) > 14) return null;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const oh = Math.sin(other.heading), oc = Math.cos(other.heading);
    const axes = [
      [sh, ch], [-ch, sh],
      [oh, oc], [-oc, oh],
    ];
    let best = { pen: Infinity, nx: 0, nz: 0 };
    for (const [ax, az] of axes) {
      const rA = this.colHalfL * Math.abs(sh * ax + ch * az) + this.colHalfW * Math.abs(-ch * ax + sh * az);
      const rB = other.colHalfL * Math.abs(oh * ax + oc * az) + other.colHalfW * Math.abs(-oc * ax + oh * az);
      const dist = dx * ax + dz * az;
      const pen = rA + rB - Math.abs(dist);
      if (pen <= 0) return null;
      if (pen < best.pen) {
        const s = dist >= 0 ? 1 : -1;
        best = { pen, nx: ax * s, nz: az * s };
      }
    }
    const mA = this.cfg.mass, mB = other.cfg.mass;
    const wA = mB / (mA + mB), wB = mA / (mA + mB);
    this.pos.x -= best.nx * best.pen * wA;
    this.pos.z -= best.nz * best.pen * wA;
    other.pos.x += best.nx * best.pen * wB;
    other.pos.z += best.nz * best.pen * wB;
    const relV = other.speed * (oc * best.nx + oh * best.nz) - this.speed * (ch * best.nx + sh * best.nz);
    if (relV < 0) {
      const bounce = Math.min(0.35, -relV * 0.25);
      this.speed += (ch * best.nx + sh * best.nz) * bounce * -1 * wA * 2;
      other.speed += (oc * best.nx + oh * best.nz) * bounce * wB * 2;
    }
    return best;
  }

  // ─────────────── 乘员/模块查询 ───────────────
  crewState(id) {
    const c = this.crew.find((c) => c.id === id);
    return c ? c.state : 0;
  }
  crewAlive() { return this.crew.filter((c) => c.state < 2).length; }
  // 索敌/观察距离倍率（车长+通讯员状态）
  spotMult() {
    const C = DAMAGE_RULES.crewEffects;
    let m = 1;
    const cm = this.crewState('commander'), rd = this.crewState('radio');
    if (cm === 1) m *= C.commander.woundSpot; else if (cm === 2) m *= C.commander.deadSpot;
    if (rd === 1) m *= C.radio.woundSpot; else if (rd === 2) m *= C.radio.deadSpot;
    return m;
  }
  // 模块状态：2=完好 1=受损 0=损毁
  moduleState(key) {
    const m = this.modules[key];
    if (!m) return 2;
    return m.hp <= 0 ? 0 : (m.hp < m.maxHp * 0.5 ? 1 : 2);
  }
  // 装填时间（装填手 + 炮闩状态）
  reloadTimeNow() {
    const CL = DAMAGE_RULES.crewEffects.loader;
    const ld = this.crewState('loader');
    let t = this.cfg.reloadTime * (ld === 2 ? CL.deadReload : ld === 1 ? CL.woundReload : 1);
    if (this.moduleState('breech') < 2) t *= DAMAGE_RULES.effects.breechDamagedReload;
    return t;
  }

  // ─────────────── 行驶（离合器 + 功率曲线手感） ───────────────
  drive(dt, throttle, steer, brake) {
    const cfg = this.cfg;
    if (this.destroyed) { throttle = 0; steer = 0; brake = true; }
    // 拟真门控：驾驶员阵亡/发动机损毁 → 永久瘫痪；断履带 → 必须原地修理才能开动；修理读条中不能移动（可开炮）
    if (this.crewState('driver') === 2 || this.moduleState('engine') === 0 || this._fuelPumpDead) this.immobilized = true;
    if (this.immobilized || this.mods.tracks > 0 || this.repairing) { throttle = 0; steer = 0; brake = true; }
    this.throttle = throttle;
    this.steer = steer;
    this.time += dt;
    const prevSpeed = this.speed;

    // 发动机模块 + 驾驶员受伤状态（阵亡已走瘫痪门控）
    const E = DAMAGE_RULES.effects, CE = DAMAGE_RULES.crewEffects.driver;
    const engSt = this.moduleState('engine');
    let engK = engSt === 0 ? 0 : engSt === 1 ? E.engineDamagedPower : 1;
    const drv = this.crewState('driver');
    if (drv === 1) engK *= CE.woundPower;
    let steerK = 1;
    if (drv === 1) steerK *= CE.woundTraverse;
    // 极速折减：发动机受损 ×0.6；油箱损毁（供油受损）×0.5
    let capK = 1;
    if (engSt === 1) capK *= E.engineDamagedSpeedCap;
    if (this.moduleState('fuel') === 0) capK *= E.fuelDeadSpeedCap;
    // 地形模式（每图一种，config.TERRAIN_RULES）：石板=理论极速 70%；硬地/软土/泥泞 = 越野极速(offroadK)× 1.0/0.9/0.8
    // 地图可提供 roadSpeedAt(x,z)（阿登压实雪路）：命中 → 越野极速 × 路面系数（×1.15），脱离路面回软雪
    const terr = TERRAIN_RULES[(this.world && this.world.map && this.world.map.terrain) || 'hard'] || TERRAIN_RULES.hard;
    const roadK = (this.world && this.world.roadSpeedAt) ? this.world.roadSpeedAt(this.pos.x, this.pos.z) : null;
    const terrainK = roadK != null ? (cfg.offroadK || 1) * roadK : (terr.base === 'road' ? terr.speedK : (cfg.offroadK || 1) * terr.speedK);
    const turnTerrK = terr.turnK;   // 地形转向系数（泥泞最钝）

    // ── 纵向动力 ──
    if (brake) {
      const dec = cfg.brakeDecel * dt;
      this.speed = Math.abs(this.speed) <= dec ? 0 : this.speed - Math.sign(this.speed) * dec;
      this.clutchT = 0;
    } else if (throttle !== 0 && Math.sign(throttle) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.5) {
      const s = Math.sign(this.speed);
      this.speed -= s * cfg.brakeDecel * 0.7 * dt;
      if (Math.sign(this.speed) !== s) this.speed = 0;
      this.clutchT = 0;
    } else if (throttle !== 0) {
      this.clutchT += dt;
      const clutch = Math.min(1, 0.35 + (this.clutchT / cfg.clutchDelay) * 0.65);
      const vRatio = Math.min(1, Math.abs(this.speed) / (cfg.maxSpeed * terrainK));   // 功率衰减按地形生效极速（越野末段不再偏冲）
      const power = cfg.enginePower * Math.abs(throttle) * clutch * engK *
                    (1 - Math.pow(vRatio, 0.9) * cfg.powerFalloff);
      const dir = throttle > 0 ? 1 : -1;
      this.speed += dir * power * dt;
      const cap = (dir > 0 ? cfg.maxSpeed * terrainK : cfg.revSpeed) * capK;
      if (dir > 0 && this.speed > cap) this.speed = cap;
      if (dir < 0 && this.speed < -cap) this.speed = -cap;
    } else {
      const s = Math.sign(this.speed);
      const dec = cfg.engineBrake * dt;
      this.speed = Math.abs(this.speed) > dec ? this.speed - s * dec : 0;
      this.clutchT = 0;
    }

    // ── 坡度阻力 ──
    const slopeAcc = Math.sin(this.pitch) * 9.8 * cfg.slopePower;
    this.speed += slopeAcc * dt;
    if (Math.abs(throttle) < 0.05 && Math.abs(this.speed) < 0.25 && Math.abs(slopeAcc) < 3) this.speed = 0;

    // 转向：高速衰减 + 转向掉速 + 倒车镜像
    const speedFactor = 0.2 + 0.45 * Math.min(Math.abs(this.speed) / 6, 1);
    const yawRate = steer * cfg.hullTraverse * speedFactor * steerK * turnTerrK;
    if (Math.abs(this.speed) > 0.1 || Math.abs(yawRate) > 0.01) {
      this.heading += yawRate * dt * (this.speed < -0.2 ? -1 : 1);
    }
    if (Math.abs(steer) > 0.15 && Math.abs(this.speed) > 1) {
      this.speed *= 1 - cfg.turnDrag * Math.abs(steer) * dt;
    }

    // 位移 + 障碍推挤
    _v1.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const px0 = this.pos.x, pz0 = this.pos.z;
    this.pos.addScaledVector(_v1, this.speed * dt);
    this.world.resolveCollision(this.pos, 2.2);
    const wantD = Math.abs(this.speed) * dt;
    if (wantD > 1e-6) {
      const gotD = Math.hypot(this.pos.x - px0, this.pos.z - pz0);
      const blockedOb = this.world.lastBlocked;
      if (blockedOb && wantD > 0.015 && gotD < wantD * 0.6 && Math.abs(this.speed) > 0.8) {
        this._ramHit = { time: this.time, impact: Math.abs(this.speed), type: blockedOb.d ? blockedOb.d.type : null };
      }
      if (gotD < wantD) this.speed = Math.sign(this.speed) * gotD / dt;
    }

    // 纵向加速度记录（平滑，供悬挂俯仰）
    const acc = (this.speed - prevSpeed) / Math.max(dt, 1e-4);
    if (Math.abs(this.speed) > 0 && Math.abs(prevSpeed) <= 0) {
      this.accelSm += (acc * 1.4 - this.accelSm) * Math.min(1, dt * 4.5);
    } else {
      this.accelSm += (acc - this.accelSm) * Math.min(1, dt * 4.5);
    }

    this._syncTransform(dt);
  }

  _syncTransform(dt) {
    const gh = this.world && this.world.groundY ? this.world.groundY : (() => 0);

    // 地形姿态：两侧履带前后接地点四点采样（最小二乘平面拟合）
    const cfgD = this.cfg.dims;
    const f = cfgD.length * 0.34;   // 采样基线放宽：滚动地形 pitch 更稳定（防微坡尖刺）
    const w = Math.max(1.2, cfgD.width / 2 - (this.cfg.trackWidth || 0.6) / 2);
    const sx = Math.sin(this.heading), cz = Math.cos(this.heading);
    const px = Math.cos(this.heading), pz = -Math.sin(this.heading);
    const hFL = gh(this.pos.x + sx * f - px * w, this.pos.z + cz * f - pz * w);
    const hFR = gh(this.pos.x + sx * f + px * w, this.pos.z + cz * f + pz * w);
    const hBL = gh(this.pos.x - sx * f - px * w, this.pos.z - cz * f - pz * w);
    const hBR = gh(this.pos.x - sx * f + px * w, this.pos.z - cz * f - pz * w);
    const frontAvg = (hFL + hFR) / 2, rearAvg = (hBL + hBR) / 2;
    const leftAvg = (hFL + hBL) / 2, rightAvg = (hFR + hBR) / 2;
    const targetPitch = Math.atan2(rearAvg - frontAvg, f * 2);
    const targetRoll = Math.atan2(leftAvg - rightAvg, w * 2);
    const k = dt >= 1 ? 1 : 1 - Math.exp(-8 * dt);
    this.pitch += (targetPitch - this.pitch) * k;
    this.roll += (targetRoll - this.roll) * k;

    const hC = (hFL + hFR + hBL + hBR) / 4;

    // ── 悬挂：弹簧-阻尼姿态 ──
    const cfg = this.cfg;
    const spd = Math.abs(this.speed);
    let tPitch = -this.accelSm * 0.0068;
    let tRoll = -this.steer * Math.min(spd / cfg.maxSpeed, 1) * 0.5 * 0.075;
    const roadK = (this.world && this.world.isOnRoad) ? this.world.isOnRoad(this.pos.x, this.pos.z) : 1;
    const bump = spd * 0.0012 * roadK;
    const t = this.time;
    tPitch += (Math.sin(t * 11.3 + this.bumpPhase) + Math.sin(t * 6.1) * 0.6) * bump;
    tRoll += (Math.sin(t * 9.7 + this.bumpPhase * 2) + Math.sin(t * 14.3) * 0.5) * bump;
    const idle = 0.0014 + Math.abs(this.throttle) * 0.0038;
    tPitch += Math.sin(t * 68) * idle * 0.5;
    tRoll += Math.sin(t * 61 + 2) * idle;

    const stiff = 58, damp = 8.6;
    this.susPitchV += (tPitch - this.susPitch) * stiff * dt;
    this.susPitchV *= Math.exp(-damp * dt);
    this.susPitch += this.susPitchV * dt;
    this.susRollV += (tRoll - this.susRoll) * stiff * dt;
    this.susRollV *= Math.exp(-damp * dt);
    this.susRoll += this.susRollV * dt;

    this.root.position.set(this.pos.x, hC, this.pos.z);
    this.root.rotation.set(0, this.heading, 0);
    this.model.rotation.set(this.pitch + this.susPitch, this.modelYaw, this.roll + this.susRoll);
  }

  // ─────────────── 炮塔伺服（朝世界瞄准点，含弹道补偿） ───────────────
  aimAt(worldPoint) { this.aimPoint.copy(worldPoint); }

  updateTurret(dt) {
    const cfg = this.cfg;
    // 方向机 + 炮手状态
    const E = DAMAGE_RULES.effects;
    const tdSt = this.moduleState('turretDrive');
    let traverse = cfg.turretTraverse * (tdSt === 0 ? E.driveDeadTraverse : tdSt === 1 ? E.driveDamagedTraverse : 1);
    if (this.crewState('gunner') === 2) traverse *= DAMAGE_RULES.crewEffects.gunner.deadTraverse;

    _v2.copy(this.aimPoint).sub(this.root.position);
    const desiredWorldYaw = Math.atan2(_v2.x, _v2.z);
    // 弹道补偿：解算起点用炮口（含炮口高度/前伸量，弹着点严格落在瞄准点上）
    this.getMuzzle(_v3, _v4);
    const mhoriz = Math.hypot(this.aimPoint.x - _v3.x, this.aimPoint.z - _v3.z);
    const dy = this.aimPoint.y - _v3.y;
    let desiredElev = Math.atan2(dy, Math.max(mhoriz, 1));
    const v = this.shellVelocityOf(), g = GAME.shellGravity;
    if (mhoriz > 2) {
      const disc = v * v * v * v - g * (g * mhoriz * mhoriz + 2 * dy * v * v);
      if (disc > 0) desiredElev = Math.atan((v * v - Math.sqrt(disc)) / (g * mhoriz));
    }
    const dep = THREE.MathUtils.degToRad(cfg.gunDepression);
    const elv = THREE.MathUtils.degToRad(cfg.gunElevation);
    // 世界仰角限位 = 炮架限位 + 固有零位（车体俯仰 + 炮管 GLB 烘焙偏差，实时校准）——
    // 与 camera.js 瞄具限位同口径，坡上/带烘焙零位的车才不会出现"瞄得到、打不到"的死区
    const curDir = this.getGunDirection(_v1);
    const curWorldElev = Math.asin(THREE.MathUtils.clamp(curDir.y, -1, 1));
    const gunZero = curWorldElev - this.gunPitch;
    desiredElev = THREE.MathUtils.clamp(desiredElev, dep + gunZero, elv + gunZero);

    // 闭环方向：以炮口实际世界方位为准——炮架枢轴若带烘焙偏角，俯仰会引入方位漂移，
    // 开环 turretYaw 收敛 ≠ 炮口对准（高倍镜下横向偏几个像素）
    const curWorldYaw = Math.atan2(curDir.x, curDir.z);
    const yawErr = wrapAngle(desiredWorldYaw - curWorldYaw);
    this.turretYaw = wrapAngle(this.turretYaw + THREE.MathUtils.clamp(yawErr, -traverse * dt, traverse * dt));
    // 歼击车战斗室：火炮水平射界钳制（目标超出弧度时炮卡在弧缘——需车体转向把目标带进射界）
    if (cfg.casemate) {
      const arc = cfg.casemate.arc * Math.PI / 180;
      if (this.turretYaw < -arc) this.turretYaw = -arc;
      else if (this.turretYaw > arc) this.turretYaw = arc;
    }
    // 闭环俯仰
    const desiredGunPitch = THREE.MathUtils.clamp(this.gunPitch + (desiredElev - curWorldElev), dep, elv);
    const dp = desiredGunPitch - this.gunPitch;
    this.gunPitch += THREE.MathUtils.clamp(dp, -traverse * 0.7 * dt, traverse * 0.7 * dt);

    this.turretGroup.rotation.y = this.turretYaw;
    this.barrelGroup.rotation.x = -this.gunPitch;

    this.aimOffset = Math.abs(yawErr) +
                     Math.abs(desiredElev - curWorldElev) * 0.6;
  }

  // 炮管实际指向（世界）
  getGunDirection(out) {
    return out.set(0, 0, 1).applyQuaternion(this.barrelGroup.getWorldQuaternion(_q1)).normalize();
  }

  // 炮口世界坐标与指向
  getMuzzle(outPos, outDir) {
    _v1.fromArray(this.cfg.muzzleLocal).sub(_v2.fromArray(this.cfg.barrelPivot));
    outPos.copy(_v1);
    this.barrelGroup.localToWorld(outPos);
    this.getGunDirection(outDir);
    return outPos;
  }

  // 机枪独立伺服：瞄准世界点
  updateMgTurret(dt, aimPoint) {
    if (!this.mgGroup || !aimPoint) return;
    this.mgGroup.getWorldPosition(_v1);
    const desiredWorldYaw = Math.atan2(aimPoint.x - _v1.x, aimPoint.z - _v1.z);
    const turretWorldYaw = this.turretYaw + this.heading + this.modelYaw;
    let desiredLocal = desiredWorldYaw - turretWorldYaw;
    desiredLocal = Math.atan2(Math.sin(desiredLocal), Math.cos(desiredLocal));
    this.mgYaw = approachAngle(this.mgYaw, desiredLocal, 4.5 * dt);
    this.mgGroup.rotation.y = this.mgYaw + this.mgBaseYaw;
  }

  // 机枪口世界坐标 + 指向
  getMgMuzzle(outPos, outDir, aimPoint = null) {
    if (!this.mgGroup) { outPos.set(0, 0, 0); outDir.set(0, 0, 1); return outPos; }
    if (this.mgMuzzleLocal) outPos.copy(this.mgMuzzleLocal);
    else outPos.set(0, 0, 0);
    this.mgGroup.localToWorld(outPos);
    if (aimPoint) outDir.copy(aimPoint).sub(outPos).normalize();
    else outDir.set(0, 0, this.mgFlip).applyQuaternion(this.mgGroup.getWorldQuaternion(_q1)).normalize();
    return outPos;
  }

  // ── 前机枪伺服：射界内自动瞄准目标；返回 false = 无组/目标超射界（不可开火） ──
  updateHullMg(dt, aimPoint) {
    if (!this.hullMgGroup) return false;
    if (!aimPoint) { this.hullInArc = false; return false; }
    this.hullMgGroup.getWorldPosition(_v1);
    const localYaw = wrapAngle(Math.atan2(aimPoint.x - _v1.x, aimPoint.z - _v1.z) - this.heading - this.modelYaw);
    const arc = this.cfg.hullMgArc ?? 0.26;
    if (Math.abs(localYaw) > arc) { this.hullInArc = false; return false; }
    this.hullYaw = approachAngle(this.hullYaw, localYaw, 3.2 * dt);
    this.hullMgGroup.rotation.y = this.hullYaw;
    this.hullAimPt.copy(aimPoint);
    this.hullInArc = true;
    return true;
  }

  // 前机枪口世界坐标 + 指向（沿枪管朝向）
  getHullMgMuzzle(outPos, outDir) {
    if (!this.hullMgGroup) { outPos.set(0, 0, 0); outDir.set(0, 0, 1); return outPos; }
    if (this.hullMgMuzzleLocal) outPos.copy(this.hullMgMuzzleLocal);
    else outPos.set(0, 0, 0);
    this.hullMgGroup.localToWorld(outPos);
    outDir.set(0, 0, 1).applyQuaternion(this.hullMgGroup.getWorldQuaternion(_q1)).normalize();
    return outPos;
  }

  // ── 弹种 ──
  shellDef(type = this.shellType) { return SHELL_TYPES[type] || SHELL_TYPES.ap; }
  shellVelocityOf(type = this.shellType) {
    if (type === 'apcr') return (this.cfg.apcrShell && this.cfg.apcrShell.velocity) || this.cfg.shellVelocity;
    if (type === 'he' && this.cfg.heVelocity) return this.cfg.heVelocity;   // HE 初速逐炮族（史实 ≈AP；弃用统一 0.72）
    const hs = this.cfg.heShell;
    if (type === 'he' && hs && hs.velMult) return this.cfg.shellVelocity * hs.velMult;   // 大口径火炮 HE 初速随炮
    return this.cfg.shellVelocity * this.shellDef(type).velMult;
  }

  // 切换弹种（1/2 键）：重置装填
  switchShell(type) {
    if (!SHELL_TYPES[type] || type === this.shellType) return false;
    if (this.destroyed || this.shellPool[type] <= 0) return false;
    this.shellType = type;
    this.reload = this.reloadTimeNow();
    // 切弹扰动：σ×6（新 σ 量级重标定，旧 ×2 已不可感）
    this.dispersion = Math.max(this.dispersion, this.cfg.dispersion * 6);
    return true;
  }

  readyToFire() {
    return this.reload <= 0 && !this.destroyed && this.shellPool[this.shellType] > 0
        && this.modules.breech.hp > 0;   // 炮闩损毁无法开火
  }

  // 开火：返回炮弹出膛数据；调用方生成炮弹与特效
  fire() {
    if (!this.readyToFire()) return null;
    this.shellPool[this.shellType]--;
    this.reload = this.reloadTimeNow();
    this.recoil = 1;
    this.evacT = 0.5;
    this.barrelSmokeT = 3;
    this.susPitchV -= 0.6;
    // ⚠ 先采样当前散布、再抬后坐扰动：膨胀若在采样前执行，本发就会吃满 bloom
    //（旧代码 ×3/新 ×8 全部落在本发上——炮看着已收敛、每发却按膨胀档打，400m+ 命中率虚低元凶）
    const d = this.dispersion;
    this.dispersion = Math.max(this.dispersion, this.cfg.dispersion * 8);
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    this.getMuzzle(pos, dir);
    // 高斯散布（Box-Muller，两轴独立 σ）：真实弹着向心聚集，50% 落在 0.67σ 内。
    // 噪声加在与炮线垂直的正交基上（旧版加世界 xyz：第三轴退化、随炮向混轴）
    _lat.set(dir.z, 0, -dir.x);
    if (_lat.lengthSq() < 0.25) _lat.set(1, 0, 0); else _lat.normalize();
    _vup.crossVectors(_lat, dir).normalize();
    const u1 = Math.max(Math.random(), 1e-12), u2 = Math.random();
    const gr = Math.sqrt(-2 * Math.log(u1));
    dir.addScaledVector(_lat, gr * Math.cos(2 * Math.PI * u2) * d);
    dir.addScaledVector(_vup, gr * Math.sin(2 * Math.PI * u2) * d);
    dir.normalize();
    const def = this.shellDef();
    const hs = this.shellType === 'he' ? (this.cfg.heShell || null) : null;
    return {
      pos, dir,
      velocity: this.shellVelocityOf(this.shellType),
      pen: this.shellType === 'apcr' && this.cfg.apcrShell ? this.cfg.apcrShell.pen
        : this.cfg.shellPen * (hs && hs.penMult ? hs.penMult : def.penMult),
      penDrop: (this.shellType === 'apcr' && this.cfg.apcrShell ? this.cfg.apcrShell.penDrop
        : this.cfg.shellPenDrop) * def.penDropK,
      spall: this.cfg.spallPower * def.spallMult,   // 后效强度
      hePower: hs ? (hs.power || 1) : 1,            // HE 威力系数（88mm=1 基准，122/152 大口径加成）
      nearMissR: hs ? (hs.nearMissR || 0) : 0,      // HE 落地近失弹作用半径（0=无近失弹）
      owner: this,
      shellType: this.shellType,
      caliber: this.cfg.caliber || 75,   // 弹着尘堆范围随口径（2026-09-23 修正：旧键 gunCaliber 不存在）
    };
  }

  // 散布更新：移动/转向/转炮塔扩圈，静止缩圈（观瞄/炮手状态放大散布；垂稳车移动惩罚减半）
  updateFireControl(dt) {
    const cfg = this.cfg, E = DAMAGE_RULES.effects, CG = DAMAGE_RULES.crewEffects.gunner;
    const opSt = this.moduleState('optics');
    const opticsMult = opSt === 0 ? E.opticsDeadSpread : opSt === 1 ? E.opticsDamagedSpread : 1;
    const gnr = this.crewState('gunner');
    const gunnerMult = gnr === 2 ? CG.deadSpread : gnr === 1 ? CG.woundSpread : 1;
    const stabK = cfg.gyroStab ? 0.5 : 1;   // 垂向陀螺稳定仪（M4A3）
    const moveFactor = Math.abs(this.speed) / cfg.maxSpeedForward * stabK;
    // 乘数按 σ 量级重标定（2026-09-19）：满速 ×13 ≈ 史实行进间射击（无垂稳基本打不中）；
    // aimOffset×40 —— 甩炮/未收敛时散布爆炸，停稳即收敛（旧系数是旧 σ×10 量级，失效）
    const target = cfg.dispersion * (1 + moveFactor * 12 + this.aimOffset * 40) * opticsMult * gunnerMult;
    const aimK = gnr === 1 ? CG.woundAim : 1;
    const rate = this.dispersion > target ? 3.5 : 1 / (cfg.aimTime * aimK);
    this.dispersion = THREE.MathUtils.damp(this.dispersion, target, rate, dt);
  }

  // ─────────────── 命中判定 ───────────────
  // 返回 { zone, armor, impactAngleDeg, localPoint, worldPos }
  // ── 命中判定（装甲板图 v2）：线段 × 自由四边形板求交，返回最近命中板 ──
  // 返回 null = 未命中任何板（弹从板缝穿过，不算命中）；命中返回
  // { zone, plateName, armor, impactAngleDeg, cosA, localPoint, worldPos, isTurret, normal, track }
  resolveHitZone(worldPoint, shellDir) {
    const cfg = this.cfg;
    if (!cfg.armorModel) return this._resolveHitZoneLegacy(worldPoint, shellDir);

    // 段（车体系）：命中点即包围球接触点，板在其前方深处 → 前伸 2m / 后续 8m 覆盖全部板面
    // 点与方向必须同系：都用完整逆变换（含车体俯仰/侧倾）——坡上/顶石头翘头时两系不打架
    const lp = this.root.worldToLocal(worldPoint.clone());
    const ld = shellDir.clone();
    this.root.getWorldQuaternion(_q1).invert();
    ld.applyQuaternion(_q1).normalize();
    const a = lp.clone().addScaledVector(ld, -2), b = lp.clone().addScaledVector(ld, 8);

    let best = null;   // { t, P, isTurret, ptLocal(车体系), nLocal(车体系) }
    // 车体板（车体系直接测）
    for (const P of this._armorPlates.hull) {
      const t = _segPlateT(a, b, P);
      if (t >= 0 && (!best || t < best.t)) best = { t, P, isTurret: false };
    }
    // 炮塔板（转进炮塔系：减枢轴 + rotY(-turretYaw)）
    const yaw = this.turretGroup ? this.turretGroup.rotation.y : 0;
    const pv = this.turretGroup.position;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const ta = new THREE.Vector3(
      (a.x - pv.x) * cyw - (a.z - pv.z) * syw, a.y - pv.y, (a.x - pv.x) * syw + (a.z - pv.z) * cyw);
    const tb = new THREE.Vector3(
      (b.x - pv.x) * cyw - (b.z - pv.z) * syw, b.y - pv.y, (b.x - pv.x) * syw + (b.z - pv.z) * cyw);
    for (const P of this._armorPlates.turret) {
      const t = _segPlateT(ta, tb, P);
      if (t >= 0 && (!best || t < best.t)) best = { t, P, isTurret: true };
    }
    // 附加盒（车长塔等；炮塔附加盒同样在炮塔系）
    for (const [extraList, isTurret, sa, sb] of [
      [this._armorExtras.hull, false, a, b], [this._armorExtras.turret, true, ta, tb]]) {
      for (const ex of extraList) {
        const r = _segBoxT(sa, sb, ex.box);
        if (r && (!best || r.t < best.t)) best = { t: r.t, P: null, extra: ex, isTurret, faceAxis: r.axis, faceSign: r.sign };
      }
    }
    if (!best) return null;

    // 命中点与法线（车体系）→ 世界系
    let ptLocal, nLocal, armor, plateName, face, track = false;
    if (best.P) {
      const src = best.isTurret ? ta : a;
      ptLocal = src.clone().addScaledVector(best.isTurret
        ? tb.clone().sub(ta) : b.clone().sub(a), best.t);
      nLocal = best.P.n.clone();
      armor = best.P.plate.t;
      plateName = best.P.plate.name;
      face = best.P.plate.face;
      track = !!best.P.plate.track;
    } else {
      const src = best.isTurret ? ta : a;
      ptLocal = src.clone().addScaledVector(best.isTurret ? tb.clone().sub(ta) : b.clone().sub(a), best.t);
      nLocal = new THREE.Vector3();
      nLocal.setComponent(best.faceAxis, best.faceSign);
      armor = best.extra.t;
      plateName = best.extra.name;
      face = 'misc';
    }
    if (best.isTurret) {
      // 炮塔系 → 车体系：rotY(yaw) + 枢轴
      const px = ptLocal.x, pz = ptLocal.z;
      ptLocal.set(px * cyw + pz * syw, ptLocal.y, -px * syw + pz * cyw).add(pv);
      const nx = nLocal.x, nz = nLocal.z;
      nLocal.set(nx * cyw + nz * syw, nLocal.y, -nx * syw + nz * cyw);
    }
    if (nLocal.dot(ld) > 0) nLocal.negate();   // 法线迎弹
    const cosA = THREE.MathUtils.clamp(-nLocal.dot(ld), 0, 1);
    const zone = (best.isTurret ? 'turret' : 'hull') +
      ({ front: 'Front', rear: 'Rear', side: 'Side', top: 'Top' }[face] || 'Side');
    return {
      zone, plateName, armor,
      impactAngleDeg: THREE.MathUtils.radToDeg(Math.acos(cosA)), cosA,
      localPoint: ptLocal, worldPos: this.root.localToWorld(ptLocal.clone()),
      isTurret: best.isTurret,
      normal: nLocal.clone().applyQuaternion(this.root.getWorldQuaternion(_q1)),
      track,
    };
  }

  // 旧 6 面平板判定（无 armorModel 时的回退）
  _resolveHitZoneLegacy(worldPoint, shellDir) {
    const cfg = this.cfg;
    const lp = this.root.worldToLocal(worldPoint.clone());  // 米
    const ld = shellDir.clone();
    this.root.getWorldQuaternion(_q1).invert();   // 与点变换同系（含俯仰/侧倾）
    ld.applyQuaternion(_q1);

    const isTurret = lp.y > cfg.dims.hullHeight;
    let zone, normal;
    if (Math.abs(ld.z) >= Math.abs(ld.x)) {
      if (ld.z < 0) { zone = isTurret ? 'turretFront' : 'hullFront'; normal = _v2.set(0, 0, 1).clone(); }
      else { zone = isTurret ? 'turretRear' : 'hullRear'; normal = _v2.set(0, 0, -1).clone(); }
    } else {
      zone = isTurret ? 'turretSide' : 'hullSide';
      normal = _v2.set(-Math.sign(ld.x), 0, 0).clone();
    }
    const cosA = THREE.MathUtils.clamp(-ld.dot(normal), 0, 1);
    const impactAngleDeg = THREE.MathUtils.radToDeg(Math.acos(cosA));
    const armor = cfg.armor[zone];
    const worldNormal = normal.clone().applyQuaternion(this.root.getWorldQuaternion(_q1));
    return { zone, armor, impactAngleDeg, cosA, localPoint: lp, worldPos: worldPoint.clone(), isTurret, normal: worldNormal };
  }

  // 应用命中结算。penetration: 当前穿深；spall: 后效强度；shell: 弹体（HE 威力系数/近失弹用）
  // 返回 { type: 'pen'|'bounce'|'ricochet'|'splash'|'dead', events[], killed }
  applyHit(hit, penetration, shellType = 'ap', hitWorld = null, dirWorld = null, spall = 100, shell = null) {
    if (this.destroyed) return { type: 'dead', events: [] };
    const def = SHELL_TYPES[shellType] || SHELL_TYPES.ap;
    const R = DAMAGE_RULES;

    // 跳弹（HE 永不跳弹）：概率曲线 + 口径碾压（2026-09-23 史实化，替代固定角度必跳）
    // P = clamp((入射角-ricStart)/(ricFull-ricStart)) × ricK(弹种) × 碾压系数；上限 maxP
    if (shellType !== 'he') {
      const cal = (shell && shell.owner && shell.owner.cfg.caliber) || 0;
      let om = 1;
      if (cal > 0) {
        const ratio = cal / Math.max(hit.armor, 1);
        for (const [thr, k] of R.ricochet.overmatch) { if (ratio >= thr) { om = k; break; } }
      }
      const a = hit.impactAngleDeg;
      let p = (a - def.ricStart) / (def.ricFull - def.ricStart);
      p = Math.max(0, Math.min(1, p)) * (def.ricK || 1) * om;
      if (a >= def.ricFull) p = Math.max(p, 0.95);
      p = Math.min(p, R.ricochet.maxP);
      if (Math.random() < p) {
        return { type: 'ricochet', zone: hit.zone, events: [] };
      }
    }
    // 等效装甲
    const effective = hit.armor / Math.max(hit.cosA, def.cosFloor);
    if (penetration < effective) {
      if (shellType === 'he') return this.applyHESplash(hit, shell);   // HE 未击穿：外部毁伤
      return { type: 'bounce', zone: hit.zone, effective, events: [] };
    }

    // 击穿：记录击穿孔冒烟点
    this.holeSmoke = { local: hit.localPoint.clone(), t: 3 };
    this._hsAcc = 0;
    const events = [];
    // 履带区命中：概率断履带（板图模型用板 flag；旧模型按 |x|>trackX 且 y<trackY 区域）
    const I = this.cfg.internal;
    const lp = hit.localPoint;
    const isTrack = hit.track !== undefined
      ? hit.track
      : (I && !hit.isTurret && Math.abs(lp.x) > I.trackX && lp.y < I.trackY);
    if (isTrack) {
      if (Math.random() < R.trackChance * def.trackBreakK) {
        this.mods.tracks = Math.max(this.mods.tracks, R.trackRepair);
        this._lastCritical = 'track';
        events.push({ type: 'module', label: '履带断裂', mod: 'tracks', lvl: 1 });
      }
    }
    // 弃车检定用：记录近 10s 被击穿时间戳（先于后效，保证本次计入检定）
    this._recentPens = (this._recentPens || []).filter(t => this.time - t < R.bail.recentPensWindow);
    this._recentPens.push(this.time);
    if (this.repairing) this.cancelRepair();   // 修理中被击穿 → 打断
    // 击穿后效：破片锥 + 装药爆轰（乘员/模块/殉爆统一在此结算）
    if (hitWorld && dirWorld) events.push(...this.spallDamage(hitWorld, dirWorld, shellType, spall, shell));
    this._checkCrewDeath(events);   // 内含弃车检定（乘员未全灭时）
    return { type: 'pen', zone: hit.zone, events, killed: this.destroyed };
  }

  // ── 击穿后效：弹芯直击 + 破片锥 + 装药爆轰（解析法，免射线步进） ──
  spallDamage(hitWorld, dirWorld, shellType, spall, shell = null) {
    const R = DAMAGE_RULES, S = R.spall;
    const events = [];
    const lp = this.root.worldToLocal(hitWorld.clone());
    const ld = dirWorld.clone();
    this.root.getWorldQuaternion(_q1).invert();   // 与 lp 同系（含车体俯仰/侧倾），否则倾斜时破片锥全打空
    ld.applyQuaternion(_q1).normalize();

    const isHE = shellType === 'he';
    const detK = this.isPlayer ? 0.3 : 1;    // PvE 保护：玩家被殉爆概率降低
    const fireK = this.isPlayer ? 0.5 : 1;
    const modDmgK = Math.max(0.4, spall / 110);
    const modDmg = () => (S.moduleHitDmg[0] + Math.random() * (S.moduleHitDmg[1] - S.moduleHitDmg[0])) * modDmgK;
    const coneTan = Math.tan(S.coneAngle);

    // 乘员杀伤判定：阵亡优先，已伤者再中弹阵亡率提升
    const tryCrew = (c, killP) => {
      if (c.state >= 2) return;
      const p = c.state === 1 ? Math.min(0.95, killP * 1.3) : killP;
      if (Math.random() < p) { c.state = 2; events.push({ type: 'crew', label: `${c.name}阵亡`, crew: c.id, lvl: 2 }); }
      else if (c.state === 0) { c.state = 1; events.push({ type: 'crew', label: `${c.name}受伤`, crew: c.id, lvl: 1 }); }
    };

    // ① 弹芯路径直击 + 破片锥（AP 主通道）
    if (!isHE) {
      for (const c of this.crew) {
        _v2.set(c.x - lp.x, c.y - lp.y, c.z - lp.z);
        const proj = _v2.dot(ld);
        if (proj < 0 || proj > S.range) continue;
        const perp = Math.sqrt(Math.max(0, _v2.lengthSq() - proj * proj));
        if (perp < c.r * 0.8) tryCrew(c, S.crewKillDirect);
        else if (perp < c.r + coneTan * proj * 0.6) tryCrew(c, S.crewKillSpall);
      }
    }

    // ② 装药爆轰：AP 穿入 0.6m 处小半径 / HE 穿入 0.9m 处大半径（大口径 HE 爆轰球随威力放大，封顶 ×1.3）
    const hePow = isHE ? ((shell && shell.hePower) || 1) : 1;
    const bt = isHE ? 0.9 : 0.6;
    const br = isHE ? S.heBurst * Math.min(1.3, 1 + 0.15 * (hePow - 1)) : S.apheBurst;
    _v3.copy(lp).addScaledVector(ld, bt);
    for (const c of this.crew) {
      if (c.state >= 2) continue;
      const d = Math.hypot(c.x - _v3.x, c.y - _v3.y, c.z - _v3.z);
      if (d < br) tryCrew(c, S.crewKillBurst);
      else if (!isHE && d < br + 0.5) tryCrew(c, S.crewKillSpall);
    }

    // ③ 模块毁伤（弹芯路径 / 破片锥 / 爆轰半径任一覆盖即结算，每模块一次）
    for (const key in this.modules) {
      const m = this.modules[key];
      if (m.hp <= 0) continue;
      for (const s of m.spots) {
        _v2.set(s.x - lp.x, s.y - lp.y, s.z - lp.z);
        const proj = _v2.dot(ld);
        if (proj < -0.3 || proj > S.range) continue;
        const perp = Math.sqrt(Math.max(0, _v2.lengthSq() - proj * proj));
        const burstD = Math.hypot(s.x - _v3.x, s.y - _v3.y, s.z - _v3.z);
        if (perp < s.r || perp < s.r + coneTan * proj * 0.5 || burstD < br + s.r * 0.5) {
          this.damageModule(key, modDmg(), events, detK, fireK);
          break;
        }
      }
    }

    // ④ 弹芯穿出：出口事件（特效）
    const xLim = this.cfg.dims.width / 2 + 0.2;
    const zLim = this.cfg.dims.length / 2 + 0.2;
    const yTop = this.cfg.dims.turretTop + 0.15;
    const p = _v4;
    for (let t = 0.12; t <= 7.2; t += 0.12) {
      p.copy(lp).addScaledVector(ld, t);
      if (p.y < -0.2) break;
      if (Math.abs(p.x) > xLim || Math.abs(p.z) > zLim || p.y > yTop) {
        events.push({ type: 'exit', pos: this.root.localToWorld(p.clone()), dir: dirWorld.clone() });
        break;
      }
    }
    return events;
  }

  // HE 未击穿外部毁伤：断履带 / 伤观瞄 / 伤炮闩 / 薄甲震伤乘员（概率随威力系数缩放）
  applyHESplash(hit, shell = null) {
    if (this.destroyed) return { type: 'dead', events: [] };
    const R = DAMAGE_RULES, HS = R.heSplash;
    const P = (shell && shell.hePower) || 1;   // HE 威力系数（88mm=1 基准；docs/heavy-he-damage-plan.md 方案 A）
    const events = [];
    const I = this.cfg.internal;
    const lp = hit.localPoint;
    const detK = this.isPlayer ? 0.3 : 1, fireK = this.isPlayer ? 0.5 : 1;
    // 威力缩放：断带 0.55→(122)0.75→(152)0.95封顶；观瞄/炮闩小幅上浮；薄甲震伤阈值 30→(122)60→(152)90mm
    const trackP = Math.min(0.95, R.heTrackChance + (P - 1) * 0.17);
    const optP = Math.min(0.85, HS.opticsChance + (P - 1) * 0.07);
    const breechP = Math.min(0.7, HS.breechChance + (P - 1) * 0.10);
    const thinWound = HS.thinArmorWound + (P - 1) * 27;
    const thinP = Math.min(0.85, HS.thinWoundChance + (P - 1) * 0.14);
    // 大口径门槛：P≥2 启用结构震伤/内崩落/薄甲多人震伤/超压毁伤（方案 C+；88/90mm=1 走原路径）
    const shock = R.heShock, big = P >= shock.minPower;

    // 履带区（板图模型用板 flag；旧模型按区域）
    const isTrackHE = hit.track !== undefined
      ? hit.track
      : (I && !hit.isTurret && Math.abs(lp.x) > I.trackX && lp.y < I.trackY);
    if (isTrackHE) {
      if (big || Math.random() < trackP) {   // 大口径命中行走部必断带（2026-09-23）
        this.mods.tracks = Math.max(this.mods.tracks, R.trackRepair);
        events.push({ type: 'module', label: '履带断裂', mod: 'tracks', lvl: 1 });
      }
    } else if (big && !hit.isTurret && Math.random() < 0.7) {
      // 大口径命中车体：冲击波震断履带，无需命中行走部（2026-09-23）
      this.mods.tracks = Math.max(this.mods.tracks, R.trackRepair);
      events.push({ type: 'module', label: '履带断裂', mod: 'tracks', lvl: 1 });
    }
    // 命中炮塔：伤观瞄 / 炮闩（大口径必伤，2026-09-23）
    if (hit.isTurret) {
      if (big || Math.random() < optP) this.damageModule('optics', big ? 20 : 14, events, detK, fireK);
      if (hit.zone === 'turretFront' && (big || Math.random() < breechP)) this.damageModule('breech', big ? 30 : 20, events, detK, fireK);
    }
    // 薄甲面：冲击波震伤乘员（阈值随威力放大——大口径震得穿更厚的板；P≥2 波及多人、半径放大）
    const woundR = HS.thinWoundRadius + (big ? shock.thinWoundRadiusK * (P - 1) : 0);
    if (hit.armor <= thinWound) {
      const inRange = this.crew.filter((c) => c.state < 2)
        .map((c) => ({ c, d: Math.hypot(c.x - lp.x, c.y - lp.y, c.z - lp.z) }))
        .filter((e) => e.d < woundR)
        .sort((a, b) => a.d - b.d)
        .slice(0, big ? shock.thinWoundCrew : 1);
      let any = false;
      for (const { c } of inRange) {
        if (Math.random() >= thinP) continue;
        any = true;
        if (c.state === 0) { c.state = 1; events.push({ type: 'crew', label: `${c.name}被震伤`, crew: c.id, lvl: 1 }); }
        else { c.state = 2; events.push({ type: 'crew', label: `${c.name}阵亡`, crew: c.id, lvl: 2 }); }
      }
      if (any) this._checkCrewDeath(events);
    } else if (big && Math.random() < Math.min(shock.scabMax, shock.scabBase * (P - 1) + shock.scabArmorK * hit.armor)) {
      // ① 内崩落：厚板被大口径命中 → 装甲内层崩落破片伤乘员（没打穿也死人的史实机制）
      // 阵亡率随威力缩放（2026-09-23：152 档 0.5，122 档 0.44）
      const scabKill = Math.min(0.55, shock.scabKillP + (P - 1) * 0.075);
      const inRange = this.crew.filter((c) => c.state < 2)
        .map((c) => ({ c, d: Math.hypot(c.x - lp.x, c.y - lp.y, c.z - lp.z) }))
        .filter((e) => e.d < shock.scabRadius)
        .sort((a, b) => a.d - b.d)
        .slice(0, shock.scabCrewMax);
      for (const { c } of inRange) {
        if (Math.random() < scabKill) { c.state = 2; events.push({ type: 'crew', label: `${c.name}被崩落破片击毙`, crew: c.id, lvl: 2 }); }
        else if (c.state === 0) { c.state = 1; events.push({ type: 'crew', label: `${c.name}被崩落破片击伤`, crew: c.id, lvl: 1 }); }
      }
      if (inRange.length) this._checkCrewDeath(events);
    }
    // ② 结构震伤：方向机（座圈受震）/ 发动机（支架变形），命中部位对应模块概率 ×1.5
    if (big) {
      const sp = Math.min(shock.structMax, shock.structP * (P - 1));
      const sDmg = () => shock.structDmg[0] + Math.random() * (shock.structDmg[1] - shock.structDmg[0]);
      if (Math.random() < sp * (hit.isTurret ? 1.5 : 1)) this.damageModule('turretDrive', sDmg(), events, detK, fireK);
      if (Math.random() < sp * (!hit.isTurret ? 1.5 : 1)) this.damageModule('engine', sDmg(), events, detK, fireK);
    }
    // ④ 超压毁伤（2026-09-23）：大口径直击未击穿 → 按面甲分档的整车毁伤
    //    152 级直击四号约 35% / 虎式约 15% / 超重甲 5%；122 级 ×0.6。冲击波席卷战斗室杀伤乘员 + 重创模块
    const OP = big ? shock.overpressure : null;
    if (OP && P >= OP.minPower) {
      let opBase = OP.tiers[OP.tiers.length - 1][1];
      for (const [armorMax, p] of OP.tiers) { if (hit.armor <= armorMax) { opBase = p; break; } }
      if (Math.random() < opBase * (P - 1) / OP.pScale) {
        events.push({ type: 'module', label: '超压毁伤', mod: 'hull', lvl: 2 });
        const inRange = this.crew.filter((c) => c.state < 2)
          .map((c) => ({ c, d: Math.hypot(c.x - lp.x, c.y - lp.y, c.z - lp.z) }))
          .filter((e) => e.d < OP.crewRadius)
          .sort((a, b) => a.d - b.d)
          .slice(0, OP.crewMax);
        for (const { c } of inRange) {
          if (Math.random() < OP.crewKillP) { c.state = 2; events.push({ type: 'crew', label: `${c.name}被超压冲击波震死`, crew: c.id, lvl: 2 }); }
          else if (c.state === 0) { c.state = 1; events.push({ type: 'crew', label: `${c.name}被超压冲击波震伤`, crew: c.id, lvl: 1 }); }
        }
        const oDmg = OP.moduleDmg[0] + Math.random() * (OP.moduleDmg[1] - OP.moduleDmg[0]);
        this.damageModule('breech', oDmg, events, detK, fireK);
        this.damageModule(hit.isTurret ? 'turretDrive' : 'engine', oDmg, events, detK, fireK);
        if (inRange.length) this._checkCrewDeath(events);
      }
    }
    return { type: 'splash', events, killed: this.destroyed };
  }

  // HE 落地近失弹：爆点冲击波/破片对邻近车辆的外部毁伤（半径/威力随口径；方案 D）
  applyHENearMiss(burstPos, shell = null) {
    if (this.destroyed) return null;
    const R0 = (shell && shell.nearMissR) || 0;
    if (!R0) return null;
    const P = (shell && shell.hePower) || 1;
    const dx = this.pos.x - burstPos.x, dz = this.pos.z - burstPos.z;
    const dy = (this.root.position.y - burstPos.y) * 0.6;
    const d = Math.hypot(dx, dy, dz);
    if (d > R0) return null;
    const k = 1 - d / R0;   // 中心 1 → 半径边缘 0
    const events = [];
    // 冲击波断履带
    if (Math.random() < 0.45 * k * Math.min(1.6, P)) {
      this.mods.tracks = Math.max(this.mods.tracks, DAMAGE_RULES.trackRepair);
      events.push({ type: 'module', label: '履带被冲击波震断', mod: 'tracks', lvl: 1 });
    }
    // 震坏观瞄
    if (Math.random() < 0.3 * k) this.damageModule('optics', 10, events);
    // 冲击波震伤乘员：最近 1 名（大口径波及 2 名）；薄甲车加重（敞顶/薄侧甲先遭殃）
    const armorK = (this.cfg.armor && this.cfg.armor.hullSide <= 60) ? 1.5 : 1;
    const woundP = Math.min(0.85, 0.35 * k * (0.6 + 0.4 * P) * armorK);
    const lp = this.root.worldToLocal(new THREE.Vector3(burstPos.x, burstPos.y, burstPos.z));
    const byDist = this.crew.filter((c) => c.state < 2)
      .map((c) => ({ c, dd: Math.hypot(c.x - lp.x, c.z - lp.z) + Math.max(0, c.y - lp.y) * 0.3 }))   // 水平距为主，垂直弱加权（爆点在地面）
      .sort((a, b) => a.dd - b.dd);
    let wounded = 0;
    for (const { c, dd } of byDist) {
      if (wounded >= (P >= 2 ? 2 : 1) || dd > 3.2) break;
      if (Math.random() < woundP) {
        if (c.state === 0) { c.state = 1; events.push({ type: 'crew', label: `${c.name}被震伤`, crew: c.id, lvl: 1 }); }
        else { c.state = 2; events.push({ type: 'crew', label: `${c.name}阵亡`, crew: c.id, lvl: 2 }); }
        wounded++;
      }
    }
    if (events.length) this._checkCrewDeath(events);
    return events;
  }

  // ── 模块毁伤（HP 扣减 + 档位事件 + 特殊后果：起火/殉爆/趴窝/弃车检定） ──
  damageModule(key, dmg, events, detK = 1, fireK = 1) {
    const m = this.modules[key];
    if (!m || m.hp <= 0 || this.destroyed) return;
    const R = DAMAGE_RULES;
    m.hp = Math.max(0, m.hp - dmg);
    if (m.hp <= 0) {
      events.push({ type: 'module', label: `${m.name}损毁`, mod: key, lvl: 2 });
      // 弃车表现用损伤源记录
      if (key === 'engine') this._lastCritical = 'engine';
      if (key === 'breech' || key === 'turretDrive' || key === 'optics' || key === 'ammoRacks') this._lastCritical = 'turret';
      if (key === 'fuel') {
        this.ignite(); events.push({ type: 'fire', label: '油箱起火' });
        // 油泵打穿：30% 直接趴窝（永久）
        if (Math.random() < R.effects.fuelDeadImmobilize * fireK) {
          this._fuelPumpDead = true;
          this.immobilized = true;
          events.push({ type: 'module', label: '供油中断，车辆趴窝', mod: 'fuel', lvl: 2 });
        }
      }
      if (key === 'engine' && Math.random() < R.engineFireOnDead * fireK) {
        this.ignite(); events.push({ type: 'fire', label: '发动机起火' });
      }
      if (key === 'ammoRacks' && Math.random() < R.ammoDetOnDestroy * detK) {
        events.push({ type: 'ammo_boom', label: '弹药殉爆' });
        this.destroy(true);
      }
      this._checkBail(events);   // 关键模块损毁 → 士气检定
    } else if (m.hp < m.maxHp * 0.5) {
      events.push({ type: 'module', label: `${m.name}受损`, mod: key, lvl: 1 });
    }
    // 弹药架任何命中都有殉爆机会
    if (!this.destroyed && key === 'ammoRacks' && Math.random() < R.ammoDetHit * detK) {
      events.push({ type: 'ammo_boom', label: '弹药殉爆' });
      this.destroy(true);
    }
    // 油箱命中概率起火
    if (!this.destroyed && key === 'fuel' && this.burning <= 0 && Math.random() < R.fuelFireOnHit * fireK) {
      this.ignite(); events.push({ type: 'fire', label: '油箱起火' });
    }
  }

  // 乘员全灭判定
  _checkCrewDeath(events) {
    if (this.destroyed) return;
    if (this.crewAlive() === 0) {
      if (events) events.push({ type: 'kill', label: '乘员全灭' });
      this.destroy(false);
      return;
    }
    this._checkBail(events);   // 乘员减员 → 士气检定
  }

  // ── 弃车士气检定（拟真核心：不再战斗到最后一人） ──
  // 乘员阵亡/模块损毁/被击穿后触发；概率见 DAMAGE_RULES.bail；每车每场最多 maxChecks 次
  _checkBail(events) {
    if (this.destroyed || this.bailedOut) return;
    const B = DAMAGE_RULES.bail;
    const dead = this.crew.length - this.crewAlive();
    let p = dead >= 3 ? B.dead3 : dead >= 2 ? B.dead2 : 0;
    if (this.immobilized || this.mods.tracks > 0) p += B.immobileAdd;
    if (this.burning > 0) p += B.burningAdd;
    if (this.moduleState('breech') === 0) p += B.noGunAdd;
    const now = this.time;
    this._recentPens = (this._recentPens || []).filter(t => now - t < B.recentPensWindow);
    if (this._recentPens.length >= 2) p += B.recentPensAdd;
    if (p <= 0 || this._bailChecks >= B.maxChecks) return;
    this._bailChecks++;
    if (Math.random() < p) this.bailOut(events);
  }

  // ── 弃车：计为击毁；表现 = 炮管低垂 + 炮塔停在最后角度 + 舱口灰黑烟柱升起（不爆炸、不熏黑） ──
  bailOut(events) {
    if (this.bailedOut || this.destroyed) return;
    this.bailedOut = true;
    this.repairing = null;
    if (events) events.push({ type: 'bail', label: '车组弃车', lvl: 2 });
    // 火炮低垂（炮塔不回中，停在最后角度——后续 update 不再驱动它）
    this.gunPitch = Math.max(this.gunPitch, 0.14);
    // 烟源（车体局部坐标，update 中逐帧转世界）：发动机损毁 → 发动机舱；其余 → 炮塔舱门
    const src = this._lastCritical;
    if (src === 'engine' && this.modules.engine?.spots?.length) {
      const s = this.modules.engine.spots[0];
      this._bailSmokeLocal = new THREE.Vector3(s.x, s.y + 0.9, s.z);
    } else {
      const tp = this.cfg.turretPivot;
      this._bailSmokeLocal = new THREE.Vector3(tp[0], tp[1] + 1.0, tp[2] - 0.3);   // 炮塔舱门位（偏后上）
    }
    this._bailSmokeT = 120;      // 舱口烟持续 120s（随车 dispose 消失，不再污染下一局）
    this._bailAcc = 0;
    if (this._lastCritical === 'track') {
      this.model.rotation.z += 0.045;   // 断带弃车：车体歪斜
      this.model.position.y -= 0.06;
    }
    this.destroy(false);   // 计为击毁（bailedOut 标记：destroy 内跳过熏黑；main.js 据此区分玩家强制结算）
  }

  // ── 消耗品 ──
  // 修理（读条制）：原地停车读条、可开炮/转炮塔；R 开始/再按中止。一次修好全部可修项
  // 可修项：断履带 + 受损（非损毁）的发动机/油箱/炮闩；时长 = baseTime + 每项 perItem
  _repairableItems() {
    const R = DAMAGE_RULES.repair;
    const out = [];
    if (this.mods.tracks > 0) out.push({ key: 'tracks', label: '履带' });
    for (const k of R.repairableModules) {
      if (this.moduleState(k) === 1) out.push({ key: k, label: this.modules[k].name });
    }
    return out;
  }
  startRepair() {
    if (this.destroyed || this.bailedOut || this.repairing) return false;
    if (this.consumables.repair <= 0) return false;
    const items = this._repairableItems();
    if (!items.length) return false;
    const R = DAMAGE_RULES.repair;
    this.repairing = { t: 0, dur: R.baseTime + R.perItem * items.length, items };
    return true;
  }
  cancelRepair() {
    if (!this.repairing) return;
    this.repairing = null;
  }
  _completeRepair() {
    const r = this.repairing;
    this.repairing = null;
    this.consumables.repair--;
    for (const it of r.items) {
      if (it.key === 'tracks') this.mods.tracks = 0;
      else this.modules[it.key].hp = this.modules[it.key].maxHp;
    }
    this.pendingEvents.push({ type: 'module', label: '抢修完成', mod: 'repair', lvl: 1 });
  }
  useExtinguisher() {
    if (this.destroyed || this.consumables.ext <= 0 || this.burning <= 0) return false;
    this.burning = 0;
    this.consumables.ext--;
    return true;
  }

  // ── 机枪命中毁伤：骚扰压制（无法穿透主装甲，不伤乘员/不断履带）；
  //    仅小概率直接破坏观瞄（MG_RULES.opticsKill 按命中距离阶梯）──
  applyMGDamage(dist) {
    const out = [];
    if (this.destroyed) return out;
    const p = mgOpticsChance(dist);
    if (p > 0 && this.moduleState('optics') !== 0 && Math.random() < p) {
      this.damageModule('optics', this.modules.optics.maxHp, out, 1, 1);
    }
    return out;
  }

  ignite() {
    if (this.destroyed) return;
    this.burning = DAMAGE_RULES.fireDuration;
  }

  destroy(violent) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.burning = 0;
    // 永久放射状地面焦痕（车体中心——飞头分支炮塔离位，以车体为准）：
    // 爆炸击毁（殉爆/烧爆/爆轰）16~20m；乘员阵亡/弃车等非爆炸击毁 12~16m（2026-09-25 用户定：直径加倍）
    if (this.effects && this.effects.scorch) {
      this.effects.scorch(this.root.position.x, this.root.position.z,
        violent ? 16 + Math.random() * 4 : 12 + Math.random() * 4);
    }
    // 残骸燃烧时间轴：0 ~ _wreckBigT 大火，之后转余烬薄烟（高烟柱）
    this._wreckAge = 0;
    this._wreckBigT = 20 + Math.random() * 10;
    if (!this.bailedOut) {
      // 烧毁外观：全部材质熏黑 + 炮管微垂（弃车不熏黑——车组跑了，车没炸）
      // 熏黑系数 0.42（2026-09-12 调浅：0.22 太死黑，0.42 保留焦痕层次）
      this.model.traverse((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) { m.color && m.color.multiplyScalar(0.42); m.roughness = 1; }
        }
      });
      this.gunPitch = Math.max(this.gunPitch, 0.06);
    }
    // 残骸持续小火（40% 概率，1~2 处：发动机顶部/炮塔舱口顶部/驾驶室顶部）——局部坐标，update 逐帧转世界
    this._wreckFires = null;
    if (Math.random() < 0.4) {
      const cands = [];
      const eng = this.modules.engine && this.modules.engine.spots[0];
      if (eng) cands.push(new THREE.Vector3(eng.x, this.cfg.dims.hullHeight + 0.1, eng.z));
      const tp = this.cfg.turretPivot;
      if (tp) cands.push(new THREE.Vector3(tp[0], tp[1] + 1.05, tp[2] - 0.2));
      const drv = this.crew.find((c) => c.id === 'driver');
      cands.push(new THREE.Vector3(drv ? drv.x : 0, this.cfg.dims.hullHeight + 0.1,
        drv ? drv.z : this.cfg.dims.length * 0.3));
      for (let i = cands.length - 1; i > 0; i--) {   // 洗牌后取 1~2 处
        const j = Math.floor(Math.random() * (i + 1));
        const t = cands[i]; cands[i] = cands[j]; cands[j] = t;
      }
      this._wreckFires = cands.slice(0, 1 + Math.floor(Math.random() * 2))
        .map((p) => ({ pos: p, acc: Math.random() * 0.055 }));
    }
    if (violent) {
      this.ammoDetonated = true;
      this.speed = 0;   // 殉爆当场停车（残骸不再滑行，保证与焦痕中心一致）
      const fx = this.effects;
      const pos = this.root.position.clone();
      // 殉爆三段延爆
      if (fx) {
        fx.explosion(pos.clone().setY(pos.y + 1.6), 4.4);
        setTimeout(() => {
          if (this.destroyed && this.root.parent) fx.explosion(pos.clone().setY(pos.y + 1.2), 2.6);
        }, 280);
        setTimeout(() => {
          if (this.destroyed && this.root.parent) fx.explosion(pos.clone().setY(pos.y + 2), 1.8);
        }, 700);
      }
      if (Math.random() < 0.5) {
        // 50%：炮塔抛飞
        this.root.updateMatrixWorld(true);
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        this.turretGroup.matrixWorld.decompose(wp, wq, ws);
        const sceneRoot = this.root.parent;
        if (sceneRoot) {
          sceneRoot.attach(this.turretGroup);
          this.turretFly = {
            vel: new THREE.Vector3((Math.random() - 0.5) * 4, 11 + Math.random() * 4, (Math.random() - 0.5) * 4),
            rot: new THREE.Vector3(Math.random() * 3 - 1.5, Math.random() * 3, Math.random() * 3 - 1.5),
            landed: false,
          };
        }
      } else {
        // 另 50%：不飞头——高压燃气从炮塔顶端舱盖喷出（近垂直火柱）
        this.root.updateMatrixWorld(true);
        const tp = this.cfg.turretPivot;
        this.jetFirePos = this.root.localToWorld(new THREE.Vector3(tp[0], tp[1] + 1.05, tp[2] - 0.2));
        this.jetFireDir = new THREE.Vector3((Math.random() - 0.5) * 0.5, 1, (Math.random() - 0.5) * 0.5).normalize();
        this.jetFireT = 5 + Math.random() * 3;
        this._jetAcc = 0;
      }
    }
  }

  // ─────────────── 帧更新 ───────────────
  update(dt, effects, audio) {
    const cfg = this.cfg;
    if (effects) this.effects = effects;

    // 装填
    if (this.reload > 0) this.reload -= dt;

    // 修理读条推进（断履带不再自修：必须读条修理）
    if (this.repairing) {
      this.repairing.t += dt;
      if (this.repairing.t >= this.repairing.dur) this._completeRepair();
    }
    // 修理中被击穿 → 打断修理（进度作废）
    //（pen 在 applyHit 里 cancelRepair）

    // ── 物件音效：撞障碍物 + 行驶碾压废墟 ──
    if (audio && audio.playProp) {
      this.ramCd = Math.max(0, this.ramCd - dt);
      this.rubbleCd -= dt;
      if (this._ramHit) {
        if (this._ramHit.time === this.time && this.ramCd <= 0) {
          this.ramCd = 0.5;
          const t = this._ramHit.type;
          const isHouse = !t || t.startsWith('house') || t.startsWith('barn') || t.startsWith('barrack');
          audio.playProp(isHouse ? 'ramHouse' : 'crushObj', Math.min(1, 0.35 + this._ramHit.impact / 12), this.pos);
        }
        this._ramHit = null;
      }
      const des = this.world && this.world.destructibles;
      if (!this.destroyed && des && Math.abs(this.speed) > 1.2
          && des.rubbleHeightAt(this.pos.x, this.pos.z) > 0.12 && this.rubbleCd <= 0) {
        this.rubbleCd = 1.1 + Math.random() * 0.7;
        audio.playProp('crushRubble', Math.min(0.9, 0.35 + Math.abs(this.speed) / 14), this.pos);
      }
    }

    // 火药残烟
    if (this.evacT > 0) {
      this.evacT -= dt;
      if (this.evacT <= 0 && this.effects) {
        this.root.updateMatrixWorld(true);
        this.getMuzzle(_v3, _v4);
        this.effects.boreEvac(_v3, _v4);
      }
    }

    // 炮管余烟
    if (this.barrelSmokeT > 0 && this.effects) {
      this.barrelSmokeT -= dt;
      this._bsAcc += dt;
      if (this._bsAcc > 0.09) {
        this._bsAcc = 0;
        this.root.updateMatrixWorld(true);
        this.getMuzzle(_v3, _v4);
        _v3.addScaledVector(_v4, -0.4);
        this.effects.ps.spawn('smoke', {
          x: _v3.x, y: _v3.y, z: _v3.z,
          vy: 0.8 + Math.random(), life: 1.4, size0: 0.3, size1: 1.6, alpha: 0.3, windK: 1,
          c0: [0.7, 0.68, 0.64], c1: [0.4, 0.39, 0.38], fadeIn: 0.2,
        });
      }
    }

    // 击穿孔冒烟
    if (this.holeSmoke && this.holeSmoke.t > 0 && this.effects) {
      this.holeSmoke.t -= dt;
      this._hsAcc += dt;
      if (this._hsAcc > 0.07) {
        this._hsAcc = 0;
        _v3.copy(this.holeSmoke.local);
        this.root.localToWorld(_v3);
        this.effects.ps.spawn('smoke', {
          x: _v3.x, y: _v3.y, z: _v3.z,
          vy: 1.4, life: 1.6, size0: 0.25, size1: 1.3, alpha: 0.42, windK: 0.8,
          c0: [0.3, 0.28, 0.26], c1: [0.15, 0.15, 0.14], fadeIn: 0.15,
        });
      }
    }

    // 后座回位
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 3.2);
      const back = this.recoil * this.recoil * 0.38 / cfg.scale;
      this.barrelGroup.position.copy(this.barrelBasePos);
      this.barrelGroup.position.z -= back;
    }

    // 履带 UV 滚动 + 轮子旋转（trackScrollAxis：贴图轨道方向沿 U 的车型（M4/虎式）滚 offset.x）
    // 符号：前进时 offset 递增——实测递减方向在起步时是"倒车式"滑动（2026-09-12 用户实测纠正）
    // trackScrollFlip：仅翻转履带贴图 UV 符号（t34-85 的 V 轴绕向相反）；轮子旋转不翻（2026-09-13）
    const roll = this.speed * dt;
    const uvRoll = cfg.trackScrollFlip ? -roll : roll;
    const scrollX = cfg.trackScrollAxis === 'x';
    for (const t of this.trackMaterials) {
      if (scrollX) t.offset.x += uvRoll * 0.5;
      else t.offset.y += uvRoll * 0.5;
    }
    for (const w of this.wheelGroups) w.group.rotation.x += roll / w.radius;

    // ── 起火：每秒烧灼乘员 + 殉爆判定（灭火器可扑灭）──
    if (this.burning > 0 && !this.destroyed) {
      this.burning -= dt;
      const R = DAMAGE_RULES;
      this._burnAcc += dt;
      while (this._burnAcc >= 1) {
        this._burnAcc -= 1;
        for (const c of this.crew) {
          if (c.state >= 2) continue;
          const killP = c.state === 1 ? R.fireCrewKillPerSec * 1.6 : R.fireCrewKillPerSec;
          if (Math.random() < killP) {
            c.state = 2;
            this.pendingEvents.push({ type: 'crew', label: `${c.name}被大火吞噬`, crew: c.id, lvl: 2 });
          } else if (c.state === 0 && Math.random() < R.fireCrewWoundPerSec) {
            c.state = 1;
            this.pendingEvents.push({ type: 'crew', label: `${c.name}被烧伤`, crew: c.id, lvl: 1 });
          }
        }
        this._checkCrewDeath(this.pendingEvents);
      }
      const detC = R.fireDetPerSec * (this.isPlayer ? 0.3 : 1);
      if (Math.random() < detC * dt) this.destroy(true);
      const firePos = this.turretGroup.getWorldPosition(_v2);
      effects.burning(firePos, dt, 1, false);
    }

    // 殉爆炮塔飞行
    if (this.turretFly && !this.turretFly.landed) {
      const tf = this.turretFly;
      tf.vel.y -= 22 * dt;
      this.turretGroup.position.addScaledVector(tf.vel, dt);
      this.turretGroup.rotation.x += tf.rot.x * dt;
      this.turretGroup.rotation.y += tf.rot.y * dt;
      this.turretGroup.rotation.z += tf.rot.z * dt;
      const gy = this.world.groundY(this.turretGroup.position.x, this.turretGroup.position.z) + 0.8;
      if (this.turretGroup.position.y < gy) {
        this.turretGroup.position.y = gy;
        tf.landed = true;
        effects.explosion(this.turretGroup.position, 0.8);
      }
    }

    // 殉爆炮塔顶端喷火（不飞头分支：高压燃气从舱盖喷出）
    if (this.jetFireT > 0 && this.effects) {
      this.jetFireT -= dt;
      this._jetAcc += dt;
      const k = Math.min(1, this.jetFireT / 1.5);
      if (this._jetAcc > 0.05 * (2 - k)) {
        this._jetAcc = 0;
        this.effects.jetFire(this.jetFirePos, this.jetFireDir);
      }
    }

    // 被摧毁后：燃烧时间轴（0~20/30s 大火 → 之后余烬：明火变小，薄烟柱升得更高）
    if (this.destroyed && effects) {
      if (this.bailedOut) {
        // 弃车：舱口灰黑烟柱（车没炸，只是乘员跑了；烟随车 dispose 消失）
        if (this._bailSmokeT > 0 && this._bailSmokeLocal) {
          this._bailSmokeT -= dt;
          _v2.copy(this._bailSmokeLocal);
          this.root.localToWorld(_v2);
          effects.hatchSmoke(_v2, dt);
        }
      } else {
        this._wreckAge += dt;
        const p = this.root.position;
        _v2.set(p.x, p.y + cfg.dims.hullHeight + 0.5, p.z);
        if (this._wreckAge < this._wreckBigT) {
          effects.burning(_v2, dt, this.ammoDetonated ? 0.7 : 1.1, true);
        } else {
          effects.smolder(_v2, dt);
        }
      }
      // 持续小火点（40% 残骸 1~2 处，弃车残骸同样可能有）：小火苗 + 黑烟
      if (this._wreckFires) {
        for (const f of this._wreckFires) {
          f.acc += dt;
          if (f.acc >= 0.055) {
            f.acc = 0;
            _v2.copy(f.pos);
            this.root.localToWorld(_v2);
            effects.wreckFire(_v2);
          }
        }
      }
    }
  }
}
