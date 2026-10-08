// ═══ 特效编排：炮口风暴 / 爆炸 / 殉爆喷火 / 机炮·命中共用火花 / 地面尘幕 / 扬尘 / 排气 / 残骸燃烧 ═══
// 配方移植自 modalTank 实测参数；注意本项目粒子 grav 符号约定：正值 = 向下（modalTank 负值 = 向下，已换算）
import * as THREE from 'three';

const V = () => new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _NEG_Z = new THREE.Vector3(0, 0, -1);
const _tv1 = new THREE.Vector3();
const _tv2 = new THREE.Vector3();
const _aY = new THREE.Vector3();
const _tm = new THREE.Matrix4();

// ── 尘土随机层次：明度抖动（同团深浅不一，前后景深感）+ 透明度抖动 ──
// 返回新数组（粒子池只读引用，严禁原地改共享配色表）
const _jCol = (c, amt = 0.16) => {
  const k = 1 + (Math.random() - 0.5) * 2 * amt;
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
};
const _jA = (a, amt = 0.3) => Math.max(0.05, a * (1 - amt + Math.random() * 2 * amt));

// ── 击毁爆炸焦痕纹理（程序化 512²，2026-09-25 v3）：全部由径向渐变"软印章"叠成——
//    ①非对称炭化核（沿随机轴拉伸的不规则深盘，两层深浅）②粗壮放射状烧蚀痕（漂移印章链，
//    长短悬殊、方向性强，模拟爆抛物烧蚀拖尾）③外抛散点（不规则小斑沿射线尾部分布，外淡内浓）
//    ④枯草热晕（低alpha小斑随机散布外缘，无环状轮廓）。无硬边无规则几何，多层土色递进融入地面。──
function makeScorchTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const R = S / 2;
  const CHAR = '18,14,10', BROWN = '52,40,26', ASH = '108,94,70';
  const stamp = (x, y, r, rgb, a) => {
    if (r <= 0.5 || a <= 0.004) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  };
  // 非对称轴向：核心沿此轴拉伸（模拟斜爆/弹向拖尾）
  const axis = Math.random() * Math.PI * 2;
  const axc = Math.cos(axis), axs = Math.sin(axis);
  const warp = (x, y) => {   // 以中心为基准沿 axis 拉伸 1.25 / 横向 0.92
    const dx = x - R, dy = y - R;
    const u = dx * axc + dy * axs, v = -dx * axs + dy * axc;
    return [R + u * 1.25 * axc - v * 0.92 * axs, R + u * 1.25 * axs + v * 0.92 * axc];
  };

  // ① 炭化核：大软章错位叠成不规则深盘（沿轴拉伸）+ 内部土色斑驳（焦黑与烤土混合，非纯黑）
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 1.5) * R * 0.36;
    const [x, y] = warp(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
    stamp(x, y, R * (0.16 + Math.random() * 0.2), CHAR, 0.15 + Math.random() * 0.2);
  }
  for (let i = 0; i < 14; i++) {   // 核内烤土斑驳（棕/土黄，压进焦盘边缘带）
    const a = Math.random() * Math.PI * 2;
    const rr = R * (0.14 + Math.random() * 0.24);
    const [x, y] = warp(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
    stamp(x, y, R * (0.07 + Math.random() * 0.11), Math.random() < 0.5 ? BROWN : '84,66,42', 0.1 + Math.random() * 0.14);
  }
  for (let i = 0; i < 9; i++) {   // 中心最黑热点
    const [x, y] = warp(R + (Math.random() - .5) * R * 0.26, R + (Math.random() - .5) * R * 0.26);
    stamp(x, y, R * (0.09 + Math.random() * 0.12), '10,8,6', 0.3 + Math.random() * 0.25);
  }

  // ② 放射状烧蚀痕：2~3 条主痕特长（0.85~1.05R），其余短（0.3~0.6R）——方向性抛洒感
  const RAYS = 16 + Math.floor(Math.random() * 5);
  const mainIdx = new Set();
  while (mainIdx.size < 2 + Math.floor(Math.random() * 2)) mainIdx.add(Math.floor(Math.random() * RAYS));
  for (let i = 0; i < RAYS; i++) {
    const isMain = mainIdx.has(i);
    const a0 = (i / RAYS) * Math.PI * 2 + Math.random() * 0.3 - 0.15;
    const L = isMain ? R * (0.85 + Math.random() * 0.2) : R * (0.3 + Math.random() * 0.32);
    const steps = isMain ? 10 + Math.floor(Math.random() * 5) : 5 + Math.floor(Math.random() * 4);
    const w0 = R * (isMain ? 0.09 + Math.random() * 0.09 : 0.06 + Math.random() * 0.08);
    const rgb = Math.random() < 0.65 ? CHAR : BROWN;
    let a = a0;
    for (let s = 0; s < steps; s++) {
      const f = s / (steps - 1);
      a += (Math.random() - 0.5) * (isMain ? 0.1 : 0.2);
      const r = R * 0.14 + f * (L - R * 0.14);
      const w = Math.max(w0 * (1 - f * 0.65), 2);
      const [x, y] = [R + Math.cos(a) * r, R + Math.sin(a) * r];
      stamp(x, y, w, rgb, (isMain ? 0.5 : 0.34) * (1 - f * 0.7) + 0.08);
      if (Math.random() < 0.35) stamp(x + w * 0.6, y + w * 0.4, w * 0.7, BROWN, 0.08 * (1 - f) + 0.02);   // 侧向灰烬
    }
  }

  // ③ 外抛散点：小斑沿各向散布（集中在中环带），多数为双章错位的不规则拉长形
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = R * (0.4 + Math.pow(Math.random(), 0.6) * 0.55);
    const fade = 0.5 - (rr / R) * 0.42;
    const [x, y] = [R + Math.cos(a) * rr, R + Math.sin(a) * rr];
    const r = 1.5 + Math.random() * 4;
    stamp(x, y, r, Math.random() < 0.6 ? CHAR : BROWN, fade * (0.35 + Math.random() * 0.4));
    stamp(x + r * 0.8, y - r * 0.5, r * 0.72, BROWN, fade * (0.22 + Math.random() * 0.3));
  }

  // ④ 枯草热晕：更小更多、随机散布外缘（无环状对齐无独立轮廓），极低 alpha 模拟烧灼枯草向外过渡
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = R * (0.55 + Math.random() * 0.42);
    stamp(R + Math.cos(a) * rr, R + Math.sin(a) * rr, R * (0.035 + Math.random() * 0.075), ASH, 0.022 + Math.random() * 0.038);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Effects {
  constructor(scene, particles, audio, terrainHeightFn, camera = null) {
    this.scene = scene;
    this.ps = particles;
    this.audio = audio;
    this.groundY = terrainHeightFn;
    this.camera = camera;   // 曳光火光段的弹道屏幕投影对齐用
    this.shakeAmount = 0;
    this.theme = 'default';   // 特效主题（maps.js 按图设置）：'snow'=阿登雪原——扬尘/飞溅全部白与浅灰系
    this._delayed = [];     // 延迟特效队列（弹着尘堆：命中 0.5s 后腾起）
    // 冲击波环（池化）
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.PlaneGeometry(32, 32);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uRingR: { value: 0 }, uWidth: { value: 0.8 }, uAlpha: { value: 0 },
          uColor: { value: new THREE.Color(0xd8c8a0) },
        },
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uRingR,uWidth,uAlpha; uniform vec3 uColor; varying vec2 vP;
          void main(){ float r = length(vP); float d = (r - uRingR) / uWidth; float a = exp(-d*d*0.6) * uAlpha; if (a < 0.006) discard; gl_FragColor = vec4(uColor, a); }`,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.rings.push({ mesh, t: 1, dur: 1, size: 1, alpha: 0.5 });
    }
    // 碎片（池化）：默认小方块（砖石）；wood=true 换长条形木片几何；shard=true 换不规则斜劈铁片
    this.debris = [];
    this.debrisGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.woodGeo = new THREE.BoxGeometry(0.55, 0.035, 0.12);   // 长条薄木片
    this.leafGeo = new THREE.BoxGeometry(0.075, 0.008, 0.045);   // 叶片 7.5cm×4.5cm
    // 斜劈破片：四面体 + 各顶点随机径向拉伸（焊接同位顶点保证面不撕裂）→ 歪斜铁片感
    this.shardGeo = (() => {
      const g = new THREE.TetrahedronGeometry(0.16, 0);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      const seen = new Map();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3);
        if (!seen.has(key)) seen.set(key, 0.6 + Math.random() * 0.8);
        v.multiplyScalar(seen.get(key));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    })();
    const dGeo = this.debrisGeo;
    const dMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.9 });
    for (let i = 0; i < 200; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.debris.push({ mesh: m, vel: V(), rot: V(), life: 0, grav: 22, drag: 0 });
    }
    // 机枪曳光弹飞行体（拉长圆柱体，池化；半径 5cm×横向 1.8 倍，保证远距可见）
    const MG = 64;
    this.mgBullets = [];
    this.mgPool = [];
    this.mgGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.05, 6);   // 真实弹体：长 5cm × 直径 1.5cm
    this.mgGeo.rotateX(Math.PI / 2);
    {
      const p = this.mgGeo.attributes.position;
      const half = 0.025, amp = 0.0025;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        const u = (z / half + 1) * 0.5;
        p.setY(i, p.getY(i) + Math.sin(u * Math.PI) * amp);
      }
      p.needsUpdate = true;
      this.mgGeo.computeVertexNormals();
    }
    this.mgMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < MG; i++) {
      const m = new THREE.Mesh(this.mgGeo, this.mgMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.mgPool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1 });
    }

    // 曳光弹线拖尾（视觉残留）：面向相机的渐隐亮带——长轴沿弹道、头亮尾暗连续一条线
    this.trailMat = new THREE.ShaderMaterial({
      uniforms: {
        uHead: { value: new THREE.Color(1, 0.97, 0.8) },
        uTail: { value: new THREE.Color(1, 0.62, 0.2) },
        uAlpha: { value: 0.8 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform vec3 uHead; uniform vec3 uTail; uniform float uAlpha;
        void main(){ float a = pow(vUv.x, 1.8) * uAlpha; if (a < 0.012) discard;
          gl_FragColor = vec4(mix(uTail, uHead, vUv.x), a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const trailGeo = new THREE.PlaneGeometry(1, 1);
    trailGeo.translate(-0.5, 0, 0);   // 局部 X ∈ [-1,0]：带子在弹头后方，uv.x=1 为弹头端
    this.trails = [];
    this.trailPool = [];
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(trailGeo, this.trailMat);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.trailPool.push({ mesh: m, dir: new THREE.Vector3(), lenMax: 0, width: 0.1, range: 0, flown: 0, life: 0, maxLife: 0 });
    }

    // ── 弹壳抛壳系统（池化） ──
    this.casings = [];
    this.casingPool = [];
    // 三种弹壳几何体：机枪小弹壳 / M230机炮弹壳 / 炮弹大弹壳
    const geoMg = new THREE.CylinderGeometry(0.0075, 0.0075, 0.12, 6);
    const geoM230 = new THREE.CylinderGeometry(0.0175, 0.0175, 0.20, 6);
    const geoCannon = new THREE.CylinderGeometry(0.07, 0.07, 0.40, 8);
    this.casingGeos = { mg: geoMg, m230: geoM230, cannon: geoCannon };
    this.casingMats = {
      brass: new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.35, metalness: 0.8 }),
      olive: new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.55, metalness: 0.5 }),
    };
    const CASING_POOL = 80;
    for (let i = 0; i < CASING_POOL; i++) {
      const m = new THREE.Mesh(geoMg, this.casingMats.brass);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.casingPool.push({ mesh: m, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), life: 0, max: 1, settled: false });
    }
  }

  addShake(a) { this.shakeAmount = Math.min(this.shakeAmount + a, 1.6); }

  // ── 炮口风暴：核心爆闪 + 制退器侧瓣 + 前向火舌 + 冲击环 + 前喷炮烟 + 侧向云 ──
  // sideDir = 炮口横向（世界）；缺省时由 dir × up 计算
  muzzleBlast(pos, dir, sideDir = null) {
    if (sideDir) _side.copy(sideDir);
    else _side.crossVectors(dir, _up);
    if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
    _side.normalize();
    // 核心爆闪
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.12, size0: 7, size1: 19, alpha: 1,
      c0: [1, 0.97, 0.82], c1: [1, 0.55, 0.18], fadeIn: 0.22, rotSpeed: 0,
    });
    // 制退器侧瓣 ×2
    for (const side of [1, -1]) {
      this.ps.spawn('glow', {
        x: pos.x + _side.x * side * 1.1, y: pos.y + _side.y * side * 1.1, z: pos.z + _side.z * side * 1.1,
        life: 0.09, size0: 3.6, size1: 8.5, alpha: 0.95,
        c0: [1, 0.82, 0.45], c1: [1, 0.42, 0.1], fadeIn: 0.3, rotSpeed: 0,
      });
    }
    // 前向火舌
    for (let i = 0; i < 8; i++) {
      const sp = 28 + Math.random() * 26;
      const j2 = () => (Math.random() - 0.5) * 2.2;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j2(), vy: dir.y * sp + 1 + j2(), vz: dir.z * sp + j2(),
        life: 0.11 + Math.random() * 0.08, size0: 2, size1: 5, alpha: 0.95, drag: 3,
        c0: [1, 0.9, 0.6], c1: [1, 0.45, 0.12], fadeIn: 0.4,
      });
    }
    // 冲击环
    this._ring(pos, 13, 0.26, 0.85);
    // 前喷炮烟：瞬间云团（出生即大，快速膨胀）
    for (let i = 0; i < 42; i++) {
      const sp = 14 + Math.random() * 16;
      const j = () => (Math.random() - 0.5) * 4.5;
      this.ps.spawn('smoke', {
        x: pos.x + dir.x * 0.6, y: pos.y + dir.y * 0.6, z: pos.z + dir.z * 0.6,
        vx: dir.x * sp + j(), vy: dir.y * sp + Math.abs(j()) * 0.5, vz: dir.z * sp + j(),
        life: 0.9 + Math.random() * 0.8, size0: 2, size1: 6.5 + Math.random() * 2.5,
        alpha: 0.38, drag: 3.2, grav: -0.55, windK: 0.7,
        c0: [0.93, 0.91, 0.87], c1: [0.55, 0.53, 0.5], fadeIn: 0.06, sizeEase: 1.9,
      });
    }
    // 制退器侧向云
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const sp = 7 + Math.random() * 8;
      this.ps.spawn('smoke', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: _side.x * side * sp + (Math.random() - .5) * 2, vy: 0.7 + Math.random() * 0.8,
        vz: _side.z * side * sp + (Math.random() - .5) * 2,
        life: 1 + Math.random() * 0.7, size0: 1.6, size1: 5 + Math.random() * 2,
        alpha: 0.3, drag: 2.4, grav: -0.45, windK: 0.6,
        c0: [0.88, 0.85, 0.8], c1: [0.5, 0.48, 0.46], fadeIn: 0.06, sizeEase: 1.8,
      });
    }
    this.ps.flash(pos, 0xffa550, 62, 23);   // ≈0.2s
    // 炮口近地：爆风震起地面浮尘
    const gy = this.groundY(pos.x, pos.z);
    if (pos.y - gy < 12) {
      const k = Math.max(0.4, Math.min(1.2, 1.15 - (pos.y - gy) * 0.08));
      this.groundShock({ x: pos.x, y: gy, z: pos.z }, k);
    }
  }

  // ── 地面浮尘幕：以 pos（y=地面高）为中心一圈震起浮尘（开炮/爆炸用） ──
  groundShock(pos, strength = 1) {
    const R = 2.4 + strength * 1.8;   // 浮尘环半径
    const gy = pos.y;
    // 外圈烟幕：超大·淡而可见·快速外扩飘散
    const n1 = 10 + Math.round(strength * 5);
    for (let i = 0; i < n1; i++) {
      const a = (i / n1) * Math.PI * 2 + Math.random() * 0.6;
      const sp = (2.6 + Math.random() * 3.6) * strength;
      this.ps.spawn('smoke', {
        x: pos.x + Math.cos(a) * R, y: gy + 0.22 + Math.random() * 0.3, z: pos.z + Math.sin(a) * R,
        vx: Math.cos(a) * sp, vy: 0.9 + Math.random() * 1.2, vz: Math.sin(a) * sp,
        life: 1.5 + Math.random() * 1.1, size0: 2, size1: 9 + Math.random() * 5,
        alpha: 0.24 + Math.random() * 0.06, drag: 1.15, grav: 0.12, windK: 1.7,
        c0: this.theme === 'snow' ? [0.90, 0.91, 0.94] : [0.67, 0.58, 0.43],   // 雪原：震起雪尘（白）
        c1: this.theme === 'snow' ? [0.76, 0.78, 0.82] : [0.58, 0.5, 0.39], fadeIn: 0.14, sizeEase: 1.3,
      });
    }
    // 内圈核心：稍浓但同样虚化
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.ps.spawn('smoke', {
        x: pos.x + Math.cos(a) * 0.8, y: gy + 0.2, z: pos.z + Math.sin(a) * 0.8,
        vx: Math.cos(a) * 3.4 * strength, vy: 1.3 + Math.random() * 1.4, vz: Math.sin(a) * 3.4 * strength,
        life: 1.2 + Math.random() * 0.8, size0: 1.4, size1: 6,
        alpha: 0.32, drag: 1.5, grav: 0.1, windK: 1.4,
        c0: this.theme === 'snow' ? [0.85, 0.86, 0.90] : [0.61, 0.52, 0.39],   // 雪原：内圈雪尘
        c1: this.theme === 'snow' ? [0.70, 0.72, 0.76] : [0.54, 0.47, 0.37], fadeIn: 0.1, sizeEase: 1.35,
      });
    }
    // 地面尘环（淡白尘环快速掠过）
    this._ring(pos, 10 * strength, 0.5, 0.18);
  }

  // ── 火药残烟：开炮 0.5s 后炮口喷出白烟团（tank.js 倒计时驱动） ──
  boreEvac(pos, dir) {
    for (let i = 0; i < 22; i++) {
      const sp = 2.5 + Math.random() * 3.5;
      const j = () => (Math.random() - 0.5) * 1.6;
      this.ps.spawn('smoke', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j(), vy: dir.y * sp + 0.9 + Math.random() * 0.7, vz: dir.z * sp + j(),
        life: 1 + Math.random() * 0.35, size0: 1.5, size1: 3.3,
        alpha: 0.5, drag: 1.4, grav: -0.3, windK: 0.9,
        c0: [0.9, 0.89, 0.87], c1: [0.72, 0.71, 0.7], fadeIn: 0.1, sizeEase: 1.7,
      });
    }
  }

  // ── 装甲命中火花（跳弹/未击穿/击穿入口统一；dir 可空 = 半球四溅）──
  // 火花粒子缩小 + 少量扁平斜劈铁片破片（避免大块碎屑的违和感）
  hitSpark(pos, dir) {
    const n = dir ? 22 : 18;
    for (let i = 0; i < n; i++) {
      const sp = 9 + Math.random() * 16;
      if (dir) {
        // 定向：沿弹道方向喷入装甲（击穿入口锥）
        const j = () => (Math.random() - .5) * 6.5;
        this.ps.spawn('glow', {
          x: pos.x, y: pos.y, z: pos.z,
          vx: dir.x * sp + j(), vy: dir.y * sp + 1.6 + j() * 0.3, vz: dir.z * sp + j(),
          life: 0.24 + Math.random() * 0.2, size0: 0.2, size1: 0.04, alpha: 1, grav: 19, drag: 0.45,
          c0: [1, 0.93, 0.65], c1: [1, 0.5, 0.15], fadeIn: 0.1,
        });
      } else {
        const a = Math.random() * Math.PI * 2, e = Math.random() * 2;
        this.ps.spawn('glow', {
          x: pos.x, y: pos.y, z: pos.z,
          vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp, vz: Math.sin(a) * sp * Math.sin(e),
          life: 0.26 + Math.random() * 0.2, size0: 0.18, size1: 0.04, alpha: 1, grav: 20, drag: 0.4,
          c0: [1, 0.9, 0.6], c1: [1, 0.5, 0.15], fadeIn: 0.12,
        });
      }
    }
    // 扁平小破片：斜劈铁片（更小更扁，替代大块碎屑感）
    this._debrisBurst(pos, 5, 12, { shard: true, size: 0.35, life: 0.7, grav: 22 });
    // 入口炽白闪
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.13, size0: 1.6, size1: 3.6, alpha: 1,
      c0: [1, 0.95, 0.8], c1: [1, 0.6, 0.2], fadeIn: 0.3, rotSpeed: 0,
    });
    // 命中硝烟：浅/中/深灰三档多团向上飘散
    const grays = [
      { c0: [0.62, 0.6, 0.57], c1: [0.5, 0.48, 0.45], a: 0.5 },
      { c0: [0.42, 0.4, 0.37], c1: [0.3, 0.29, 0.27], a: 0.55 },
      { c0: [0.26, 0.25, 0.23], c1: [0.15, 0.14, 0.13], a: 0.6 },
    ];
    for (let i = 0; i < 9; i++) {
      const g = grays[i % 3];
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - .5) * 1.2, y: pos.y + Math.random() * 0.5, z: pos.z + (Math.random() - .5) * 1.2,
        vx: (Math.random() - .5) * 2.2, vy: 2.2 + Math.random() * 2.2, vz: (Math.random() - .5) * 2.2,
        life: 1.8 + Math.random() * 1.4, size0: 1.2 + Math.random(), size1: 4.5 + Math.random() * 3,
        alpha: g.a, windK: 0.9, drag: 0.5, sizeEase: 1.7,
        c0: g.c0, c1: g.c1, fadeIn: 0.2,
      });
    }
    this.ps.flash(pos, 0xffd080, 26, 38);   // ≈0.12s
  }

  // ── 命中大烟尘：整车扬尘（①车身震动涌尘 ②四周地面随机散布浮尘，非环形不径向外扩）
  // 重质尘配方：低升速 + 微沉降贴地悬停随风漫散（类似树木压倒的扬尘），非热烟上蹿 ──
  bigDustBurst(pos, scale = 1) {
    // ① 车身震动尘：命中点及周边涌出的多层灰尘团，缓慢涌起后悬在车体周围
    const grays = [
      { c0: [0.58, 0.56, 0.53], c1: [0.44, 0.42, 0.4], a: 0.55 },
      { c0: [0.4, 0.38, 0.35], c1: [0.28, 0.27, 0.25], a: 0.6 },
      { c0: [0.25, 0.24, 0.22], c1: [0.14, 0.13, 0.12], a: 0.65 },
    ];
    for (let i = 0; i < 20; i++) {
      const g = grays[i % 3];
      const j = () => (Math.random() - .5) * 2.6;
      this.ps.spawn('smoke', {
        x: pos.x + j(), y: pos.y + Math.random() * 0.8, z: pos.z + j(),
        vx: j() * 1.6, vy: 0.3 + Math.random() * 0.6, vz: j() * 1.6,
        life: 2.4 + Math.random() * 2.2, size0: 1.8 + Math.random() * 1.6,
        size1: (10 + Math.random() * 4) * scale,
        alpha: g.a, windK: 1.3, drag: 1.6, grav: 0.08, sizeEase: 1.5,
        c0: g.c0, c1: g.c1, fadeIn: 0.1 + Math.random() * 0.1,
      });
    }
    // ② 地面浮尘：命中点地面投影周围逐点独立随机散布，缓慢漫起悬停
    const gy = this.groundY(pos.x, pos.z);
    const earths = [
      { c0: [0.55, 0.46, 0.34], c1: [0.38, 0.32, 0.24] },   // 土色
      { c0: [0.46, 0.42, 0.37], c1: [0.3, 0.27, 0.23] },    // 灰土
    ];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.random() * 4;
      const e = earths[i % 2];
      this.ps.spawn('smoke', {
        x: pos.x + Math.sin(a) * r, y: gy + 0.15 + Math.random() * 0.4, z: pos.z + Math.cos(a) * r,
        vx: (Math.random() - .5) * 1.8, vy: 0.15 + Math.random() * 0.5, vz: (Math.random() - .5) * 1.8,
        life: 2.2 + Math.random() * 1.8, size0: 1.6 + Math.random() * 1.2,
        size1: (7 + Math.random() * 4) * scale,
        alpha: 0.5 + Math.random() * 0.12, drag: 1.2, grav: 0.1, windK: 1.5,
        c0: e.c0, c1: e.c1, fadeIn: 0.12 + Math.random() * 0.15, sizeEase: 1.4,
      });
    }
  }

  // ── 机枪曳光弹：拉长圆柱（侧向视角可见）+ 随弹飞行的面向相机光点（主可见手段——
  //    追尾视角下圆柱端面朝向观察者，任何尺寸都不可见；加色粒子始终面向相机） ──
  mgTracer(pos, dir, len = 200) {
    const b = this.mgPool.pop();
    if (!b) return;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.mesh.quaternion.setFromUnitVectors(_NEG_Z, dir);
    b.mesh.scale.setScalar(1);
    b.vel.copy(dir).multiplyScalar(300);
    const dist = Math.min(len, 620);
    b.life = b.max = dist / 300;
    this.mgBullets.push(b);
    // 曳光头亮点（弹头）+ 弹线拖尾（视觉残留：头亮尾暗渐隐亮带，随弹实时跟随）
    const fly = b.life;
    this.ps.spawn('fire', {
      x: pos.x, y: pos.y, z: pos.z,
      vx: dir.x * 300, vy: dir.y * 300, vz: dir.z * 300,
      life: fly, size0: 0.07, size1: 0.04, alpha: 0.9, grav: 0, drag: 0, rotSpeed: 0,
      c0: [1, 0.97, 0.8], c1: [1, 0.66, 0.22],
    });
    const t = this.trailPool.pop();
    if (t) {
      t.mesh.visible = true;
      t.lenMax = 1.0;                            // 拖尾 ~1m
      t.width = 0.018 + Math.random() * 0.012;
      t.range = b.max * 300;              // 弹头全程飞行距离
      t.flown = 0;                        // 已飞距离（拖尾从枪口起生长）
      t.mesh.scale.set(0.02, t.width, 1);
      t.mesh.position.copy(pos);
      t.dir.copy(dir);
      t.life = t.maxLife = b.max + t.lenMax / 300;   // 弹头飞完 + 尾巴追平后消散
      this.trails.push(t);
    }
    // 出膛亮斑
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.05, size0: 0.3, size1: 0.12, alpha: 0.8,
      c0: [1, 0.9, 0.55], c1: [1, 0.6, 0.2], fadeIn: 0.5, rotSpeed: 0,
    });
  }

  // ── 机枪枪口：短火光 + 微烟（参考 darkWil 玩家小闪光） ──
  mgMuzzleFlash(pos, dir) {
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.04, size0: 0.45, size1: 1.0, alpha: 1,
      c0: [1, 0.95, 0.7], c1: [1, 0.5, 0.15], fadeIn: 0.4, rotSpeed: 0,
    });
    for (let i = 0; i < 2; i++) {
      const sp = 3 + Math.random() * 3;
      const j = () => (Math.random() - 0.5) * 1.4;
      this.ps.spawn('smoke', {
        x: pos.x + dir.x * 0.2, y: pos.y + dir.y * 0.2, z: pos.z + dir.z * 0.2,
        vx: dir.x * sp + j(), vy: dir.y * sp + 0.4 + Math.abs(j()) * 0.2, vz: dir.z * sp + j(),
        life: 0.4 + Math.random() * 0.3, size0: 0.3, size1: 1.0, alpha: 0.22, drag: 3, grav: -0.4, windK: 0.8,
        c0: [0.9, 0.88, 0.84], c1: [0.5, 0.48, 0.45], fadeIn: 0.08,
      });
    }
  }

  // ── 机枪命中：铁花四溅 + 微烟 ──
  mgImpact(pos) {
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.5;
      const sp = 6 + Math.random() * 11;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.25 + Math.random() * 0.22, size0: 0.32, size1: 0.05, alpha: 1, grav: 24, drag: 0.4,
        c0: [1, 0.9, 0.6], c1: [1, 0.5, 0.15], fadeIn: 0.08,
      });
    }
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z, vy: 1.6, life: 0.6, size0: 0.3, size1: 1.3, alpha: 0.3,
      c0: [0.5, 0.48, 0.45], c1: [0.3, 0.29, 0.27], fadeIn: 0.1,
    });
  }

  // ── 机枪/机炮命中统一入口：按口径分流（≥20mm 走机炮榴弹配方，其余机枪小火花） ──
  gunImpact(pos, dir, caliber) {
    if (caliber === '30mm') this.cannonImpact(pos, dir);
    else this.mgImpact(pos);
  }

  // ── 30mm 机炮命中：榴弹爆闪 + 大量装甲火花 + 炽热破片 + 硝烟尘雾（dir = 弹道方向，可空） ──
  cannonImpact(pos, dir = null) {
    // 反弹喷溅基准：弹道反向（近似跳飞方向）
    const bx = dir ? -dir.x : 0, by = dir ? Math.abs(-dir.y) * 0.4 : 0, bz = dir ? -dir.z : 0;
    // 1) 爆炸闪光：星芒核心爆闪 + 橙红火球残焰 + 动态光
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.16, size0: 1.5, size1: 4.5, alpha: 1,
      c0: [1, 0.98, 0.88], c1: [1, 0.5, 0.12], fadeIn: 0.22, rotSpeed: 0,
    });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = 2 + Math.random() * 3;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y + 0.1, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 1.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.3 + Math.random() * 0.18, size0: 0.6, size1: 2.2, alpha: 0.9, drag: 2,
        c0: [1, 0.8, 0.4], c1: [0.75, 0.2, 0.03], fadeIn: 0.3,
      });
    }
    this.ps.flash(pos, 0xffb060, 20, 38);   // ≈0.12s
    // 2) 大量装甲火花：黄白细火花沿反弹锥四溅（密）+ 炽红铁花慢速落弧
    for (let i = 0; i < 26; i++) {
      const sp = 9 + Math.random() * 16;
      const j = () => (Math.random() - .5) * 7.5;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: bx * sp * 0.6 + j(),
        vy: by * sp * 0.6 + 2.2 + Math.random() * 3.5 + j() * 0.3,
        vz: bz * sp * 0.6 + j(),
        life: 0.28 + Math.random() * 0.3, size0: 0.36, size1: 0.05, alpha: 1, grav: 20, drag: 0.4,
        c0: [1, 0.95, 0.7], c1: [1, 0.5, 0.14], fadeIn: 0.08,
      });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.3 + Math.random() * 1.0, sp = 4 + Math.random() * 7;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y + 0.1, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 2, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.55 + Math.random() * 0.4, size0: 0.3, size1: 0.1, alpha: 1, grav: 22, drag: 0.15,
        c0: [1, 0.5, 0.16], c1: [0.55, 0.12, 0.03], fadeIn: 0.05,
      });
    }
    // 3) 炽热破片：白热高速曳光破片全球飞散（弱重力长射程）+ 铁质小块翻滚落地
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI;
      const sp = 16 + Math.random() * 14;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp * 0.8, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.18 + Math.random() * 0.14, size0: 0.5, size1: 0.06, alpha: 1, grav: 12, drag: 0.5,
        c0: [1, 1, 0.92], c1: [1, 0.62, 0.25], fadeIn: 0.03,
      });
    }
    this._debrisBurst(pos, 3, 9, { shard: true, size: 0.32, life: 0.9, grav: 26 });
    // 4) 硝烟尘雾：灰白+深灰多团向上翻滚膨胀（机炮榴弹烟柱感）
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - .5) * 0.7, y: pos.y + Math.random() * 0.4, z: pos.z + (Math.random() - .5) * 0.7,
        vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2, vz: Math.sin(a) * sp,
        life: 1.3 + Math.random() * 1.1, size0: 0.8 + Math.random() * 0.6, size1: 3.6 + Math.random() * 2.4,
        alpha: 0.45, windK: 0.8, drag: 1.2, sizeEase: 1.7, fadeIn: 0.12,
        c0: [0.58, 0.56, 0.53], c1: [0.3, 0.29, 0.27],
      });
    }
  }

  // ── 爆反击碎：命中点小尺度橙色爆闪（板被消耗即触发） ──
  eraFlash(pos, dir) {
    this.ps.flash(pos, 0xffb060, 24, 26);   // ≈0.15s 爆闪
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.6;
      const sp = 8 + Math.random() * 16;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.abs(Math.cos(e)) * sp * 0.8, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.3 + Math.random() * 0.25, size0: 0.5, size1: 0.08, alpha: 1, grav: 20, drag: 0.5,
        c0: [1, 0.85, 0.5], c1: [1, 0.4, 0.1], fadeIn: 0.05,
      });
    }
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y + 0.3, z: pos.z, vy: 2.2,
      life: 0.9, size0: 0.5, size1: 2.2, alpha: 0.4,
      c0: [0.55, 0.5, 0.45], c1: [0.3, 0.29, 0.27], fadeIn: 0.1,
    });
  }

  // ── APS 拦截空爆：弹道半途定向爆炸（effective=摧毁弹丸时更猛） ──
  apsIntercept(pos, effective, dir = null) {
    const k = effective ? 1 : 0.6;   // 强度系数
    // 强爆闪（白色偏青，双层）
    this.ps.flash(pos, 0xffffff, 90 * k, 26);
    this.ps.flash(pos, 0xffd090, 50 * k, 14);
    // 定向爆轰火球：沿来袭弹道反方向锥形喷射（无 dir 时球面）
    const bx = dir ? -dir.x : 0, by = dir ? -dir.y : 0.3, bz = dir ? -dir.z : 0;
    for (let i = 0; i < Math.round(14 * k + 8); i++) {
      const sp = 7 + Math.random() * 13;
      // 锥形散布：主方向 + 随机偏移
      const jx = (Math.random() - 0.5) * 1.5, jy = (Math.random() - 0.5) * 1.2, jz = (Math.random() - 0.5) * 1.5;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: (bx + jx) * sp, vy: (by + jy) * sp + 3, vz: (bz + jz) * sp,
        life: 0.3 + Math.random() * 0.3, size0: 1.6 * k + 0.4, size1: 3.8 * k + 0.8, alpha: 0.95, drag: 1.6,
        c0: [1, 0.9, 0.6], c1: [0.85, 0.25, 0.05], fadeIn: 0.25,
      });
    }
    // 致密破片流（白色曳光，速度高、拖尾感）
    for (let i = 0; i < Math.round(34 * k + 10); i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI;
      const sp = 18 + Math.random() * 30;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.sin(e), vy: Math.cos(e) * sp, vz: Math.sin(a) * sp * Math.sin(e),
        life: 0.3 + Math.random() * 0.25, size0: 0.55, size1: 0.06, alpha: 1, grav: 18, drag: 0.4,
        c0: [1, 1, 0.9], c1: [1, 0.6, 0.25], fadeIn: 0.03,
      });
    }
    // 烟云（拦截药柱的灰白烟，快速膨胀）
    for (let i = 0; i < Math.round(10 * k + 4); i++) {
      const sp = 1.5 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - 0.5), y: pos.y + (Math.random() - 0.5), z: pos.z + (Math.random() - 0.5),
        vx: Math.cos(a) * sp, vy: 1.8 + Math.random() * 1.5, vz: Math.sin(a) * sp,
        life: 1.2 + Math.random() * 0.8, size0: 1.2, size1: 4.5, alpha: 0.5, windK: 0.7, drag: 1.2,
        c0: [0.72, 0.7, 0.66], c1: [0.38, 0.37, 0.35], fadeIn: 0.1, sizeEase: 1.6,
      });
    }
    // 冲击环（小型空爆环）
    this._ring(pos, 6 * k + 3, 0.22, 0.55);
    // 震屏（玩家车被拦截时）
    this.addShake(effective ? 0.5 : 0.25);
  }

  // ── 抛壳（机枪/机炮/炮弹弹壳，物理下落 + 触地反弹） ──
  // type: 'mg'(机枪≤20mm) | 'm230'(30mm机炮) | 'cannon'(炮弹)
  // pos: 抛出位置（世界坐标）  dir: 射击方向  sideDir: 侧向（垂直于dir，用于确定抛壳方向）
  ejectCasing(pos, dir, type, sideDir = null) {
    if (this.casingPool.length === 0) {
      // 池空：回收最老的
      const old = this.casings.shift();
      if (old) { old.mesh.visible = false; this.casingPool.push(old); }
    }
    const c = this.casingPool.pop();
    if (!c) return;

    // 选择几何体和材质
    const geo = this.casingGeos[type] || this.casingGeos.mg;
    const mat = type === 'cannon' ? this.casingMats.olive : this.casingMats.brass;
    c.mesh.geometry = geo;
    c.mesh.material = mat;

    // 侧向方向
    if (!sideDir) {
      sideDir = _side.crossVectors(dir, _up);
      if (sideDir.lengthSq() < 1e-6) sideDir.set(1, 0, 0);
      sideDir.normalize();
    }
    // 随机左右抛
    const sideSign = Math.random() < 0.5 ? 1 : -1;
    sideDir = sideDir.clone().multiplyScalar(sideSign);

    // 抛出速度：侧向 + 向上 + 随机后向
    const speed = type === 'cannon' ? (2.5 + Math.random() * 1.5) : (3 + Math.random() * 2);
    c.vel.set(
      sideDir.x * speed + (Math.random() - 0.5) * 1.0 - dir.x * 0.5,
      1.5 + Math.random() * 1.2,
      sideDir.z * speed + (Math.random() - 0.5) * 1.0 - dir.z * 0.5,
    );
    // 角速度（随机翻滚）
    c.angVel.set(
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
      (Math.random() - 0.5) * 12,
    );

    c.mesh.position.copy(pos);
    // 初始旋转：弹壳水平 + 随机
    c.mesh.rotation.set(Math.PI / 2 + Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
    c.mesh.visible = true;
    c.settled = false;
    c.life = type === 'cannon' ? 6 + Math.random() * 2 : 3.5 + Math.random() * 1.5;
    c.max = c.life;
    c.type = type;
    this.casings.push(c);

    // 炮弹/M230弹壳冒烟
    if (type === 'cannon' || type === 'm230') {
      const smokeCount = type === 'cannon' ? 3 : 2;
      for (let i = 0; i < smokeCount; i++) {
        this.ps.spawn('smoke', {
          x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y + 0.1, z: pos.z + (Math.random() - 0.5) * 0.3,
          vx: sideDir.x * 0.5 + (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.3, vz: sideDir.z * 0.5 + (Math.random() - 0.5) * 0.3,
          life: 0.8 + Math.random() * 0.4, size0: 0.08, size1: 0.35, alpha: 0.25, drag: 2, grav: -0.3, windK: 0.5,
          c0: [0.7, 0.68, 0.64], c1: [0.4, 0.38, 0.35], fadeIn: 0.1,
        });
      }
    }
  }

  // ── 跳弹：沿反弹方向的长条火花 + 刮擦白闪 ──
  ricochetSpark(pos, dir) {
    for (let i = 0; i < 14; i++) {
      const sp = 13 + Math.random() * 22;
      const j = () => (Math.random() - .5) * 6.5;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j(), vy: dir.y * sp + 1.8 + j() * 0.35, vz: dir.z * sp + j(),
        life: 0.26 + Math.random() * 0.24, size0: 0.26, size1: 0.05, alpha: 1, grav: 17, drag: 0.45,
        c0: [1, 0.95, 0.75], c1: [1, 0.55, 0.2], fadeIn: 0.1,
      });
    }
    // 扁平小破片
    this._debrisBurst(pos, 4, 14, { shard: true, size: 0.35, life: 0.6, grav: 20 });
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.1, size0: 1.1, size1: 2.6, alpha: 1,
      c0: [1, 0.98, 0.9], c1: [1, 0.75, 0.4], fadeIn: 0.3, rotSpeed: 0,
    });
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z, vy: 1.6, life: 1, size0: 0.4, size1: 1.8,
      alpha: 0.35, windK: 0.9, c0: [0.4, 0.38, 0.34], c1: [0.22, 0.21, 0.2], fadeIn: 0.18,
    });
    this.ps.flash(pos, 0xffd080, 13, 51);   // ≈0.09s
  }

  // ── 击穿出口喷射（弹芯穿透车体另一侧） ──
  // TODO: 伤害模型支持穿透后由 shell.js 触发（当前阶段仅实现并导出，未被调用）
  penExit(pos, dir) {
    for (let i = 0; i < 10; i++) {
      const sp = 9 + Math.random() * 15;
      const j = () => (Math.random() - .5) * 5.5;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + j(), vy: dir.y * sp + Math.abs(j()) * 0.35 + 1, vz: dir.z * sp + j(),
        life: 0.18 + Math.random() * 0.28, size0: 0.42, size1: 0.05, alpha: 1, grav: 14, drag: 0.6,
        c0: [1, 0.9, 0.55], c1: [1, 0.45, 0.1], fadeIn: 0.12,
      });
    }
    // 出口炽流
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.12, size0: 1.1, size1: 2.6, alpha: 0.95,
      c0: [1, 0.95, 0.8], c1: [1, 0.6, 0.2], fadeIn: 0.3, rotSpeed: 0,
    });
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z,
      vx: dir.x * 2.6, vy: dir.y * 2.6 + 0.9, vz: dir.z * 2.6,
      life: 1.2, size0: 0.4, size1: 2.0, alpha: 0.42, windK: 0.8,
      c0: [0.42, 0.38, 0.34], c1: [0.2, 0.19, 0.17], fadeIn: 0.12, sizeEase: 1.4,
    });
    this.ps.flash(pos, 0xffa050, 10, 51);   // ≈0.09s
  }

  // ── 弹着点（未击穿/跳弹） ──
  impactSparks(pos, normal) { this.hitSpark(pos, normal); }

  // ── 击穿：内部喷火 + 浓烟（统一走 hitSpark 定向锥） ──
  penetrationBurst(pos, dir = null) { this.hitSpark(pos, dir); }

  // ── 地面命中：土柱（土尘主导——真实土爆只见尘柱与扬土，火光只有一瞬小闪） ──
  dirtHit(pos, k = 1) {   // k：威力缩放（HE=1.8；AP=1）
    const gy = this.groundY(pos.x, pos.z);
    const p = V().set(pos.x, gy, pos.z);
    const sz = Math.sqrt(k);   // 视觉面积 ∝ 数量×尺寸² → 尺寸开根号
    // 雪原主题（阿登）：土柱/黑烟/灰烟/土烟/掀土全部换成雪雾白与浅灰；其余图保持土色系
    const snow = this.theme === 'snow';
    const DC = snow ? {
      clod: [[0.94, 0.95, 0.97], [0.80, 0.82, 0.86]],   // 飞溅雪块
      dark: [[0.78, 0.80, 0.84], [0.62, 0.64, 0.69]],   // 浓雪雾（阴）
      mid:  [[0.88, 0.89, 0.92], [0.70, 0.72, 0.76]],   // 中灰雪雾
      earth:[[0.91, 0.92, 0.94], [0.75, 0.77, 0.81]],   // 雪尘
      ring: [[0.89, 0.90, 0.93], [0.72, 0.74, 0.78]],   // 冲击波掀雪
    } : {
      clod: [[0.48, 0.38, 0.26], [0.3, 0.22, 0.14]],
      dark: [[0.16, 0.14, 0.12], [0.08, 0.07, 0.06]],
      mid:  [[0.4, 0.36, 0.32], [0.25, 0.22, 0.2]],
      earth:[[0.5, 0.4, 0.28], [0.32, 0.24, 0.16]],
      ring: [[0.55, 0.46, 0.34], [0.38, 0.32, 0.24]],
    };
    const lfK = snow ? 0.6 : 1;   // 雪尘粒重：生命周期短、沉降快（grav 各段转正）
    // 中心爆闪（2026-09-25 强化：命中点清晰亮斑；仍一瞬即逝不酿火球）
    this.ps.spawn('glow', {
      x: p.x, y: gy + 0.5, z: p.z, life: 0.17, size0: 1.6 * sz, size1: 4.2 * sz, alpha: 0.85,
      c0: [1, 0.94, 0.7], c1: [1, 0.35, 0.06], fadeIn: 0.2,
    });
    // 少量小火舌贴尘卷起（随尘散去）
    for (let i = 0; i < 2 * k; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      this.ps.spawn('fire', {
        x: p.x, y: gy + 0.4, z: p.z,
        vx: Math.sin(a) * sp, vy: 0.8 + Math.random() * 2, vz: Math.cos(a) * sp,
        life: 0.16 + Math.random() * 0.14, size0: 0.6 * sz, size1: 1.7 * sz, alpha: 0.55, drag: 1.5,
        c0: [1, 0.72, 0.24], c1: [0.55, 0.12, 0.02], fadeIn: 0.25,
      });
    }
    // 四散土块（大块飞溅 + 重力下落；深浅随机避免单一色）
    for (let i = 0; i < 30 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (5 + Math.random() * 12) * sz;
      this.ps.spawn('smoke', {
        x: p.x, y: gy + 0.3, z: p.z,
        vx: Math.sin(a) * sp, vy: (5 + Math.random() * 12) * sz, vz: Math.cos(a) * sp,
        life: (1 + Math.random() * 1.5) * lfK, size0: 1.2 * sz, size1: 3.5 * sz, alpha: _jA(0.85, 0.2), grav: 16, drag: 0.5,
        c0: _jCol(DC.clod[0]), c1: _jCol(DC.clod[1]),
      });
    }
    // 黑烟（深色浓烟，贴地扩散）
    for (let i = 0; i < 10 * k; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.5 * sz;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r, y: gy + 0.3, z: p.z + Math.cos(a) * r,
        vx: Math.sin(a) * (1 + Math.random() * 3), vy: 1 + Math.random() * 2.5, vz: Math.cos(a) * (1 + Math.random() * 3),
        life: (2 + Math.random() * 2) * lfK, size0: 3 * sz, size1: 10 * sz, alpha: _jA(0.55, 0.35), grav: snow ? 1.5 : -0.4, drag: 0.7, windK: 1.3,
        c0: _jCol(DC.dark[0], 0.22), c1: _jCol(DC.dark[1], 0.22), fadeIn: 0.15, sizeEase: 2,
      });
    }
    // 灰烟（中等色调，扩散更广）
    for (let i = 0; i < 10 * k; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2.5 * sz;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r, y: gy + 0.3, z: p.z + Math.cos(a) * r,
        vx: Math.sin(a) * (2 + Math.random() * 4), vy: 1 + Math.random() * 3, vz: Math.cos(a) * (2 + Math.random() * 4),
        life: (1.5 + Math.random() * 1.5) * lfK, size0: 2.5 * sz, size1: 8 * sz, alpha: _jA(0.45, 0.35), grav: snow ? 1.3 : -0.5, drag: 0.9, windK: 1.2,
        c0: _jCol(DC.mid[0], 0.2), c1: _jCol(DC.mid[1], 0.2), fadeIn: 0.15, sizeEase: 2,
      });
    }
    // 土色烟（棕色尘土）
    for (let i = 0; i < 12 * k; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 2 * sz;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r, y: gy + 0.25, z: p.z + Math.cos(a) * r,
        vx: Math.sin(a) * (2 + Math.random() * 5), vy: 1 + Math.random() * 3, vz: Math.cos(a) * (2 + Math.random() * 5),
        life: (1.5 + Math.random() * 1.5) * lfK, size0: 2 * sz, size1: 7 * sz, alpha: _jA(0.5, 0.35), grav: snow ? 1.2 : -0.6, drag: 1, windK: 1.1,
        c0: _jCol(DC.earth[0], 0.22), c1: _jCol(DC.earth[1], 0.22), fadeIn: 0.15, sizeEase: 1.8,
      });
    }
    // 冲击波掀土：不规则外扬尘（角度/速度/半径全随机——旧均匀角速版会读成一道"环"）
    for (let i = 0; i < 20 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = Math.random() * 1.2 * sz;
      const sp = (2.5 + Math.random() * 10.5) * sz;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r0, y: gy + 0.12 + Math.random() * 0.5, z: p.z + Math.cos(a) * r0,
        vx: Math.sin(a) * sp, vy: 0.4 + Math.random() * 1.4, vz: Math.cos(a) * sp,
        life: (0.9 + Math.random() * 1.2) * lfK, size0: (1.6 + Math.random() * 1.8) * sz, size1: (5 + Math.random() * 4) * sz,
        alpha: _jA(0.42, 0.4), grav: snow ? 1.0 : -0.8, drag: 1.6, windK: 1.4,
        c0: _jCol(DC.ring[0], 0.24), c1: _jCol(DC.ring[1], 0.24), fadeIn: 0.12, sizeEase: 1.8,
      });
    }
    this.ps.flash(p, 0xffa030, 26 * k, 9);   // 2026-09-25 强化（原 12k/8）
  }

  // ── HE 落地大爆：土尘主导的爆压感（短促小闪 + 贴地尘幕外铺）；替代 explosion 走地面（explosion 火球留给坦克命中）──
  heGround(pos) {
    const gy = this.groundY(pos.x, pos.z);
    const p = V().set(pos.x, gy, pos.z);
    // 雪原主题：爆尘团/贴地尘幕换雪雾白灰（其余图土色系不变）
    const snow = this.theme === 'snow';
    const core = snow ? [[0.82, 0.84, 0.88], [0.64, 0.66, 0.71]] : [[0.34, 0.29, 0.23], [0.2, 0.17, 0.13]];
    const skirt = snow ? [[0.90, 0.91, 0.94], [0.73, 0.75, 0.79]] : [[0.52, 0.44, 0.32], [0.36, 0.3, 0.22]];
    const lfK = snow ? 0.6 : 1;   // 雪尘粒重：生命周期短、沉降快（grav 转正）
    // 短促爆闪（2026-09-25 强化：土爆点亮感；仍一闪即逝不起大火球）
    this.ps.spawn('glow', {
      x: p.x, y: gy + 0.7, z: p.z, life: 0.14, size0: 3.2, size1: 6.5, alpha: 1,
      c0: [1, 0.96, 0.78], c1: [1, 0.5, 0.12], fadeIn: 0.35, rotSpeed: 0,
    });
    // 2~3 条小火舌（随即被尘吞没）
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2;
      this.ps.spawn('fire', {
        x: p.x, y: gy + 0.6, z: p.z,
        vx: Math.sin(a) * sp, vy: 1 + Math.random() * 2, vz: Math.cos(a) * sp,
        life: 0.14 + Math.random() * 0.12, size0: 0.85, size1: 2.1, alpha: 0.6, drag: 1.4,
        c0: [1, 0.75, 0.28], c1: [0.6, 0.14, 0.03], fadeIn: 0.3,
      });
    }
    this.ps.flash(p, 0xffa030, 42, 9);   // 2026-09-25 强化（原 22/8）
    // 中心深色爆尘团（快速膨胀的浓土尘，深浅不一）
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * 0.6, y: gy + 0.5 + Math.random() * 0.8, z: p.z + Math.cos(a) * 0.6,
        vx: Math.sin(a) * sp, vy: 1.6 + Math.random() * 2, vz: Math.cos(a) * sp,
        life: (1.6 + Math.random() * 1.4) * lfK, size0: 2.5 + Math.random() * 1.5, size1: 9 + Math.random() * 4,
        alpha: _jA(0.55, 0.3), grav: snow ? 1.4 : -0.4, drag: 0.9, windK: 1.3,
        c0: _jCol(core[0], 0.24), c1: _jCol(core[1], 0.24), fadeIn: 0.1, sizeEase: 1.9,
      });
    }
    // 贴地尘幕：爆压沿地面向外铺开（角度/速度/宽度全随机，不出现可见环缘）
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 9;
      const r0 = Math.random() * 2;
      this.ps.spawn('smoke', {
        x: p.x + Math.sin(a) * r0, y: gy + 0.15 + Math.random() * 0.4, z: p.z + Math.cos(a) * r0,
        vx: Math.sin(a) * sp, vy: 0.5 + Math.random() * 1.2, vz: Math.cos(a) * sp,
        life: (1.1 + Math.random() * 1.3) * lfK, size0: 1.8 + Math.random() * 1.6, size1: 7 + Math.random() * 4,
        alpha: _jA(0.38, 0.4), grav: snow ? 1.2 : -0.6, drag: 1.5, windK: 1.6,
        c0: _jCol(skirt[0], 0.24), c1: _jCol(skirt[1], 0.24), fadeIn: 0.12, sizeEase: 1.8,
      });
    }
  }

  // ── 大爆炸：爆闪 + 三层火球 + 火花 + 铁花 + 浓烟火柱 + 冲击环 + 近地尘幕 ──
  explosion(pos, scale = 1) {
    // 核心爆闪
    this.ps.spawn('glow', {
      x: pos.x, y: pos.y, z: pos.z, life: 0.18, size0: 8 * scale, size1: 19 * scale, alpha: 1,
      c0: [1, 0.98, 0.9], c1: [1, 0.5, 0.12], fadeIn: 0.3, rotSpeed: 0,
    });
    // 火球（球面分布 + 上偏）
    for (let i = 0; i < 16; i++) {
      const sp = 4.5 + Math.random() * 6.5;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      this.ps.spawn('fire', {
        x: pos.x, y: pos.y + 0.3, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 3.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.4 + Math.random() * 0.35, size0: 2.4 * scale, size1: 6.5 * scale, alpha: 0.95, drag: 1.4,
        c0: [1, 0.78, 0.35], c1: [0.7, 0.16, 0.04], fadeIn: 0.32,
      });
    }
    // 火花四溅（亮黄长条，强重力）
    for (let i = 0; i < 38; i++) {
      const sp = 12 + Math.random() * 22;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.4;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 4.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.45 + Math.random() * 0.4, size0: 0.36, size1: 0.06, alpha: 1, grav: 22, drag: 0.3,
        c0: [1, 0.85, 0.5], c1: [1, 0.4, 0.1], fadeIn: 0.06,
      });
    }
    // 铁花四溅（炽热暗红碎块，高抛物线落地）
    for (let i = 0; i < 18; i++) {
      const sp = 8 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2;
      const e = 0.5 + Math.random() * 1.1;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y + 0.4, z: pos.z,
        vx: Math.cos(a) * sp * Math.cos(e), vy: Math.sin(e) * sp + 5.5, vz: Math.sin(a) * sp * Math.cos(e),
        life: 0.8 + Math.random() * 0.7, size0: 0.26, size1: 0.1, alpha: 1, grav: 19, drag: 0.12,
        c0: [1, 0.45, 0.16], c1: [0.45, 0.1, 0.03], fadeIn: 0.04,
      });
    }
    // 浓烟火柱（出生大团·快速膨胀·低升速不腾高；真黑烟走 smoke 池）
    for (let i = 0; i < 22; i++) {
      const sp = 1.2 + Math.random() * 2.2;
      const a = Math.random() * Math.PI * 2;
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - .5), y: pos.y + 0.5, z: pos.z + (Math.random() - .5),
        vx: Math.cos(a) * sp, vy: 1.2 + Math.random() * 1.6, vz: Math.sin(a) * sp,
        life: 2.6 + Math.random() * 2.8, size0: 3.4 * scale, size1: 9.5 * scale, alpha: 0.7,
        drag: 1.1, grav: -0.35, windK: 1,
        c0: [0.32, 0.29, 0.26], c1: [0.14, 0.13, 0.12], fadeIn: 0.14, sizeEase: 1.9,
      });
    }
    // 冲击环
    this._ring(pos, 13 * scale, 0.3, 0.75);
    // 碎片
    this._debrisBurst(pos, Math.min(14 * scale | 0, 30), 16 * scale);
    // 地面焦土尘（雪原主题：白灰雪尘；其余图焦土色不变）
    const gy = this.groundY(pos.x, pos.z);
    const sc0 = this.theme === 'snow' ? [0.88, 0.89, 0.92] : [0.6, 0.54, 0.44];
    const sc1 = this.theme === 'snow' ? [0.70, 0.72, 0.76] : [0.42, 0.38, 0.32];
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 8 + Math.random() * 14 * scale;
      this.ps.spawn('smoke', {
        x: pos.x, y: gy + 0.4, z: pos.z,
        vx: Math.sin(a) * sp, vy: 2 + Math.random() * 4, vz: Math.cos(a) * sp,
        life: 1.2 + Math.random(), size0: 3, size1: 9, alpha: 0.4, drag: 2,
        c0: sc0, c1: sc1,
      });
    }
    // 近地面追加浮尘幕
    if (pos.y - gy < 3) this.groundShock({ x: pos.x, y: gy, z: pos.z }, 1.3);
    this.ps.flash(pos, 0xffa050, 85 * scale, 14);   // ≈0.32s
  }

  // ── 殉爆座圈喷火（高频调用形成连续火柱 + 大量火花；tank.js 残骸 update 驱动） ──
  jetFire(pos, dir) {
    // 外层橙红火舌
    for (let i = 0; i < 11; i++) {
      const sp = 9 + Math.random() * 10;
      const j = () => (Math.random() - .5) * 3.2;
      this.ps.spawn('fire', {
        x: pos.x + (Math.random() - .5) * 1.6, y: pos.y, z: pos.z + (Math.random() - .5) * 1.6,
        vx: dir.x * sp + j(), vy: dir.y * sp * 0.55 + 1.2 + Math.random() * 1.4, vz: dir.z * sp + j(),
        life: 0.7 + Math.random() * 0.3, size0: 1.8, size1: 4.5, alpha: 1, drag: 0.8, grav: -0.9, sizeEase: 1.3,
        c0: [1, 0.62, 0.2], c1: [0.72, 0.15, 0.03], fadeIn: 0.12,
      });
    }
    // 内层亮黄火心
    for (let i = 0; i < 7; i++) {
      const sp = 7 + Math.random() * 7;
      const j = () => (Math.random() - .5) * 2;
      this.ps.spawn('fire', {
        x: pos.x + (Math.random() - .5) * 1, y: pos.y + 0.1, z: pos.z + (Math.random() - .5) * 1,
        vx: dir.x * sp + j(), vy: dir.y * sp * 0.5 + 1 + Math.random() * 1.2, vz: dir.z * sp + j(),
        life: 0.5 + Math.random() * 0.25, size0: 1.1, size1: 2.4, alpha: 1, drag: 0.85, grav: -1.1,
        c0: [1, 0.9, 0.5], c1: [1, 0.55, 0.12], fadeIn: 0.1,
      });
    }
    // 炽热碎屑四射（强重力回落）
    for (let i = 0; i < 22; i++) {
      const sp = 8 + Math.random() * 15;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.3;
      this.ps.spawn('glow', {
        x: pos.x, y: pos.y + 0.2, z: pos.z,
        vx: dir.x * sp * 0.6 + Math.cos(a) * sp * 0.7 * Math.cos(e),
        vy: Math.sin(e) * sp * 0.7 + 3,
        vz: dir.z * sp * 0.6 + Math.sin(a) * sp * 0.7 * Math.cos(e),
        life: 0.5 + Math.random() * 0.45, size0: 0.3, size1: 0.05, alpha: 1, grav: 20, drag: 0.3,
        c0: [1, 0.85, 0.45], c1: [1, 0.4, 0.08], fadeIn: 0.06,
      });
    }
    // 夹带大团黑烟
    if (Math.random() < 0.6) this.ps.spawn('smoke', {
      x: pos.x, y: pos.y + 0.5, z: pos.z,
      vx: dir.x * 2.5, vy: 1.8, vz: dir.z * 2.5,
      life: 2.4, size0: 2, size1: 5.5, alpha: 0.5, grav: -0.3, drag: 0.7, windK: 1.2, sizeEase: 1.8,
      c0: [0.2, 0.17, 0.15], c1: [0.08, 0.08, 0.08], fadeIn: 0.2,
    });
    this.ps.flash(pos, 0xff8830, 40, 26);   // ≈0.18s
  }

  _ring(pos, size, dur, alpha = 0.5) {
    for (const r of this.rings) {
      if (!r.mesh.visible) {
        r.mesh.visible = true;
        r.mesh.position.set(pos.x, this.groundY(pos.x, pos.z) + 0.6, pos.z);
        r.t = 0; r.dur = dur; r.size = size; r.alpha = alpha;
        return;
      }
    }
  }

  // opts.mats：材质数组（随机取用；缺省用深色默认）；opts.size：整体尺寸系数；opts.wood：长条木片几何+随机朝向
  _debrisBurst(pos, count, speed, opts = {}) {
    let n = 0;
    const mats = opts.mats || null, sizeK = opts.size || 1, wood = !!opts.wood;
    for (const d of this.debris) {
      if (d.life <= 0) {
        d.life = opts.life ? opts.life * (0.75 + Math.random() * 0.5) : 1.6 + Math.random() * 1.6;
        d.mesh.visible = true;
        d.mesh.position.copy(pos);
        d.vel.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
        d.rot.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        if (wood) {
          d.mesh.geometry = this.woodGeo;
          d.mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
          // 木片长度随机变化（长条感）
          const k = (0.5 + Math.random() * 1.6) * sizeK;
          d.mesh.scale.set(k * (0.7 + Math.random() * 0.9), k * (0.6 + Math.random() * 0.6), k);
        } else if (opts.leaf) {
          d.mesh.geometry = this.leafGeo;
          d.mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
          d.mesh.scale.setScalar((0.75 + Math.random() * 0.5) * (opts.leafScale || 1));   // 叶片尺寸微差 × 全局倍率
        } else if (opts.shard) {
          // 斜劈铁片：非均匀拉伸（扁平长条）+ 随机初始姿态，避免正方体规整感
          d.mesh.geometry = this.shardGeo;
          d.mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
          d.mesh.scale.set(
            (0.5 + Math.random() * 1.1) * sizeK,
            (0.22 + Math.random() * 0.4) * sizeK,
            (0.9 + Math.random() * 1.7) * sizeK,
          );
        } else {
          d.mesh.geometry = this.debrisGeo;
          d.mesh.scale.setScalar((0.5 + Math.random() * 1.6) * sizeK);
        }
        if (mats) d.mesh.material = mats[(Math.random() * mats.length) | 0];
        d.grav = opts.grav ?? 22;          // 落叶等轻质碎片用低重力缓慢飘落
        d.drag = opts.drag ?? 0;           // 空气阻力（每秒速度衰减率）
        if (++n >= count) break;
      }
    }
  }

  // ── 行驶扬尘 ──
  trackDust(pos, intensity) {
    this.ps.spawn('smoke', {
      x: pos.x + (Math.random() - 0.5) * 1.2, y: pos.y, z: pos.z + (Math.random() - 0.5) * 1.2,
      vx: (Math.random() - 0.5) * 2, vy: 0.4 + intensity * 1.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 2,
      life: 1.1 + Math.random() * 1.2, size0: 1.2, size1: 4.5 + intensity * 3,
      alpha: 0.10 + intensity * 0.13, drag: 1.4, rotSpeed: 0.7, windK: 1.2,
      c0: this.theme === 'snow' ? [0.90, 0.92, 0.95] : [0.62, 0.55, 0.44],   // 雪原：行驶扬雪雾（白）
      c1: this.theme === 'snow' ? [0.78, 0.80, 0.84] : [0.5, 0.45, 0.38],
    });
  }

  // ── 发动机排烟（intensity 可选 0~1：浓度提升，起步浓黑烟；turbine=燃气轮机灰色烟；
  //    velFade 0~1 = 车速衰减因子：有速度时烟团寿命/尺寸缩短，烟迹不拖远；
  //    type 'up' = 上喷型：甲板朝天管，烟团先上喷 0.5~1m 再自然回落飘散（苏系 KV/IS 类）；
  //    alphaMul 透明度倍率（巡航半烟规则：main.js 按车速/油门计算）；
  //    sideV = 该侧排气口的外侧水平单位向量（V 字上喷：左管偏左、右管偏右） ──
  exhaustPuff(pos, load, intensity = null, turbine = false, velFade = 0, type = '', alphaMul = 1, sideV = null) {
    const k = intensity === null ? 0 : Math.min(Math.max(intensity, 0), 1);
    // 浅灰版（2026-09-26 用户定）：整体抬亮到浅灰区间；备份见 _backup_20260926_exhaust
    // 原黑烟值：const dark = 0.16 + (1 - Math.min(load + k, 1)) * 0.3;（0.16~0.46）
    const dark = 0.55 + (1 - Math.min(load + k, 1)) * 0.17;   // 0.55(重负荷)~0.72(怠速)，负荷越重略深
    let c0, c1;
    if (turbine) {
      const g = 0.42 + (1 - Math.min(load + k, 1)) * 0.18;
      c0 = [g, g, g + 0.02], c1 = [g * 0.68, g * 0.68, g * 0.7];
    } else {
      c0 = [dark + 0.1, dark + 0.09, dark + 0.085], c1 = [dark * 0.6, dark * 0.6, dark * 0.64];
    }
    if (type === 'up') {
      // 上喷轨迹（v3，2026-09-23 用户定）：无重力下落——动能只来自喷出那一下，
      // vy 指数减速（drag 6.5）渐停，喷起 ≈0.5~1.0m 后在原高度上下 ±0.5m 浮动漂移；
      // V 字管口 15~25° 外向倾角（同前）；寿命 ×0.7（烟迹不拉远）
      const _ang = (15 + Math.random() * 10) * Math.PI / 180;
      const _vup = 4.2 + load * 1.6 + Math.random() * 1.2;
      const _vlat = sideV ? _vup * Math.tan(_ang) : 0;
      this.ps.spawn('smoke', {
        x: pos.x, y: pos.y, z: pos.z,
        vx: (Math.random() - 0.5) * 1.2 + (sideV ? sideV.x * _vlat : 0), vy: _vup, vz: (Math.random() - 0.5) * 1.2 + (sideV ? sideV.z * _vlat : 0),
        life: (0.85 + Math.random() * 0.65 + k * 0.45) * (1 - velFade * 0.6),
        size0: (1.0 + load * 0.5 + k * 0.4) * (1 - velFade * 0.2), size1: (3.4 + load * 1.2 + k * 1.6) * (1 - velFade * 0.4),
        alpha: (0.16 + load * 0.2 + k * 0.38) * (1 - velFade * 0.4) * alphaMul, drag: 6.5, dragH: 0.8, windK: 1.2, grav: 0,
        c0, c1, fadeIn: 0.08, sizeEase: 1.3,
      });
      return;
    }
    // 默认型（初团即云化：size0 0.9 起步，fadeIn 短、sizeEase 缓，避免小球→膨胀过程）
    this.ps.spawn('smoke', {
      x: pos.x, y: pos.y, z: pos.z,
      vx: (Math.random() - 0.5) * 2.5, vy: 0.3 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 2.5,
      life: (0.8 + Math.random() * 0.8 + k * 0.6) * (1 - velFade * 0.78),
      size0: (0.9 + k * 0.5) * (1 - velFade * 0.3), size1: (2.8 + load * 1.5 + k * 2.4) * (1 - velFade * 0.6),
      alpha: (0.18 + load * 0.22 + k * 0.4) * (1 - velFade * 0.4) * alphaMul, drag: 0.7, windK: 1.8, grav: -0.15,
      c0, c1, fadeIn: 0.12, sizeEase: 1.5,
    });
  }

  // ── 残骸燃烧 / 起火（持续，每帧调用；0.025s 节流高频重叠生成，烟火各自节流） ──
  burning(pos, dt, intensity = 1, big = false) {
    // --- 真黑烟柱：出生即大团，升速低（贴车），膨胀率大 ---
    this._burnS = (this._burnS || 0) + dt * intensity;
    if (this._burnS > 0.025) {
      this._burnS = 0;
      for (let i = 0; i < 2; i++) {
        const src = Math.random() < 0.6 ? 0.4 : 0.9;   // 动力舱 + 炮塔两个源
        this.ps.spawn('smoke', {
          x: pos.x + (Math.random() - .5) * 1.3, y: pos.y + src, z: pos.z + (Math.random() - .5) * 1.3,
          vx: (Math.random() - .5) * 0.5, vy: 0.6 + Math.random() * 0.4, vz: (Math.random() - .5) * 0.5,
          life: 3.5 + Math.random() * 2, size0: 1.8, size1: 6, alpha: 0.32,
          grav: -0.35, drag: 0.3, windK: 1.4,
          c0: [0.13, 0.11, 0.1], c1: [0.05, 0.05, 0.05], fadeIn: 0.3, sizeEase: 2.2,
        });
      }
    }
    // --- 火焰：起火小火苗（big=false）/ 残骸大火（big=true） ---
    this._burnF = (this._burnF || 0) + dt * intensity;
    if (this._burnF > 0.025) {
      this._burnF = 0;
      if (big) {
        for (let i = 0; i < 2; i++) {
          this.ps.spawn('fire', {
            x: pos.x + (Math.random() - .5) * 5, y: pos.y + 0.5, z: pos.z + (Math.random() - .5) * 5,
            vy: 1.4 + Math.random() * 1, life: 0.5, size0: 1.4, size1: 4.2, alpha: 0.85, sizeEase: 1.4,
            c0: [1, 0.55, 0.18], c1: [0.75, 0.16, 0.03], fadeIn: 0.24,
          });
        }
        this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 2.7, y: pos.y + 0.4, z: pos.z + (Math.random() - .5) * 2.7,
          vy: 1.2 + Math.random() * 0.8, life: 0.34, size0: 0.7, size1: 2.4, alpha: 0.9,
          c0: [1, 0.85, 0.4], c1: [1, 0.5, 0.1], fadeIn: 0.2,
        });
        this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 5.8, y: pos.y + 0.25, z: pos.z + (Math.random() - .5) * 5.8,
          vy: 0.8 + Math.random() * 0.6, life: 0.5, size0: 1.6, size1: 3.8, alpha: 0.8, sizeEase: 1.5,
          c0: [1, 0.5, 0.14], c1: [0.66, 0.13, 0.03], fadeIn: 0.2,
        });
      } else {
        // 起火：低矮小火苗 + 偶发黄心
        this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 1.6, y: pos.y + 0.4, z: pos.z + (Math.random() - .5) * 1.6,
          vy: 1.1 + Math.random() * 0.7, life: 0.4, size0: 0.6, size1: 1.8, alpha: 0.7, sizeEase: 1.4,
          c0: [1, 0.7, 0.25], c1: [0.8, 0.22, 0.05], fadeIn: 0.2,
        });
        if (Math.random() < 0.5) this.ps.spawn('fire', {
          x: pos.x + (Math.random() - .5) * 1.0, y: pos.y + 0.35, z: pos.z + (Math.random() - .5) * 1.0,
          vy: 1.0 + Math.random() * 0.5, life: 0.3, size0: 0.4, size1: 1.2, alpha: 0.8,
          c0: [1, 0.85, 0.4], c1: [1, 0.5, 0.1], fadeIn: 0.18,
        });
      }
      // 残火灯光（闪烁）
      if (Math.random() < (big ? 0.6 : 0.25)) {
        _side.set(pos.x, pos.y + 1, pos.z);
        this.ps.flash(_side, 0xff7722, big ? 22 : 10, big ? 15 : 8);
      }
    }
  }

  // 残骸余烬（大火 20~30s 后）：明火变小变稀，烟更薄但升速快、寿命长 → 高细烟柱
  smolder(pos, dt) {
    this._smoS = (this._smoS || 0) + dt;
    if (this._smoS > 0.034) {
      this._smoS = 0;
      // 薄烟柱：窄散布、升速降 30%、偏斜 5~20° 随机方向（水平分量 = vy·tanθ）、长寿命
      const vy1 = 1.19 + Math.random() * 0.63;
      const tilt1 = (5 + Math.random() * 15) * Math.PI / 180;
      const ta1 = Math.random() * Math.PI * 2, vh1 = vy1 * Math.tan(tilt1);
      this.ps.spawn('smoke', {
        x: pos.x + (Math.random() - .5) * 0.9, y: pos.y + 0.6, z: pos.z + (Math.random() - .5) * 0.9,
        vx: Math.cos(ta1) * vh1, vy: vy1, vz: Math.sin(ta1) * vh1,
        life: 6.5 + Math.random() * 3.5, size0: 3.5, size1: 6.2, alpha: 0.24,
        grav: -0.22, drag: 0.22, windK: 0.9,
        c0: [0.16, 0.15, 0.14], c1: [0.08, 0.08, 0.08], fadeIn: 0.4, sizeEase: 1.6,
      });
      if (Math.random() < 0.8) {
        const vy2 = 0.91 + Math.random() * 0.49;
        const tilt2 = (5 + Math.random() * 15) * Math.PI / 180;
        const ta2 = Math.random() * Math.PI * 2, vh2 = vy2 * Math.tan(tilt2);
        this.ps.spawn('smoke', {
          x: pos.x + (Math.random() - .5) * 1.4, y: pos.y + 0.4, z: pos.z + (Math.random() - .5) * 1.4,
          vx: Math.cos(ta2) * vh2, vy: vy2, vz: Math.sin(ta2) * vh2,
          life: 5.5 + Math.random() * 3, size0: 2.2, size1: 5.0, alpha: 0.18,
          grav: -0.2, drag: 0.22, windK: 0.85,
          c0: [0.2, 0.19, 0.18], c1: [0.1, 0.1, 0.1], fadeIn: 0.4, sizeEase: 1.6,
        });
      }
    }
    // 余火：零星小火苗（不再是大火）
    this._smoF = (this._smoF || 0) + dt;
    if (this._smoF > 0.09) {
      this._smoF = 0;
      if (Math.random() < 0.6) this.ps.spawn('fire', {
        x: pos.x + (Math.random() - .5) * 2.2, y: pos.y + 0.3, z: pos.z + (Math.random() - .5) * 2.2,
        vy: 0.7 + Math.random() * 0.5, life: 0.35, size0: 0.35, size1: 1.1, alpha: 0.6, sizeEase: 1.3,
        c0: [1, 0.62, 0.2], c1: [0.7, 0.2, 0.04], fadeIn: 0.2,
      });
      if (Math.random() < 0.12) {
        _side.set(pos.x, pos.y + 0.8, pos.z);
        this.ps.flash(_side, 0xff7722, 6, 6);
      }
    }
  }

  // 残骸持续小火（40% 残骸 1~2 处火点，tank 按 ~0.055s 节奏逐点调用）：小火苗 + 浓黑烟
  wreckFire(pos) {
    // 浓黑烟（贴近火点升起；升速降 30%、偏斜 5~20° 随机方向）
    const wvy = 0.84 + Math.random() * 0.49;
    const wtilt = (5 + Math.random() * 15) * Math.PI / 180;
    const wta = Math.random() * Math.PI * 2, wvh = wvy * Math.tan(wtilt);
    this.ps.spawn('smoke', {
      x: pos.x + (Math.random() - .5) * 0.5, y: pos.y + 0.25, z: pos.z + (Math.random() - .5) * 0.5,
      vx: Math.cos(wta) * wvh, vy: wvy, vz: Math.sin(wta) * wvh,
      life: 3.5 + Math.random() * 2, size0: 1.0, size1: 3.0, alpha: 0.36,
      grav: -0.2, drag: 0.25, windK: 0.8, fadeIn: 0.3, sizeEase: 1.8,
      c0: [0.09, 0.08, 0.08], c1: [0.04, 0.04, 0.04],
    });
    // 小火苗（围绕火点，比余烬火星大但远小于大火段）
    if (Math.random() < 0.85) this.ps.spawn('fire', {
      x: pos.x + (Math.random() - .5) * 0.5, y: pos.y + 0.15, z: pos.z + (Math.random() - .5) * 0.5,
      vy: 0.9 + Math.random() * 0.6, life: 0.32, size0: 0.4, size1: 1.3, alpha: 0.8, sizeEase: 1.3,
      c0: [1, 0.68, 0.22], c1: [0.72, 0.18, 0.04], fadeIn: 0.18,
    });
  }

  // 弃车舱口烟：灰黑薄烟从炮塔舱门升起（车组离车、未起火爆炸的标记）
  hatchSmoke(pos, dt) {
    this._hatchS = (this._hatchS || 0) + dt;
    if (this._hatchS < 0.06) return;
    this._hatchS = 0;
    this.ps.spawn('smoke', {
      x: pos.x + (Math.random() - .5) * 0.5, y: pos.y + Math.random() * 0.3, z: pos.z + (Math.random() - .5) * 0.5,
      vx: (Math.random() - .5) * 0.3, vy: 1.1 + Math.random() * 0.6, vz: (Math.random() - .5) * 0.3,
      life: 3.5 + Math.random() * 2, size0: 0.45, size1: 2.6, alpha: 0.3,
      grav: -0.18, drag: 0.3, windK: 1.1, fadeIn: 0.35, sizeEase: 1.7,
      c0: [0.3, 0.3, 0.3], c1: [0.15, 0.15, 0.16],
    });
  }

  // ── 弹着尘堆（地面腾起式烟柱）：命中 0.5s 后自地面腾起——尘团全部从贴地处出生、按各自目标高度上抛
  //    （中心 7~10m、四周 2.5m，中心高四周低；上抛初速按含空气阻力的弹道闭式解反算，保证柱顶到位），
  //    到顶后自然坠落贴地（重力+空气阻力），不在空中预先展开成堆；云底全程连续接地面（无悬浮团），
  //    落地按命中点地形托底（ps 粒子 gy）、随风漂移消散；存活 10~15s（旧 20~30s 的一半）；
  //    底部另铺一圈贴地基础云（不腾起的大团），垫住腾起期柱脚，避免柱底离地的悬空感；
  //    大团软烟完全云化（单团更大更透、重叠成整体云团）；范围直径 8~16m 随口径（原 10~20m 两轮各缩 20%）；
  //    （alphaPow 2.5 前慢后快淡出 + fadeIn 0.04 短渐入）；opt 可整套覆盖（命中坦克：r/size 0.7、h 0.8、a 0.85、life 0.7、wind 1.3）──
  dustMound(pos, cal = 75, opt = null) {
    this._delayed.push({ t: 0.5, x: pos.x, y: pos.y, z: pos.z, cal, opt });
  }

  _dustMoundSpawn(d) {
    const o = d.opt || {};
    const R = Math.min(20, Math.max(10, 10 + (d.cal - 75) * (10 / 53))) * (o.r || 1) * 0.8;   // 直径再缩 20%
    const sizeK = o.size || 1, hK = o.h || 1, aK = o.a || 1, lifeK = o.life || 1, wK = o.wind || 1;
    const gy = this.groundY(d.x, d.z);
    const H = (7 + Math.random() * 3) * hK;                        // 中心峰高 7~10m
    const hEdge = 2.5 * hK;                                        // 四周缘高 2.5m
    const life = (10 + Math.random() * 5) * lifeK * (this.theme === 'snow' ? 0.5 : 1);   // 雪尘粒重：半寿命
    // 浅沙土系四档（沙白/浅沙/浅灰/沙色——整体调浅无深土色，含一档特别浅的灰），逐团 _jCol/_jA 抖动
    // 雪原主题（阿登）：雪白/浅白/浅灰/白灰四档
    const DUST = this.theme === 'snow' ? [
      { c0: [0.95, 0.96, 0.98], c1: [0.86, 0.88, 0.91] },   // 雪白
      { c0: [0.90, 0.91, 0.94], c1: [0.80, 0.82, 0.86] },   // 浅白
      { c0: [0.85, 0.86, 0.90], c1: [0.75, 0.77, 0.81] },   // 浅灰
      { c0: [0.88, 0.89, 0.92], c1: [0.78, 0.80, 0.84] },   // 白灰
    ] : [
      { c0: [0.87, 0.83, 0.73], c1: [0.77, 0.73, 0.64] },   // 沙白（最浅）
      { c0: [0.81, 0.76, 0.65], c1: [0.71, 0.66, 0.56] },   // 浅沙
      { c0: [0.81, 0.80, 0.77], c1: [0.71, 0.70, 0.67] },   // 浅灰（一点点特别浅的灰）
      { c0: [0.75, 0.68, 0.55], c1: [0.65, 0.59, 0.48] },   // 沙色
    ];
    const kDrag = 0.4;                                             // 与下方 drag 一致（vy 上抛空气阻力）
    const n = Math.round(30 + R * 1.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = R * Math.sqrt(Math.random()) * (0.85 + Math.random() * 0.3);    // 面积均匀 + 外缘不规则
      const hFrac = Math.max(0, 1 - Math.pow(rr / R, 1.6));                      // 中心高四周低
      const hTop = hEdge + (H - hEdge) * hFrac;                                  // 该列柱顶 2.5m（缘）~7~10m（峰）
      const sk = 0.55 + 0.45 * hFrac;                                            // 边缘团径 ×0.55 起，中心足径
      const col = DUST[(Math.random() * DUST.length) | 0];
      const grav = (this.theme === 'snow' ? 4.0 : 2.4) + Math.random() * 0.8;    // 雪尘坠落快；原 2.4：~2s 到顶、坠落利落
      // 腾起初速：目标柱高反解 vy（含阻力上抛闭式 h = v/k − (g/k²)·ln(1+kv/g)，牛顿 2 次即收敛）
      const hRise = Math.max(0.6, hTop - (0.15 + Math.random() * 0.5));
      let v0 = 1.3 + 0.69 * hRise;
      for (let j = 0; j < 2; j++) v0 -= (v0 / kDrag - (grav / (kDrag * kDrag)) * Math.log(1 + kDrag * v0 / grav) - hRise) * (grav + kDrag * v0) / v0;
      v0 = Math.min(14, Math.max(1.5, v0));
      this.ps.spawn('smoke', {
        x: d.x + Math.cos(a) * rr * 0.6, y: gy + 0.15 + Math.random() * 0.5, z: d.z + Math.sin(a) * rr * 0.6,   // 全部贴地出生：地面腾起，非空中展开
        vx: Math.cos(a) * (0.4 + Math.random() * 1.2), vy: v0, vz: Math.sin(a) * (0.4 + Math.random() * 1.2),
        life,
        size0: (6 + Math.random() * 4) * sk * sizeK, size1: (15 + Math.random() * 12) * sk * sizeK,   // 大团软烟：云化
        alpha: (0.5 + Math.random() * 0.12) * aK, grav, drag: 0.4, windK: 0.22 * wK,   // 上抛到顶后自然坠落贴地；windK 漂移
        fadeIn: 0.04, sizeEase: 1.6, alphaPow: 2.5, gy,                // 短渐入防硬跳 + 前慢后快淡出；gy 按命中点地形托底
        c0: _jCol(col.c0), c1: _jCol(col.c1),
      });
    }
    // 底部基础云：一圈贴地滞留的大团（微扬 ≤0.6m 后即落回），垫住烟柱脚下——
    // 腾起期柱团离地上升时，柱底与地面之间的空隙由这层大团遮住，消除悬空感
    const nb = Math.round(9 + R * 0.6);
    for (let i = 0; i < nb; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = R * Math.sqrt(Math.random()) * 0.92;
      const col = DUST[(Math.random() * DUST.length) | 0];
      this.ps.spawn('smoke', {
        x: d.x + Math.cos(a) * rr, y: gy + 0.1 + Math.random() * 0.4, z: d.z + Math.sin(a) * rr,
        vx: Math.cos(a) * (0.3 + Math.random() * 0.5), vy: 0.4 + Math.random() * 0.5, vz: Math.sin(a) * (0.3 + Math.random() * 0.5),
        life: life * (0.85 + Math.random() * 0.15),
        size0: (7 + Math.random() * 4) * sizeK, size1: (13 + Math.random() * 8) * sizeK,
        alpha: (0.55 + Math.random() * 0.12) * aK, grav: (this.theme === 'snow' ? 3.2 : 2.0) + Math.random() * 0.6, drag: 0.4, windK: 0.22 * wK,
        fadeIn: 0.04, sizeEase: 1.6, alphaPow: 2.5, gy,
        c0: _jCol(col.c0), c1: _jCol(col.c1),
      });
    }
  }

  // ── 击毁爆炸地面焦痕（永久，战斗期间不消失）：以车体残骸为中心的放射状焦土贴花。
  //    16×16 分段逐顶点贴合地形（9m 面片 0.56m 网格，防坡地陷入地面下），随机旋转避免同款；
  //    战斗结束由 clearScorches 清理。size 缺省 9m（殉爆/爆炸击毁 8~10m，非爆炸击毁 6~8m 由调用方给）──
  scorch(x, z, size = 9) {
    if (!this._scorchMat) {
      this._scorchMat = new THREE.MeshBasicMaterial({
        map: makeScorchTexture(), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      this._scorches = [];
    }
    const geo = new THREE.PlaneGeometry(size, size, 20, 20);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const rot = Math.random() * Math.PI * 2;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = pos.getZ(i);
      const wx = x + lx * cr + lz * sr, wz = z - lx * sr + lz * cr;   // 旋转烘进顶点，保证贴地采样与渲染一致
      pos.setX(i, wx - x); pos.setZ(i, wz - z);
      pos.setY(i, this.groundY(wx, wz) + 0.09);
    }
    const mesh = new THREE.Mesh(geo, this._scorchMat);
    mesh.position.set(x, 0, z);
    mesh.userData.size = size;   // 贴花边长（测试与统计用）
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this._scorches.push(mesh);
    return mesh;
  }

  clearScorches() {
    if (!this._scorches) return;
    for (const m of this._scorches) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this._scorches.length = 0;
  }

  update(dt) {
    if (this._delayed.length) {
      for (let i = this._delayed.length - 1; i >= 0; i--) {
        const d = this._delayed[i];
        d.t -= dt;
        if (d.t <= 0) { this._delayed.splice(i, 1); this._dustMoundSpawn(d); }
      }
    }
    this.shakeAmount *= Math.exp(-3.2 * dt);
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const t = r.t / r.dur;
      if (t >= 1) { r.mesh.visible = false; r.mesh.material.uniforms.uAlpha.value = 0; continue; }
      const ringR = 0.6 + r.size * t;
      const u = r.mesh.material.uniforms;
      u.uRingR.value = ringR;
      u.uWidth.value = 1.4 + ringR * 0.09;
      u.uAlpha.value = r.alpha * (1 - t) * 0.5;
    }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      if (d.drag > 0) {   // 空气阻力：轻质碎片（落叶）水平/垂直速度衰减
        const dr = Math.exp(-d.drag * dt);
        d.vel.x *= dr; d.vel.z *= dr; d.vel.y *= dr;
      }
      d.vel.y -= (d.grav || 22) * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      const gy = this.groundY(d.mesh.position.x, d.mesh.position.z) + 0.12;
      if (d.mesh.position.y < gy) {
        d.mesh.position.y = gy;
        d.vel.y *= -0.35; d.vel.x *= 0.6; d.vel.z *= 0.6;
      }
      d.mesh.rotation.x += d.rot.x * dt;
      d.mesh.rotation.y += d.rot.y * dt;
      d.mesh.rotation.z += d.rot.z * dt;
    }
    // 曳光弹线拖尾：从枪口起生长（飞多长拖多长），弹头消失后残留段前飞追平消散
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.life -= dt;
      t.flown += 300 * dt;
      t.mesh.position.addScaledVector(t.dir, 300 * dt);
      const lenCur = Math.min(t.lenMax, t.flown) - Math.max(0, t.flown - t.range);
      if (t.life <= 0 || !this.camera) {
        t.mesh.visible = false;
        this.trails.splice(i, 1);
        this.trailPool.push(t);
        continue;
      }
      // 法线 = 视线在垂直弹道平面上的投影 → 平面始终含弹道方向且朝向观察者
      _tv1.copy(this.camera.position).sub(t.mesh.position);
      // 屏幕像素保底：世界体积真实（30cm），渲染不薄于 ~14px 长 / ~1.8px 宽（远景可辨）
      const dist = _tv1.length();
      const pxPerM = (innerHeight * 0.5) / Math.tan(this.camera.fov * Math.PI / 360);
      t.mesh.scale.set(Math.max(lenCur, 14 / pxPerM * dist), Math.max(t.width, 1.8 / pxPerM * dist), 1);
      const dv = _tv1.dot(t.dir);
      _tv2.copy(t.dir).multiplyScalar(dv).sub(_tv1);
      if (_tv2.lengthSq() < 1e-4) _tv2.set(-t.dir.z, 0, t.dir.x);   // 正对/正背弹道兜底
      _tv2.normalize();
      _aY.crossVectors(_tv2, t.dir).normalize();
      _tm.makeBasis(t.dir, _aY, _tv2);
      t.mesh.quaternion.setFromRotationMatrix(_tm);
    }
    // 机枪曳光弹飞行体
    for (let i = this.mgBullets.length - 1; i >= 0; i--) {
      const b = this.mgBullets[i];
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.life <= 0) {
        b.mesh.visible = false;
        this.mgBullets.splice(i, 1);
        this.mgPool.push(b);
        continue;
      }
    }
    // 弹壳物理更新
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        this.casings.splice(i, 1);
        this.casingPool.push(c);
        continue;
      }
      if (!c.settled) {
        // 重力
        c.vel.y -= 22 * dt;
        // 速度积分
        c.mesh.position.addScaledVector(c.vel, dt);
        // 触地检测
        const gy = this.groundY(c.mesh.position.x, c.mesh.position.z) + 0.02;
        if (c.mesh.position.y < gy) {
          c.mesh.position.y = gy;
          c.vel.y *= -0.3;
          c.vel.x *= 0.5; c.vel.z *= 0.5;
          c.angVel.multiplyScalar(0.4);
          // 速度足够小则停止
          if (c.vel.lengthSq() < 0.5 && Math.abs(c.vel.y) < 0.5) {
            c.settled = true;
            c.vel.set(0, 0, 0);
            c.angVel.set(0, 0, 0);
          }
        }
        // 旋转
        c.mesh.rotation.x += c.angVel.x * dt;
        c.mesh.rotation.y += c.angVel.y * dt;
        c.mesh.rotation.z += c.angVel.z * dt;
      }
      // 淡出（最后 0.8 秒）
      const fade = Math.min(c.life / 0.8, 1);
      c.mesh.material.opacity = fade;
      c.mesh.material.transparent = fade < 1;
    }
  }}
