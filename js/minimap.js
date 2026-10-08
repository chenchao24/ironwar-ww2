// ═══ 小地图：600m 战场态势（玩家居中、车头朝上旋转） ═══
import { VISIBILITY_RULES } from './config.js';
import { MAP_ROADS } from './maps.js';

const SIZE = 208;          // CSS 逻辑像素
const RANGE = 800;         // 显示半径（米）
const SECTOR_SPREAD = 27.5 * Math.PI / 180;   // 视野扇面半角（°→rad）

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

export class Minimap {
  /**
   * @param canvas  <canvas id="minimap">
   * @param world   World 实例（groundY + obstacles）
   */
  constructor(canvas, world) {
    this.cv = canvas;
    this.world = world;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * this.dpr;
    canvas.height = SIZE * this.dpr;
    this.ctx = canvas.getContext('2d');
    this.range = RANGE;
    this._acc = 0;
    this._t = 0;
    this._terrain = null;
  }

  // 预渲染地形底图（高度带 + 坡度明暗 + 树石）；同一战场只渲染一次
  prerender() {
    if (this._terrain) return;
    const world = this.world;
    const isSnow = world.map && world.map.terrain === 'snow';   // 阿登：雪原配色
    const N = 176, PX = (world.mapSizeX || world.mapSize) / 2, PZ = (world.mapSizeZ || world.mapSize) / 2;
    const off = document.createElement('canvas');
    off.width = off.height = N;
    const c2 = off.getContext('2d');
    const img = c2.createImageData(N, N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1) * 2 - 1) * PX;
        const z = (j / (N - 1) * 2 - 1) * PZ;
        const h = world.groundY(x, z);
        // 高度分带（雪原：低地灰蓝 → 高地亮白；其他图：低地暗橄榄 → 高地沙褐 → 山脊灰岩）
        let r, g, b;
        if (isSnow) {
          if (h < -1.5) { r = 138; g = 148; b = 158; }
          else if (h < 0.5) { r = 168; g = 176; b = 184; }
          else if (h < 2.5) { r = 192; g = 198; b = 206; }
          else { r = 216; g = 220; b = 226; }
        } else if (h < -1.5) { r = 34; g = 42; b = 28; }
        else if (h < 0.5) { r = 48; g = 56; b = 36; }
        else if (h < 2.5) { r = 70; g = 70; b = 50; }
        else { r = 92; g = 88; b = 72; }
        // 坡度压暗，勾出沟壑
        const s = Math.abs(world.groundY(x + 14, z) - h) + Math.abs(world.groundY(x, z + 14) - h);
        const sh = clamp(1 - s * 0.10, 0.55, 1.1);
        const o = (j * N + i) * 4;
        img.data[o] = r * sh; img.data[o + 1] = g * sh; img.data[o + 2] = b * sh; img.data[o + 3] = 255;
      }
    }
    c2.putImageData(img, 0, 0);
    // 树 / 岩石 / 废墟
    const k = N / (2 * PZ);
    // 路网（底图要素；雪图雪泥灰 / 其余土黄——之前不画路，玩家容易把溪线/坡影误读为路）
    const snowT = isSnow;
    for (const r of MAP_ROADS[world.mapId] || []) {
      c2.strokeStyle = snowT ? 'rgba(110,108,102,0.6)' : 'rgba(122,106,76,0.6)';
      c2.lineWidth = Math.max(1, r.half * 2 * k);
      c2.beginPath();
      r.pts.forEach(([x, z], i) => {
        const a = (x + PX) * k, b = (z + PZ) * k;
        if (i) c2.lineTo(a, b); else c2.moveTo(a, b);
      });
      c2.stroke();
    }
    for (const c of world.obstacles) {
      if (c.dead) continue;   // 已摧毁的布景障碍不再绘制
      c2.fillStyle = c.kind === 'tree' ? 'rgba(16,32,14,0.9)'
                   : c.kind === 'rock' ? 'rgba(122,116,100,0.85)'
                   : c.kind === 'building' ? 'rgba(148,132,102,0.92)'   // 建筑：土褐亮块（小镇图主要素）
                   : 'rgba(70,66,58,0.9)';
      c2.beginPath();
      c2.arc((c.x + PX) * k, (c.z + PZ) * k, Math.max(1, c.r * k), 0, Math.PI * 2);
      c2.fill();
    }
    this._terrain = off;
  }

  // viewYaw：观瞄视线世界方位（rig.aimYaw——鼠标看向，含瞄准镜/望远镜视野），缺省回退车体航向
  update(dt, player, enemies, viewYaw = null) {
    this._acc += dt; this._t += dt;
    if (this._acc < 1 / 30) return;
    this._acc = 0;
    if (!this._terrain) this.prerender();

    const ctx = this.ctx, c = SIZE / 2;
    const s = c / this.range;                        // px / m
    const th = player.heading - Math.PI;             // 旋转：车头朝上
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    // 圆形视域裁剪
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.clip();
    // 地图外暗色底（避免方形空白）
    ctx.fillStyle = 'rgba(12,14,12,0.95)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 地形底图
    ctx.translate(c, c);
    ctx.rotate(th);
    ctx.translate(-player.pos.x * s, -player.pos.z * s);
    const PX = (this.world.mapSizeX || this.world.mapSize) / 2, PZ = (this.world.mapSizeZ || this.world.mapSize) / 2;
    ctx.drawImage(this._terrain, -PX * s, -PZ * s, 2 * PX * s, 2 * PZ * s);
    // 地图边缘标识（琥珀边框，随旋转；矩形地图按 X/Z 各自半径）
    ctx.strokeStyle = 'rgba(232,163,61,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-PX * s, -PZ * s, 2 * PX * s, 2 * PZ * s);
    ctx.restore();

    // 距离环（300 / 600m）
    ctx.save();
    ctx.strokeStyle = 'rgba(216,220,200,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, c, c * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(216,220,200,0.22)';
    ctx.beginPath(); ctx.arc(c, c, c - 1.5, 0, Math.PI * 2); ctx.stroke();

    // ── 玩家视野扇面（随屏幕视线 rig.aimYaw——含瞄准镜/望远镜；双档半径=自动确认圈 500/700m）──
    // 画布角度：世界方向 φ 在本图上 = π/2 − (φ − th)（屏幕角，自 +x 顺时针）
    {
      const aim = viewYaw !== null ? viewYaw : (player.heading + player.turretYaw);
      const a0 = Math.PI / 2 - (aim - th);
      const r1 = c * (VISIBILITY_RULES.autoStationary / this.range);   // 静止目标确认圈
      const r2 = c * (VISIBILITY_RULES.autoMoving / this.range);       // 移动目标确认圈
      const a1 = a0 - SECTOR_SPREAD, a2 = a0 + SECTOR_SPREAD;
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.clip();   // 扇面不出圆形图缘
      ctx.translate(c, c);
      ctx.fillStyle = 'rgba(220, 214, 160, 0.055)';                        // 外带：移动目标
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r2, a1, a2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(220, 214, 160, 0.10)';                         // 内圈：静止目标
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r1, a1, a2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(220, 214, 160, 0.22)';                       // 扇缘
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r1, a1, a2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a1) * r2, Math.sin(a1) * r2);
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
      ctx.stroke();
      ctx.restore();
    }

    // ── 歼击车火炮射界覆盖（透明深蓝）：世界航向 ± casemate.arc（车头朝上地图 → 扇形恒朝上，
    //    红炮线在其内摆动）──
    if (player.cfg.casemate) {
      const arc = player.cfg.casemate.arc * Math.PI / 180;
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.clip();
      ctx.translate(c, c);
      ctx.fillStyle = 'rgba(46, 92, 210, 0.16)';                           // 透明深蓝覆盖
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, c - 1, -Math.PI / 2 - arc, -Math.PI / 2 + arc); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(86, 130, 235, 0.4)';                         // 界缘
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-Math.PI / 2 - arc) * (c - 1), Math.sin(-Math.PI / 2 - arc) * (c - 1));
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-Math.PI / 2 + arc) * (c - 1), Math.sin(-Math.PI / 2 + arc) * (c - 1));
      ctx.stroke();
      ctx.restore();
    }

    // ── 炮口指向线（淡红透明）：炮管实际指向（heading + turretYaw，含限角/随动延迟）──
    {
      const gun = player.heading + player.turretYaw;
      const a = Math.PI / 2 - (gun - th);
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.clip();
      ctx.translate(c, c);
      ctx.strokeStyle = 'rgba(224, 74, 48, 0.5)';                          // 淡红透明（与敌标红同系）
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (c - 1), Math.sin(a) * (c - 1)); ctx.stroke();
      ctx.restore();
    }

    // 敌人：确认=实时红三角；疑似=橙菱形（快照位，不跟踪）；失联=灰?最后位置；未发现不显示
    const cos = Math.cos(th), sin = Math.sin(th);
    for (const e of enemies) {
      if (e.destroyed) continue;
      const spotted = e.spotted === true;
      const suspected = e.suspected === true;
      const lost = e.lostContact === true;
      if (!spotted && !lost && !suspected) continue;
      // 位置：确认用实时，疑似/失联用 lastKnownPos 快照
      const src = spotted ? e.pos : (e.lastKnownPos || e.pos);
      const dx = src.x - player.pos.x;
      const dz = src.z - player.pos.z;
      let rx = dx * cos - dz * sin;
      let ry = dx * sin + dz * cos;
      const dist = Math.hypot(dx, dz);
      const beyond = dist > this.range - 14;
      if (beyond) {
        const k = (c - 11) / (Math.hypot(rx, ry) || 1);
        rx *= k; ry *= k;
      }
      const px = c + rx * (beyond ? 1 : s);
      const py = c + ry * (beyond ? 1 : s);
      ctx.save();
      ctx.translate(px, py);
      if (beyond) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(this._t * 5);
      if (spotted) {
        // 朝向三角（按车体航向）
        ctx.rotate(Math.atan2(Math.sin(e.heading - th), -Math.cos(e.heading - th)));
        ctx.fillStyle = '#e04a30';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -5.5); ctx.lineTo(4, 4.5); ctx.lineTo(-4, 4.5); ctx.closePath();
        ctx.fill(); ctx.stroke();
      } else if (suspected) {
        // 疑似目标：橙色菱形，轻微呼吸闪烁
        const pulse = 0.7 + 0.3 * Math.sin(this._t * 4);
        ctx.globalAlpha *= pulse;
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#ffa940';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.fillRect(-4, -4, 8, 8);
        ctx.strokeRect(-4, -4, 8, 8);
      } else {
        // 失联：灰色圆 + ? 问号，呼吸闪烁
        const pulse = 0.55 + 0.25 * Math.sin(this._t * 3);
        ctx.globalAlpha *= pulse;
        ctx.fillStyle = 'rgba(150,150,150,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(40,40,40,0.95)';
        ctx.font = '700 8px "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0.5);
      }
      ctx.restore();
    }

    // 玩家（车头朝上）
    ctx.save();
    ctx.translate(c, c);
    ctx.fillStyle = '#e8e2b8';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3.2); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // 北方标记（世界 -Z 为北……取 +Z 反方向）
    const nx = -Math.sin(player.heading), ny = Math.cos(player.heading);
    ctx.save();
    ctx.translate(c + nx * (c - 12), c + ny * (c - 12));
    ctx.fillStyle = 'rgba(232,226,184,0.75)';
    ctx.font = '700 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 0);
    ctx.restore();
  }
}
