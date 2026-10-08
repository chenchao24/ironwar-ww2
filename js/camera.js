// ═══ 相机装备：近距追尾 / 狙击瞄准镜（二战直视瞄具·固定档位，德系 TZF 双档 2.5×/5× Shift 切档）/ 观赏模式 / 后座推镜与抖动 ═══
import * as THREE from 'three';
import { CAMERA, GAME } from './config.js';

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _turretPos = new THREE.Vector3();
const _fwd = new THREE.Vector3();

const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;

export class CameraRig {
  constructor(camera, groundY) {
    this.camera = camera;
    this.groundY = groundY;
    this.tank = null;

    this.aimYaw = 0;            // 观瞄方位（世界）
    this.aimPitch = -0.04;      // 观瞄俯仰（正 = 抬头）
    this.aimTarget = new THREE.Vector3();   // 准星世界目标点（测距后由 Game 更新）
    this.farPoint = new THREE.Vector3();

    this.aiming = false;        // 狙击镜
    this.orbiting = false;      // C 键观赏模式
    this.binocular = false;     // Q 车长望远镜（7×/12×，观察不联动炮塔）
    this.binoMag = 7;           // 望远镜当前倍率
    this.dist = CAMERA.chaseDist;
    this.zoomMag = 1;           // 镜内角放大倍率（由坦克瞄具 FoV 决定）
    this.zoomIdx = 0;           // 多档瞄具当前档位（zoomFov 为数组时生效）
    this.shake = 0;
    this.recoil = 0;            // 开炮后坐推镜
    this.fovCurrent = CAMERA.fov;
    this.pos = new THREE.Vector3();
    this._first = true;
  }

  attach(tank) {
    this.tank = tank;
    this.aimYaw = tank.heading;
    this.aimPitch = -0.04;
    this.aiming = false;
    this.orbiting = false;
    this.binocular = false;
    this.binoMag = 7;
    this.dist = CAMERA.chaseDist;
    this.zoomIdx = 0;
    this.zoomMag = CAMERA.fov / this.aimFovEff();
    tank.root.visible = true;
    this._first = true;
  }

  // 鼠标增量 → 观瞄方向（鼠标右移 = 向右转）
  addAim(dx, dy) {
    this.aimYaw -= dx;
    let lo = -0.30, hi = 0.42;
    if (!this.binocular && !this.orbiting) [lo, hi] = this._aimPitchRange();   // 瞄具随炮架限位
    this.aimPitch = clamp(this.aimPitch - dy, lo, hi);
  }

  // 瞄具俯仰限位（世界系）= 炮架限位 + 固有零位——零位实时校准（当前世界仰角 - gunPitch），
  // 含车体俯仰（坡地）与炮管 GLB 烘焙角度偏差（如虎式 barrelGroup 自带约 -2°）。
  // 瞄线永不超过火炮可达范围，否则炮伺服撞限位后弹着点偏离准星中心（炮口指示器上/下漂）。
  // 上限再预留弹道下坠补偿角（远点 1600m：gR/2v²），否则仰角打满时补偿量把火炮顶出限位。
  _aimPitchRange() {
    const cfg = this.tank && this.tank.cfg;
    if (!cfg) return [-0.30, 0.42];
    this.tank.getGunDirection(_fwd);
    const zero = Math.asin(clamp(_fwd.y, -1, 1)) - this.tank.gunPitch;
    const v = this.tank.shellVelocityOf ? this.tank.shellVelocityOf() : 800;
    const dropMargin = GAME.shellGravity * 1600 / (2 * v * v);
    return [THREE.MathUtils.degToRad(cfg.gunDepression) + zero,
            THREE.MathUtils.degToRad(cfg.gunElevation) + zero - dropMargin];
  }

  // 追尾距离缩放
  zoom(wheelDir) { this.dist = clamp(this.dist + wheelDir * 1.6, CAMERA.chaseMin, CAMERA.chaseMax); }

  // 当前镜内 FoV（度）：二战直视瞄具固定倍率；德系 TZF 双档 2.5×/5×（zoomFov 数组，Shift 切档）
  aimFovEff() {
    const zf = this.tank && this.tank.cfg && this.tank.cfg.zoomFov;
    if (Array.isArray(zf)) return zf[this.zoomIdx % zf.length];
    return zf || CAMERA.aimFov;
  }

  // 多档瞄具（数组 zoomFov）开镜态 Shift 切档，返回当前角放大倍率；单档瞄具返回 null
  cycleAimZoom() {
    const zf = this.tank && this.tank.cfg && this.tank.cfg.zoomFov;
    if (!Array.isArray(zf) || zf.length < 2) return null;
    this.zoomIdx = (this.zoomIdx + 1) % zf.length;
    return CAMERA.fov / this.aimFovEff();
  }

  setAimMode(on) {
    if (this.orbiting || this.binocular) on = false;
    if (this.aiming === on) return;
    this.aiming = on;
    if (this.tank) this.tank.root.visible = !on;
  }

  // 车长望远镜（Q 闩锁）：机位在车长塔顶，观察方向随鼠标（不联动炮塔），Shift 切换 7×/12×
  setBinocular(on) {
    if (this.binocular === on) return;
    if (on && this.orbiting) return;   // 观赏模式下不进入望远镜
    this.binocular = on;
    if (on) this.setAimMode(false);   // 与瞄准镜互斥
    else {   // 望远镜俯仰范围更大，收起时收回到炮架限位内
      const [lo, hi] = this._aimPitchRange();
      this.aimPitch = clamp(this.aimPitch, lo, hi);
    }
    if (this.tank) this.tank.root.visible = !on;   // 望远镜中隐藏自车（避免遮挡）
  }
  cycleBinoZoom() {
    this.binoMag = this.binoMag === 7 ? 12 : 7;
    return this.binoMag;
  }

  toggleOrbit() {
    this.orbiting = !this.orbiting;
    if (this.orbiting) {
      this.setAimMode(false);
      if (this.tank) this.tank.root.visible = true;
    } else {
      if (this.tank) this.aimYaw = this.tank.heading;
      this.aimPitch = -0.04;
      this._first = true;
    }
    return this.orbiting;
  }

  addRecoil(a) { this.recoil = Math.min(this.recoil + a, 1.4); }
  addShake(a) { this.shake = Math.min(this.shake + a, 1.2); }

  // 镜内开火瞬时上跳
  addAimKick(a) {
    const [lo, hi] = this._aimPitchRange();
    this.aimPitch = clamp(this.aimPitch + a, lo, hi);
  }

  aimDirection(out = _fwd) {
    const cp = Math.cos(this.aimPitch);
    return out.set(Math.sin(this.aimYaw) * cp, Math.sin(this.aimPitch), Math.cos(this.aimYaw) * cp);
  }

  update(dt) {
    if (!this.tank) return;
    const tank = this.tank;
    tank.root.updateWorldMatrix(true, true);

    // ── 观赏模式：绕车自由视角 ──
    if (this.orbiting) {
      const cp = Math.cos(this.aimPitch), sp = Math.sin(this.aimPitch);
      _desired.set(
        tank.root.position.x - Math.sin(this.aimYaw) * cp * this.dist,
        tank.root.position.y + 1.6 + sp * this.dist,
        tank.root.position.z - Math.cos(this.aimYaw) * cp * this.dist,
      );
      const gy = this.groundY(_desired.x, _desired.z) + 0.5;
      if (_desired.y < gy) _desired.y = gy;
      this.pos.x = damp(this.pos.x, _desired.x, CAMERA.followLerp, dt);
      this.pos.y = damp(this.pos.y, _desired.y, CAMERA.followLerp, dt);
      this.pos.z = damp(this.pos.z, _desired.z, CAMERA.followLerp, dt);
      this.camera.position.copy(this.pos);
      _look.copy(tank.root.position); _look.y += 1.8;
      this.camera.lookAt(_look);
      this._fovTo(CAMERA.fov, dt);
      return;
    }

    tank.turretGroup.getWorldPosition(_turretPos);
    const aimDir = this.aimDirection(_fwd);

    // ── 车长望远镜：车长塔顶机位 + 自由观察（不联动炮塔），7×/12× 定档 ──
    if (this.binocular) {
      _desired.copy(_turretPos);
      _desired.y += 1.25;
      this.pos.x = damp(this.pos.x, _desired.x, CAMERA.aimLerp, dt);
      this.pos.y = damp(this.pos.y, _desired.y, CAMERA.aimLerp, dt);
      this.pos.z = damp(this.pos.z, _desired.z, CAMERA.aimLerp, dt);
      this.camera.position.copy(this.pos);
      _look.copy(this.camera.position).addScaledVector(aimDir, 80);
      this.camera.lookAt(_look);
      // 手持式轻微晃动（车速驱动；高倍率下线性放大受限）
      this._wobT = (this._wobT || 0) + dt;
      const spdN = Math.min(Math.abs(tank.speed) / (tank.cfg.maxSpeed || 16), 1);
      const eng = (0.00006 + spdN * 0.0011) / (this.binoMag / 7);
      this.camera.rotateX(Math.sin(this._wobT * 6.7) * eng);
      this.camera.rotateZ(Math.sin(this._wobT * 4.9 + 1.3) * eng * 0.8);
      this._fovTo(CAMERA.fov / this.binoMag, dt);
      return;
    }

    // 准星远点（1600m），Game 测距后用 aimTarget 覆盖
    this.farPoint.copy(_turretPos).addScaledVector(aimDir, 1600);

    // ── 目标位置 ──
    if (this.aiming) {
      // 狙击镜：炮手瞄具位——炮塔顶上方、略靠前
      _desired.copy(_turretPos).addScaledVector(aimDir, 0.9);
      _desired.y = _turretPos.y + 1.15;
    } else {
      _desired.copy(_turretPos).addScaledVector(aimDir, -this.dist);
      _desired.y += CAMERA.chaseHeight * (this.dist / CAMERA.chaseDist);
    }
    const gy2 = this.groundY(_desired.x, _desired.z) + 0.55;
    if (_desired.y < gy2) _desired.y = gy2;

    // ── 平滑 ──
    const lerpRate = this.aiming ? CAMERA.aimLerp : CAMERA.followLerp;
    if (this._first) { this.pos.copy(_desired); this._first = false; }
    this.pos.x = damp(this.pos.x, _desired.x, lerpRate, dt);
    this.pos.y = damp(this.pos.y, _desired.y, lerpRate, dt);
    this.pos.z = damp(this.pos.z, _desired.z, lerpRate, dt);

    // ── 抖动 ──
    let sx = 0, sy = 0, sz = 0;
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.35;
      sx = (Math.random() - 0.5) * s; sy = (Math.random() - 0.5) * s; sz = (Math.random() - 0.5) * s;
      this.shake = damp(this.shake, 0, 6, dt);
    }

    // ── 开炮后坐 ──
    if (this.recoil > 0.001) this.recoil = damp(this.recoil, 0, 9, dt);
    const rb = this.recoil * 0.38;   // 二战无现代火控防抖：后坐推镜更明显
    this.camera.position.set(
      this.pos.x + sx - aimDir.x * rb,
      this.pos.y + sy - aimDir.y * rb,
      this.pos.z + sz - aimDir.z * rb,
    );

    // ── 注视 ──
    if (this.aiming) {
      _look.copy(this.camera.position).addScaledVector(aimDir, 60);
    } else {
      _look.copy(this.camera.position).addScaledVector(aimDir, 40);
    }
    this.camera.lookAt(_look);

    // ── 镜内晃动：二战无电子稳定器——机动中明显摆动（M4 垂向陀螺稳定仪减半），静止近零 ──
    if (this.aiming) {
      this._wobT = (this._wobT || 0) + dt;
      const thr = Math.abs(tank.throttle || 0);
      const spdN = Math.min(Math.abs(tank.speed) / (tank.cfg.maxSpeed || 16), 1);
      const stabK = tank.cfg.gyroStab ? 0.45 : 1;
      const eng = (0.00008 + thr * 0.0016 + spdN * 0.003) * stabK;
      this.camera.rotateX(Math.sin(this._wobT * 7.3) * eng);
      this.camera.rotateZ(Math.sin(this._wobT * 5.1 + 1.7) * eng * 0.8);
    }

    // ── FoV（固定倍率） ──
    this.zoomMag = CAMERA.fov / this.aimFovEff();
    this._fovTo((this.aiming ? this.aimFovEff() : CAMERA.fov) + this.recoil * 1.1, dt);
  }

  _fovTo(target, dt) {
    this.fovCurrent = damp(this.fovCurrent, target, 12, dt);
    if (Math.abs(this.fovCurrent - this.camera.fov) > 0.01) {
      this.camera.fov = this.fovCurrent;
      this.camera.updateProjectionMatrix();
    }
  }
}
