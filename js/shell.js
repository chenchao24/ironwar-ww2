// ═══ 炮弹：高速弹道 + 曳光 + 命中检测 + 穿甲/跳弹/后效结算（乘员+模块制） ═══
import * as THREE from 'three';
import { GAME, ZONE_NAMES, SHELL_TYPES, BIG_DUST_RULES } from './config.js';

const _v = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _center = new THREE.Vector3();

export class ShellManager {
  constructor(scene, effects, audio, world) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.world = world;
    this.shells = [];
    this.tanks = [];          // 战斗中的坦克（由 main 注入）
    this.onPlayerHit = null;  // 玩家被命中的回调（UI）
    this.onEnemyHit = null;   // 玩家命中敌人的回调（UI）

    // 曳光弹体（共享几何体）
    this.tracerGeo = new THREE.CylinderGeometry(0.05, 0.05, 6, 5);
    this.tracerGeo.rotateX(Math.PI / 2);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd890 });
  }

  fire(data) {
    const tracer = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    tracer.position.copy(data.pos);
    this.scene.add(tracer);
    this.shells.push({
      pos: data.pos.clone(),
      vel: data.dir.clone().multiplyScalar(data.velocity),
      pen: data.pen, penDrop: data.penDrop,
      spall: data.spall || 100,
      owner: data.owner,
      shellType: data.shellType,
      hePower: data.hePower || 1,        // HE 威力系数（152=3/122=2.2；不转发则实战恒为 1，大口径 HE 全失效）
      nearMissR: data.nearMissR || 0,    // HE 近失弹半径
      caliber: data.caliber || 75,       // 弹着尘堆范围随口径
      dist: 0, tracer,
      life: 6,
    });
    // 尾迹烟
    this.effects.ps.spawn('glow', {
      x: data.pos.x, y: data.pos.y, z: data.pos.z,
      life: 0.08, size0: 1.6, size1: 0.6, alpha: 0.9,
    });
  }

  update(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      // 子步进避免隧穿
      const steps = Math.max(1, Math.ceil(s.vel.length() * dt / 3));
      let hit = false;
      for (let k = 0; k < steps && !hit; k++) {
        const sdt = dt / steps;
        const prev = _prev.copy(s.pos);
        s.vel.y -= GAME.shellGravity * sdt;
        s.pos.addScaledVector(s.vel, sdt);
        const stepLen = s.pos.distanceTo(prev);
        s.dist += stepLen;

        // 地面命中：HE 土尘大爆（尘柱+爆压尘幕，火光仅一瞬）/ AP 普通土花——弹种效果区分
        const gy = this.world.groundY(s.pos.x, s.pos.z);
        if (s.pos.y <= gy) {
          if (s.shellType === 'he') {
            const pw = s.hePower || 1;
            this.effects.dirtHit(s.pos, 1.8 * (0.75 + 0.3 * pw));   // 威力系数：122/152 土柱更大
            this.effects.heGround(s.pos);
            // 近失弹：大口径 HE 爆点对邻近车辆的外部毁伤（事件经 pendingEvents 进 HUD）
            if (s.nearMissR) {
              for (const t of this.tanks) {
                if (t === s.owner || t.destroyed) continue;
                const evs = t.applyHENearMiss(s.pos, s);
                if (evs && evs.length) t.pendingEvents.push(...evs);
              }
            }
          } else {
            this.effects.dirtHit(s.pos, 1);
          }
          this.effects.dustMound(s.pos, s.caliber);   // 弹着尘堆（0.5s 后腾起，范围随口径）
          const dToPlayer = this._distToPlayer(s.pos);
          this.audio.playExplosion(s.shellType === 'he' ? Math.min(1, 0.6 + 0.25 * (s.hePower || 1)) : 0.35, THREE.MathUtils.clamp(dToPlayer / 400, 0, 1));
          hit = true;
          break;
        }

        // 坦克命中
        for (const t of this.tanks) {
          if (t === s.owner || t.destroyed) continue;
          if (s._gaps && s._gaps.has(t)) continue;   // 已从该车板缝穿过：不再吸附重测
          if (this._segmentHitsTank(prev, s.pos, t)) {
            const bx = s.pos.x, by = s.pos.y, bz = s.pos.z;
            s.pos.copy(_closest);
            hit = this._resolveTankHit(s, t);   // 跳弹续飞时返回 false
            if (!hit && !s.spent) {
              // 板缝穿过：位置不吸附回包围球最近点（否则每子步被拉回，炮弹卡成空中光柱）
              s.pos.set(bx, by, bz);
              (s._gaps || (s._gaps = new Set())).add(t);
              continue;
            }
            break;
          }
        }

        // 可破坏地图物件
        if (!hit && this.world.onShellHitDestructible &&
            this.world.onShellHitDestructible(prev, s.pos, s)) {
          hit = true;
          break;
        }
      }

      if (hit || s.life <= 0 ||
          Math.abs(s.pos.x) > GAME.mapSize || Math.abs(s.pos.z) > GAME.mapSize) {
        this.scene.remove(s.tracer);
        this.shells.splice(i, 1);
        continue;
      }
      // 曳光姿态
      s.tracer.position.copy(s.pos);
      s.tracer.lookAt(_v.copy(s.pos).add(s.vel));
      // 尾迹
      if (Math.random() < dt * 90) {
        this.effects.ps.spawn('smoke', {
          x: s.pos.x, y: s.pos.y, z: s.pos.z,
          life: 0.35, size0: 0.35, size1: 1.1, alpha: 0.18,
        });
      }
    }
  }

  _distToPlayer(p) {
    const pl = this.tanks.find((t) => t.isPlayer);
    return pl ? p.distanceTo(pl.root.position) : 999;
  }

  // 粗判：线段与坦克包围球相交
  _segmentHitsTank(a, b, tank) {
    const c = _center.copy(tank.root.position);
    c.y += tank.cfg.dims.hullHeight * 0.7;
    const r = Math.max(tank.cfg.dims.length, tank.cfg.dims.width) * 0.42 + 0.6;
    const ab = _ab.copy(b).sub(a);
    const len = ab.length();
    if (len < 1e-6) return false;
    ab.divideScalar(len);
    const ac = _ac.copy(c).sub(a);
    const t = THREE.MathUtils.clamp(ac.dot(ab), 0, len);
    const closest = _closest.copy(a).addScaledVector(ab, t);
    return closest.distanceToSquared(c) < r * r;
  }

  // 返回 true = 炮弹销毁；false = 跳弹续飞
  _resolveTankHit(shell, tank) {
    // 跳弹后的乏弹：再命中只出火花
    if (shell.spent) {
      this.effects.impactSparks(shell.pos, null);
      this.audio.playHitArmor(false, this._distToPlayer(shell.pos));
      return true;
    }
    const def = SHELL_TYPES[shell.shellType] || SHELL_TYPES.ap;
    const penAtRange = shell.pen * (1 - def.penDropK * shell.penDrop * shell.dist / 1000);
    const dir = shell.vel.clone().normalize();
    const hit = tank.resolveHitZone(shell.pos, dir);
    if (!hit) return false;   // 板缝穿过：未命中任何装甲板，弹照常飞（不改向不结算）
    // 命中坦克同出弹着尘堆（整体小 30%、低 20%、初浓 50~60%、漂移略快、消散 +30%）
    this.effects.dustMound(shell.pos, shell.caliber, { r: 0.7, size: 0.7, h: 0.8, a: 0.85, life: 0.7, wind: 1.3 });
    const result = tank.applyHit(hit, penAtRange, shell.shellType, shell.pos, dir, shell.spall, shell);

    const isPlayerOwner = shell.owner.isPlayer;
    const isPlayerTarget = tank.isPlayer;
    const zoneName = hit.plateName || ZONE_NAMES[hit.zone] || '';

    if (result.type === 'ricochet') {
      // 跳弹续飞
      const n = hit.normal;
      const v = shell.vel;
      const sp = v.length() * 0.55;
      _v.copy(v).normalize();
      _v.addScaledVector(n, -2 * _v.dot(n)).normalize();
      if (Math.random() < BIG_DUST_RULES.ricochetChance) this.effects.bigDustBurst(shell.pos, BIG_DUST_RULES.bounceScale);
      this.effects.ricochetSpark(shell.pos, _v);
      v.copy(_v).multiplyScalar(sp);
      v.y += 3;
      shell.spent = true;
      this.audio.playRicochet();
      if (isPlayerOwner && this.onEnemyHit) this.onEnemyHit('跳弹！', 0, false, shell.pos, [], 0);
      if (isPlayerTarget && this.onPlayerHit) this.onPlayerHit('ricochet', dir, null, null, shell.pos.clone());
      return false;
    }

    if (result.type === 'bounce') {
      if (Math.random() < BIG_DUST_RULES.bounceChance) this.effects.bigDustBurst(shell.pos, BIG_DUST_RULES.bounceScale);
      this.effects.impactSparks(shell.pos, null);
      this.audio.playHitArmor(false, this._distToPlayer(shell.pos));
      if (isPlayerOwner && this.onEnemyHit) this.onEnemyHit(`未能击穿${zoneName}！`, 0, false, shell.pos, [], 0);
      if (isPlayerTarget && this.onPlayerHit) this.onPlayerHit('bounce', dir);
      return true;
    }

    if (result.type === 'splash') {
      // HE 未击穿：爆轰声光 + 外部毁伤事件（大口径威力加大爆闪；与 AP 跳弹/未穿区分）
      this.effects.explosion(shell.pos.clone(), Math.min(1.6, 0.85 + 0.35 * (shell.hePower || 1)));
      this.effects.bigDustBurst(shell.pos, BIG_DUST_RULES.penScale);
      this.audio.playHitArmor(false, this._distToPlayer(shell.pos));
      const events = result.events || [];
      this._reportResult(tank, hit, { type: 'splash', events, killed: result.killed }, isPlayerOwner, isPlayerTarget, dir, `HE 命中${zoneName}`);
      return true;
    }

    if (result.type === 'dead') return true;

    // ── 击穿 ──
    this.effects.penetrationBurst(shell.pos, dir);
    const events = result.events || [];
    const exitEv = events.find((e) => e.type === 'exit');
    if (exitEv) this.effects.penExit(exitEv.pos, exitEv.dir);
    const ammoBoom = events.some((e) => e.type === 'ammo_boom');
    const killed = tank.destroyed;

    if (ammoBoom) {
      this.audio.playExplosion(2.6, THREE.MathUtils.clamp(this._distToPlayer(tank.root.position) / 500, 0, 1));
      this.effects.addShake(1.4);
    } else if (killed) {
      this.effects.explosion(tank.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 1.6);
      this.audio.playExplosion(1.6, THREE.MathUtils.clamp(this._distToPlayer(tank.root.position) / 500, 0, 1));
      this.effects.addShake(0.9);
    } else {
      if (Math.random() < BIG_DUST_RULES.penChance) this.effects.bigDustBurst(shell.pos, BIG_DUST_RULES.penScale);
      this.audio.playHitArmor(true, this._distToPlayer(shell.pos));
      if (events.some((e) => e.type === 'fire')) this.audio.startFire();
    }

    this._reportResult(tank, hit, { type: 'pen', events, killed, ammoBoom }, isPlayerOwner, isPlayerTarget, dir, `击穿${zoneName}！`);
    return true;
  }

  // 击穿/HE 溅射共用的反馈上报（hitLog/飘字/UI 标记/受击方向）
  _reportResult(tank, hit, out, isPlayerOwner, isPlayerTarget, dir, penLabel) {
    if (isPlayerOwner && this.onEnemyHit) {
      const zoneName = hit.plateName || ZONE_NAMES[hit.zone] || '';
      const label = out.ammoBoom ? '弹药殉爆！'
        : out.killed ? '目标歼灭！'
        : out.type === 'splash' ? `HE 命中${zoneName}（未击穿）`
        : penLabel;
      this.onEnemyHit(label, 0, out.killed, hit.worldPos, out.events || [], 0);
    }
    if (isPlayerTarget && this.onPlayerHit) {
      this.onPlayerHit(out.type === 'splash' ? 'bounce' : 'pen', dir, out, out.events, hit.worldPos ? hit.worldPos.clone() : null);
    }
  }

  clear() {
    for (const s of this.shells) this.scene.remove(s.tracer);
    this.shells.length = 0;
  }
}
