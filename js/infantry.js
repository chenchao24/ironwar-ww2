// ═══ 地面步兵（程序化积木小人）：Soldier 个体 + Squad 班 ═══
// 零模型资产：躯干/头/盔/四肢/步枪全 box 拼装（共享几何体与阵营材质）；
// 行军步态/受惊卧倒/中弹倒地全程序化矩阵动画。三阵营：德/美/苏（含雪地罩衫概率）。
// 设计为图无关模块：本文件不依赖游戏本体（demo 页与正式接入共用）。

import * as THREE from 'three';

// ── 阵营外观表 ──
export const FACTIONS = {
  de: {
    label: '德军',
    uniform: 0x4a5248,        // 原野灰
    uniformSnow: 0xd8dce0,    // 雪地罩衫
    snowRate: 0.5,            // 罩衫配发率（阿登德军白罩衫较多）
    helmet: 'stahlhelm',
    helmetColor: 0x39403f,
    gear: 0x3a332a,           // 背包/装具
  },
  us: {
    label: '美军',
    uniform: 0x6b6248,        // 橄榄褐
    uniformSnow: 0xdde0e2,
    snowRate: 0.2,
    helmet: 'm1',
    helmetColor: 0x54513f,
    gear: 0x5a5140,
  },
  su: {
    label: '苏军',
    uniform: 0x6e5f43,        // 卡其棕
    uniformSnow: 0xd6d9dc,
    snowRate: 0.3,
    helmet: 'ssh40',          // 60% 钢盔 / 40% 乌山卡棉帽
    helmetColor: 0x4c4a38,
    gear: 0x4e4636,
  },
};

const SKIN = 0xc9a284;
const RIFLE = 0x453723;

// ── 共享几何体（模块级一次创建；尺寸单位米，身高 ~1.75m） ──
let G = null;
function geos() {
  if (G) return G;
  G = {
    leg: new THREE.BoxGeometry(0.13, 0.78, 0.14),      // 原点在髋关节（旋转摆腿）
    arm: new THREE.BoxGeometry(0.10, 0.60, 0.11),      // 原点在肩关节
    torso: new THREE.BoxGeometry(0.36, 0.55, 0.22),
    head: new THREE.SphereGeometry(0.115, 8, 6),
    helmDe: new THREE.CylinderGeometry(0.14, 0.155, 0.10, 10),   // 德钢盔（煤斗形：直筒+外撇）
    helmUs: new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),  // 美 M1（半球）
    helmSu: new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),   // 苏 ssh40
    capSu: new THREE.CylinderGeometry(0.125, 0.135, 0.10, 8),    // 苏乌山卡（圆筒棉帽）
    pack: new THREE.BoxGeometry(0.26, 0.32, 0.13),     // 背包
    rifle: new THREE.BoxGeometry(0.045, 0.05, 1.02),   // 步枪（斜挎胸前）
  };
  G.leg.translate(0, -0.39, 0);
  G.arm.translate(0, -0.30, 0);
  return G;
}

// ── 阵营材质缓存 ──
const _mats = new Map();
function factionMats(fk, snow) {
  const key = fk + (snow ? '_s' : '');
  if (_mats.has(key)) return _mats.get(key);
  const F = FACTIONS[fk];
  const mk = (c, r = 0.92) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0.02 });
  const m = {
    uniform: mk(snow ? F.uniformSnow : F.uniform),
    helmet: mk(snow ? 0xcfd4d8 : F.helmetColor),
    skin: mk(SKIN, 0.8),
    gear: mk(F.gear),
    rifle: mk(RIFLE, 0.75),
  };
  _mats.set(key, m);
  return m;
}

// ═══ 士兵个体 ═══
// 状态：march 行军 / prone 卧倒（受惊）/ dead 倒地（阵亡）。root 原点在脚底，面朝局部 +z
export class Soldier {
  constructor(fk, rand = Math.random) {
    const F = FACTIONS[fk];
    const snow = rand() < F.snowRate;
    const M = factionMats(fk, snow);
    const g = geos();
    this.faction = fk;
    this.state = 'march';
    this.phase = rand() * Math.PI * 2;      // 步态相位（打散全班同步）
    this._pose = 0;                          // 0=站姿 1=卧倒
    this._stagger = 0;                       // 受惊反应延迟（秒）
    this._fallT = -1;                        // 倒地动画计时（<0 未死）
    this._fallAxis = rand() < 0.5 ? 'x' : 'z';
    this._fallSign = rand() < 0.5 ? 1 : -1;

    const root = this.root = new THREE.Group();
    const s = 0.96 + rand() * 0.08;          // 身高微差
    root.scale.setScalar(s);

    const legL = this.legL = new THREE.Mesh(g.leg, M.uniform);
    legL.position.set(-0.10, 0.78, 0);
    const legR = this.legR = new THREE.Mesh(g.leg, M.uniform);
    legR.position.set(0.10, 0.78, 0);
    const torso = new THREE.Mesh(g.torso, M.uniform);
    torso.position.y = 1.055;
    const head = new THREE.Mesh(g.head, M.skin);
    head.position.y = 1.44;
    let helm;
    const hKey = fk === 'su' && rand() < 0.4 ? 'cap' : F.helmet;
    helm = new THREE.Mesh(hKey === 'stahlhelm' ? g.helmDe : hKey === 'm1' ? g.helmUs : hKey === 'ssh40' ? g.helmSu : g.capSu, M.helmet);
    helm.position.y = hKey === 'stahlhelm' ? 1.50 : 1.51;
    const armL = this.armL = new THREE.Mesh(g.arm, M.uniform);
    armL.position.set(-0.235, 1.30, 0);
    const armR = this.armR = new THREE.Mesh(g.arm, M.uniform);
    armR.position.set(0.235, 1.30, 0);
    const pack = new THREE.Mesh(g.pack, M.gear);
    pack.position.set(0, 1.12, -0.175);
    const rifle = new THREE.Mesh(g.rifle, M.rifle);
    rifle.position.set(0.06, 1.18, 0.13);           // 斜挎胸前（行军携行）
    rifle.rotation.set(0.5, 0, 0.35);
    root.add(legL, legR, torso, head, helm, armL, armR, pack, rifle);
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.soldier = this; } });
  }

  // 受惊卧倒（stagger = 反应延迟秒）
  prone(stagger = 0) {
    if (this.state === 'dead') return;
    this.state = 'prone';
    this._stagger = stagger;
  }
  // 起立恢复
  rise() {
    if (this.state === 'dead') return;
    this.state = 'march';
  }
  // 中弹倒地
  kill() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this._fallT = 0;
  }

  /**
   * @param dt      帧时长
   * @param moving  本帧是否在行进（班停止时原地站立）
   * @param speedK  步频系数（≈行进速度）
   */
  update(dt, moving, speedK = 1) {
    const r = this.root;
    if (this.state === 'dead') {
      // 倒地：绕水平轴翻倒（ease-in 加速），落地后静止
      if (this._fallT >= 0 && this._fallT < 0.5) {
        this._fallT += dt;
        const k = Math.min(1, this._fallT / 0.5);
        const ang = (k * k) * (Math.PI / 2) * 0.97;
        if (this._fallAxis === 'x') r.rotation.x = ang * this._fallSign;
        else r.rotation.z = ang * this._fallSign;
        r.position.y = Math.sin(k * Math.PI) * 0.06;   // 翻倒微弹跳
      }
      return;
    }
    // 卧倒/起立过渡
    const target = this.state === 'prone' ? 1 : 0;
    if (this._stagger > 0) this._stagger -= dt;
    else if (this._pose !== target) {
      const d = dt / 0.38;
      this._pose += Math.sign(target - this._pose) * Math.min(d, Math.abs(target - this._pose));
    }
    const p = this._pose;
    // 站姿步态 → 卧倒姿态的连续插值
    if (moving && p < 1) {
      this.phase += dt * 7.2 * speedK;                  // ~1.15 步/秒·腿
      const sw = Math.sin(this.phase);
      this.legL.rotation.x = sw * 0.55 * (1 - p);
      this.legR.rotation.x = -sw * 0.55 * (1 - p);
      this.armL.rotation.x = -sw * 0.38 * (1 - p);
      this.armR.rotation.x = sw * 0.38 * (1 - p);
      r.position.y = Math.abs(Math.cos(this.phase)) * 0.045 * (1 - p) + p * 0.10;
    } else {
      this.legL.rotation.x *= (1 - p); this.legR.rotation.x *= (1 - p);
      this.armL.rotation.x *= (1 - p); this.armR.rotation.x *= (1 - p);
      r.position.y = p * 0.10;
    }
    if (p > 0) {
      // 卧倒：体干前倾贴地、腿后伸微撇、臂前伸撑地
      r.rotation.x = -1.42 * p;
      this.legL.rotation.x += 0.12 * p;
      this.legR.rotation.x += -0.12 * p;
      this.armL.rotation.x += -1.25 * p;
      this.armR.rotation.x += -1.25 * p;
    } else {
      r.rotation.x = 0;
    }
  }
}

// ═══ 步兵班 ═══
// 沿折线路径纵队行进（两列交错）；shellAt() = 炮击事件（内圈死、外圈全班卧倒数秒）
export class Squad {
  /**
   * @param scene  THREE.Scene（或任意 Group）
   * @param opts   { faction:'de'|'us'|'su', path:[[x,z]...], count, spacing, speed, loop, rand }
   */
  constructor(scene, opts) {
    const rand = opts.rand || Math.random;
    this.path = opts.path;
    this.loop = opts.loop !== false;
    this.speed = opts.speed ?? 1.25;
    this.alertT = 0;
    this.soldiers = [];
    this._s = 0;                                   // 排头弧长参数
    const spacing = opts.spacing ?? 2.4;
    const count = opts.count ?? 8;
    // 预计算弧长
    this._cum = [0];
    for (let i = 1; i < this.path.length; i++) {
      const [ax, az] = this.path[i - 1], [bx, bz] = this.path[i];
      this._cum.push(this._cum[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this._total = this._cum[this._cum.length - 1];
    for (let i = 0; i < count; i++) {
      const s = new Soldier(opts.faction, rand);
      s._sOff = -i * spacing;                      // 沿路径的纵向间隔
      s._lat = (i % 2 === 0 ? -0.7 : 0.7) * (0.8 + rand() * 0.4);   // 两列交错
      scene.add(s.root);
      this.soldiers.push(s);
    }
    this._v = new THREE.Vector3();
    this.update(0);
  }

  // 弧长参数 → 位置/切向（含横移）
  _posAt(s, lat, out) {
    if (this.loop) s = ((s % this._total) + this._total) % this._total;
    else s = Math.max(0, Math.min(this._total, s));
    const c = this._cum;
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    const [ax, az] = this.path[i - 1], [bx, bz] = this.path[i];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    out.x = ax + dx * t - uz * lat;
    out.z = az + dz * t + ux * lat;
    out.yaw = Math.atan2(ux, uz);
    return out;
  }

  // 炮击事件：rKill 内阵亡，rProne 内全班卧倒 sec 秒
  shellAt(pos, rKill = 6, rProne = 22, sec = 4) {
    let killed = 0, alarmed = false;
    for (const s of this.soldiers) {
      if (s.state === 'dead') continue;
      const d = Math.hypot(s.root.position.x - pos.x, s.root.position.z - pos.z);
      if (d < rKill) { s.kill(); killed++; }
      else if (d < rProne) alarmed = true;
    }
    if (alarmed) {
      this.alertT = Math.max(this.alertT, sec);
      for (const s of this.soldiers) {
        if (s.state !== 'dead') s.prone(Math.random() * 0.45);
      }
    }
    return killed;
  }

  update(dt) {
    if (this.alertT > 0) {
      this.alertT -= dt;
      if (this.alertT <= 0) for (const s of this.soldiers) s.rise();
    }
    const moving = this.alertT <= 0;
    if (moving) this._s += this.speed * dt;
    const tmp = { x: 0, z: 0, yaw: 0 };
    for (const s of this.soldiers) {
      this._posAt(this._s + s._sOff, s._lat, tmp);
      s.root.position.x = tmp.x;
      s.root.position.z = tmp.z;
      s.root.rotation.y = tmp.yaw;
      s.update(dt, moving, this.speed);
    }
  }

  aliveCount() { return this.soldiers.reduce((n, s) => n + (s.state !== 'dead' ? 1 : 0), 0); }
}
