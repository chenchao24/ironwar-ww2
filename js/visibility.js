// ═══ 点亮系统 v3：成对观察状态（观察者→目标）· 三档认知（未发现/疑似/确认）═══
// 第七次迭代·察觉/确认两层对等模型（docs/ai-redesign-plan.md §3）：
//   第 1 层 察觉→疑似：按目标行为分档（移动 detectMove 1200 / 静止 detectStationary 700 / 软遮挡 300）；
//   第 2 层 确认→点亮：自动确认圈（基准 500/700 × 角色 autoConfirmK × AI 难度 obsK）+ 光学 dwell（WP4）。
// 玩家侧：开火/察觉快照为真实位置（无误差）；AI 侧快照带误差（声源定位/远距察觉，连续开火收敛）。
// 兼容字段：敌车上的 spotted/suspected/lostContact/lastKnownPos 为「玩家→该车」通道的同步，
//         供 UI/小地图/前机枪读取；AI 一律改用 contactInfo(observer, target)。

import { terrainHeight } from './terrain.js';   // 仅作缺省回退（World 未提供 groundY 时）
import { VISIBILITY_RULES as R } from './config.js';
import { roleProfile } from './ai/roles.js';
import { AI_DIFFICULTY } from './ai/difficulty.js';
import { SuspicionMap } from './ai/suspicion.js';

const TERRAIN_STEP = 4;        // 地形步进 m（>800m 放宽到 8m，§3.11 性能预算）

class VisibilityManager {
  constructor(world) {
    this.world = world;
    this.obstacles = world.obstacles || [];
    this.sightBlockers = world.sightBlockers || [];   // 软遮挡（灌木丛）：挡视线不挡移动
    this.smoke = null;             // SmokeManager 引用
    this.timer = 0;
    this.time = 0;
    this.pairs = new Map();        // observer → Map<target, state>
    this.profiles = new Map();     // AI 坦克 → { alertRange, reactDelay }
    this.radioQueue = [];          // { target, at } AI 电台共享队列
    this.suspicion = new SuspicionMap();   // 排级共享怀疑度地图（§5.5，搜索建议层）
    this._playerExposure = 0;      // 玩家被敌发现程度（0/1/2）
  }

  // 当前地图高度采样（含小镇废墟场）；无 world 时回退平原公式
  _gy(x, z) { return this.world && this.world.groundY ? this.world.groundY(x, z) : terrainHeight(x, z); }

  setSmokeManager(smoke) { this.smoke = smoke; }

  // ── AI 难度切面（main.js 建 AI 时注入；缺省按标准档） ──
  setAIProfile(tank, diffKey) {
    const df = AI_DIFFICULTY[diffKey] || AI_DIFFICULTY.standard;
    this.profiles.set(tank, {
      alertRange: (R.aiAlertRange && R.aiAlertRange[diffKey]) || 700,
      reactDelay: (R.aiReactDelay && R.aiReactDelay[diffKey]) || 2.0,
      obsK: df.obsK || 1,                  // 侦查确认距离系数（§3.4/§3.7）
    });
  }
  profileOf(tank) { return this.profiles.get(tank) || { alertRange: 700, reactDelay: 2.0, obsK: 1 }; }

  // 初始化/获取成对状态
  _st(obs, tgt) {
    let m = this.pairs.get(obs);
    if (!m) { m = new Map(); this.pairs.set(obs, m); }
    let s = m.get(tgt);
    if (!s) {
      s = {
        level: 0,               // 0 未发现 / 1 疑似接触 / 2 确认点亮
        spotTimer: 0,           // 确认保持
        suspectTimer: 0,        // 疑似保持
        lostContact: false,
        lostTimer: 0,
        detectTimer: 0,
        detecting: false,
        lastKnownPos: null,     // 最后已知（真实）位置——玩家侧标记直接用；AI 侧叠加 errVec
        lastKnownHeading: 0,
        errVec: null,           // AI 接触位置误差 {x,z}（声源定位误差，连续开火收敛）
        dwellT: 0,              // 玩家主动照射进度 s
        contactAge: 0,          // 获得接触至今时长（AI 反应延迟判定）
        radioQueued: false,     // 本接触是否已排程电台通报
      };
      m.set(tgt, s);
    }
    return s;
  }

  // ── 开火暴露：1400m 内所有敌方获得接触（无视遮挡——炮声/炮口焰） ──
  // 目视开阔且在自动确认圈内 → 直接确认；否则疑似（快照位置 + AI 侧误差）。
  onFire(shooter, allTanks) {
    shooter._lastFireAt = this.time;   // tgtK 开火窗口（§3.6）
    for (const other of allTanks) {
      if (other === shooter || other.destroyed) continue;
      if (!!other.isPlayer === !!shooter.isPlayer) continue;   // 只对敌对方向暴露
      const d = shooter.pos.distanceTo(other.pos);
      if (d > R.fireContactRange) continue;
      const st = this._st(other, shooter);
      const info = this.losDetail(other, shooter);
      const auto = this._autoRange(other, shooter, info) * this._tgtK(shooter, false);
      if (info.see && d <= Math.max(auto, R.autoConcealed)) {
        this._confirm(st, other, shooter);      // 开阔地目视到开火 → 直接点亮
        continue;
      }
      // 疑似接触
      if (st.level < 1) { st.level = 1; st.contactAge = 0; }
      st.suspectTimer = Math.max(st.suspectTimer, R.fireContactTime);
      st.lostContact = false;
      st.detecting = false;
      st.lastKnownPos = shooter.pos.clone();
      st.lastKnownHeading = shooter.heading;
      if (!other.isPlayer) {
        // AI 声源定位误差：越远越大；射手在软遮挡后 ×1.5；连续开火逐发收敛
        if (st.errVec) {
          st.errVec.x *= R.fireErrDecay; st.errVec.z *= R.fireErrDecay;
          if (Math.hypot(st.errVec.x, st.errVec.z) < 8) st.errVec = null;   // 已收敛≈锁定位置
        } else if (st.level === 1 && !st._errDone) {
          const base = R.fireErrNear + (R.fireErrFar - R.fireErrNear) * Math.min(1, d / R.fireContactRange);
          const err = base * (info.softOnly && !info.see ? R.fireErrConcealedMul : 1);
          const ang = Math.random() * Math.PI * 2;
          st.errVec = { x: Math.sin(ang) * err, z: Math.cos(ang) * err };
          st._errDone = true;
        }
        this._queueRadio(other, shooter);
        // 怀疑度注入（§5.5）：开火声 → 快照位（含误差）加热
        this.suspicion.add(st.lastKnownPos.x + (st.errVec ? st.errVec.x : 0),
          st.lastKnownPos.z + (st.errVec ? st.errVec.z : 0), 1.5);
      }
    }
  }

  // ── AI 被击穿告警：立即获得大致方位（弹着方向可判读） ──
  notifyContact(observer, target) {
    if (observer.destroyed || target.destroyed) return;
    const st = this._st(observer, target);
    if (st.level >= 2) return;
    if (st.level < 1) { st.level = 1; st.contactAge = 0; }
    st.suspectTimer = Math.max(st.suspectTimer, R.fireContactTime + 1);
    st.lostContact = false;
    st.lastKnownPos = target.pos.clone();
    st.lastKnownHeading = target.heading;
    if (!st.errVec) {
      const ang = Math.random() * Math.PI * 2, err = (R.fireErrNear + R.fireErrFar) / 2;
      st.errVec = { x: Math.sin(ang) * err, z: Math.cos(ang) * err };
      st._errDone = true;
    }
    this.suspicion.add(st.lastKnownPos.x + st.errVec.x, st.lastKnownPos.z + st.errVec.z, 1.2);   // 被击弹向加热
    this._queueRadio(observer, target);
  }

  // ── 电台共享：一辆 AI 获得接触 → 延迟 2~4s 通报其余 AI（位置误差更大） ──
  _queueRadio(observer, target) {
    if (!target.isPlayer) return;
    const st = this._st(observer, target);
    if (st.radioQueued) return;
    st.radioQueued = true;
    this.radioQueue.push({
      target,
      at: this.time + R.radioDelayMin + Math.random() * (R.radioDelayMax - R.radioDelayMin),
    });
  }

  _processRadio(tanks) {
    for (let i = this.radioQueue.length - 1; i >= 0; i--) {
      const q = this.radioQueue[i];
      if (this.time < q.at) continue;
      this.radioQueue.splice(i, 1);
      if (q.target.destroyed) continue;
      for (const t of tanks) {
        if (t.isPlayer || t.destroyed) continue;
        const st = this._st(t, q.target);
        if (st.level > 0) continue;                 // 已有自主接触，不覆盖
        st.level = 1; st.contactAge = 0;
        st.suspectTimer = R.fireContactTime + 2;    // 通报信息维持稍久
        st.lostContact = false;
        st.lastKnownPos = q.target.pos.clone();
        st.lastKnownHeading = q.target.heading;
        const ang = Math.random() * Math.PI * 2, err = R.fireErrFar * R.radioErrMul;
        st.errVec = { x: Math.sin(ang) * err, z: Math.cos(ang) * err };
        st._errDone = true;
        st.radioQueued = true;                      // 二次通报不再扩散
        this.suspicion.add(st.lastKnownPos.x + st.errVec.x, st.lastKnownPos.z + st.errVec.z, 0.6);   // 电台通报加热
      }
    }
  }

  // ── AI 光学确认 dwell（§3.5）：疑似接触 → AI 停车指向疑似扇形持续观测 → 确认 ──
  // 触发/停车/指向由 AI 行为层保证（本函数只做判定）：目标须在疑似扇形内
  // （中心=aimPos 含误差，半宽随 errVec 收敛）、LOS 可见、距离 ≤ 角色 dwellRange × tgtK；
  // softOnly 时所需时间 ×1.5。4s 无进展 → 该目标 30s 冷却（行为层应退避原推进逻辑）。
  aiDwell(dt, observer, target) {
    const st = this._st(observer, target);
    const idle = { active: false, progress: 0, done: false, cooldown: false };
    if (st.level !== 1 || target.destroyed) { st.aiDwellT = 0; return idle; }
    if (st.dwellCdUntil && this.time < st.dwellCdUntil) return { ...idle, cooldown: true };
    const ap = this.contactInfo(observer, target).aimPos;
    if (!ap) { st.aiDwellT = 0; return idle; }
    const prof = this._roleOf(observer.cfg);
    const d = Math.hypot(ap.x - observer.pos.x, ap.z - observer.pos.z);
    if (d > prof.dwellRange * this._tgtK(target, false)) { st.aiDwellT = 0; return { ...idle, outOfRange: true }; }
    // 扇形判定：目标真实位置 vs 疑似扇形（中心 aimPos，半宽 = 误差角 + 目标角尺寸 + 基础 0.05 rad）
    const ty = Math.atan2(target.pos.x - observer.pos.x, target.pos.z - observer.pos.z);
    const sy = Math.atan2(ap.x - observer.pos.x, ap.z - observer.pos.z);
    let dyaw = ty - sy;
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const dTrue = Math.hypot(target.pos.x - observer.pos.x, target.pos.z - observer.pos.z) || 1;
    const errMag = st.errVec ? Math.hypot(st.errVec.x, st.errVec.z) : 0;
    const halfW = Math.atan((errMag + 2.6) / dTrue) + 0.05;
    const info = this.losDetail(observer, target);
    if (Math.abs(dyaw) > halfW || (!info.see && !info.softOnly)) {
      // 目标不在观测扇形（已换位/被硬遮挡）→ 累积较快消退，4s 无进展进冷却
      st.aiDwellT = Math.max(0, (st.aiDwellT || 0) - dt * 2);
      st.dwellFailT = (st.dwellFailT || 0) + dt;
      if (st.dwellFailT >= 4) { st.dwellCdUntil = this.time + 30; st.dwellFailT = 0; st.aiDwellT = 0; return { ...idle, cooldown: true }; }
      return { ...idle, active: true };
    }
    st.dwellFailT = 0;
    const need = info.see ? prof.dwellTime : prof.dwellTime * 1.5;
    st.aiDwellT = (st.aiDwellT || 0) + dt;
    if (st.aiDwellT >= need) {
      this._confirm(st, observer, target);
      st.aiDwellT = 0; st.dwellCdUntil = null;
      return { active: true, progress: 1, done: true, cooldown: false };
    }
    return { active: true, progress: st.aiDwellT / need, done: false, cooldown: false };
  }

  // ── 玩家主动侦查：望远镜/瞄准镜持续照射 → 确认点亮（角色 dwellRange × tgtK 上限，§3.12） ──
  playerDwell(dt, player, enemies, aimDir, opticsActive) {
    if (!player || player.destroyed) return;
    const dwellCap = this._roleOf(player.cfg).dwellRange;
    for (const e of enemies) {
      if (e.destroyed) continue;
      const st = this._st(player, e);
      if (st.level >= 2 || !opticsActive) { st.dwellT = 0; continue; }
      const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > dwellCap * this._tgtK(e, false)) { st.dwellT = 0; continue; }
      // 角偏差：瞄准线 vs 目标方向（含俯仰）
      const ty = (e.root.position.y + 1.6) - (player.root.position.y + 2.4);
      const dl = Math.sqrt(dx * dx + ty * ty + dz * dz) || 1;
      const dot = (dx * aimDir.x + ty * aimDir.y + dz * aimDir.z) / dl;
      const ang = Math.acos(Math.min(1, Math.max(-1, dot)));
      const tol = R.dwellTol + Math.atan(2.6 / dist);   // 目标角尺寸补偿
      if (ang > tol) { st.dwellT = Math.max(0, st.dwellT - dt * 3); continue; }   // 移出快速消退
      const info = this.losDetail(player, e);
      if (!info.see && !info.softOnly) { st.dwellT = 0; continue; }   // 硬遮挡后无法确认
      const need = info.see ? R.dwellTime : R.dwellTimeConcealed;
      st.dwellT += dt;
      if (st.dwellT >= need) { this._confirm(st, player, e); st.dwellT = 0; }
    }
  }

  // ── 视线三分：see=完全通畅 / softOnly=仅灌木类软遮挡遮蔽 / 否则不通 ──
  losDetail(a, b) {
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    if (Math.hypot(dx, dz) > R.sightRangeHard) return { see: false, softOnly: false };
    const ay = this._gy(a.pos.x, a.pos.z) + a.cfg.dims.hullHeight + 0.5;
    const by = this._gy(b.pos.x, b.pos.z) + b.cfg.dims.hullHeight + 0.5;
    if (this._los(a.pos.x, a.pos.z, ay, b.pos.x, b.pos.z, by, false, true)) return { see: true, softOnly: false };
    if (this._los(a.pos.x, a.pos.z, ay, b.pos.x, b.pos.z, by, false, false)) return { see: false, softOnly: true };
    return { see: false, softOnly: false };
  }

  // ── 旧接口：完整 LOS（含软遮挡），距离上限 sightRangeHard ──
  canSee(a, b) { return this.losDetail(a, b).see; }

  // ── M2：从任意点（指定眼高）能否看到目标坦克（掩体评分用；无距离上限，调用方自控） ──
  canSeePoint(x, z, eyeH, target) {
    const by = this._gy(target.pos.x, target.pos.z) + target.cfg.dims.hullHeight + 0.5;
    return this._los(x, z, eyeH, target.pos.x, target.pos.z, by, false, true);
  }

  // ── 视线核心：地形步进 + 障碍圆 + 软遮挡（可选） + 烟雾 ──
  _los(ax, az, ay, bx, bz, by, smokeIgnore, includeSoft) {
    // 地形步进遮挡检测（>800m 步进放宽到 8m——远距判定对精度无感，§3.11 性能预算）
    const dist = Math.hypot(bx - ax, bz - az);
    const step = dist > 800 ? TERRAIN_STEP * 2 : TERRAIN_STEP;
    const steps = Math.ceil(dist / step);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t;
      if (this._gy(x, z) > y) return false;
    }

    // 障碍物遮挡检测（仅检查线段附近的；0.3m 余量——可以小不能大，避免边缘空气墙）
    // 高度判定：障碍带 topY 时，射线在最近接近点处高于顶 +0.15m → 越过不挡
    //（坡上看坡下灌木/低石不再被误挡；无 topY 的旧障碍保持原行为）
    for (const obs of this.obstacles) {
      const t = this._segCircleT(ax, az, bx, bz, obs.x, obs.z, obs.r + 0.3);
      if (t < 0) continue;
      if (obs.topY !== undefined && ay + (by - ay) * t > obs.topY + 0.15) continue;
      return false;
    }

    // 软视线遮挡（灌木丛，挡视线不挡移动；concealment 判定时可跳过；同 topY 高度规则）
    // 空间网格聚集：只测视线段附近候选（语义与原全表一致）
    if (includeSoft) {
      const cands = this.world.gatherSight
        ? this.world.gatherSight(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz))
        : this.sightBlockers;
      for (const b of cands) {
        const t = this._segCircleT(ax, az, bx, bz, b.x, b.z, b.r);
        if (t < 0) continue;
        if (b.topY !== undefined && ay + (by - ay) * t > b.topY + 0.15) continue;
        return false;
      }
    }

    // 烟雾云遮挡检测
    if (this.smoke && !smokeIgnore && this.smoke.isBlocked({ x: ax, z: az }, { x: bx, z: bz })) return false;

    return true;
  }

  // 线段与圆相交判定（2D），返回最近接近点参数 t（未相交返回 -1）
  _segCircleT(ax, az, bx, bz, cx, cz, r) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return -1;
    const t = ((cx - ax) * dx + (cz - az) * dz) / len2;
    if (t < 0 || t > 1) return -1;
    const px = ax + dx * t, pz = az + dz * t;
    return (px - cx) * (px - cx) + (pz - cz) * (pz - cz) < r * r ? t : -1;
  }

  // 线段与圆相交判定（2D）
  _segCircleHit(ax, az, bx, bz, cx, cz, r) {
    return this._segCircleT(ax, az, bx, bz, cx, cz, r) >= 0;
  }

  // 角色剖面缓存（roleProfile 按 cfg 对象缓存；全车间 cfg 共享引用）
  _roleOf(cfg) {
    if (!this._roleCache) this._roleCache = new WeakMap();
    let p = this._roleCache.get(cfg);
    if (!p) { p = roleProfile(cfg); this._roleCache.set(cfg, p); }
    return p;
  }

  // 角色自动确认系数（双方观察者通用）
  _roleAutoK(observer) {
    return this._roleOf(observer.cfg).autoConfirmK || 1;
  }

  // 观察者修正 obsK（§3.7）：车长/通讯员（spotMult 死代码启用）× 观瞄模块，综合下限 obsFloor
  _obsK(observer) {
    const opt = observer.moduleState ? observer.moduleState('optics') : 2;
    const optK = opt === 0 ? R.opticsDeadK : opt === 1 ? R.opticsDamagedK : 1;
    const crew = observer.spotMult ? observer.spotMult() : 1;
    return Math.max(R.obsFloor, crew * optK);
  }

  // tgtK 目标修正（§3.6，乘在察觉与确认距离上）：开火窗口 ×1.5 / 重型车体 ×1.15（hullFront≥100）
  // / 低矮车体 ×0.85（turretTop<2.4：四号歼击车 1.95、黄鼠狼 2.3）/ 埋伏态 ×0.8 / hull-down ×0.5
  _tgtK(target, hd) {
    let k = 1;
    if (this.time - (target._lastFireAt || -1e9) <= R.tgtFireWindow) k *= R.tgtFireK;
    if (target.cfg.armor && target.cfg.armor.hullFront >= 100) k *= R.tgtHeavyK;
    if (target.cfg.dims && target.cfg.dims.turretTop < 2.4) k *= R.tgtLowK;
    if ((target._stillT || 0) >= R.ambushStillTime) k *= R.tgtAmbushK;
    if (hd) k *= R.tgtHullDownK;
    return k;
  }

  // hull-down 判定：目标炮塔顶可见（车体被地形/障碍遮蔽时的部分可见；确认距离 ×0.5）
  _turretVisible(a, b) {
    const ay = this._gy(a.pos.x, a.pos.z) + a.cfg.dims.hullHeight + 0.5;
    const by = this._gy(b.pos.x, b.pos.z) + (b.cfg.dims.turretTop || 2.5) * 0.85;
    return this._los(a.pos.x, a.pos.z, ay, b.pos.x, b.pos.z, by, false, true);
  }

  // 确认延迟（§3.8）：casemate 固定 detectDelay（车体已预瞄）；turreted 目标在炮塔朝向
  // ±turretInArc 内 → detectDelay（0.5s，已指向），之外 → turretOutDelay（1.2s，先发现后转塔）
  _confirmDelay(a, b) {
    if (a.cfg.casemate) return R.detectDelay;
    const turYaw = (a.heading || 0) + (a.turretYaw || 0);
    const tyaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    let dyaw = tyaw - turYaw;
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    return Math.abs(dyaw) <= R.turretInArc * Math.PI / 180 ? R.detectDelay : R.turretOutDelay;
  }

  // 自动确认圈（第 2 层 A）：基准（目标静止 500/移动 700）× 角色 autoConfirmK（双方）
  // × AI 难度 obsK（仅 AI 观察者）× 观察者 obsK（乘员/观瞄，双方）；仅软遮挡时压到 autoConcealed
  _autoRange(observer, target, info) {
    let r = Math.abs(target.speed) > R.movingSpeed ? R.autoMoving : R.autoStationary;
    r *= this._roleAutoK(observer);
    if (!observer.isPlayer) r *= this.profileOf(observer).obsK || 1;
    r *= this._obsK(observer);
    if (info && info.softOnly && !info.see) r = Math.min(r, R.autoConcealed);
    return r;
  }

  _confirm(st, observer, target) {
    st.level = 2;
    st.spotTimer = R.spotHold;
    st.suspectTimer = 0;
    st.lostContact = false;
    st.detecting = false;
    st.errVec = null;
    st.lastKnownPos = target.pos.clone();
    st.lastKnownHeading = target.heading;
    if (!observer.isPlayer) this._queueRadio(observer, target);
  }

  // ── 每帧更新 ──
  update(dt, tanks) {
    this.time += dt;
    this.timer += dt;
    this.suspicion.update(dt);

    // 埋伏态计时（§3.6：静止 ≥ambushStillTime → tgtK×0.8）
    for (const t of tanks) t._stillT = Math.abs(t.speed) <= R.movingSpeed ? (t._stillT || 0) + dt : 0;

    // 电台通报到期处理
    this._processRadio(tanks);

    // 低频视线检测
    if (this.timer >= R.detectInterval) {
      this.timer = 0;
      this._detect(tanks);
    }

    // 每帧状态衰减
    for (const [obs, m] of this.pairs) {
      for (const [tgt, st] of m) {
        if (tgt.destroyed) { st.level = 0; st.lostContact = false; continue; }
        if (st.level === 2) {
          st.spotTimer -= dt;
          if (st.spotTimer <= 0) {          // 失去确认 → 失联（保留最后已知位置）
            st.level = 0;
            st.lostContact = true;
            st.lostTimer = R.lostDuration;
            st.errVec = null; st._errDone = false; st.radioQueued = false;
          }
        } else if (st.level === 1) {
          st.suspectTimer -= dt;
          if (st.suspectTimer <= 0) {       // 疑似消退 → 短暂失联灰标
            st.level = 0;
            st.lostContact = true;
            st.lostTimer = R.lostDuration * 0.7;
            st.errVec = null; st._errDone = false; st.radioQueued = false;
          }
        }
        st.contactAge = st.level > 0 ? st.contactAge + dt : 0;
        if (st.lostTimer > 0) {
          st.lostTimer -= dt;
          if (st.lostTimer <= 0) st.lostContact = false;
        }
      }
    }

    this._syncLegacy(tanks);
  }

  // ── 视线检测核心（每 detectInterval 调用；只处理敌对互观察对） ──
  _detect(tanks) {
    const alive = tanks.filter(t => !t.destroyed);

    for (const a of alive) {
      for (const b of alive) {
        if (a === b) continue;
        if (!!a.isPlayer === !!b.isPlayer) continue;   // 敌车间不互点亮（无友军 AI）
        const st = this._st(a, b);
        const d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
        const info = this.losDetail(a, b);
        // 完全可见，或仅软遮挡且已进入抵近确认圈，或 hull-down（炮塔顶可见车体被遮，§3.6 ×0.5）
        let visible = info.see || (info.softOnly && d <= R.autoConcealed);
        let hd = false;
        if (!visible && d <= R.sightRangeHard) {
          hd = this._turretVisible(a, b);
          if (hd) visible = true;
        }
        const tK = this._tgtK(b, hd);
        // 扇形视野（§3.8）：casemate 观察者——目标在车头前向 ±casemateFrontArc 之外 → 察觉/确认距离 ×0.5
        let sectorK = 1;
        if (a.cfg.casemate) {
          const tyaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
          let syaw = tyaw - a.heading;
          while (syaw > Math.PI) syaw -= 2 * Math.PI;
          while (syaw < -Math.PI) syaw += 2 * Math.PI;
          if (Math.abs(syaw) > R.casemateFrontArc * Math.PI / 180) sectorK = R.casemateSideK;
        }
        const autoR = this._autoRange(a, b, info) * tK * sectorK;
        const inAuto = visible && d <= autoR;

        if (st.level === 2) {
          // 已确认目标：LOS + 硬上限内即可维持跟踪（已捕获目标可追溯至更远超自动圈）
          if (visible && d <= R.sightRangeHard) {
            st.spotTimer = R.spotHold;
            if (st.lastKnownPos) st.lastKnownPos.copy(b.pos); else st.lastKnownPos = b.pos.clone();
            st.lastKnownHeading = b.heading;
          }
          // 否则 spotTimer 在 update 中衰减 → 失联
          continue;
        }

        // ── 第 1 层：察觉 → 疑似（按目标行为分档 ×tgtK：移动 detectMove / 静止 detectStationary） ──
        // 静则隐、动则现；AI 侧快照带远距察觉误差（fireErrFar），玩家侧真实位置
        const detectR = (Math.abs(b.speed) > R.movingSpeed ? R.detectMove : R.detectStationary) * tK * sectorK;
        const detected = visible && d <= detectR;
        if (detected && st.level < 1) {
          st.level = 1; st.contactAge = 0;
          if (st.lastKnownPos) st.lastKnownPos.copy(b.pos); else st.lastKnownPos = b.pos.clone();   // 先落快照（suspicion 注入依赖）
          st.lastKnownHeading = b.heading;
          if (!a.isPlayer) {
            if (!st.errVec) {
              const ang = Math.random() * Math.PI * 2;
              st.errVec = { x: Math.sin(ang) * R.fireErrFar, z: Math.cos(ang) * R.fireErrFar };
              st._errDone = true;
            }
            this._queueRadio(a, b);   // 一辆 AI 察觉 → 电台通报其余 AI
            this.suspicion.add(st.lastKnownPos.x + st.errVec.x, st.lastKnownPos.z + st.errVec.z, 0.8);   // 察觉加热
          }
        }
        if (detected && st.level === 1) {
          st.suspectTimer = Math.max(st.suspectTimer, R.spotHold);
          if (st.lastKnownPos) st.lastKnownPos.copy(b.pos); else st.lastKnownPos = b.pos.clone();
          st.lastKnownHeading = b.heading;
        }

        // ── 第 2 层 A：自动确认圈（基准 ×角色 ×难度 ×tgtK ×扇形；延迟确认，延迟按炮塔朝向分档） ──
        if (inAuto) {
          if (st.detecting) {
            st.detectTimer -= R.detectInterval;
            if (st.detectTimer <= 0) this._confirm(st, a, b);
          } else {
            st.detecting = true;
            st.detectTimer = this._confirmDelay(a, b);
          }
        } else {
          st.detecting = false;
        }
      }
    }
  }

  // ── 成对接触查询（AI 用） ──
  contactInfo(observer, target) {
    const m = this.pairs.get(observer);
    const st = m && m.get(target);
    if (!st) return { level: 0, spotted: false, suspected: false, lost: false, aimPos: null, speed: 0, heading: 0, reactReady: true };
    const spotted = st.level === 2;
    const suspected = st.level === 1;
    let aimPos = null;
    if (spotted) aimPos = target.root.position;
    else if (st.lastKnownPos) {
      aimPos = (!observer.isPlayer && st.errVec)
        ? { x: st.lastKnownPos.x + st.errVec.x, y: st.lastKnownPos.y, z: st.lastKnownPos.z + st.errVec.z }
        : st.lastKnownPos;
    }
    const prof = observer.isPlayer ? { reactDelay: 0 } : this.profileOf(observer);
    return {
      level: st.level, spotted, suspected, lost: st.lostContact,
      aimPos,
      speed: spotted ? target.speed : 0,
      heading: spotted ? target.heading : (st.lastKnownHeading || 0),
      reactReady: st.contactAge >= prof.reactDelay,
    };
  }

  isSpotted(observer, target) {
    const m = this.pairs.get(observer);
    const st = m && m.get(target);
    return st ? st.level === 2 : false;
  }

  isSuspected(observer, target) {
    const m = this.pairs.get(observer);
    const st = m && m.get(target);
    return st ? st.level === 1 : false;
  }

  // 玩家被敌发现程度：0 未暴露 / 1 有敌疑似 / 2 已被确认（HUD 暴露警示）
  playerExposure() { return this._playerExposure; }

  // ── 兼容字段同步：敌车 = 玩家观察通道；玩家 = 被敌发现程度 ──
  _syncLegacy(tanks) {
    const player = tanks.find(t => t.isPlayer);
    if (!player) return;
    const pm = this.pairs.get(player);
    for (const t of tanks) {
      if (t === player) continue;
      const st = pm && pm.get(t);
      const lv = st ? st.level : 0;
      t.spotted = lv === 2;
      t.suspected = lv === 1;
      t.lostContact = st ? st.lostContact : false;
      t.lastKnownPos = st ? st.lastKnownPos : null;
      t.lastKnownHeading = st ? st.lastKnownHeading : 0;
    }
    let maxLv = 0;
    for (const t of tanks) {
      if (t.isPlayer || t.destroyed) continue;
      const m = this.pairs.get(t);
      const st = m && m.get(player);
      if (st) maxLv = Math.max(maxLv, st.level);
    }
    player.spotted = maxLv === 2;      // 语义改为「被任意敌车确认锁定」
    this._playerExposure = maxLv;
  }

  dispose() {
    this.pairs.clear();
    this.profiles.clear();
    this.radioQueue.length = 0;
    this.suspicion.dispose();
    this._playerExposure = 0;
    this.time = 0;
    this.timer = 0;
  }
}

export { VisibilityManager };
