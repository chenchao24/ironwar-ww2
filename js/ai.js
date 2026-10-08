// ═══ 敌方坦克 AI：难度分级 / 交战机动 / 弱点瞄准 / 弹种选择 / 消耗品 / 重创撤退（乘员+模块制） ═══
import * as THREE from 'three';
import { SHELL_TYPES, AI_MG_RULES, mgFalloff, GAME, DAMAGE_RULES } from './config.js';
import { wrapAngle } from './tank.js';
import { AI_DIFFICULTY } from './ai/difficulty.js';
import { doctrineOf } from './ai/doctrine.js';
import { roleProfile } from './ai/roles.js';

export { AI_DIFFICULTY };   // 兼容旧引用（难度表已迁至 js/ai/difficulty.js）

const _v = new THREE.Vector3();
const _vA = new THREE.Vector3();   // AI 机枪专用临时向量（aim）
const _vB = new THREE.Vector3();   // muzzle
const _vC = new THREE.Vector3();   // dir
const _vD = new THREE.Vector3();   // 命中球心 / point
const _vE = new THREE.Vector3();   // 投影临时

export class TankAI {
  constructor(tank, difficulty = 'standard') {
    this.tank = tank;
    this.diff = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.standard;
    this.state = 'patrol';
    this.aimError = new THREE.Vector3();
    this.errorTimer = 0;
    this.fireHesitation = this.diff.hesitMax;
    this.waypoint = null;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    // ── 弹种决策 ──
    this.shellTimer = 1.5;
    this._wantShell = 'ap';
    this._wantCount = 99;
    // ── 周旋 ──
    this.evadeTimer = 0;
    // ── 短停射击 / 开火后位移 ──
    this._stopT = 0;
    this._dashT = 0;
    this._dashDir = 1;
    this._scootT = 0;              // 歼击车 shoot&scoot 首段直线倒车（§4.2）
    // ── 掩体系统 ──
    this._strafeDir = Math.random() < 0.5 ? 1 : -1;
    this._tiltAng = 0.55;
    this.visibility = null;
    this.coverState = null;    // null | 'moving' | 'holding' | 'peeking'
    this.coverPt = null;
    this._peekOrigin = null;
    this._lastBehavior = '';
    this._sameCount = 0;
    this._justHit = false;
    this._lastCrew = -1;       // 受击侦测：乘员数下降 = 被击穿
    this._lastModules = -1;    // 模块总健康度
    this._shellSwitchCd = 0;
    this._evadeCd = 0;
    this._evadeGoal = null;
    // ── 消耗品反应延时 ──
    this.burnReactT = 0;
    this.trackReactT = 0;
    this.moduleReactT = 0;
    // ── 巡逻炮塔扫掠相位 ──
    this.scanPhase = Math.random() * Math.PI * 2;
    // ── 自动机枪 ──
    this.mgReactT = -1;
    this.mgBurst = 0;
    this.mgPauseT = 0;
    this.onMGHit = null;
    // ── 搜索/节奏总监（WP6，docs/ai-redesign-plan.md §8.1） ──
    this._visited = new Set();       // 已访 POI（对象引用）
    this._searchPoi = null;
    this._observeT = 0;              // 到位观察停留
    this._noContactT = 0;            // 无确认接触总时长（节奏升级依据）
    this._searchLevel = 0;
    this._pushZone = null;           // L3 持续 45s 后的敌整备区推进点（§8.1）
    this._l3T = null;                // L3 起始时刻（无接触时长基线）
    this.platoon = null;             // P2 排级钩子（预留）
    this.order = null;               // 排级指令（platoon.js 每帧下发）
    // ── 状态机超时/降级（§8.2） ──
    this._battleT = 0;
    this._lastFireT = 0;
    this._fireDead = false;          // 火力丧失（炮闩损毁且修理耗尽）
    this._blockedShots = 0;          // 连续被掩体吃掉的发数
    this._holdWaitT = 0;
    this._peekNoFireT = 0;
    this._evadeNoGain = 0;
    // ── 独狼装配：角色 + 阵营 doctrine（WP6 浅接线，P2 排级深化） ──
    this._role = null;
    this._doctrine = null;
    this._preferRange = this.diff.preferRange;
  }

  // 重创判定：乘员损失过半 / 起火 / 发动机损毁 / 炮闩损毁 → 触发撤退周旋
  _heavilyDamaged(t) {
    return t.crewAlive() <= 2 || t.burning > 0 ||
      t.moduleState('engine') === 0 || t.moduleState('breech') === 0;
  }

  update(dt, player, shells, effects, audio, visibility) {
    const t = this.tank;
    if (t.destroyed || player.destroyed) {
      if (t.destroyed) t.drive(dt, 0, 0);
      return;
    }
    this.visibility = visibility || this.visibility;
    this._battleT += dt;
    // 独狼装配（惰性）：角色剖面 + 阵营 doctrine（新兵档 doctrine 关闭）
    if (!this._role) {
      this._role = roleProfile(t.cfg);
      this._doctrine = this.diff.useDoctrine ? doctrineOf(t.cfg.nation) : null;
      this._preferRange = this.diff.preferRange * (this._role.preferRangeK || 1) * (this._doctrine ? this._doctrine.preferRangeK : 1);
    }

    // 受击侦测：乘员减少 / 模块健康下降 → 中断 peek + 提高找掩体概率 + 立即获得大致方位
    const crewNow = t.crewAlive();
    if (this._lastCrew >= 0 && crewNow < this._lastCrew) {
      this._justHit = true;
      if (this.visibility) this.visibility.notifyContact(t, player);   // 被击穿 → 疑似接触（弹向可判读）
      if (this.coverState === 'peeking') this.coverState = 'moving';
      else if (!this.coverState && this.diff.coverUse) this._postFireDecision(player);
    }
    this._lastCrew = crewNow;
    if (this._evadeCd > 0) this._evadeCd -= dt;

    // ── 消耗品：起火即灭火（0.8s 反应）；断履带/模块损毁 -> 维修 ──
    if (this.diff.useConsumables) this._useConsumables(dt, player);

    // ── 成对接触状态（本车 → 玩家）：确认点亮 / 疑似接触 / 失联 / 未发现 ──
    const ci = this.visibility ? this.visibility.contactInfo(t, player)
      : { level: player.spotted ? 2 : 0, spotted: !!player.spotted, suspected: false,
          lost: !!player.lostContact, aimPos: player.root.position,
          speed: player.speed || 0, heading: player.heading || 0, reactReady: true };
    this._ci = ci;
    if (ci.level > 0) this._noContactT = 0; else this._noContactT += dt;   // 节奏总监计时

    // ── 未发现玩家：POI 链搜索 + 炮塔扫掠（节奏总监 L0~L3；docs §8.1，已删除全图感知） ──
    if (!ci.spotted && !ci.suspected && !ci.lost) {
      this.state = 'search';
      this.coverState = null;
      this._searchMove(dt);
      this._scanTurret(dt);
      t.updateFireControl(dt);
      return;
    }

    // ── 疑似接触（炮声/电台通报/被击中）：转向声源方位戒备搜索，不开火 ──
    // fleeOnConfirm 被击穿即撤（§6.6：疑似/失联态同样生效——被击告警本就只给疑似）
    if (this._role && this._role.fleeOnConfirm && this._justHit && this.diff.evade &&
        this.evadeTimer <= 0 && this._evadeCd <= 0) {
      const fap = ci.aimPos || player.root.position;
      const fd = Math.hypot(fap.x - t.pos.x, fap.z - t.pos.z);
      if (fd < this.diff.engageRange * 1.2) this._startEvade(player);
    }
    // 撤退机动优先：疑似/失联态下已启动 evade → 直接执行（spotted 态走交战段入口）
    if (this.evadeTimer > 0 && !ci.spotted) {
      const eap = ci.aimPos || player.root.position;
      const eYaw = Math.atan2(eap.x - t.pos.x, eap.z - t.pos.z);
      const eDist = Math.hypot(eap.x - t.pos.x, eap.z - t.pos.z);
      const ed = this._evadeDrive(dt, eYaw, eDist, player);
      this._driveWithUnstick(dt, ed.throttle, ed.steer, eYaw);
      _v.set(t.pos.x + Math.sin(eYaw) * 200, t.pos.y + 1.6, t.pos.z + Math.cos(eYaw) * 200);
      t.aimAt(_v);
      t.updateTurret(dt);
      t.updateFireControl(dt);
      return;
    }
    // 反应延迟内原地警戒（拟真：遭遇伏击的判读时间）；就绪后谨慎推进以求目视确认
    if (ci.suspected && !ci.spotted) {
      this.state = 'alert';
      this.coverState = null;
      const ap = ci.aimPos || player.root.position;
      this.scanPhase += dt * 0.9;
      const searchYaw = Math.atan2(ap.x - t.pos.x, ap.z - t.pos.z) + Math.sin(this.scanPhase) * 0.22;
      _v.set(t.pos.x + Math.sin(searchYaw) * 200, t.pos.y + 1.6, t.pos.z + Math.cos(searchYaw) * 200);
      t.aimAt(_v);
      t.updateTurret(dt);
      if (ci.reactReady) {
        const dAp = Math.hypot(ap.x - t.pos.x, ap.z - t.pos.z);
        const alertR = this.visibility ? this.visibility.profileOf(t).alertRange : 700;
        const o = this.order;
        if (o && o.type === 'hold') {
          // 排级原地戒备（德伏击扇面/美英压制车，§5.2-2）：casemate 先摆车体朝向威胁，再停车细搜 + dwell
          this._alertHold(dt, searchYaw);
          if (this.visibility && this.diff.useDwell && doctrineOf(t.cfg.nation).dwellHabit !== 'never') {
            this.visibility.aiDwell(dt, t, player);
          }
        } else if (o && o.type === 'charge') {
          // 排级冲锋（苏 doctrine 全队 / 美英侦查单元）：直接向声源推进
          const { throttle, steer } = this._driveToward(searchYaw, dt, 0.9);
          this._driveWithUnstick(dt, throttle, steer, searchYaw);
        } else if (dAp > alertR * 0.8) {
          const { throttle, steer } = this._driveToward(searchYaw, dt, 0.45);
          this._driveWithUnstick(dt, throttle, steer, searchYaw);
        } else {
          this._alertHold(dt, searchYaw);   // 已进入警戒圈边缘：casemate 摆车体 + 停车细搜
          // 光学确认 dwell（§3.5）：难度允许且非苏军（dwellHabit≠never）时持续观测疑似扇形 → 转确认
          if (this.visibility && this.diff.useDwell && doctrineOf(t.cfg.nation).dwellHabit !== 'never') {
            this.visibility.aiDwell(dt, t, player);
          }
        }
      } else this._alertHold(dt, searchYaw);
      t.updateFireControl(dt);
      return;
    }

    // 目标位置：点亮时实时位置，失联时最后已知位置（AI 侧疑似含声源误差，由 alert 分支处理）
    const targetPos = ci.spotted ? player.root.position : (ci.aimPos || player.root.position);
    const targetSpeed = ci.speed;
    const targetHeading = ci.heading;

    // ── 失联：包抄侧翼 ──
    if (!ci.spotted) {
      this.state = 'flank';
      this.coverState = null;
      this._flankMove(dt, targetPos);
      t.updateTurret(dt);
      t.updateFireControl(dt);
      return;
    }
    this.flankWp = null;

    const toPlayer = _v.copy(targetPos).sub(t.root.position);
    const dist = toPlayer.length();
    const dirYaw = Math.atan2(toPlayer.x, toPlayer.z);

    // 修理中断：玩家进入 260m（§6.7）——读条作废，转交战机动
    if (t.repairing && dist < 260) t.cancelRepair();

    // 火力丧失判定（§6.6）：炮闩损毁且修理耗尽 → 直接降级（不必经 holding 超时——从未开火流程不入 holding）
    if (!this._fireDead && t.moduleState('breech') === 0 && (!t.consumables || t.consumables.repair <= 0)) {
      this._fireDead = true;
    }

    // ── 弹种选择 ──
    this._selectShell(dt, player, dist);

    // ── 重创撤退：倒车拉距，优先入掩体 / 脱离视野；fleeOnConfirm（黄鼠狼/克伦威尔）被击穿即撤 ──
    const fleeHit = this._role && this._role.fleeOnConfirm && this._justHit;
    if (this.diff.evade && this.evadeTimer <= 0 && this._evadeCd <= 0 &&
        (this._heavilyDamaged(t) || fleeHit) && dist < this.diff.engageRange * 1.2) {
      this._startEvade(player);
    }

    // ── 机动决策 ──
    let throttle = 0, steer = 0;
    if (this.evadeTimer > 0) {
      ({ throttle, steer } = this._evadeDrive(dt, dirYaw, dist, player));
    } else if (dist > this.diff.engageRange) {
      this.state = 'advance';
      ({ throttle, steer } = this._driveToward(dirYaw, dt, 1));
    } else {
      this.state = 'engage';
      // 歼击车战斗室：横向机动偏航钳制在火炮射界内（钳到弧缘——目标保持在炮口可及范围）
      const arcDeg = t.cfg.casemate ? t.cfg.casemate.arc * Math.PI / 180 : 0;
      const arcLim = arcDeg * 0.6;
      const clampYaw = (yaw) => arcLim ? dirYaw + THREE.MathUtils.clamp(wrapAngle(yaw - dirYaw), -arcLim, arcLim) : yaw;
      const wantStop = this.diff.shortStop && !this._fireDead && t.readyToFire() && dist < this.diff.fireRange;
      // casemate 被绕 panic（§6.3）：目标脱出射界 ×1.2 → 枢轴+倒车甩头对敌，其余机动让位
      const relYaw = arcDeg ? wrapAngle(dirYaw - t.heading) : 0;
      const panic = !!arcDeg && Math.abs(relYaw) > arcDeg * 1.2;
      if (panic) {
        throttle = -0.4;
        steer = THREE.MathUtils.clamp(relYaw * 2.5 * (t.speed < -0.2 ? -1 : 1), -1, 1);
        // 甩头最高优先（§6.3）：清掉进行中的撤退性位移，不与摆车体抢执行权
        this._scootT = 0; this._dashT = 0;
      } else if (this.order && this.order.type === 'flank' && this.order.point) {
        // 排级包抄（§5.2-3）：驶向侧翼包抄点（到位/超时由排级转 'auto'）
        const fYaw = Math.atan2(this.order.point.x - t.pos.x, this.order.point.z - t.pos.z);
        ({ throttle, steer } = this._driveToward(fYaw, dt, 0.9));
      } else if (this.diff.coverUse && this.coverState === 'moving' && this.coverPt) {
        const yaw = Math.atan2(this.coverPt.x - t.pos.x, this.coverPt.z - t.pos.z);
        ({ throttle, steer } = this._driveToward(yaw, dt, 1));
        if (Math.hypot(this.coverPt.x - t.pos.x, this.coverPt.z - t.pos.z) < 5.5) {
          this.coverState = 'holding';
          this._coverStuckT = 0;
        } else {
          this._coverStuckT = (this._coverStuckT || 0) + dt;
          this._coverPosT = (this._coverPosT || 0) + dt;
          if (this._coverPosT > 1.5) {
            const moved = Math.hypot(t.pos.x - (this._coverLastX ?? t.pos.x), t.pos.z - (this._coverLastZ ?? t.pos.z));
            if (moved < 3) { this.coverState = null; this.coverPt = null; this._coverStuckT = 0; }
            this._coverLastX = t.pos.x; this._coverLastZ = t.pos.z; this._coverPosT = 0;
          }
        }
      } else if (this.diff.coverUse && this.coverState === 'holding') {
        throttle = 0; steer = 0;
        if (t.readyToFire()) {
          this.coverState = 'peeking';
          this._peekOrigin = { x: t.pos.x, z: t.pos.z };
          this._peekNoFireT = 0;
          this._holdWaitT = 0;
        } else {
          // 装填上限+2s 仍未就绪（§8.2）：炮闩损毁且修理耗尽 → 火力丧失降级；否则弃位
          this._holdWaitT += dt;
          if (this._holdWaitT > (t.reloadTimeNow ? t.reloadTimeNow() : 8) + 2) {
            if (t.moduleState('breech') === 0 && (!t.consumables || t.consumables.repair <= 0)) this._fireDead = true;
            this.coverState = null;
            this._holdWaitT = 0;
          }
        }
      } else if (this.diff.coverUse && this.coverState === 'peeking') {
        const gy = t.world.groundY(t.pos.x, t.pos.z);
        const seen = this.visibility &&
          this.visibility.canSeePoint(t.pos.x, t.pos.z, gy + t.cfg.dims.turretTop * 0.85, player);
        const advanced = Math.hypot(t.pos.x - this._peekOrigin.x, t.pos.z - this._peekOrigin.z);
        if (seen || advanced >= this.diff.peekMax) {
          this._stopT += dt;
          this._peekNoFireT += dt;
          if (this._peekNoFireT > 6) {   // peek 到位 6s 未开火 → 强制转移（§8.2）
            this._peekNoFireT = 0;
            this.coverState = null;
            this._dashT = 1.5 + Math.random();
            this._dashDir = Math.random() < 0.5 ? 1 : -1;
          }
          throttle = 0;
          const tiltYaw = clampYaw(dirYaw + (this._strafeDir || 1) * 0.45);
          const dyaw = wrapAngle(tiltYaw - t.heading);
          steer = THREE.MathUtils.clamp(dyaw * 1.2 * (t.speed < -0.2 ? -1 : 1), -1, 1);
        } else {
          ({ throttle, steer } = this._driveToward(dirYaw, dt, 0.45));
        }
      } else if (this._scootT > 0) {
        this._scootT -= dt;
        this.state = 'relocate';
        throttle = -0.7;   // scoot 首段：直线倒车，车头保持朝敌（§4.2）
        const sdy = wrapAngle(dirYaw - t.heading);
        steer = THREE.MathUtils.clamp(sdy * 2.2 * (t.speed < -0.2 ? -1 : 1), -1, 1);
        if (this._scootT <= 0) {   // 二段：侧向 dash 完成 15~30m 换位
          this._dashT = 0.8 + Math.random() * 0.7;
          this._dashDir = Math.random() < 0.5 ? 1 : -1;
        }
      } else if (this._dashT > 0) {
        this._dashT -= dt;
        this.state = 'relocate';
        ({ throttle, steer } = this._driveToward(dirYaw + Math.PI / 2 * this._dashDir, dt, 0.8));
      } else if (wantStop) {
        this._stopT += dt;
        throttle = 0; steer = 0;
        if (this._stopT > (this.diff.stopMaxT || 2.5)) {   // 短停超时（§8.2 接线 stopMaxT）
          this._stopT = 0;
          this._dashT = 0.8;
          this._dashDir = Math.random() < 0.5 ? 1 : -1;
        }
      } else {
        this._stopT = 0;
        if (this._fireDead) {
          // 火力丧失降级（§6.6 基本版）：游走吸引——中距横移机动诱敌，不站桩等死
          const strafeYaw = clampYaw(dirYaw + Math.PI / 2 * (this._strafeDir || (this._strafeDir = 1)));
          ({ throttle, steer } = this._driveToward(strafeYaw, dt, 0.55));
          if (Math.random() < dt * 0.3) this._strafeDir *= -1;
        } else if (dist > this._preferRange * 1.25) {
          ({ throttle, steer } = this._driveToward(dirYaw, dt, 0.75));
        } else if (dist < this._preferRange * 0.5) {
          ({ throttle, steer } = this._driveToward(dirYaw + Math.PI * 0.75, dt, 0.5));
        } else if (this._tiltDuelOk() && !this._needFlank) {
          if (this._tiltAng == null) this._tiltAng = this._tiltBase();
          const tiltYaw = clampYaw(dirYaw + this._strafeDir * this._tiltAng);
          let thr = 0.35;
          if (dist > this._preferRange * 1.15) thr = 0.55;
          else if (dist < this._preferRange * 0.8) thr = -0.45;
          const dd = this._driveToward(tiltYaw, dt, Math.abs(thr));
          const mir = t.speed < -0.2 ? -1 : 1;
          throttle = thr;
          steer = THREE.MathUtils.clamp(dd.steer * mir, -1, 1);
          if (Math.random() < dt * 0.12) { this._strafeDir *= -1; this._tiltAng = this._tiltBase() * (0.85 + Math.random() * 0.3); }
        } else {
          const strafeYaw = clampYaw(dirYaw + Math.PI / 2 * (this._strafeDir || (this._strafeDir = Math.random() < 0.5 ? 1 : -1)));
          ({ throttle, steer } = this._driveToward(strafeYaw, dt, this._needFlank ? 0.55 : 0.4));
          if (!this._needFlank && Math.random() < dt * 0.15) this._strafeDir *= -1;
        }
      }
    }
    // 障碍绕行 + 卡住脱困（统一在驾驶出口内）
    this._driveWithUnstick(dt, throttle, steer, dirYaw);

    // ── 瞄准（王牌按弱点选瞄点高度） ──
    this.errorTimer -= dt;
    if (this.errorTimer <= 0) {
      const err = (0.004 + dist * 0.000005) * this.diff.aimErrMul;
      this.aimError.set(
        (Math.random() - 0.5) * err * 2,
        (Math.random() - 0.5) * err * 1.2,
        (Math.random() - 0.5) * err * 2
      );
      this.errorTimer = 0.8 + Math.random() * 0.8;
    }
    // 提前量
    const tof = dist / t.shellVelocityOf();
    const pv = _v.set(Math.sin(targetHeading), 0, Math.cos(targetHeading)).multiplyScalar(targetSpeed * tof * 0.85);
    const aimPoint = new THREE.Vector3().copy(targetPos).add(pv);
    const aimY = this.diff.weakAim ? this._weakAimY(player, dirYaw) : 1.1;
    aimPoint.y += aimY;
    aimPoint.addScaledVector(this.aimError, dist);

    t.aimAt(aimPoint);
    t.updateTurret(dt);
    t.updateFireControl(dt);
    const aligned = t.aimOffset < 0.014;

    // ── 开火（散布未收敛不开火；观瞄受损门槛放宽）──
    if (this.fireHesitation > 0) this.fireHesitation -= dt;
    const optSt = t.moduleState ? t.moduleState('optics') : 2;
    const optK = optSt === 0 ? 4 : optSt === 1 ? 1.8 : 1;
    // 散布门限随拟真 σ 重标定（2026-09-19）：短停 ≤~3σ / 行进 ≤10σ（旧绝对值 0.0024/0.012 已失配）
    // movingFire（M4 垂稳）：行进门限放宽一档 10→15（§6.4）
    const spreadK = this._stopT > 0 ? (this.diff.stopSpreadK || 3) : (this._role && this._role.movingFire ? 15 : 10);
    const spreadOk = t.dispersion < t.cfg.dispersion * spreadK * optK;
    // 弹道遮挡：仅 HE 低频开火拆掩体
    let coverBlocked = false;
    if (this.visibility && this._ci && this._ci.spotted) {
      const gyT = t.world.groundY(t.pos.x, t.pos.z);
      coverBlocked = !this.visibility.canSeePoint(t.pos.x, t.pos.z, gyT + t.cfg.dims.turretTop * 0.85, player);
      if (coverBlocked && this.diff.switchShell && t.shellType !== 'he' && t.shellPool.he > 0 && Math.random() < 0.04) {
        t.switchShell('he');
      }
    }
    // 伏击纪律（§4.1）：casemate 伏击车型（ambusher/sniper）只在目标进入射界 ±arc×0.8 扇面内开火
    let arcFireOk = true;
    if (t.cfg.casemate && this._role && (this._role.role === 'ambusher' || this._role.role === 'sniper')) {
      const arcDegF = t.cfg.casemate.arc * Math.PI / 180;
      arcFireOk = Math.abs(wrapAngle(dirYaw - t.heading)) <= arcDegF * 0.8;
    }
    // 排级开火门（§4.1 狙击延迟 + §5.3 开火时序）与火线纪律（§4.5 炮线锥友军检查）
    let holdFire = !!(this.order && this.order.holdFire);
    if (!holdFire && this.platoon && !this.platoon.fireStaggerOk(this)) holdFire = true;
    let friendlyBlock = false;
    if (this.platoon) {
      for (const m of this.platoon.members) {
        const f = m.tank;
        if (f === t || f.destroyed) continue;
        const fx = f.pos.x - t.pos.x, fz = f.pos.z - t.pos.z;
        const fd = Math.hypot(fx, fz);
        if (fd >= dist) continue;                        // 友军比目标远：不挡
        const dd = Math.abs(wrapAngle(Math.atan2(fx, fz) - dirYaw));
        if (dd < 0.052) { friendlyBlock = true; break; }  // ±3° 炮线锥
      }
    }
    if (friendlyBlock && !this._dashT) {   // 横移让出火线
      this._dashT = 0.8 + Math.random() * 0.6;
      this._dashDir = Math.random() < 0.5 ? 1 : -1;
    }
    if (aligned && spreadOk && this.fireHesitation <= 0 && t.readyToFire() && dist < this.diff.fireRange && arcFireOk && !holdFire && !friendlyBlock) {
      if (coverBlocked && !(t.shellType === 'he' && Math.random() < 0.4)) {
        // 掩体遮挡：不开火
      } else {
      const shot = t.fire();
      if (shot) {
        shells.fire(shot);
        effects.muzzleBlast(shot.pos, shot.dir);
        if (t.world.hedgeField) t.world.hedgeField.muzzleShake(shot.pos);   // 灌木丛 5m 内开火 → 震落尘埃
        {
          const _ev = new THREE.Vector3().copy(t.root.position);
          _ev.y += t.cfg.dims.turretTop + 0.3;
          _ev.addScaledVector(shot.dir, -1.0);
          const _ed = shot.dir.clone();
          const _es = new THREE.Vector3().crossVectors(shot.dir, new THREE.Vector3(0, 1, 0));
          if (_es.lengthSq() < 1e-6) _es.set(1, 0, 0);
          _es.normalize();
          setTimeout(() => { effects.ejectCasing(_ev, _ed, 'cannon', _es); }, 800 + Math.random() * 400);
        }
        const d01 = THREE.MathUtils.clamp(dist / 600, 0, 1);
        audio.playDistantFire(0.7 * (1 - d01 * 0.7));
        this.fireHesitation = this.diff.hesitMin + Math.random() * (this.diff.hesitMax - this.diff.hesitMin);
        if (t.crewState('commander') === 2) this.fireHesitation *= DAMAGE_RULES.crewEffects.commander.deadReact;   // 车长阵亡：反应 +30%
        const planned = (!this.diff.coverUse || !this.coverState || this.coverState === 'peeking') && !coverBlocked;
        this._lastFireT = this._battleT;
        this._peekNoFireT = 0;
        // 车种开火反应（§4.2/§6.4）：scoot（歼击车换位）/ fireAndCover（IS-2 开火必退掩）
        if (this._role) {
          if (this._role.fireAndCover) {
            const pt = (this.diff.coverUse && this.visibility) ? this._bestCoverPt(player) : null;
            if (pt) { this.coverPt = pt; this.coverState = 'moving'; }
            else { this._dashT = 2 + Math.random(); this._dashDir = Math.random() < 0.5 ? 1 : -1; }
          } else if (Math.random() < (this._role.scootChance || 0)) {
            this._scootT = 1.2 + Math.random() * 0.6;   // 首段直线倒车（车头朝敌），随后 dash 完成换位
            this._dashT = 0;
          }
        }
        if (coverBlocked) {
          // 连续 2 发被掩体吃掉 → 强制转移/包抄（§8.2 防 HE 挠痒循环）
          if (++this._blockedShots >= 2) {
            this._blockedShots = 0;
            this.coverState = null;
            this._postFireDecision(player);
          }
        } else this._blockedShots = 0;
        if (planned) {
          this._postFireDecision(player);
        } else {
          this._stopT = 0;
        }
        if (this.onFire) this.onFire(t);
        if (this.platoon) this.platoon.notifyFire(this);   // 开火时序锚点记录（§5.3）
      }
      }
    }

    // engage-hold 超时：12s 无开火 → 重掷战术决策（§8.2）
    if (this.state === 'engage' && !this.coverState && this._battleT - this._lastFireT > 12) {
      this._lastFireT = this._battleT;
      this._postFireDecision(player);
    }

    // ── 自动机枪 ──
    this._updateMG(dt, player, dist, effects, audio);
  }

  // ── AI 自动机枪（外露模块毁伤；参数 AI_MG_RULES） ──
  _updateMG(dt, player, dist, effects, audio) {
    const t = this.tank;
    const R = AI_MG_RULES;
    if (!t.cfg.mg || !t.mgGroup || player.destroyed || !(this._ci && this._ci.spotted) ||
        dist > Math.min(R.range, t.cfg.mg.range)) {
      this.mgReactT = -1; this.mgBurst = 0; this.mgPauseT = 0;
      return;
    }
    const aim = _vA.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
    t.updateMgTurret(dt, aim);
    if (this.mgReactT < 0) this.mgReactT = R.reactMin + Math.random() * (R.reactMax - R.reactMin);
    if (this.mgReactT > 0) {
      this.mgReactT = Math.max(0, this.mgReactT - dt);
      if (this.mgReactT > 0) return;
    }
    if (this.mgPauseT > 0) { this.mgPauseT -= dt; return; }
    if (this.mgBurst <= 0) this.mgBurst = R.burstMin + Math.floor(Math.random() * (R.burstMax - R.burstMin + 1));
    t.mgTimer -= dt;
    if (t.mgTimer > 0 || t.mgAmmo <= 0) return;
    if (!this.visibility || !this.visibility.canSee(t, player)) return;
    t.mgTimer = 1 / t.cfg.mg.rate;
    t.mgAmmo--;
    this.mgBurst--;
    if (this.mgBurst <= 0) this.mgPauseT = R.pauseMin + Math.random() * (R.pauseMax - R.pauseMin);
    const muzzle = _vB, dir = _vC;
    t.getMgMuzzle(muzzle, dir, aim);
    const dd = (t.cfg.mg.dispersion || 0.008) + R.aimErr;
    dir.x += (Math.random() * 2 - 1) * dd;
    dir.y += (Math.random() * 2 - 1) * dd;
    dir.z += (Math.random() * 2 - 1) * dd;
    dir.normalize();
    effects.mgTracer(muzzle, dir, t.cfg.mg.range);
    effects.mgMuzzleFlash(muzzle, dir);
    const v01 = THREE.MathUtils.clamp(1 - dist / 400, 0, 1);
    audio.playMGShot(0.5 * (0.3 + v01 * 0.7));
    const c = _vD.copy(player.root.position); c.y += player.cfg.dims.hullHeight * 0.7;
    const r = Math.max(player.cfg.dims.length, player.cfg.dims.width) * 0.42 + 0.6;
    const ac = _vE.copy(c).sub(muzzle);
    const tt = THREE.MathUtils.clamp(ac.dot(dir), 0, t.cfg.mg.range);
    const point = _vE.copy(muzzle).addScaledVector(dir, tt);
    if (point.distanceToSquared(c) >= r * r) return;
    effects.gunImpact(point, dir, t.mgCaliber);
    const hitDist = muzzle.distanceTo(point);
    const hitK = mgFalloff(hitDist);
    if (hitK > 0 && Math.random() < hitK * R.hitMul) {
      const evs = player.applyMGDamage(hitDist);
      for (const ev of evs) {
        if (this.onMGHit) this.onMGHit(ev.label, point, ev.type);
      }
    }
  }

  // ── 巡逻炮塔扫掠 ──
  _scanTurret(dt) {
    this.scanPhase += dt * 0.4;
    const yaw = Math.sin(this.scanPhase) * 1.05;
    const t = this.tank;
    _v.set(
      t.pos.x + Math.sin(t.heading + yaw) * 100,
      t.pos.y + 1.5,
      t.pos.z + Math.cos(t.heading + yaw) * 100,
    );
    t.aimAt(_v);
    t.updateTurret(dt);
  }

  // ── POI 链搜索 + 节奏总监（§8.1）：无确认接触 45/75/105s 逐级升级 ──
  // L0/L1 沿「推进轴线」（己方出生点→敌半区，advance to contact）偏向最近未访 POI（L1 提速）；
  // L2 地图控制（中心 600m 内高分 POI）；L3 节点梳篦（沿轴线前向）
  _searchMove(dt) {
    const t = this.tank;
    // 排级行军槽位（§5.2-1）：march 指令优先（楔形编队行进），无指令时走个体 POI 链
    if (this.order && this.order.type === 'march' && this.order.point) {
      const d = Math.hypot(this.order.point.x - t.pos.x, this.order.point.z - t.pos.z);
      if (d < 20) { this._driveWithUnstick(dt, 0, 0); return; }   // 到位：保编队
      const yaw = Math.atan2(this.order.point.x - t.pos.x, this.order.point.z - t.pos.z);
      const thr = this._noContactT >= 75 ? 0.9 : 0.8;
      const { throttle, steer } = this._driveToward(yaw, dt, thr);
      this._driveWithUnstick(dt, throttle, steer, yaw);
      return;
    }
    // 履带痕侦查（§5.5）：2s 一扫，附近 200m 内有新鲜玩家履带痕 → 怀疑度注入痕点质心
    if (this.visibility && this.visibility.trackMarks && this.visibility.suspicion) {
      this._trackScanT = (this._trackScanT || 0) - dt;
      if (this._trackScanT <= 0) {
        this._trackScanT = 2;
        const trs = this.visibility.trackMarks.recentTracks(t.pos.x, t.pos.z, 200, 60);
        if (trs.length) {
          const cx = trs.reduce((s, m) => s + m.x, 0) / trs.length;
          const cz = trs.reduce((s, m) => s + m.z, 0) / trs.length;
          this.visibility.suspicion.add(cx, cz, 0.5);
        }
      }
    }
    const pois = (this.visibility && this.visibility.pois) || [];
    // 推进轴线：出生点 → 地图中心并延伸至敌半区（军队知道前线方向，不给玩家精确坐标）
    if (!this._advanceAxis) {
      const l = Math.hypot(t.pos.x, t.pos.z) || 1;
      this._advanceAxis = { x: -t.pos.x / l, z: -t.pos.z / l };
    }
    const ax = this._advanceAxis;
    const nc = this._noContactT;
    const level = nc >= 105 ? 3 : nc >= 75 ? 2 : nc >= 45 ? 1 : 0;
    this._searchLevel = level;
    // 到位观察停留（2~3.5s）
    if (this._observeT > 0) {
      this._observeT -= dt;
      this._driveWithUnstick(dt, 0, 0);
      return;
    }
    // 当前目标到达判定
    if (this._searchPoi) {
      const d = Math.hypot(this._searchPoi.x - t.pos.x, this._searchPoi.z - t.pos.z);
      if (d < 25) {
        this._visited.add(this._searchPoi);
        this._searchPoi = null;
        this._observeT = 2 + Math.random() * 1.5;
        this._driveWithUnstick(dt, 0, 0);
        return;
      }
    }
    // 目标选择
    if (!this._searchPoi) {
      if (!pois.length) { this._driveWithUnstick(dt, 0, 0); return; }
      // 怀疑度热点邻近加成（§5.5 搜索建议层：只偏向排序，不改认知）
      const sus = this.visibility && this.visibility.suspicion;
      const hot = sus ? sus.hottest() : null;
      const hb = hot ? (p) => Math.max(0, 1 - Math.hypot(p.x - hot.x, p.z - hot.z) / 600) * 120 : () => 0;
      if (level >= 3) {
        if (this._l3T == null) this._l3T = nc;
        // L3 持续 45s 仍无接触 → 直接推进敌整备区（对称知识：敌出生区方向，非玩家实时坐标）
        if (nc - this._l3T > 45) {
          if (!this._pushZone) this._pushZone = { x: ax.x * 750, z: ax.z * 750, type: 'push', score: 1 };
          if (!this._visited.has(this._pushZone)) this._searchPoi = this._pushZone;
        }
        if (!this._searchPoi) {   // 轴线前向优先的最近未访 node
          let best = null, bs = Infinity;
          for (const p of pois) {
            if (this._visited.has(p) || p.type !== 'node') continue;
            const dd = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
            const fwd = (p.x - t.pos.x) * ax.x + (p.z - t.pos.z) * ax.z;
            const s = dd - fwd * 0.8 - hb(p);
            if (s < bs) { bs = s; best = p; }
          }
          if (!best && this._pushZone && !this._visited.has(this._pushZone)) best = this._pushZone;
          this._searchPoi = best;
        }
      }
      if (level >= 2 && !this._searchPoi) {   // L2 地图控制：中心加分的高分 POI + 怀疑度热度
        let best = null, bs = -Infinity;
        for (const p of pois) {
          if (this._visited.has(p)) continue;
          const central = Math.hypot(p.x, p.z) <= 600 ? 2 : 0;
          const s = p.score + central - Math.hypot(p.x - t.pos.x, p.z - t.pos.z) / 400
            + (sus ? sus.heatNear(p.x, p.z, 250) * 0.5 : 0);
          if (s > bs) { bs = s; best = p; }
        }
        this._searchPoi = best;
      }
      if (!this._searchPoi) {   // L0/L1：沿推进轴线偏向的最近未访 POI（advance to contact）；全访完则清空重游
        let best = null, bs = Infinity;
        for (const p of pois) {
          if (this._visited.has(p)) continue;
          const dd = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
          const fwd = (p.x - t.pos.x) * ax.x + (p.z - t.pos.z) * ax.z;
          const s = dd - fwd * 0.8 - hb(p);
          if (s < bs) { bs = s; best = p; }
        }
        if (!best) { this._visited.clear(); this._driveWithUnstick(dt, 0, 0); return; }
        this._searchPoi = best;
      }
    }
    const yaw = Math.atan2(this._searchPoi.x - t.pos.x, this._searchPoi.z - t.pos.z);
    const thr = level >= 2 ? 0.9 : 0.8;   // L0/L1 刻意接敌推进（0.8），L1 起高油门
    const { throttle, steer } = this._driveToward(yaw, dt, thr);
    this._driveWithUnstick(dt, throttle, steer, yaw);
  }

  // ── alert 原地姿态（§6.3 修复）：casemate 车体优先枢轴朝向疑似扇面（摆到位才谈得上伏击射界） ──
  _alertHold(dt, searchYaw) {
    const t = this.tank;
    if (t.cfg.casemate) {
      const arcDeg = t.cfg.casemate.arc * Math.PI / 180;
      const dy = wrapAngle(searchYaw - t.heading);
      if (Math.abs(dy) > arcDeg * 0.8) {
        this._driveWithUnstick(dt, 0.15, THREE.MathUtils.clamp(dy * 2.5, -1, 1), searchYaw);
        return;
      }
    }
    this._driveWithUnstick(dt, 0, 0);
  }

  // ── 失联包抄（怀疑度热点优先：最后位置 400m 内有热点则奔热点） ──
  _flankMove(dt, lastPos) {
    const t = this.tank;
    const sus = this.visibility && this.visibility.suspicion;
    const hot = sus ? sus.hottest() : null;
    const anchor = (hot && Math.hypot(hot.x - lastPos.x, hot.z - lastPos.z) < 400)
      ? { x: hot.x, z: hot.z } : lastPos;
    if (!this.flankWp) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const yawToLast = Math.atan2(anchor.x - t.pos.x, anchor.z - t.pos.z);
      this.flankWp = new THREE.Vector3(
        anchor.x + Math.sin(yawToLast + side * Math.PI * 0.5) * 60,
        0,
        anchor.z + Math.cos(yawToLast + side * Math.PI * 0.5) * 60,
      );
    }
    const target = t.pos.distanceTo(this.flankWp) > 40 ? this.flankWp : anchor;
    const yaw = Math.atan2(target.x - t.pos.x, target.z - t.pos.z);
    const { throttle, steer } = this._driveToward(yaw, dt, 0.9);
    this._driveWithUnstick(dt, throttle, steer, yaw);
  }

  // ── 弱点瞄高（车体 1.1m / 炮塔 1.9m，取该分区较弱者） ──
  _estZone(player, dirYaw) {
    const rel = wrapAngle(dirYaw - player.heading);
    const c = Math.cos(rel), s = Math.sin(rel);
    const a = player.cfg.armor;
    let hull, turret;
    if (Math.abs(c) >= Math.abs(s)) {
      if (c < 0) { hull = a.hullFront; turret = a.turretFront; }
      else { hull = a.hullRear; turret = a.turretRear; }
    } else {
      hull = a.hullSide; turret = a.turretSide;
    }
    return { armor: Math.min(hull, turret), aimY: hull <= turret ? 1.1 : 1.9 };
  }
  _weakAimY(player, dirYaw) { return this._estZone(player, dirYaw).aimY; }

  // 摆角对射开关（§6.4 泛化）：王牌原生开启；标准档+doctrine 且本车有 tiltPref 偏好时开启
  _tiltDuelOk() {
    return !!(this.diff.tiltDuel || (this.diff.useDoctrine && this._role && this._role.tiltPref != null));
  }
  // 摆角基准：tiltPref（虎式 0.7 / 黑豹 0=严格正面）或默认 0.55
  _tiltBase() {
    return this._role && this._role.tiltPref != null ? this._role.tiltPref : 0.55;
  }

  // ── 撤退启动（§6.5）：倒车拉距，优先入掩体 / 脱离视野 ──
  _startEvade(player) {
    this.evadeTimer = 6 + Math.random() * 3;
    this._evadeFreq = 0.7 + Math.random() * 0.5;
    this._evadeAmp = 0.4 + Math.random() * 0.35;
    this._evadePhase = Math.random() * Math.PI * 2;
    const cvPt = (this.diff.coverUse && this.visibility) ? this._bestCoverPt(player) : null;
    this._evadeGoal = cvPt ? { type: 'cover', x: cvPt.x, z: cvPt.z } : { type: 'los' };
  }

  // ── 撤退机动（spotted 交战段与 alert/flank 优先撤退共用；返回油门/转向） ──
  _evadeDrive(dt, dirYaw, dist, player) {
    const t = this.tank;
    this.evadeTimer -= dt;
    this.state = 'evade';
    const throttle = -0.85;
    this._evadePhase += dt * (this._evadeFreq || 0.9);
    const weave = Math.sin(this._evadePhase) * (this._evadeAmp || 0.5);
    const mir = t.speed < -0.2 ? -1 : 1;
    let noseYaw = dirYaw + weave;
    let ended = null;   // 'cover' 到掩 / 'los' 脱离视线 / 'timeout' 超时（记零收益）
    if (this._evadeGoal && this._evadeGoal.type === 'cover') {
      const covYaw = Math.atan2(this._evadeGoal.x - t.pos.x, this._evadeGoal.z - t.pos.z);
      noseYaw = covYaw + Math.PI + weave * 0.5;
      if (Math.hypot(this._evadeGoal.x - t.pos.x, this._evadeGoal.z - t.pos.z) < 8) {
        this.coverPt = this._evadeGoal;
        this.coverState = 'holding';
        this.evadeTimer = 0;
        this._evadeCd = 8 + Math.random() * 4;
        ended = 'cover';
      }
    }
    const dy = wrapAngle(noseYaw - t.heading);
    const steer = THREE.MathUtils.clamp(mir * dy * 2.2, -1, 1);
    if (!ended && this._evadeGoal && this._evadeGoal.type === 'los' &&
        this.visibility && !this.visibility.canSee(player, t)) {
      this.evadeTimer = 0;
      this._evadeCd = 6 + Math.random() * 4;
      ended = 'los';
    }
    if (!ended && (this.evadeTimer <= 0 || dist > this.diff.fireRange)) {
      this.evadeTimer = 0;
      this._evadeCd = 6 + Math.random() * 3;   // 统一冷却（修复平原立即重触发无限蛇形，§8.2）
      // 开阔地连续 2 次零收益（既未到掩也未脱离视线）→ 背水一战：30s 内不再撤退
      if (++this._evadeNoGain >= 2) { this._evadeNoGain = 0; this._evadeCd = 30; }
      ended = 'timeout';
    }
    if (ended && ended !== 'timeout') this._evadeNoGain = 0;
    return { throttle, steer };
  }

  // ── 弹种选择（AP 能穿用 AP；穿不了换 HE 压制/断腿并绕侧） ──
  _selectShell(dt, player, dist) {
    const t = this.tank;
    if (!this.diff.switchShell) return;
    // 弹尽自动换弹
    if (t.shellPool[t.shellType] <= 0) {
      const alt = ['ap', 'apcr', 'he'].find((k) => t.shellPool[k] > 0);
      if (alt) { t.switchShell(alt); this._shellSwitchCd = 3; }
      return;
    }
    if (this._shellSwitchCd > 0) { this._shellSwitchCd -= dt; return; }
    this.shellTimer -= dt;
    if (this.shellTimer > 0) return;
    this.shellTimer = 2.5;

    const zone = this._estZone(player, Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z));
    const apPen = t.cfg.shellPen * (1 - t.cfg.shellPenDrop * dist / 1000);
    const ac = t.cfg.apcrShell;
    const apcrPen = (ac && t.shellPool.apcr > 0) ? ac.pen * (1 - ac.penDrop * dist / 1000) : 0;

    let want = 'ap';
    let needFlank = false;
    if (apPen < zone.armor * 1.05) {
      if (apcrPen >= zone.armor * 1.05) want = 'apcr';   // AP 无解但钨芯可穿：切 APCR（仅 2~6 发，省着用）
      else { want = 'he'; needFlank = true; }            // 正面无解：HE 断腿/伤观瞄压制 + 绕侧
    }
    this._needFlank = needFlank;

    if (want !== this._wantShell) { this._wantShell = want; this._wantCount = 0; }
    this._wantCount++;
    if (want !== t.shellType && this._wantCount >= 2 && t.shellPool[want] > 0) {
      t.switchShell(want);
      this._shellSwitchCd = 9;
    }
  }

  // ── 消耗品使用 ──
  _useConsumables(dt, player) {
    const t = this.tank;
    if (t.burning > 0) {
      this.burnReactT += dt;
      if (this.burnReactT > 0.8) { t.useExtinguisher(); this.burnReactT = 0; }
    } else this.burnReactT = 0;

    // 断履带/可修模块受损 → 脱战（无接触或距离 >260m）时原地读条修理（与玩家同规则）
    const needRepair = !t.repairing && t.consumables.repair > 0 &&
      t._repairableItems && t._repairableItems().length > 0;
    if (needRepair) {
      const d = Math.hypot(player.pos.x - t.pos.x, player.pos.z - t.pos.z);
      const engaged = this._ci && (this._ci.spotted || this._ci.lost || this._ci.suspected) && d < 260;
      if (!engaged) {
        this.trackReactT += dt;
        if (this.trackReactT > 1.2) { t.startRepair(); this.trackReactT = 0; }
      } else this.trackReactT = 0;
    } else this.trackReactT = 0;
  }

  // ── 开火后战术决策：找掩体 / 侧向位移 / 原地对射（阵位切换滞后 §8.4） ──
  _postFireDecision(player) {
    const t = this.tank;
    this._stopT = 0;
    let pt = (this.diff.coverUse && this.visibility) ? this._bestCoverPt(player) : null;
    // 切换滞后：已有阵位时，新阵位评分须超 1.5 才换（防 A↔B 振荡）
    if (pt && this.coverPt && this._coverScore != null && pt.score < this._coverScore + 1.5) pt = null;
    const pCover = this._justHit ? (this.diff.coverChanceAfterHit || 0.85) : (this.diff.coverChance || 0.6);
    const r = Math.random();
    let choice;
    if (!pt) {
      choice = r < 0.7 ? 'strafe' : 'hold';
    } else {
      choice = r < pCover ? 'cover' : (r < pCover + 0.25 ? 'strafe' : 'hold');
    }
    if (choice === this._lastBehavior && choice !== 'hold') {
      this._sameCount++;
      if (this._sameCount >= 2) choice = choice === 'cover' ? 'strafe' : 'cover';
    } else this._sameCount = 0;
    this._lastBehavior = choice;
    this._justHit = false;
    if (choice === 'cover' && pt) {
      this.coverPt = pt;
      this._coverScore = pt.score;
      this.coverState = 'moving';
    } else if (choice === 'strafe') {
      this.coverState = null;
      this._dashT = 1.5 + Math.random() * 1.5;
      this._dashDir = Math.random() < 0.5 ? 1 : -1;
    } else {
      this.coverState = this.coverState === 'peeking' ? 'peeking' : null;
      this._peekOrigin = { x: this.tank.pos.x, z: this.tank.pos.z };
      this._dashT = 0;
    }
  }

  // ── 阵位评估（§6.2 三合一：遮蔽 + 射界 + 撤离路线；含 hull-down 加成；切换滞后在调用方）──
  _bestCoverPt(player) {
    const t = this.tank, vis = this.visibility;
    if (!vis || !t.world || !t.world.groundY) return null;
    const baseYaw = Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z);
    const bX = ((t.world.mapSizeX || t.world.map.size) / 2) - 25;
    const bZ = ((t.world.mapSizeZ || t.world.map.size) / 2) - 25;
    let best = null, bestScore = this.diff.coverScoreMin || 4;
    const radii = [this.diff.coverMin, (this.diff.coverMin + this.diff.coverMax) / 2, this.diff.coverMax];
    for (const R of radii) {
      for (let i = 0; i < 8; i++) {
        const ang = baseYaw + Math.PI + (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const px = t.pos.x + Math.sin(ang) * R, pz = t.pos.z + Math.cos(ang) * R;
        if (Math.abs(px) > bX || Math.abs(pz) > bZ) continue;
        const gy = t.world.groundY(px, pz);
        const hullSees = vis.canSeePoint(px, pz, gy + t.cfg.dims.hullHeight * 0.5, player);
        const turretSees = vis.canSeePoint(px, pz, gy + t.cfg.dims.turretTop * 0.85, player);
        if (!turretSees && !hullSees) continue;   // 完全不可交战/不可观察，排除
        let score = turretSees ? 3 : 1;
        if (!hullSees && turretSees) score += 1.5;   // hull-down：车体被遮 + 炮塔可打（最优阵位）
        score -= Math.abs(Math.hypot(player.pos.x - px, player.pos.z - pz) - this._preferRange) / 200;
        score -= Math.hypot(px - t.pos.x, pz - t.pos.z) / 150;
        // 射界朝向成本（casemate：到位须转向对轴，转角越大越差）
        if (t.cfg.casemate) {
          const needYaw = Math.abs(wrapAngle(Math.atan2(player.pos.x - px, player.pos.z - pz) - t.heading));
          score -= needYaw / Math.PI * 0.8;
        }
        let blocked = false, nearHard = 0;
        for (const o of (t.world.obstacles || [])) {
          if (this._segBlocked(px, pz, o)) { blocked = true; break; }
          if (o.r >= 2.5 && Math.hypot(px - o.x, pz - o.z) < o.r + 6) nearHard = 1;
        }
        if (blocked) continue;
        score += nearHard;
        // 撤离路线：阵位远离玩家方向 15m 净空（无硬障碍）→ +1
        const awayYaw = Math.atan2(px - player.pos.x, pz - player.pos.z);
        const bx = px + Math.sin(awayYaw) * 15, bz = pz + Math.cos(awayYaw) * 15;
        let retreatOk = true;
        for (const o of (t.world.obstacles || [])) {
          if (Math.hypot(bx - o.x, bz - o.z) < o.r + 1.5) { retreatOk = false; break; }
        }
        if (retreatOk) score += 1;
        if (score > bestScore) { bestScore = score; best = { x: px, z: pz, score }; }
      }
    }
    return best;
  }

  _segBlocked(px, pz, o) {
    const t = this.tank;
    const ax = t.pos.x, az = t.pos.z;
    const dx = px - ax, dz = pz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return false;
    const tt = ((o.x - ax) * dx + (o.z - az) * dz) / len2;
    if (tt < 0 || tt > 1) return false;
    const cx = ax + dx * tt - o.x, cz = az + dz * tt - o.z;
    return cx * cx + cz * cz < (o.r + 1) * (o.r + 1);
  }

  // ── 障碍绕行 ──
  _avoidSteer(dirYaw) {
    const t = this.tank;
    const obs = t.world && t.world.obstacles;
    if (!this.diff.avoidObstacles || !obs || !obs.length) return 0;
    const sx = Math.sin(dirYaw), sz = Math.cos(dirYaw);
    let adj = 0;
    for (const o of obs) {
      const dx = o.x - t.pos.x, dz = o.z - t.pos.z;
      const fwd = dx * sx + dz * sz;
      if (fwd < -o.r || fwd > 22 + o.r) continue;
      const side = dx * sz - dz * sx;
      const clear = o.r + 3.5;
      if (Math.abs(side) < clear) {
        adj += (side >= 0 ? -1 : 1) * (1 - Math.abs(side) / clear) * (1 - Math.max(fwd, 0) / (22 + o.r));
      }
    }
    return THREE.MathUtils.clamp(adj, -1, 1);
  }

  _driveToward(targetYaw, dt, throttleScale) {
    const t = this.tank;
    let dy = targetYaw - t.heading;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(dy * 2.2, -1, 1);
    const throttle = Math.abs(dy) > 1.1 ? 0.15 : throttleScale;
    return { throttle, steer };
  }

  // 统一驾驶出口（所有行驶分支共用）：障碍绕行 + 卡住检测与脱困——
  // 有油门/有车速但位移极小（顶住石头/残骸/建筑）→ 保持 1.4s 后带转向倒车 1.5s，
  // 随后驶往"障碍切线方向"22m 绕行点（满舵只会原地枢轴，绕行点让坦克真正横移脱困）
  _driveWithUnstick(dt, throttle, steer, dirYaw = null) {
    const t = this.tank;
    if (this._unstickT > 0) {
      this._unstickT -= dt;
      throttle = this._unstickDir;
      steer = this._unstickSteer;
      this.stuckTimer = 0;
    } else {
      if (this._bypassT > 0) {
        this._bypassT -= dt;
        const dx = this._bypassX - t.pos.x, dz = this._bypassZ - t.pos.z;
        if (Math.hypot(dx, dz) < 4) this._bypassT = 0;   // 已到绕行点
        else {
          const d = this._driveToward(Math.atan2(dx, dz), dt, 0.6);
          throttle = d.throttle; steer = d.steer;
        }
      } else if (throttle !== 0 && dirYaw != null) {
        // 障碍绕行
        const avoid = this._avoidSteer(dirYaw);
        if (avoid !== 0) steer = THREE.MathUtils.clamp(steer + avoid, -1, 1);
      }
      // 卡住检测（绕行途中顶到新障碍也会再触发）
      const movedSq = t.root.position.distanceToSquared(this.lastPos);
      if (movedSq < dt * dt * 0.5 && (Math.abs(throttle) > 0.2 || Math.abs(t.speed) > 0.5)) {
        this.stuckTimer += dt;
        if (this.stuckTimer > (this.coverState === 'moving' ? 2.5 : 1.4)) {
          this.stuckTimer = 0;
          // ── 脱困升级阶梯（§8.3）：L1 倒车+22m 切线绕行；60s 内 3 次 → L2 朝地图中心 60m 大绕行；
          //    L2 窗口内再卡 → L3 当前目标拉黑 60s、交还搜索/排级任务 ──
          this._unstickLog = (this._unstickLog || []).filter(tt => this._battleT - tt < 60);
          this._unstickLog.push(this._battleT);
          if (this._unstickLog.length >= 3) {
            this._unstickT = 1.5;
            this._bypassT = 12;
            this._unstickDir = throttle >= 0 ? -0.85 : 0.7;
            const cy = Math.atan2(-t.pos.x, -t.pos.z);   // 朝地图中心
            this._unstickSteer = (wrapAngle(cy - t.heading) >= 0 ? 1 : -1) * 0.6;
            this._bypassX = t.pos.x + Math.sin(cy) * 60;
            this._bypassZ = t.pos.z + Math.cos(cy) * 60;
            if (this._unstickLog.length >= 4) {
              // L3：目标点拉黑（POI 标记已访 / 指令交还 / 阵位放弃）
              if (this._searchPoi) { this._visited.add(this._searchPoi); this._searchPoi = null; }
              if (this.order && this.order.point) this.order = { type: 'auto' };
              if (this.coverPt) { this.coverPt = null; this.coverState = null; this._coverScore = null; }
              this._unstickLog.length = 0;
            }
            this.lastPos.copy(t.root.position);
            t.drive(dt, this._unstickDir, this._unstickSteer);
            return;
          }
          this._unstickT = 1.5;
          this._bypassT = 9;   // 绕行窗口：转向 + 行驶到侧前方绕行点（过时未到也恢复正常决策）
          this._unstickDir = throttle >= 0 ? -0.85 : 0.7;   // 前进被卡→倒车；倒车被卡→前开
          // 绕行点：沿"顶住自己的障碍"的切线方向 22m（保证不往障碍里开）；
          // 找不到对应障碍（残骸等非 obstacles 对象）则退化为车体侧向 22m
          let wy = null;
          const obs = t.world && t.world.obstacles;
          if (obs && obs.length) {
            let bo = null, bd = Infinity;
            for (const o of obs) {
              const d = Math.hypot(o.x - t.pos.x, o.z - t.pos.z) - o.r;
              if (d < bd) { bd = d; bo = o; }
            }
            if (bo && bd < 4) {
              const awayYaw = Math.atan2(t.pos.x - bo.x, t.pos.z - bo.z);   // 障碍 → 坦克
              const t1 = awayYaw + Math.PI / 2, t2 = awayYaw - Math.PI / 2;
              wy = Math.abs(wrapAngle(t1 - t.heading)) < Math.abs(wrapAngle(t2 - t.heading)) ? t1 : t2;   // 转更少的一侧
            }
          }
          const side = Math.random() < 0.5 ? 1 : -1;
          if (wy == null) wy = t.heading + side * Math.PI / 2;
          this._unstickSteer = (wrapAngle(wy - t.heading) >= 0 ? 1 : -1) * 0.6;
          this._bypassX = t.pos.x + Math.sin(wy) * 22;
          this._bypassZ = t.pos.z + Math.cos(wy) * 22;
          this._strafeDir = (this._strafeDir || 1) * -1;
          if (this.coverState === 'moving') this.coverState = null;
        }
      } else this.stuckTimer = 0;
    }
    this.lastPos.copy(t.root.position);
    t.drive(dt, throttle, steer);
  }
}
