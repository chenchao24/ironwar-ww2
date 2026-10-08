// ═══ 排气口热浪扭曲（屏幕空间折射 · 零管线侵入）═══
// 原理：主渲染直出画布（ACES/sRGB/MSAA 既有管线分毫不动）之后，用 gl.blitFramebuffer
// 把画布解析拷贝到一张同尺寸 RGBA8 纹理（画布是多重采样默认帧缓冲，copyTexSubImage 不可用，
// blit 解析合法且格式同为 RGBA8），再在排气口世界位置画相机朝向公告牌——shader 内按升腾噪声
// 对拷贝纹理做 UV 偏移采样重绘该区域，即真·背景折射，输出字节与画布逐位同源，无色彩管理风险。
// 公告牌带深度测试（贴管口向相机回撤 8cm），被车体/地形遮挡处自动失效；
// 无热源（熄火/击毁/屏外/超 260m 亚像素）时整条路径零开销（不拷贝、不渲染）。
import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec2 vLocal;
  uniform float uHalf;
  void main() {
    vLocal = position.xy * uHalf;   // 公告牌局部坐标（米，x 右 / y 上）
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  varying vec2 vLocal;
  uniform sampler2D tCopy;
  uniform vec2 uRes;
  uniform vec2 uM2U;        // 米→UV 位移换算（x 已含纵横比），按热源距离逐帧计算
  uniform float uTime;
  uniform float uRadius;    // 椭圆水平半径（米）
  uniform float uStrength;  // 热强度 0~1（怠速~满负荷）
  uniform float uAmp;       // 最大位移幅度（米）
  uniform float uSeed;
  void main() {
    vec2 p = vLocal;
    p.y -= uRadius * 0.35;   // 热羽中心沿管口略上移，垂直半径 1.2×（升腾羽流感）
    float r = length(vec2(p.x / uRadius, p.y / (uRadius * 1.2)));
    float k = uStrength * (1.0 - smoothstep(0.12, 1.0, r));
    // 升腾抖动：相位随 -y 滚动（花纹 ~0.44m/s 上飘），双频叠加去周期感
    float ph = p.y * 16.0 - uTime * 7.0 + uSeed;
    float w1 = sin(ph + sin(p.x * 21.0 + uTime * 2.3 + uSeed * 3.7) * 1.35);
    float w2 = sin(ph * 0.47 + uTime * 2.9 + uSeed);
    float w3 = sin(p.y * 23.0 + uTime * 5.2 + p.x * 11.0 + uSeed * 2.1);
    vec2 disp = vec2(w1 * 0.62 + w2 * 0.48, w3 * 0.34) * (k * uAmp);
    gl_FragColor = texture2D(tCopy, gl_FragCoord.xy / uRes + disp * uM2U);
  }
`;

const MAX_SOURCES = 12;  // 1v5 满编 6 车 × 双排气口
const _sz = new THREE.Vector2();
const _pv = new THREE.Vector3();   // 排气口世界坐标（updateTank 填充，addSource 只读）
const _tv = new THREE.Vector3();   // addSource 内部临时（不得与 _pv 混用）

export class HeatHaze {
  constructor(renderer) {
    this._gl = renderer.getContext();
    this._rt = new THREE.WebGLRenderTarget(2, 2, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    this._rt.texture.generateMipmaps = false;
    this._scene = new THREE.Scene();
    this._quads = [];
    for (let i = 0; i < MAX_SOURCES; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          tCopy: { value: this._rt.texture },
          uRes: { value: new THREE.Vector2() },
          uM2U: { value: new THREE.Vector2() },
          uTime: { value: 0 },
          uHalf: { value: 1 },
          uRadius: { value: 0.35 },
          uStrength: { value: 0 },
          uAmp: { value: 0.07 },
          uSeed: { value: 0 },
        },
        vertexShader: VERT, fragmentShader: FRAG,
        depthTest: true, depthWrite: false, blending: THREE.NoBlending,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      quad.visible = false;
      this._scene.add(quad);
      this._quads.push(quad);
    }
    this._n = 0;
    this._draws = 0;
    this.debugBoost = 1;   // 截图/调参用：位移幅度倍率
  }

  // 每帧渲染段开头调用：清空热源（随后 updateTank 重新登记）
  beginFrame() {
    for (const q of this._quads) q.visible = false;
    this._n = 0;
  }

  // 单车热源采集：热强度平滑（怠速基线+负荷，熄火/击毁衰减），逐排气口登记。
  // 功率联动：面积/强度随 cfg.engineHp 缩放——150hp 黄鼠狼几乎不可见，700hp 虎豹系满配。
  updateTank(tank, dt, camera) {
    const cfg = tank.cfg, exh = cfg && cfg.exhaustLocal;
    if (!exh) return;
    const eng = tank.modules && tank.modules.engine;
    const powerK = Math.min((cfg.engineHp || 700) / 700, 1);   // 700hp（HL230）为满配基准
    let target = 0;
    if (!tank.destroyed && !(eng && eng.hp <= 0)) {
      const steer = Math.abs(tank.steer || 0);
      let load = Math.abs(tank.throttle || 0);
      if (steer > 0.2 && Math.abs(tank.speed || 0) < 2.5) load = Math.max(load, steer * 0.8);   // 原地转向≈高负荷
      target = Math.min(0.3 + load * 0.4 + (tank.startK || 0) * 0.28, 1) * (0.3 + 0.7 * powerK);
    }
    const cur = tank.heatK === undefined ? target : tank.heatK;
    tank.heatK = THREE.MathUtils.damp(cur, target, target > cur ? 3.0 : 1.5, dt);
    if (tank.heatK < 0.02) return;
    const seed = tank._heatSeed || (tank._heatSeed = Math.random() * 100);
    const zShift = cfg.heatZShift || 0;          // 热羽相对排气烟点的纵向偏移（个别车管口伸出更后）
    const areaK = 0.25 + 0.75 * powerK;
    for (let i = 0; i < exh.length; i++) {
      _pv.fromArray(exh[i]);
      _pv.z += zShift;
      tank.model.localToWorld(_pv);
      const r = (0.30 + ((seed * 7.31 + i * 3.7) % 1) * 0.08) * areaK;   // 半径 0.30~0.38m × 功率面积系数
      this.addSource(_pv, r, tank.heatK, seed + i * 7.31, camera);
    }
  }

  addSource(worldPos, radius, strength, seed, camera) {
    if (this._n >= MAX_SOURCES || strength < 0.02) return;
    _tv.copy(worldPos).sub(camera.position);
    const dist = Math.max(_tv.length(), 1);
    if (dist > 260) return;
    _tv.copy(worldPos).project(camera);
    if (_tv.z > 1 || Math.abs(_tv.x) > 1.25 || Math.abs(_tv.y) > 1.25) return;
    const quad = this._quads[this._n];
    quad.visible = true;
    quad.position.copy(worldPos).lerp(camera.position, 0.08 / dist);   // 向相机回撤 8cm 防 z-fighting
    quad.quaternion.copy(camera.quaternion);
    const half = radius * 1.75;
    quad.scale.set(half, half, 1);
    const u = quad.material.uniforms;
    u.uHalf.value = half;
    u.uRadius.value = radius;
    u.uStrength.value = strength;
    u.uSeed.value = seed;
    const uy = 0.5 / (Math.tan(camera.fov * THREE.MathUtils.DEG2RAD * 0.5) * dist);   // 1 米在屏幕 UV 高度上的占比
    u.uM2U.value.set(uy / camera.aspect, uy);
    this._n++;
  }

  // 渲染段末尾调用：主渲染已出画布后执行拷贝 + 折射叠加
  draw(renderer, camera, time) {
    if (this._n === 0) return;
    renderer.getDrawingBufferSize(_sz);
    const w = _sz.x, h = _sz.y;
    if (w === 0 || h === 0) return;
    if (this._rt.width !== w || this._rt.height !== h) this._rt.setSize(w, h);
    for (let i = 0; i < this._n; i++) {
      const u = this._quads[i].material.uniforms;
      u.uTime.value = time;
      u.uRes.value.set(w, h);
      u.uAmp.value = 0.07 * this.debugBoost;
    }
    const gl = this._gl;
    renderer.setRenderTarget(this._rt);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);   // 读=画布（多重采样），写=拷贝 FBO → 硬件解析
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    renderer.setRenderTarget(null);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this._scene, camera);
    renderer.autoClear = ac;
    this._draws++;
  }
}
