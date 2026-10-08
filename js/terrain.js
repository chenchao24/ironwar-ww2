// ═══ 战场世界容器：按 mapId 装配地图（maps.js 构建）、高度场调度、障碍碰撞、阴影跟踪 ═══
// 高度采样 groundY 由 maps.js 的 setGroundY 注入（库尔斯克：基础地形 + 废墟坡度场 + 土路抬高）
import * as THREE from 'three';
import { MAPS, buildMap } from './maps.js';

// 默认高度（buildMap 前的占位：与 maps.js kurskHeight 同式）
export function terrainHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.013 + 0.4) * 3.4;
  h += Math.sin(x * 0.031 + 4.2) * Math.cos(z * 0.027 + 2.1) * 1.5;
  h += Math.sin(x * 0.083 + 0.3) * Math.cos(z * 0.071 + 5.0) * 0.45;
  const d = Math.hypot(x, z);
  let f = 0.35 + 0.65 * THREE.MathUtils.smoothstep(d, 40, 260);
  f *= 0.5 + 0.5 * THREE.MathUtils.smoothstep(Math.abs(d - 500), 60, 170);
  return h * f;
}

export class World {
  /**
   * @param scene    THREE.Scene
   * @param mapId    'kursk'（来自 MAPS 注册表）
   * @param quality  渲染质量（阴影分辨率）
   * @param assets   模型资产（tank_kit 之外含 town_kit / 植被等，由 main.js 预加载）
   * @param fx       { ps, effects, audio } 特效依赖
   */
  constructor(scene, mapId, quality, assets, fx) {
    this.scene = scene;
    this.mapId = mapId;
    this.map = MAPS[mapId] || MAPS.kursk;
    this.mapSize = this.map.size;
    this.mapSizeX = this.map.sizeX || this.map.size;   // 矩形地图支持（普罗霍罗夫卡 1500×2000）
    this.mapSizeZ = this.map.sizeZ || this.map.size;
    this.groundY = terrainHeight;   // 坦克物理/特效共用的高度采样（buildMap 后被替换）
    this.obstacles = [];            // {x, z, r, kind} 圆形碰撞体
    this.sightBlockers = [];        // 软视线遮挡（灌木丛 {x,z,r}）：挡视线不挡移动
    // 软遮挡空间网格（32m 格；数组本体保留给 poi/AI，网格供 visibility LOS 聚集）
    this._sightCell = 32;
    this._sightGrid = new Map();
    this._sightStamp = 0;

    // 本局地图根节点：天空/地面/公路/布景/灯光全部挂此（换图时整棵移除）
    this.root = new THREE.Group();
    scene.add(this.root);

    buildMap({ world: this, scene, quality, assets, ps: fx.ps, effects: fx.effects, audio: fx.audio });
    this.destructibles.listener = null;   // main.js 战斗开始后挂玩家坦克（音频距离衰减参考）

    // ── 静态布景矩阵冻结（性能：每帧全树矩阵更新跳过；阳光/雪幕等动态件除外） ──
    // 战斗中后加的动态件（倒伏 pivot/废墟/残骸）为新建对象，默认矩阵自动更新不受影响
    this.root.updateMatrixWorld(true);
    for (const child of this.root.children) {
      if (child === this.sun || (this.sun && child === this.sun.target)) continue;   // 阳光阴影相机随玩家（trackShadow）
      if (this.snowfall && child === this.snowfall.points) continue;                 // 阿登飘雪（每帧跟随相机）
      child.matrixAutoUpdate = false;
      child.matrixWorldAutoUpdate = false;
    }

    // ── 性能优化 A4：静态布景距离剔除（>1100m visible=false，雾已包住视野边缘） ──
    // 只剔除「不可移动」的布景 group（建筑套件/岩石等）；InstancedMesh（树/围栏）有视锥剔除，
    // 独立 mesh 遍历开销高，收集到 _cullList 由主循环 0.5s 节流更新
    this._cullList = [];
    this._cullTimer = 0;
    for (const child of this.root.children) {
      if (child === this.sky) continue;                       // 天空常显
      if (child.isInstancedMesh) continue;                    // B1 合批/树围栏实例：Box3 不感知实例矩阵（会把包围盒算在原点→误剔除），视锥剔除自理
      if (child.isMesh || child.isGroup) {
        // 取 group 世界包围盒中心作为剔除参考点（一次性，布景静态）
        const box = new THREE.Box3().setFromObject(child);
        if (box.isEmpty()) continue;
        const c = box.getCenter(new THREE.Vector3());
        const radius = box.getSize(new THREE.Vector3()).length() * 0.5;
        this._cullList.push({ obj: child, cx: c.x, cz: c.z, radius, wasVisible: true });
      }
    }
    // 地图注册的额外距离剔除（如 bocage 树篱分块：实例矩阵已烘焙世界坐标，
    // 逐块 boundingSphere 有效——用球心/半径入表，支持 far 覆盖）
    if (this._extraCull) {
      for (const e of this._extraCull) {
        if (!e.obj.boundingSphere) e.obj.computeBoundingSphere();
        const bs = e.obj.boundingSphere;
        if (!bs) continue;
        this._cullList.push({ obj: e.obj, cx: bs.center.x, cz: bs.center.z, radius: bs.radius, far: e.far, wasVisible: true });
      }
      this._extraCull = null;
    }
    // 动态注册的布景（如倒塌抽出的废墟 mesh）追加进剔除表
    this._cullReg = (obj) => {
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() * 0.5;
      this._cullList.push({ obj, cx: c.x, cz: c.z, radius, wasVisible: true });
    };
  }

  // 地图模块替换高度采样（含废墟坡度场）
  setGroundY(fn) { this.groundY = fn; }

  addObstacle(o) { this.obstacles.push(o); }
  removeObstacle(o) {
    const i = this.obstacles.indexOf(o);
    if (i >= 0) this.obstacles.splice(i, 1);
  }
  addSightBlocker(s) {
    this.sightBlockers.push(s);
    for (const key of this._sightCells(s)) {
      let arr = this._sightGrid.get(key);
      if (!arr) this._sightGrid.set(key, arr = []);
      arr.push(s);
    }
  }
  _sightCells(s) {
    const c = this._sightCell, r = s.r || 0;
    const out = [];
    for (let gx = Math.floor((s.x - r) / c); gx <= Math.floor((s.x + r) / c); gx++) {
      for (let gz = Math.floor((s.z - r) / c); gz <= Math.floor((s.z + r) / c); gz++) out.push(gx + ':' + gz);
    }
    return out;
  }
  removeSightBlocker(s) {
    const i = this.sightBlockers.indexOf(s);
    if (i >= 0) this.sightBlockers.splice(i, 1);
    for (const key of this._sightCells(s)) {
      const arr = this._sightGrid.get(key);
      if (arr) { const j = arr.indexOf(s); if (j >= 0) arr.splice(j, 1); }
    }
  }
  // 按 AABB 聚集软遮挡候选（邮票去重；返回数组立即消费）
  gatherSight(minx, minz, maxx, maxz) {
    const out = [], c = this._sightCell, st = ++this._sightStamp;
    for (let gx = Math.floor(minx / c); gx <= Math.floor(maxx / c); gx++) {
      for (let gz = Math.floor(minz / c); gz <= Math.floor(maxz / c); gz++) {
        const arr = this._sightGrid.get(gx + ':' + gz);
        if (!arr) continue;
        for (const b of arr) { if (b._vs === st) continue; b._vs = st; out.push(b); }
      }
    }
    return out;
  }

  // 阳光阴影相机跟随目标（阴影只覆盖附近区域）
  trackShadow(target) {
    if (!this.sun) return;
    this.sun.position.copy(this.sunDir).multiplyScalar(600).add(target);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
  }

  // 距离剔除：0.5s 节流（viewer = 相机或玩家位置）；条目可带 far 覆盖（如树篱 750m）
  updateCulling(dt, viewer) {
    if (!this._cullList.length || !viewer) return;
    this._cullTimer -= dt;
    if (this._cullTimer > 0) return;
    this._cullTimer = 0.5;
    const vx = viewer.x !== undefined ? viewer.x : viewer.position.x;
    const vz = viewer.z !== undefined ? viewer.z : viewer.position.z;
    for (const c of this._cullList) {
      const FAR = c.far || 1100;
      const d = Math.hypot(c.cx - vx, c.cz - vz) - c.radius;
      const vis = d < FAR;
      if (vis !== c.obj.visible) c.obj.visible = vis;
      c.wasVisible = vis;
    }
  }

  // 圆形碰撞体推挤，返回修正后的位置；本次推挤到的障碍物记入 lastBlocked（碰撞音效判定，调用后立即读取）
  resolveCollision(pos, radius) {
    this.lastBlocked = null;
    for (const o of this.obstacles) {
      if (o.dead) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (d < min && d > 0.001) {
        pos.x = o.x + dx / d * min;
        pos.z = o.z + dz / d * min;
        this.lastBlocked = o;
      }
    }
    const half = this.mapSize / 2 - 10;
    pos.x = THREE.MathUtils.clamp(pos.x, -half, half);
    pos.z = THREE.MathUtils.clamp(pos.z, -half, half);
    return pos;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
    });
    this.obstacles.length = 0;
    this.sightBlockers.length = 0;
    if (this._sightGrid) this._sightGrid.clear();
    if (this.destructibles) this.destructibles.dispose();
  }
}
