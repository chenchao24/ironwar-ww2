// ═══ 飘雪：相机跟随的循环雪幕（单个 Points 绘制调用；阿登图由 maps.js 挂 world.snowfall） ═══
// 粒子盒随相机平移，越界回绕——无限雪幕；侧风 + 单片横摇相位
import * as THREE from 'three';

export class Snowfall {
  constructor(root, { count = 2400, range = 120, height = 55 } = {}) {
    this.range = range;
    this.height = height;
    const pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count);      // 下落速度（m/s）
    this.phase = new Float32Array(count);    // 横摇相位
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * range;
      pos[i * 3 + 1] = Math.random() * height;
      pos[i * 3 + 2] = (Math.random() - 0.5) * range;
      this.vel[i] = 1.1 + Math.random() * 1.6;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // 雪花点贴图（柔和圆点）
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: tex, size: 0.22, transparent: true, opacity: 0.85, color: 0xf4f7fa,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;   // 粒子盒随相机动，禁视锥剔除
    this.t = 0;
    root.add(this.points);
  }

  update(dt, cam) {
    this.t += dt;
    const p = this.points.geometry.attributes.position;
    const a = p.array, n = this.vel.length, R = this.range, H = this.height;
    // 粒子盒跟随相机（竖直方向偏上：地面在盒下 45% 处）
    this.points.position.set(cam.x, Math.max(0, cam.y - H * 0.45), cam.z);
    for (let i = 0; i < n; i++) {
      a[i * 3 + 1] -= this.vel[i] * dt;
      a[i * 3] += (0.9 + Math.sin(this.t * 1.3 + this.phase[i]) * 0.5) * dt;   // 侧风 + 横摇
      if (a[i * 3 + 1] < 0) a[i * 3 + 1] += H;
      if (a[i * 3] > R / 2) a[i * 3] -= R;
      if (a[i * 3 + 2] > R / 2) a[i * 3 + 2] -= R; else if (a[i * 3 + 2] < -R / 2) a[i * 3 + 2] += R;
    }
    p.needsUpdate = true;
  }
}
