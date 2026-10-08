// ═══ 主入口：渲染器 / 资源加载 / 游戏状态机 / 相机装备 / 玩家操控 / 战斗循环（1vN 猎杀模式） ═══
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TANKS, GAME, CAMERA, SHELL_TYPES, mgFalloff, TERRAIN_RULES } from './config.js';
import { World, terrainHeight } from './terrain.js';
import { MAPS } from './maps.js';
import { EU_FILES } from './mapdata-normandy.js';
import { ParticleSystem } from './particles.js';
import { Effects } from './effects.js';
import { ShellManager } from './shell.js';
import { Tank, wrapAngle } from './tank.js';
import { TrackMarks } from './trackmarks.js';
import { TankAI } from './ai.js';
import { PlatoonAI } from './ai/platoon.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { VisibilityManager } from './visibility.js';
import { generatePOIs } from './ai/poi.js';
import { Garage } from './garage.js';
import { updateHedge } from './hedge.js';
import { HeatHaze } from './heathaze.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const damp = THREE.MathUtils.damp;
const clamp = THREE.MathUtils.clamp;

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ui = new UI();
    this.input = new Input(this.canvas);
    this.state = 'loading';     // loading → cover → menu → hangar → battle → result
    this.paused = false;

    // ── 渲染器 ──
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._applyQuality();
    this.heat = new HeatHaze(this.renderer);   // 排气口热浪（屏幕空间折射，零管线侵入）

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.3, 5000);

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // ── 世界与特效（首世界在资产加载完后创建） ──
    this.mapId = 'kursk';
    this._mapAssets = null;
    this.ps = new ParticleSystem(this.scene);
    this.effects = new Effects(this.scene, this.ps, audio, (x, z) => this.world ? this.world.groundY(x, z) : 0, this.camera);
    this.world = null;

    // ── 点亮系统 ──
    this.visibility = new VisibilityManager({ obstacles: [] });

    // ── 厂房车库 ──
    this.garage = null;
    this._garageWorld = { groundY: () => 0 };

    // ── 相机装备 ──
    this.rig = new CameraRig(this.camera, (x, z) => this.world ? this.world.groundY(x, z) : 0);
    this.raycaster = new THREE.Raycaster();
    this.rayDir = new THREE.Vector3();
    this.aimDist = null;
    this.aimTargetTank = null;
    this.aimBlocked = false;   // 瞄准线被地形遮断（准星在敌车上但炮弹到不了）→ HUD 琥珀提示

    // ── 战斗数据 ──
    this.player = null;
    this.enemies = [];
    this.ais = [];
    this.trackMarks = null;
    this.battleTime = 0;
    this.playerShots = 0;
    this.playerHits = 0;
    this.playerPens = 0;       // 击穿数
    this.crewKills = 0;        // 击杀乘员数
    this.moduleHits = 0;       // 模块战果
    this.kills = 0;            // 击毁敌车数
    this.enemyNames = [];
    this._endByTimeout = false;
    this.throttleSmooth = 0;
    this.steerSmooth = 0;
    this.endTimer = -1;
    this.ambientTimer = 2;
    this.prevReloading = false;

    // 菜单展示机位
    this.menuAngle = 0.6;

    // ── 机库展示车优化：缓存复用（LRU）+ 分帧纹理预热 ──
    this._hangarCache = new Map();
    this._prewarmed = new Set();
    this._prewarmTex = new WeakSet();
    this._prewarming = false;
    this._prewarmList = [];
    this._prewarmKey = null;
    this._hangarBusy = false;

    this.assets = {};
    this._bindUI();
    this._load();

    this.clock = new THREE.Timer();
    this.renderer.setAnimationLoop(() => { this.clock.update(); this._frame(); });
    window.__game = this;   // 调试/自动化验证钩子
    document.addEventListener('visibilitychange', () => {
      let el = document.getElementById('bg-pause-tip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'bg-pause-tip';
        el.style.cssText = ['position:fixed', 'top:46%', 'left:0', 'right:0', 'text-align:center',
          'font:bold 26px/1.4 sans-serif', 'color:#ffdf9e', 'text-shadow:0 2px 8px #000',
          'pointer-events:none', 'z-index:999', 'display:none',
        ].join(';');
        el.textContent = '⚠ 页面已切至后台，游戏暂停——切回本页面继续';
        document.body.appendChild(el);
      }
      el.style.display = (document.hidden && this.state === 'battle') ? 'block' : 'none';
    });
  }

  _applyQuality() {
    const q = this.ui.settings.quality;
    const pr = q === 'high' ? Math.min(devicePixelRatio, 1.5) : q === 'medium' ? 1.25 : 1;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ── 世界构建 ──
  _buildWorld() {
    const propScenes = {};
    for (const [k, g] of Object.entries(this._mapAssets)) {
      if (g && g.scene) propScenes[k] = g.scene;
    }
    return new World(this.scene, this.mapId, this.ui.settings.quality, propScenes, { ps: this.ps, effects: this.effects, audio });
  }

  // ─────────── 资源加载（2026-10-08 懒加载改造：按需装载，不再全量预载） ───────────
  // 地图资产分组：common 各图通用 / eu 欧洲小镇组（normandy/prokhorovka/ardennes）/ ard 阿登专属
  _propGroups() {
    return {
      common: { town_kit: 'houseModel/【5】lowpoly_buildings.glb', leaf_tree: 'houseModel/oject/leaf_tree.glb', pine_tree: 'houseModel/oject/pine_tree.glb', rock: 'houseModel/oject/rock.glb', rock2: 'houseModel/oject/rock2.glb', wood_log: 'houseModel/oject/wood_log.glb' },
      eu: Object.fromEntries(Object.entries(EU_FILES).map(([k, f]) => [k, 'otherModel/EuropeCity/opt/' + f])),
      ard: { snow_trees: 'otherModel/snow_trees_pack_lowpoly.glb', rocas: 'otherModel/rocas_low_poly.glb', snowy_pines: 'otherModel/snowy_pine_trees-pak.glb', pole_psx: 'otherModel/psx_electric_pole_fixed.glb' },
    };
  }
  // 地图 → 资产组（buildMap 前由 _ensureMapAssets 保证就绪）
  _mapAssetGroups(mapId) {
    if (mapId === 'normandy' || mapId === 'prokhorovka') return ['eu'];
    if (mapId === 'ardennes') return ['eu', 'ard'];
    return [];
  }

  // 坦克资产懒加载：Map<key, Promise> 去重；命中缓存直接返回
  _ensureTankAssets(keys) {
    if (!this._tankJobs) this._tankJobs = new Map();
    const jobs = [];
    for (const key of keys) {
      if (!key || !TANKS[key]) continue;
      if (this.assets[key]) continue;
      if (!this._tankJobs.has(key)) {
        this._tankJobs.set(key, new Promise((res, rej) =>
          this._gltf.load(TANKS[key].model, (g) => { console.log('[load] ' + key); this.assets[key] = g; res(); }, undefined, rej)));
      }
      jobs.push(this._tankJobs.get(key));
    }
    return Promise.all(jobs);
  }

  // 地图资产组懒加载（幂等）
  _loadPropGroup(groupName) {
    if (!this._propJobs) this._propJobs = new Map();
    if (this._propJobs.has(groupName)) return this._propJobs.get(groupName);
    const files = this._propGroups()[groupName] || {};
    const job = Promise.all(Object.entries(files).map(([k, url]) =>
      new Promise((res) => this._gltf.load(url, (g) => { console.log('[load] ' + k); this._mapAssets[k] = g; res(); }, undefined, res))));
    this._propJobs.set(groupName, job);
    return job;
  }
  _ensureMapAssets(mapId) {
    return Promise.all(this._mapAssetGroups(mapId).map(g => this._loadPropGroup(g)));
  }

  _load() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (u, l, t) => this.ui.setLoadProgress(l / t);
    const loader = new GLTFLoader(manager);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./node_modules/three/examples/jsm/libs/draco/');
    loader.setDRACOLoader(dracoLoader);
    this._gltf = loader;
    this._mapAssets = {};
    // 启动最小集：当前选中车 + 通用布景 + 当前地图所需资产组（其余车型/图组用时再载）
    const jobs = [
      this._ensureTankAssets([(this.ui && this.ui.selectedTank) || 'tiger1']),
      this._loadPropGroup('common'),
      this._ensureMapAssets(this.ui.settings.mapId || 'kursk'),
    ];
    Promise.all(jobs).then(async () => {
      this.world = this._buildWorld();
      this.shells = new ShellManager(this.scene, this.effects, audio, this.world);
      this.ui.initMinimap(this.world);
      this.visibility.world = this.world;
      this.visibility.obstacles = this.world.obstacles;
      this.visibility.sightBlockers = this.world.sightBlockers;
      this.visibility.pois = generatePOIs(this.world, GAME.mapSize / 2);   // POI 搜索网（WP6）
      // 玩家穿越灌木 → 怀疑度注入（§5.5）；履带痕查询由 trackmarks.recentTracks 提供
      this.visibility.trackMarks = this.trackMarks;
      if (this.world.hedgeField) this.world.hedgeField.onTankCross = (tk, x, z) => {
        if (tk.isPlayer) this.visibility.suspicion.add(x, z, 0.7);
      };
      this.ui.setLoadProgress(1);
      // 车库按需创建（构造 ~3s，全程程序化贴图/合并网格/PMREM——启动期不建，进车库再走自有 loading 流程）
      setTimeout(() => { this.ui.loadDone(); this._toCover(); }, 300);
      this._setupMenuShowcase();
      // 首帧 shader 编译改异步并行（KHR_parallel_shader_compile 可用时后台编译）
      if (this.renderer.compileAsync) this.renderer.compileAsync(this.scene, this.camera);
    }).catch((e) => {
      console.error('模型加载失败', e);
      document.querySelector('.load-text').textContent = '资源加载失败，请检查 model 目录';
    });
  }

  // ─────────── 机库展示车 ───────────
  _parkShowcase() {
    if (!this.menuTank) return;
    if (this.menuTank._cachedShowcase) this.menuTank.root.visible = false;
    else { this.menuTank.dispose(); this.scene.remove(this.menuTank.root); }
    this.menuTank = null;
  }

  _ensureHangarTank(key) {
    let t = this._hangarCache.get(key);
    if (t) {
      this._hangarCache.delete(key);
      this._hangarCache.set(key, t);
      return t;
    }
    t = new Tank(TANKS[key], this.assets[key].scene.clone(true), this._garageWorld);
    t._cachedShowcase = true;
    t.place(0, 0, 0);
    t.root.visible = false;
    this.scene.add(t.root);
    this._hangarCache.set(key, t);
    while (this._hangarCache.size > 4) {
      let oldest = null;
      for (const [k, v] of this._hangarCache) {
        if (v !== this.menuTank) { oldest = [k, v]; break; }
      }
      if (!oldest) break;
      this._hangarCache.delete(oldest[0]);
      this._prewarmed.delete(oldest[0]);
      oldest[1].dispose();
      this.scene.remove(oldest[1].root);
    }
    return t;
  }

  _setupMenuShowcase() {
    this._parkShowcase();
    const key = (this.ui && this.ui.selectedTank) || 'tiger1';
    if (!this.assets[key]) { this._ensureTankAssets([key]); return; }   // 懒加载：资产未到先跳过，装载流程会回调
    if (this.garage && this.garage.visible) {
      const t = this._ensureHangarTank(key);
      t.root.visible = true;
      this.menuTank = t;
      this.renderer.shadowMap.needsUpdate = true;
    } else {
      this.menuTank = new Tank(TANKS[key], this.assets[key].scene.clone(true), this.world);
      this.menuTank.place(0, 0, 0);
      this.scene.add(this.menuTank.root);
    }
  }

  _enterHangarWithLoading() {
    const ready = this.garage && this._hangarCache.has(this.ui.selectedTank) &&
                  this._prewarmed.has(this.ui.selectedTank);
    if (ready) { this._enterHangar(); return; }
    this.ui.showHangarLoading(true, '载入车库…', 0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.state = 'hangar';
      this.ui.show('hangar');
      if (!this.garage) this.garage = new Garage(this.scene, this.renderer, this.ui.settings.quality);
      this.garage.show();
      // 立即收走菜单背景车：它停在战场地面高度（kurskHeight(0,0)≈1.33m），
      // 车库地坪在 y=0——不收走会在加载期间悬浮 1.3m，装载完成才"掉落"（穿帮）
      this._parkShowcase();
      if (this.world) this.world.root.visible = false;
      this.renderer.toneMappingExposure = 1.14;
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this._initHangarControls();
      this.ui.refreshHangar(this.ui.selectedTank, TANKS[this.ui.selectedTank]);
      this.renderer.compile(this.scene, this.camera);
      this._loadTankThenShow(this.ui.selectedTank);
    }));
  }

  _loadTankThenShow(key) {
    // 懒加载：GLB 未载时先装载（车库自有 loading UI；并发切车由完成时 selectedTank 校验拦截）
    if (!this.assets[key]) {
      this.ui.showHangarLoading(true, '下载坦克…', 0);
      this._ensureTankAssets([key]).then(() => this._loadTankThenShow(key))
        .catch(() => { this.ui.showHangarLoading(false); this._hangarBusy = false; });
      return;
    }
    const tank = this._ensureHangarTank(key);
    const list = this._collectTankTextures(tank);
    const total = Math.max(list.length, 1);
    const step = () => {
      if (this.state !== 'hangar' || this.menuTank === tank) {
        this.ui.showHangarLoading(false);
        this._hangarBusy = false;
        return;
      }
      let n = 0;
      while (list.length && n < 4) {
        const tex = list.shift();
        this._prewarmTex.add(tex);
        this.renderer.initTexture(tex);
        n++;
      }
      if (list.length) {
        this.ui.showHangarLoading(true, '载入坦克…', 1 - list.length / total);
        requestAnimationFrame(step);
        return;
      }
      this._prewarmed.add(key);
      this._evictTankAssets();   // 懒加载 LRU：保留集外淘汰多余车型资产
      // 并发装载竞态防护：期间用户又切到别车（另一装载循环在跑）→ 本循环只预热，不回切展示车/面板
      if (this.ui.selectedTank === key) {
        this._setupMenuShowcase();
        this.ui.refreshHangar(key, TANKS[key]);
      }
      this.ui.showHangarLoading(false);
      this._hangarBusy = false;
      this._startPrewarm();
    };
    step();
  }

  _startPrewarm() {
    if (this._prewarming) return;
    this._prewarming = true;
    const step = () => {
      if (this.state !== 'hangar' || !this.garage || !this.garage.visible) { this._prewarming = false; return; }
      if (this._hangarBusy) { requestAnimationFrame(step); return; }
      const keys = Object.keys(TANKS);
      const cur = keys.indexOf(this.ui.selectedTank);
      const neighbors = [keys[(cur + 1) % keys.length], keys[(cur - 1 + keys.length) % keys.length]];
      let key = neighbors.find((k) => !this._prewarmed.has(k)) || null;
      if (!key) {
        for (const k of this._hangarCache.keys()) {
          if (!this._prewarmed.has(k)) { key = k; break; }
        }
      }
      if (!key) { this._prewarming = false; return; }
      if (!this.assets[key]) { this._ensureTankAssets([key]); requestAnimationFrame(step); return; }   // 懒加载：后台装邻居，下轮再看
      if (!this._hangarCache.has(key)) this._ensureHangarTank(key);
      if (this._prewarmKey !== key) {
        this._prewarmKey = key;
        this._prewarmList = this._collectTankTextures(this._hangarCache.get(key));
      }
      let n = 0;
      while (this._prewarmList.length && n < 4) {
        const tex = this._prewarmList.shift();
        this._prewarmTex.add(tex);
        this.renderer.initTexture(tex);
        n++;
      }
      if (!this._prewarmList.length) this._prewarmed.add(key);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _collectTankTextures(tank) {
    const list = [];
    tank.model.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'specularMap', 'alphaMap']) {
          const tex = m[k];
          if (tex && tex.isTexture && !this._prewarmTex.has(tex)) list.push(tex);
        }
      }
    });
    for (const tex of tank.trackMaterials || []) {
      if (!this._prewarmTex.has(tex)) list.push(tex);
    }
    return list;
  }

  // ─────────── 车库页 ───────────
  _enterHangar() {
    this.state = 'hangar';
    this.ui.show('hangar');
    if (!this.garage) this.garage = new Garage(this.scene, this.renderer, this.ui.settings.quality);
    this.garage.show();
    if (this.world) this.world.root.visible = false;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this._setupMenuShowcase();
    this.ui.refreshHangar(this.ui.selectedTank, TANKS[this.ui.selectedTank]);
    this._initHangarControls();
    this._startPrewarm();
  }

  _cycleHangar(dir) {
    // 装载中也可切换：旧车的装载循环由完成时的 selectedTank 校验拦截（只预热不回切）
    const keys = Object.keys(TANKS);
    let idx = keys.indexOf(this.ui.selectedTank);
    idx = (idx + dir + keys.length) % keys.length;
    this._selectHangarTank(keys[idx]);
  }

  // 车库直选（翻页/下拉共用）：命中缓存即展示，否则走装载流程
  _selectHangarTank(key) {
    if (!TANKS[key]) return;
    this.ui.selectedTank = key;
    if (this._hangarCache.has(key) && this._prewarmed.has(key)) {
      this._setupMenuShowcase();
      this.ui.refreshHangar(key, TANKS[key]);
      return;
    }
    this._hangarBusy = true;
    this.ui.showHangarLoading(true, '载入坦克…', 0);
    requestAnimationFrame(() => requestAnimationFrame(() => this._loadTankThenShow(key)));
  }

  _initHangarControls() {
    if (this._camR === undefined) {
      this._camR = 8.20; this._camTheta = 0.730; this._camPhi = 0.350;
      this._camLookX = -0.40; this._camLookY = 2.50; this._camLookZ = 2.00; this._camYLift = 0.00;
    }
    this._drag = false; this._dragX = 0; this._dragY = 0;
    if (this._hangarWired) return;
    this._hangarWired = true;
    const c = this.renderer.domElement;
    c.addEventListener('wheel', (e) => {
      if (this.state !== 'hangar') return;
      e.preventDefault();
      this._camR = THREE.MathUtils.clamp(this._camR + e.deltaY * 0.01, 3, 30);
    }, { passive: false });
    c.addEventListener('mousedown', (e) => {
      if (this.state !== 'hangar') return;
      this._drag = true; this._dragX = e.clientX; this._dragY = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this._drag || this.state !== 'hangar') return;
      this._camTheta -= (e.clientX - this._dragX) * 0.006;
      this._camPhi = THREE.MathUtils.clamp(this._camPhi + (e.clientY - this._dragY) * 0.005, -0.3, 1.2);
      this._dragX = e.clientX; this._dragY = e.clientY;
    });
    window.addEventListener('mouseup', () => { this._drag = false; });
  }

  // ─────────── UI 绑定 / 状态机 ───────────
  _bindUI() {
    this.ui.bind({
      onCoverClick: () => { audio.init(); audio.playUIClick(); audio.applySettings(this._audioSettings()); audio.startMenuBGM(); this.state = 'menu'; this.ui.show('menu'); },
      onHuntMode: () => { audio.playUIClick(); this._enterHangarWithLoading(); },
      onBackMenu: () => { audio.playUIClick(); this._endToMenu(); },
      onHangarPrev: () => { audio.playUIClick(); this._cycleHangar(-1); },
      onHangarNext: () => { audio.playUIClick(); this._cycleHangar(1); },
      onHangarSelect: (key) => { audio.playUIClick(); this._selectHangarTank(key); },
      onStartBattle: () => { audio.playUIClick(); this._startBattle(); },
      onResultMenu: () => { audio.playUIClick(); this._endToMenu(); },
      onRetry: () => { audio.playUIClick(); this._startBattle(); },
      onPauseResume: () => { audio.playUIClick(); this._resume(); },
      onPauseMenu: () => { audio.playUIClick(); this.paused = false; this._endToMenu(); },
      onSettingsChanged: () => {
        audio.applySettings(this._audioSettings());
        this._applyQuality();
      },
    });
    this.input.onKeyDown = (code) => {
      if (this.state === 'battle' && code === 'KeyC') this.rig.toggleOrbit();
      if (this.state === 'battle' && code === 'Digit1') this._switchShellByCode('ap');
      if (this.state === 'battle' && code === 'Digit2') this._switchShellByCode('he');
      if (this.state === 'battle' && code === 'Digit3') this._switchShellByCode('apcr');
      if (this.state === 'battle' && code === 'KeyR') this._toggleRepair();
      if (this.state === 'battle' && code === 'KeyT') this._useExtinguisher();
      if (this.state === 'battle' && code === 'Escape') {
        if (this.paused) this._resume(); else this._pause();
      }
    };
    // 弃车模态：确认 → 判负结束
    document.getElementById('btn-bail-confirm').addEventListener('click', () => {
      document.getElementById('screen-bail').classList.remove('active');
      this._playerBailPending = false;
      this._onDefeat();
    });
  }

  // 玩家弃车（无法战斗）：强制确认模态，仅"确认弃车"一个出口
  _showBailModal() {
    this.input.enabled = false;
    this.input.aiming = false;
    this.input.releaseLock();
    document.getElementById('screen-bail').classList.add('active');
  }

  _toCover() {
    this.state = 'cover';
    this.ui.show('cover');
  }

  _audioSettings() {
    const s = this.ui.settings;
    return { master: s.master / 100, sfx: s.sfx / 100, ambient: s.ambient / 100,
      bgmOn: s.bgmOn !== false, bgmVol: s.bgmVol ?? 50, bgmMode: s.bgmMode || 'normal' };
  }

  // ─────────── 战斗流程（猎杀模式 1vN） ───────────
  // 坦克资产 LRU 释放：保留集（当前选择/参战/展示/车库缓存）之外最多再留 2 辆，超出按加载序淘汰
  // （淘汰的 GLB 场景几何/贴图全部 dispose；_tankJobs 清掉以便再次懒加载）
  _evictTankAssets() {
    if (!this.assets) return;
    const keep = new Set([(this.ui && this.ui.selectedTank) || 'tiger1']);
    if (this.player) keep.add(this.player.cfg.id);
    for (const e of this.enemies || []) keep.add(e.cfg.id);
    if (this.menuTank && this.menuTank.cfg) keep.add(this.menuTank.cfg.id);
    if (this._hangarCache) for (const k of this._hangarCache.keys()) keep.add(k);
    const MAX_EXTRA = 2;
    for (const k of Object.keys(this.assets)) {
      const extras = Object.keys(this.assets).filter(x => !keep.has(x));
      if (extras.length <= MAX_EXTRA) break;
      if (keep.has(k)) continue;
      const g = this.assets[k];
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          for (const t of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
            if (m[t] && m[t].dispose) m[t].dispose();
          }
          m.dispose();
        }
      });
      delete this.assets[k];
      if (this._tankJobs) this._tankJobs.delete(k);
      console.log('[evict]', k);
    }
  }

  // 敌方编队键解析（懒加载前置：先定车型再统一装载；逻辑与原内联版一致）
  _resolveEnemyKeys(playerKey) {
    // 固定阵营（默认开）：敌人只从敌对阵营抽取（轴心 de ↔ 同盟 us/uk/ru）
    const FACTION = { de: 'axis', us: 'allies', uk: 'allies', ru: 'allies' };
    const playerFac = FACTION[TANKS[playerKey].nation];
    let pool = Object.keys(TANKS);
    if (this.ui.settings.factionLock !== false && playerFac) {
      const opp = pool.filter((k) => FACTION[TANKS[k].nation] && FACTION[TANKS[k].nation] !== playerFac);
      if (opp.length) pool = opp;
    }
    const enemyKeys = pool.filter((k) => k !== playerKey);
    const slots = Array.isArray(this.ui.settings.enemyTanks) && this.ui.settings.enemyTanks.length
      ? this.ui.settings.enemyTanks.slice(0, GAME.maxEnemies)
      : Array(clamp(this.ui.settings.enemyCount || 1, 1, GAME.maxEnemies)).fill('random');
    return slots.map((eKey) => {
      // 'random' 或失效值（未知车型/固定阵营下同阵营）回退池内随机（可与玩家同型）
      if (!eKey || eKey === 'random' || !TANKS[eKey] ||
          (this.ui.settings.factionLock !== false && playerFac && FACTION[TANKS[eKey].nation] === playerFac)) {
        return Math.random() < 0.5 && enemyKeys.length
          ? enemyKeys[(Math.random() * enemyKeys.length) | 0]
          : pool[(Math.random() * pool.length) | 0];
      }
      return eKey;
    });
  }

  async _startBattle() {
    // ── 懒加载：参战车 + 地图资产组先就绪（旧世界保留至新世界可建，不黑屏） ──
    this.mapId = this.ui.settings.mapId || 'kursk';
    const playerKey = this.ui.selectedTank || 'tiger1';
    const enemyKeysResolved = this._resolveEnemyKeys(playerKey);
    this.ui.showHangarLoading(true, '装载战场…', 0);
    try {
      await Promise.all([
        this._ensureTankAssets([playerKey, ...enemyKeysResolved]),
        this._ensureMapAssets(this.mapId),
      ]);
    } catch (e) {
      console.error('战场装载失败', e);
      this.ui.showHangarLoading(false);
      return;
    }
    this.ui.showHangarLoading(false);

    if (this.garage) this.garage.hide();
    if (this.world) this.world.root.visible = true;
    this._clearBattle();
    this.paused = false;
    this._hangarBusy = false;
    this._parkShowcase();
    this.renderer.shadowMap.autoUpdate = true;
    this._applyQuality();

    // 按车库选图重建世界（mapId 与当前世界不同才重建，否则复用）
    if (this.world.mapId !== this.mapId) {
      this.world.dispose();
      this.world = this._buildWorld();
      this.shells.world = this.world;
      this.visibility.world = this.world;
      this.visibility.obstacles = this.world.obstacles;
      this.visibility.sightBlockers = this.world.sightBlockers;
      this.visibility.pois = generatePOIs(this.world, GAME.mapSize / 2);   // POI 搜索网（WP6）
      this.ui.minimap = null;
      this.ui.initMinimap(this.world);
    }
    this.renderer.toneMappingExposure = (this.world.map.exposure != null) ? this.world.map.exposure : 1.28;

    // ── 出生：玩家与敌群轴线对峙（1v1 约 1300m；1vN 1500m——配合侦查体系，接敌前有机动/埋伏空间） ──
    const n = Math.max(1, enemyKeysResolved.length);
    const dist = n === 1 ? 1300 : 1500;
    let ang = Math.random() * Math.PI * 2;
    // 地图自定义出生带（普罗霍罗夫卡：南北短边中间走廊随机点位）优先；否则轴线对峙
    const mapSpawns = this.world.map && this.world.map.spawns;
    let pSpawn, spawnInZone = null;
    if (mapSpawns) {
      const pick = (r) => [r.x0 + Math.random() * (r.x1 - r.x0), r.z0 + Math.random() * (r.z1 - r.z0)];
      pSpawn = pick(mapSpawns.a);
      spawnInZone = () => pick(mapSpawns.b);
    } else {
      pSpawn = [Math.sin(ang) * dist / 2, Math.cos(ang) * dist / 2];
    }
    // 灌木带为中央环带静态布置（双方中间区域与出生角无关），applyBattle 仅清穿越特效状态
    if (this.world.hedgeField) this.world.hedgeField.applyBattle(ang);
    const eBase = ang + Math.PI;

    this.player = new Tank(TANKS[playerKey], this.assets[playerKey].scene.clone(true), this.world);
    this.player.isPlayer = true;
    this.scene.add(this.player.root);

    this.enemies = [];
    this.enemyNames = [];
    for (let i = 0; i < n; i++) {
      const eKey = enemyKeysResolved[i];   // 已在 _resolveEnemyKeys 完成槽位/随机/阵营解析并预载
      let ex, ez;
      if (spawnInZone) {
        [ex, ez] = spawnInZone();
        for (let att = 0; att < 8; att++) {
          const [cx, cz] = spawnInZone();
          if (!this.enemies.some((e) => Math.hypot(e.pos.x - cx, e.pos.z - cz) < 60)) { ex = cx; ez = cz; break; }
        }
      } else {
        const eAng = eBase + (i - (n - 1) / 2) * 0.22 + (Math.random() - 0.5) * 0.08;
        const eDist = dist / 2 + (Math.random() - 0.5) * 120;
        ex = Math.sin(eAng) * eDist;
        ez = Math.cos(eAng) * eDist;
      }
      const e = new Tank(TANKS[eKey], this.assets[eKey].scene.clone(true), this.world);
      e.place(ex, ez, THREE.MathUtils.radToDeg(Math.atan2(pSpawn[0] - ex, pSpawn[1] - ez)));
      this.scene.add(e.root);
      this.enemies.push(e);
      this.enemyNames.push(TANKS[eKey].name);
    }
    // 玩家朝向最近敌
    const ne = this.enemies[0];
    this.player.place(pSpawn[0], pSpawn[1], THREE.MathUtils.radToDeg(Math.atan2(ne.pos.x - pSpawn[0], ne.pos.z - pSpawn[1])));
    this._evictTankAssets();   // 懒加载 LRU：参战车之外淘汰多余车型资产

    // AI（每敌一台）+ 点亮系统难度切面（警戒圈/反应延迟）
    this.ais = this.enemies.map((e) => {
      const ai = new TankAI(e, this.ui.aiDifficulty);
      this.visibility.setAIProfile(e, this.ui.aiDifficulty);
      ai.onFire = (t) => this.visibility.onFire(t, [this.player, ...this.enemies]);
      ai.onMGHit = (label, point) => {
        this.ui.hitLog(`我方${label}`, 'bad');
        this.ui.floatDamage(point, label, 'mod-module');
      };
      return ai;
    });

    // 排级大脑（§5）：敌车 ≥2 且难度支持协同（标准/王牌）时建排；新兵档独狼
    this.platoon = null;
    if (this.enemies.length > 1 && this.ais[0].diff.usePlatoon) {
      this.platoon = new PlatoonAI(this.ais, this.player, this.visibility);
      for (const ai of this.ais) ai.platoon = this.platoon;
    }

    // 履带印系统
    this.trackMarks = new TrackMarks(this.scene, this.world);

    this.shells.tanks = [this.player, ...this.enemies];
    this.shells.onEnemyHit = (label, dmg, killed, worldPos, events) => {
      this.playerHits++;
      this.ui.hitMarker(killed);
      this.ui.penMarker(label);
      if (label.startsWith('击穿')) this.playerPens++;
      if (events) {
        this.moduleHits += events.filter((ev) => ev.type === 'module' || ev.type === 'fire').length;
        this.crewKills += events.filter((ev) => ev.type === 'crew' && ev.lvl === 2).length;
        if (worldPos) for (const ev of events) this._floatEvent(worldPos, ev);
      }
      const tgt = this._enemyNameAt(worldPos);
      if (label.startsWith('跳弹')) this.ui.hitLog('跳弹', 'good');
      else if (label.startsWith('未能击穿')) this.ui.hitLog('未击穿', 'good');
      else if (label === '弹药殉爆！') this.ui.hitLog('殉爆！', 'good');
      else if (killed) this.ui.hitLog(`歼灭 ${tgt}`, 'good');
      else if (label.startsWith('击穿')) this.ui.hitLog(`击穿 ${tgt}`, 'good');
      else if (label.startsWith('HE')) this.ui.hitLog(label, 'good');
      if (events) for (const ev of events) {
        if (ev.type === 'module' || ev.type === 'fire') this.ui.hitLog(ev.label, 'good');
        else if (ev.type === 'crew' && ev.lvl === 2) this.ui.hitLog(`敌${ev.label}`, 'good');
      }
      if (killed) {
        this.ui.message(label === '弹药殉爆！' ? '弹药殉爆！目标歼灭' : '敌方坦克被歼灭！');
        audio.stopFire();
      }
    };
    this.shells.onPlayerHit = (type, dir, out, events, hitPos) => {
      // 车姿显示器命中标记：命中点转车体局部坐标（+z 前/+x 右），随轮廓旋转、短暂淡出
      if (hitPos && this.player && !this.player.destroyed) {
        const lp = this.player.root.worldToLocal(hitPos.clone());
        this.ui.addAttitudeHit(lp.x, lp.z, type === 'pen' ? 'pen' : (out && out.type === 'splash' ? 'splash' : 'bounce'));
      }
      if (type === 'pen') {
        this.ui.damageFlash(0.9);
        this.rig.addShake(0.8);
        const shellYaw = Math.atan2(dir.x, dir.z);
        this.ui.damageFrom(this.rig.aimYaw - shellYaw + Math.PI);
        if (events) {
          _v1.copy(this.player.root.position); _v1.y += 2.6;
          for (const ev of events) this._floatEvent(_v1, ev);
        }
        this.ui.hitLog('被击穿', 'bad');
        if (events) for (const ev of events) {
          if (ev.type === 'fire') this.ui.hitLog('起火！', 'bad');
          else if (ev.type === 'module') this.ui.hitLog(ev.label === '履带断裂' ? '被断履带' : `${ev.label}`, 'bad');
          else if (ev.type === 'crew') this.ui.hitLog(ev.label, 'bad');
          else if (ev.type === 'ammo_boom') this.ui.hitLog('殉爆！', 'bad');
          else if (ev.type === 'bail') this.ui.hitLog('车组弃车…', 'bad');
        }
        if (this.player.destroyed && !this.player.bailedOut) this._onDefeat();
      } else {
        this.ui.damageFlash(0.35);
        this.rig.addShake(0.25);
      }
    };

    this.battleTime = 0;
    this.playerShots = 0;
    this.playerHits = 0;
    this.playerPens = 0;
    this.crewKills = 0;
    this.moduleHits = 0;
    this.kills = 0;
    this._endByTimeout = false;
    this.throttleSmooth = 0;
    this.steerSmooth = 0;
    this.endTimer = -1;
    this._prevCoax = false;
    this._prevHullMg = false;
    this._playerBailPending = false;
    document.getElementById('screen-bail').classList.remove('active');

    this.rig.attach(this.player);

    // 可破坏系统接线
    this.world.onShellHitDestructible = (prev, pos, s) => this.world.destructibles.shellHit(prev, pos, s);
    this.world.destructibles.listener = this.player;

    // 重置点亮系统（排级在上方敌车建排代码中置空/重建，勿在此再清）
    this.visibility.dispose();

    this.state = 'battle';
    this.ui.show('hud');
    this.input.enabled = true;
    this.input.requestLock();
    audio.stopBGM();
    if (this.ui.settings.bgmMode === 'personal') this._bgmPending = true;
    else { this._bgmPending = false; audio.startBattleBGM(this.player.cfg); }
    audio.loadExtSounds(this.player.cfg).then(() => audio.startEngine());
    this.ui.buildAmmoPanel(this.player);
    this.ui.buildReticle(this.player.cfg.reticle);
    this.ui.onShellSelect = (type) => this._switchShellByCode(type);
    this.ui.updateConsumables(this.player);
    this.ui.message(n > 1 ? `猎杀开始：歼灭 ${n} 辆敌方坦克` : '猎杀开始：歼灭敌方坦克');
  }

  _clearBattle() {
    for (const t of [this.player, ...this.enemies]) {
      if (t) { t.dispose(); this.scene.remove(t.root); }
    }
    this.player = null;
    this.enemies = [];
    this.ais = [];
    if (this.trackMarks) { this.trackMarks.dispose(); this.trackMarks = null; }
    this.effects.clearScorches();   // 击毁焦痕：随战斗结束清理（效果永久存在于本局）
    if (this.shells) { this.shells.clear(); this.shells.tanks = []; }
    // 清世界级持续烟源（废墟火/倒树烟等）：world 跨局不重建，不清会定在原地带进下一局
    if (this.world && this.world.destructibles) this.world.destructibles.propFires.length = 0;
    this.ui.clearMarkers();
    this.ui.setScope(false);
    this.ui.setBinoc(false);   // 战斗结束收起望远镜（rig.attach 复位 rig.binocular）
    audio.stopFire();
    this.platoon = null;
    this.visibility.dispose();
  }

  _onDefeat() {
    audio.stopEngine();
    audio.stopMGLoop('coax');
    audio.stopMGLoop('hull');
    this._prevCoax = false;
    this._prevHullMg = false;
    this.rig.setAimMode(false);
    if (this.player) this.player.root.visible = true;
    this.endTimer = 2.2;
    this._pendingResult = false;
  }

  // 事件飘字配色：乘员阵亡/弃车/起火红 / 断履带蓝 / 模块橙
  _floatEvent(worldPos, ev) {
    const cls = (ev.type === 'fire' || ev.type === 'bail') ? 'mod-fire'
      : ev.type === 'crew' ? (ev.lvl === 2 ? 'mod-fire' : 'mod-module')
      : ev.label && ev.label.includes('履带') ? 'mod-track' : 'mod-module';
    this.ui.floatDamage(worldPos, ev.label, cls);
  }

  _enemyNameAt(worldPos) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = worldPos ? e.root.position.distanceTo(worldPos) : 0;
      if (d < bd) { bd = d; best = e; }
    }
    return best ? best.cfg.name : '';
  }

  // ── 切换弹种（1/2/3 键：AP/HE/APCR，重置装填） ──
  _switchShellByCode(type) {
    const p = this.player;
    if (!p || p.destroyed) return;
    const def = SHELL_TYPES[type];
    if (!def || p.shellType === type) return;
    if (p.shellPool[type] <= 0) { this.ui.message(`${def.full}已耗尽`); return; }
    if (p.switchShell(type)) {
      this.ui.message(`切换 ${def.full} ${def.name}`);
      this.ui.penMarker(`${def.name} 装填中…`);
    }
  }

  // ── 机枪单发：曳光 + 枪口焰 + hitscan（命中率随距离衰减；命中仅小概率毁观瞄） ──
  _fireMGShot(t, which) {
    const muzzle = _v2, dir = _v3;
    if (which === 'coax') {
      t.getMgMuzzle(muzzle, dir, null);
      t.getGunDirection(dir);   // 同轴：沿主炮指向
    } else {
      t.getHullMgMuzzle(muzzle, dir);
      if (t.hullInArc) dir.copy(t.hullAimPt).sub(muzzle).normalize();
    }
    const dd = t.cfg.mg.dispersion;
    dir.x += (Math.random() * 2 - 1) * dd;
    dir.y += (Math.random() * 2 - 1) * dd;
    dir.z += (Math.random() * 2 - 1) * dd;
    dir.normalize();
    this.effects.mgTracer(muzzle, dir, t.cfg.mg.range);
    this.effects.mgMuzzleFlash(muzzle, dir);
    // hitscan：包围球粗判 → 命中掷观瞄破坏
    for (const e of this.enemies) {
      if (e.destroyed) continue;
      _v4.copy(e.root.position); _v4.y += e.cfg.dims.hullHeight * 0.7;
      const r = Math.max(e.cfg.dims.length, e.cfg.dims.width) * 0.42 + 0.6;
      const tt = clamp(_v1.copy(_v4).sub(muzzle).dot(dir), 0, t.cfg.mg.range);
      if (tt >= t.cfg.mg.range) continue;
      _v1.copy(muzzle).addScaledVector(dir, tt);
      if (_v1.distanceToSquared(_v4) >= r * r) continue;
      this.effects.gunImpact(_v1, dir, t.mgCaliber);
      const hitDist = muzzle.distanceTo(_v1);
      const hitK = mgFalloff(hitDist);
      if (hitK > 0 && Math.random() < hitK) {
        const evs = e.applyMGDamage(hitDist);
        for (const ev of evs) {
          this.ui.hitLog(ev.label, 'good');
          this.moduleHits++;
          this.ui.floatDamage(_v1, ev.label, 'mod-module');
        }
      }
      break;
    }
  }

  // ── 消耗品 ──
  // 修理（读条制）：R 开始/再按中止；读条中不能移动、可开炮；维修包次数见 DAMAGE_RULES.repair.uses
  _toggleRepair() {
    const p = this.player;
    if (!p || p.destroyed) return;
    if (p.repairing) { p.cancelRepair(); this.ui.message('修理中止'); return; }
    if (p.consumables.repair <= 0) { this.ui.message('维修包已用完'); return; }
    if (p.startRepair()) {
      const r = p.repairing;
      this.ui.message(`开始修理（${r.dur.toFixed(0)}s）：${r.items.map(i => i.label).join('、')}——读条中无法移动，可开炮`);
      this.ui.updateConsumables(p);
    } else this.ui.message('没有可修理的损伤（损毁级损伤/方向机/观瞄不可修）');
  }
  _useExtinguisher() {
    const p = this.player;
    if (!p || p.destroyed) return;
    if (p.consumables.ext <= 0) { this.ui.message('灭火器已用完'); return; }
    if (p.useExtinguisher()) {
      this.ui.message('灭火器：火焰已扑灭');
      this.ui.updateConsumables(p);
    } else this.ui.message('未起火');
  }

  _onVictory() {
    this.endTimer = 2.0;
    this._pendingResult = true;
  }

  // ── 超时判定：比存活乘员比例（阵亡多者败） ──
  _onTimeout() {
    const p = this.player;
    const myFrac = p.crewAlive() / Math.max(1, p.crew.length);
    let enFrac = 0;
    for (const e of this.enemies) enFrac += e.destroyed ? 0 : e.crewAlive() / Math.max(1, e.crew.length);
    enFrac /= Math.max(1, this.enemies.length);
    this._endByTimeout = true;
    if (myFrac > enFrac + 0.001) {
      this.ui.message('时限已到 · 你保存了更多战力');
      this._onVictory();
    } else if (myFrac < enFrac - 0.001) {
      this.ui.message('时限已到 · 敌方保存了更多战力');
      this._onDefeat();
    } else {
      this.ui.message('时限已到 · 势均力敌');
      this.endTimer = 2.0;
      this._pendingResult = null;
    }
  }

  _finishBattle(victory) {
    this.state = 'result';
    this.input.enabled = false;
    this.input.releaseLock();
    this._bgmPending = false;
    audio.stopEngine();
    audio.stopMGLoop('coax');
    audio.stopMGLoop('hull');
    audio.startMenuBGM();
    this._prevCoax = false;
    this._prevHullMg = false;
    const acc = this.playerShots > 0 ? Math.round(this.playerHits / this.playerShots * 100) : 0;
    const timeUsed = this._endByTimeout ? GAME.timeLimit : this.battleTime;
    this.ui.result(victory, `
      战斗用时：${timeUsed.toFixed(0)} 秒${this._endByTimeout ? '（超时判定）' : ''}<br>
      射击 ${this.playerShots} 发 · 命中 ${this.playerHits} 发 · 击穿 ${this.playerPens} 发 · 命中率 ${acc}%<br>
      歼灭敌车 ${this.kills} 辆 · 击杀乘员 ${this.crewKills} 人 · 模块战果 ${this.moduleHits} 处<br>
      ${victory === null ? '势均力敌，握手言和。'
        : victory ? (this._endByTimeout ? '时限已到，你保存了更多战力，判定获胜。'
            : `敌方 ${this.enemyNames.join('、') || '坦克'} 已被歼灭，战场属于你。`)
        : `你的 ${this.player ? this.player.cfg.name : '坦克'} 被击毁了。`}
    `);
  }

  _endToMenu() {
    if (this.garage) this.garage.hide();
    this.renderer.shadowMap.autoUpdate = true;
    this._applyQuality();
    if (this.world) {
      this.world.root.visible = true;
      this.renderer.toneMappingExposure = (this.world.map.exposure != null) ? this.world.map.exposure : 1.28;
    }
    this._clearBattle();
    this._setupMenuShowcase();
    this.input.aiming = false;
    this.state = 'menu';
    this.ui.show('menu');
    audio.startMenuBGM();
  }

  _pause() {
    this.paused = true;
    this.input.aiming = false;
    this.input.releaseLock();
    audio.stopEngine();
    audio.stopMGLoop('coax');
    audio.stopMGLoop('hull');
    audio.pauseBGM();
    this._prevCoax = false;
    this._prevHullMg = false;
    this.ui.show('pause');
  }

  _resume() {
    this.paused = false;
    audio.resumeBGM();
    this.ui.show('hud');
  }

  // ─────────── 玩家操控（WT 式手感） ───────────
  _playerControl(dt) {
    const p = this.player, input = this.input;
    if (!p) return;

    // 个性化 BGM：玩家首次按 W 触发
    if (this._bgmPending && (input.key('KeyW') || input.key('ArrowUp'))) {
      this._bgmPending = false;
      audio.startBattleBGM(p.cfg);
    }

    // ── 油门 ──
    let throttle = 0, steer = 0;
    if (input.key('KeyW') || input.key('ArrowUp')) throttle += 1;
    if (input.key('KeyS') || input.key('ArrowDown')) throttle -= 1;
    if (input.key('KeyA') || input.key('ArrowLeft')) steer += 1;
    if (input.key('KeyD') || input.key('ArrowRight')) steer -= 1;
    this.throttleSmooth = damp(this.throttleSmooth, throttle, 5, dt);
    if (Math.abs(this.throttleSmooth) < 0.02 && throttle === 0) this.throttleSmooth = 0;
    this.steerSmooth = damp(this.steerSmooth, steer, 5, dt);

    // ── 观瞄（鼠标）；镜内灵敏度随固定倍率降低；望远镜态随倍率降低 ──
    const binoc = this.rig.binocular;
    const sens = binoc ? (0.0021 * 2 / this.rig.binoMag)
      : this.rig.aiming ? 0.00095 / this.rig.zoomMag : 0.0021;
    const { dx, dy, wheel } = input.consumeMouse();
    this.rig.addAim(dx * sens, dy * sens);
    // 滚轮：仅非开镜/非望远镜态调整追尾距离（望远镜 7×/12× 改由 Shift 切换）
    if (wheel !== 0 && !binoc && !this.rig.aiming) this.rig.zoom(wheel);
    // 开镜闩锁（右键按下沿；望远镜态下右键 = 收望远镜 + 开镜）
    if (input.consumeRmb()) {
      if (this.rig.binocular) { this.rig.setBinocular(false); this.ui.setBinoc(false); }
      input.aiming = !input.aiming;
    }
    this.rig.setAimMode(input.aiming);
    // Shift 按下沿 = 倍率切换：望远镜 7×/12×；多档瞄具（德系 TZF）2.5×/5×
    if (input.consumeZoomToggle()) {
      if (this.rig.binocular) this.ui.setBinoMag(this.rig.cycleBinoZoom());
      else if (this.rig.aiming) {
        const mag = this.rig.cycleAimZoom();
        if (mag != null) this.ui.message(`瞄具倍率 ×${mag.toFixed(1)}`);
      }
    }
    // 车长望远镜闩锁（Q）：与瞄准镜互斥
    if (input.consumeBinoToggle()) {
      const on = !this.rig.binocular;
      if (on && this.rig.aiming) { input.aiming = false; this.rig.setAimMode(false); }
      this.rig.setBinocular(on);
      if (this.rig.binocular === on) {   // 观赏模式下会被拒绝（rig 侧防护），UI 跟随实际状态
        this.ui.setBinoc(on);
        if (on) this.ui.setBinoMag(this.rig.binoMag);
        this.ui.message(on ? '车长望远镜（Q 退出 · Shift 切换 7×/12×）' : '收起望远镜');
      }
    }

    if (p.destroyed) { p.drive(dt, 0, 0, true); audio.killEngine(); return; }   // 击毁熄火（新式/旧式引擎通吃）

    p.drive(dt, clamp(this.throttleSmooth, -1, 1), clamp(this.steerSmooth, -1, 1), input.key('Space'));   // 空格 = 刹车（专职）

    // 望远镜观察态：不联动炮塔、不开火/机枪（纯观察；车辆仍可驾驶）
    if (this.rig.binocular) {
      if (this._prevCoax) { audio.stopMGLoop('coax'); this._prevCoax = false; }
      if (this._prevHullMg) { audio.stopMGLoop('hull'); this._prevHullMg = false; }
      const reloading = p.reload > 0;
      if (this.prevReloading && !reloading) audio.playReloaded();
      this.prevReloading = reloading;
      const rpm = Math.min(Math.abs(p.speed) / p.cfg.maxSpeedForward + Math.abs(throttle) * 0.25, 1);
      audio.setEngine(rpm, Math.abs(throttle), this._engineAudioState(p, throttle));
      return;
    }

    // 炮塔伺服
    p.aimAt(this.rig.aimTarget);
    p.updateTurret(dt);

    // ── 机枪：右键=同轴/车顶机枪（随炮塔）；F=前机枪（射界内自动瞄准）──
    if (p.cfg.mg) {
      p.mgTimer -= dt;
      p.hullMgTimer -= dt;
      const canFire = !p.destroyed && p.mgAmmo > 0;
      const coaxFire = canFire && input.mmbHeld && p.mgGroup;
      let hullFire = false;
      if (canFire && input.key('KeyF') && p.hullMgGroup) {
        // 自动瞄准：射程内最近的点亮目标；射界内无目标则沿枪管直射（始终开火）
        let tgt = null, bestD = Infinity;
        for (const e of this.enemies) {
          if (e.destroyed || !e.spotted) continue;
          const d = e.pos.distanceTo(p.pos);
          if (d < bestD && d <= p.cfg.mg.range) { bestD = d; tgt = e; }
        }
        hullFire = true;
        if (tgt) {
          _v1.copy(tgt.pos); _v1.y += 1.4;
          p.updateHullMg(dt, _v1);   // 超出射界 → hullInArc=false，弹道自动改直射
        } else p.updateHullMg(dt, null);
      }
      // 双枪循环音效
      if (coaxFire && !this._prevCoax) audio.startMGLoop('coax');
      if (!coaxFire && this._prevCoax) audio.stopMGLoop('coax');
      this._prevCoax = coaxFire;
      if (hullFire && !this._prevHullMg) audio.startMGLoop('hull');
      if (!hullFire && this._prevHullMg) audio.stopMGLoop('hull');
      this._prevHullMg = hullFire;
      // 发射（共用 MG 弹链）
      if (coaxFire && p.mgTimer <= 0) {
        p.mgTimer = 1 / p.cfg.mg.rate;
        p.mgAmmo--;
        this._fireMGShot(p, 'coax');
      }
      if (hullFire && p.hullMgTimer <= 0) {
        p.hullMgTimer = 1 / p.cfg.mg.rate;
        p.mgAmmo--;
        this._fireMGShot(p, 'hull');
      }
    }
    p.updateFireControl(dt);

    // 开火
    if (input.consumeFire()) {
      if (p.readyToFire()) {
        const shot = p.fire();
        this.shells.fire(shot);
        _v2.crossVectors(shot.dir, _up);
        if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
        this.effects.muzzleBlast(shot.pos, shot.dir, _v2.normalize());
        this.visibility.onFire(this.player, [this.player, ...this.enemies]);
        if (this.world.hedgeField) this.world.hedgeField.muzzleShake(shot.pos);   // 灌木丛 5m 内开火 → 震落尘埃
        this.rig.addShake(0.5);
        this.rig.addRecoil(1);
        if (this.rig.aiming) { this.rig.addAimKick(0.012); this.ui.scopeFlash(); }   // 镜内开火上跳（二战无稳定垂稳除 M4）
        audio.playFire(1, this.rig.aiming);
        this.playerShots++;
        // 炮弹抛壳：炮塔顶部靠后，延迟0.8-1.2秒
        {
          const ep = new THREE.Vector3().copy(p.root.position);
          ep.y += p.cfg.dims.turretTop + 0.3;
          ep.addScaledVector(shot.dir, -1.0);
          const ed = shot.dir.clone();
          const es = _v2.clone();
          setTimeout(() => { this.effects.ejectCasing(ep, ed, 'cannon', es); }, 800 + Math.random() * 400);
        }
      } else {
        this.ui.penMarker(p.modules.breech.hp <= 0 ? '炮闩损毁，无法开火！' : '装填中…');
      }
    }
    // 装填完成提示音
    const reloading = p.reload > 0;
    if (this.prevReloading && !reloading) audio.playReloaded();
    this.prevReloading = reloading;

    // 发动机音随转速
    const rpm = Math.min(Math.abs(p.speed) / p.cfg.maxSpeedForward + Math.abs(throttle) * 0.25, 1);
    audio.setEngine(rpm, Math.abs(throttle), this._engineAudioState(p, throttle));
  }

  // 新式发动机音频状态（audio.setEngine 第三参，旧式引擎忽略）：有油门/转向输入即 active；
  // atTop = 车速达地形生效极速的 95%（阈值与排气规则同式），极速后音量降到 80%
  _engineAudioState(p, throttle) {
    const steer = Math.abs(this.steerSmooth || 0);
    const sp = Math.abs(p.speed);
    const terr = TERRAIN_RULES[(this.world.map && this.world.map.terrain) || 'hard'] || TERRAIN_RULES.hard;
    const effMaxK = terr.base === 'road' ? terr.speedK : (p.cfg.offroadK || 1) * terr.speedK;
    const effMax = p.cfg.maxSpeed * effMaxK;
    return {
      active: Math.abs(throttle) > 0.06 || steer > 0.06,
      atTop: sp * 3.6 > effMax * 3.6 * 0.95,
      spRatio: effMax > 0 ? Math.min(sp / effMax, 1) : 0,   // 滑行音量按此在 50%~80% 间滑移
      sp,
      aiming: !!this.rig.aiming,   // 开镜=舱内视角：发动机/行驶声 ×0.7（敞开炮塔车 audio 侧豁免）
    };
  }

  // ─────────── 测距：相机中心射线 → 敌坦 / 地形，真实弹道积分门控 ───────────
  // 瞄准点 = 准星射线锁到的面（永远在准星正下方）；炮弹按炮口→瞄准点抛物线飞行。
  // 2026-09-19 重写：敌车锁定后对炮口→敌车弹道做逐点地形积分——
  // ① 炮口低于瞄线（镜位低 ~0.7-1m）→ 近中段弹道比瞄线低 0.3~0.7m，瞄线擦过的中途坎炮弹会撞上；
  // ② hull-down 棱线擦掠（旧"浅掠让位"的 dip/hArc 解析豁免缺视差项，已被精确积分取代）。
  // 弹道被遮 → 瞄准点抢到碰地点、aimTargetTank 清空、aimBlocked=true（HUD 琥珀提示），弹着诚实。
  _updateRanging() {
    this.aimDist = null;
    this.aimTargetTank = null;
    this.aimBlocked = false;
    if (!this.player) return;
    const origin = this.camera.position;
    const dir = this.rig.aimDirection(this.rayDir);
    let best = 1600;
    this.raycaster.set(origin, dir);
    for (const e of this.enemies) {
      if (e.destroyed) continue;
      const hits = this.raycaster.intersectObject(e.root, true);
      if (hits.length && hits[0].distance < best) {
        best = hits[0].distance;
        this.aimTargetTank = e;
      }
    }
    if (this.aimTargetTank) {
      // 敌车锁定 → 炮口→瞄准点抛物线沿途查地形
      this.player.getMuzzle(_v6, _v7);
      _v1.copy(origin).addScaledVector(dir, best);
      const contact = this._trajectoryContact(_v6, _v1, this.player.shellVelocityOf());
      if (contact) {
        this.rig.aimTarget.copy(contact);
        this.aimDist = origin.distanceTo(contact);
        this.aimTargetTank = null;
        this.aimBlocked = true;
      } else {
        this.rig.aimTarget.copy(_v1);
        this.aimDist = best;
      }
      return;
    }
    // 无敌车命中：地形步进找地面锁点（全程净空 → farPoint 1600m，过顶靠距离读数自查）
    for (let d = 12; d < best; d += 3) {
      _v1.copy(origin).addScaledVector(dir, d);
      if (this.world.groundY(_v1.x, _v1.z) >= _v1.y) { best = d; break; }
    }
    if (best < 1600) {
      this.rig.aimTarget.copy(origin).addScaledVector(dir, best);
      this.aimDist = best;
    } else {
      this.rig.aimTarget.copy(this.rig.farPoint);
    }
  }

  // 炮口→瞄准点抛物线（真空 + GAME.shellGravity，与 tank.updateTurret 解算 / shell.js 积分同模型）
  // 沿途对地形求交：返回 null = 全程净空；否则返回首个碰地点（碰地子段线性插值精化）。
  _trajectoryContact(from, to, v) {
    const R = Math.hypot(to.x - from.x, to.z - from.z);
    if (R < 10) return null;
    const g = GAME.shellGravity;
    const dy = to.y - from.y;
    const disc = v * v * v * v - g * (g * R * R + 2 * dy * v * v);
    if (disc <= 0) return null;   // 抛物线无解（超射程，伺服层自会钳仰角）——不判遮挡
    const elev = Math.atan((v * v - Math.sqrt(disc)) / (g * R));
    const cosE = Math.cos(elev);
    const vx = v * cosE * (to.x - from.x) / R, vz = v * cosE * (to.z - from.z) / R;
    const vy = v * Math.sin(elev);
    const tof = R / (v * cosE);
    const N = Math.min(240, Math.max(24, Math.ceil(R / 4)));
    let px = from.x, py = from.y, pz = from.z, pg = this.world.groundY(px, pz);
    for (let i = 1; i <= N; i++) {
      const t = tof * i / N;
      const x = from.x + vx * t, z = from.z + vz * t;
      const y = from.y + vy * t - 0.5 * g * t * t;
      const gy = this.world.groundY(x, z);
      if (y <= gy) {
        if (i === 1) return new THREE.Vector3(x, gy, z);
        const f = (py - pg) / Math.max(1e-6, (py - pg) + (gy - y));   // 碰地子段线性插值
        return new THREE.Vector3(px + (x - px) * f, py + (y - py) * f, pz + (z - pz) * f);
      }
      px = x; py = y; pz = z; pg = gy;
    }
    return null;
  }

  // ─────────── 菜单/车库展示机位 ───────────
  _menuCamera(dt) {
    if (this.state === 'hangar') {
      if (this._camR === undefined) {
        this._camR = 8.20; this._camTheta = 0.730; this._camPhi = 0.350;
        this._camLookX = -0.40; this._camLookY = 2.50; this._camLookZ = 2.00; this._camYLift = 0.00;
      }
      const r = this._camR, t = this._camTheta, p = this._camPhi;
      this.camera.position.x = r * Math.cos(p) * Math.sin(t);
      this.camera.position.y = r * Math.sin(p) + this._camYLift;
      this.camera.position.z = r * Math.cos(p) * Math.cos(t);
      this.camera.lookAt(this._camLookX, this._camLookY, this._camLookZ);
    } else {
      this.menuAngle += dt * 0.1;
      const cx = Math.sin(this.menuAngle) * 7, cz = Math.cos(this.menuAngle) * 7;
      this.camera.position.set(cx, 5.5 + Math.sin(this.menuAngle * 2.3) * 0.5, cz);
      const _f = new THREE.Vector3(0, 1.0, 0).sub(this.camera.position).normalize();
      const _r = new THREE.Vector3().crossVectors(_f, new THREE.Vector3(0, 1, 0)).normalize();
      this.camera.lookAt(_r.multiplyScalar(-2.8).add(new THREE.Vector3(0, 1.0, 0)));
    }
    if (Math.abs(this.camera.fov - CAMERA.fov) > 0.1) {
      this.camera.fov = CAMERA.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.world) this.world.trackShadow(this.camera.position);
  }

  // ─────────── 帧数监控 ───────────
  _fpsTick(dt) {
    this._fpsAcc = (this._fpsAcc || 0) + dt;
    this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsAcc >= 0.5) {
      if (!this._fpsEl) {
        const el = document.createElement('div');
        el.textContent = '-- FPS';
        el.style.cssText = [
          'position:fixed', 'top:10px', 'right:10px', 'z-index:9999',
          'background:#000', 'color:#fff', 'font:11px/1.4 Consolas,monospace',
          'padding:2px 8px', 'border-radius:3px', 'opacity:0.75',
          'pointer-events:none', 'white-space:nowrap',
        ].join(';');
        document.body.appendChild(el);
        this._fpsEl = el;
      }
      this._fpsEl.textContent = Math.round(this._fpsN / this._fpsAcc) + ' FPS';
      this._fpsAcc = 0; this._fpsN = 0;
    }
  }

  // ─────────── 主循环 ───────────
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._fpsTick(dt);
    // 灌木/树木风摆时钟（阵风间歇制，见 hedge.js updateHedge；顶点 shader 实测零开销）
    updateHedge(this.clock.getElapsed(), dt);

    if (this.state === 'battle' && this.player && !this.paused) {
      this.battleTime += dt;
      this._playerControl(dt);
      const allTanks = [this.player, ...this.enemies];
      if (this.platoon) this.platoon.update(dt);   // 排级大脑先于个体（指令先行，§5）
      for (const ai of this.ais) ai.update(dt, this.player, this.shells, this.effects, audio, this.visibility);
      for (const t of allTanks) t.update(dt, this.effects, audio);
      // 异步事件抽取（起火杀乘员等）：玩家上车顶飘字 + hitlog；敌车计数为玩家战果
      for (const t of allTanks) {
        if (!t.pendingEvents.length) continue;
        _v1.copy(t.root.position); _v1.y += 2.6;
        for (const ev of t.pendingEvents) {
          this._floatEvent(_v1, ev);
          if (t.isPlayer) this.ui.hitLog(ev.label, 'bad');
          else {
            this.ui.hitLog(`敌${ev.label}`, 'good');
            if (ev.type === 'crew' && ev.lvl === 2) this.crewKills++;
          }
        }
        t.pendingEvents.length = 0;
      }
      // 战果统一计数（含弃车/烧死等非炮弹直接击毁）
      for (const e of this.enemies) {
        if (e.destroyed && !e._killCounted) {
          e._killCounted = true;
          this.kills++;
          if (e.bailedOut) this.ui.message('敌方车组弃车，目标瘫痪！');
        }
      }
      // 玩家弃车优先于普通击毁结算：弹强制确认模态（只能确认 → 判负）
      if (this.player.bailedOut && !this._playerBailPending) {
        this._playerBailPending = true;
        this._showBailModal();
      }
      // 起火导致的死亡结算（弃车走模态确认，不直接判负）
      if (this.player.destroyed && this.endTimer < 0 && !this._playerBailPending) this._onDefeat();
      // 可破坏系统
      this.world.destructibles.crushCheck(this.player, this.rig);
      for (const e of this.enemies) this.world.destructibles.crushCheck(e, null);
      this.world.destructibles.update(dt);
      // 灌木带穿越特效（尘土 / 碾木声 / 少量落叶）
      if (this.world.hedgeField) this.world.hedgeField.update(dt, this.player, this.enemies);
      // 坦克间碰撞
      for (let i = 0; i < allTanks.length; i++) {
        for (let j = i + 1; j < allTanks.length; j++) {
          const a = allTanks[i], b = allTanks[j];
          if (a.destroyed && b.destroyed) continue;
          const n = a.collideTank(b);
          if (n) {
            a._syncTransform(0); b._syncTransform(0);
            const impact = Math.abs(a.speed) + Math.abs(b.speed);
            this._ramCd = Math.max(0, (this._ramCd || 0) - dt);
            if (impact > 2 && this._ramCd <= 0) {
              this._ramCd = 0.5;
              _v1.copy(a.pos).lerp(b.pos, 0.5); _v1.y += 1.2;
              this.effects.mgImpact(_v1);
              audio.playHitArmor(false, this.player.root.position.distanceTo(_v1));
            }
          }
        }
      }
      // 听者位置（命中类音效距离衰减基准）
      if (this.player && this.player.root) audio.setListenerPos(this.player.root.position);
      // 点亮系统
      this.visibility.update(dt, allTanks);
      // 主动侦查：望远镜/瞄准镜持续照射 → 确认 600m+ 目标（唯一远距确认途径）
      this.visibility.playerDwell(dt, this.player, this.enemies,
        this.rig.aimDirection(this.rayDir), this.rig.binocular || this.rig.aiming);
      // 暴露警示（被敌疑似/确认锁定时 HUD 提示）
      this.ui.updateExposure(this.visibility.playerExposure());
      // 履带印
      if (this.trackMarks) {
        for (const t of allTanks) this.trackMarks.trackTank(t, dt);
        this.trackMarks.update(dt);
      }
      this.rig.update(dt);
      if (this.effects.shakeAmount > 0.01) this.rig.shake = Math.max(this.rig.shake, this.effects.shakeAmount * 0.8);
      this._updateRanging();
      if (this.world.skyMat) this.world.skyMat.uniforms.uTime.value += dt;
      if (this.world.snowfall) this.world.snowfall.update(dt, this.camera.position);   // 阿登飘雪

      // 行驶扬尘 + 排气
      this._driveEffects(this.player, dt);
      for (const e of this.enemies) this._driveEffects(e, dt);

      // 胜负判定
      if (this.endTimer < 0) {
        if (this.enemies.every((e) => e.destroyed)) this._onVictory();
        else if (this.battleTime >= GAME.timeLimit) this._onTimeout();
      } else {
        this.endTimer -= dt;
        if (this.endTimer <= 0) {
          this._finishBattle(this._pendingResult);
          this.endTimer = -1;
        }
      }

      // HUD
      const p = this.player;
      const reloadFrac = 1 - Math.max(p.reload, 0) / p.reloadTimeNow();
      const fovRad = this.camera.fov * Math.PI / 180;
      const dispPx = Math.tan(p.dispersion) / Math.tan(fovRad / 2) * (innerHeight / 2);
      const ringSize = clamp(30 + dispPx * 8, 49, 174);   // 增益 ×8 放大缩圈动态；下限 49 → 视觉最小圈 56px（> 1cm 炮口指示器）；×1.15 后上限 ≈200px（ui.js）
      const aimFovRad = this.rig.aimFovEff() * Math.PI / 180;
      const gsDispSize = clamp(Math.tan(p.dispersion) / Math.tan(aimFovRad / 2) * innerHeight, 58, 700);   // 最小圈 58px（> 1cm 炮口指示器 37.8px）
      const minD = p.cfg.dispersion;
      const aimFrac = clamp(1 - (p.dispersion - minD) / (minD * 4), 0, 1);
      const aimed = aimFrac >= 0.985 && !p.destroyed;
      // 炮口指示器：炮管当前弹着点投影（按当前瞄准点水平距离做弹道积分——
      // 炮伺服到位时弹着点=瞄准点，与准星严格重合；第三人称与开镜均显示）
      let gunMarker = { show: false };
      // 测距门控：1cm 炮口圆"套住"敌坦克（炮线与敌车夹角 < 圆的角半径）才启动测距旋转
      let dialRange = null;
      if (!this.rig.orbiting && !this.rig.binocular && !p.destroyed) {
        p.getMuzzle(_v2, _v3);
        const angR = (19 / innerHeight) * this.camera.fov * Math.PI / 180;   // 1cm 圆半径的视角
        let bestAng = angR;
        for (const e of this.enemies) {
          if (e.destroyed) continue;
          _v4.copy(e.root.position); _v4.y += 1.2; _v4.sub(_v2);
          const dE = _v4.length();
          const ang = Math.acos(clamp(_v4.dot(_v3) / dE, -1, 1));
          if (ang < bestAng) { bestAng = ang; dialRange = dE; }
        }
        const v = p.shellVelocityOf();
        const cosE = Math.sqrt(Math.max(0.02, 1 - _v3.y * _v3.y));
        let H = 600;
        if (p.aimPoint) {
          // 水平距离下限 8m：过近时（俯角打满看车身前地面）钳制会放大视差，8m 内本就无瞄准意义
          H = Math.max(8, Math.hypot(p.aimPoint.x - _v2.x, p.aimPoint.z - _v2.z));
        }
        const tFly = H / Math.max(60, v * cosE);
        _v2.addScaledVector(_v3, v * tFly);
        _v2.y -= 0.5 * GAME.shellGravity * tFly * tFly;
        _v2.project(this.camera);
        if (_v2.z < 1 && Math.abs(_v2.x) < 1.1 && Math.abs(_v2.y) < 1.1) {
          gunMarker = { show: true, x: (_v2.x * 0.5 + 0.5) * innerWidth, y: (-_v2.y * 0.5 + 0.5) * innerHeight };
        }
      }
      this.ui.updateHUD(p, this.enemies.filter((e) => !e.destroyed).length, {        reloadFrac, ringSize, aimFrac, aimed, gsDispSize,
        timeLeft: GAME.timeLimit - this.battleTime,
        range: this.aimDist,
        targetName: this.aimTargetTank ? this.aimTargetTank.cfg.name : '',
        blocked: this.aimBlocked,   // 瞄准线被地形遮断：炮口指示器/距离读数转琥珀
        scoped: this.rig.aiming,
        zoomText: `×${(CAMERA.fov / this.rig.aimFovEff()).toFixed(1)}`,
        gunMarker,
        dialRange,
        locked: !p.destroyed && p.aimOffset < 0.006,   // 炮管到位（与瞄准线重合）→ 外圈变色
        // 收敛档位：0 就位 / 1 接近 / 2 未就位——炮弹沿炮管飞，未就位时炮口指示器才是真准星
        conv: p.destroyed ? 0 : (p.aimOffset < 0.006 ? 0 : p.aimOffset < 0.02 ? 1 : 2),
      });
      this.ui.updateAttitude(p, this.rig.aimYaw);   // 车姿显示器：车体朝上、炮塔相对旋转 + 观测视野扇形
      this.ui.updateMarkers(this.enemies, p, this.camera);
      this.ui.minimap && this.ui.minimap.update(dt, p, this.enemies, this.rig ? this.rig.aimYaw : p.heading);
      this.ui.updateConsumables(p);
      this.ui.updateRepair(p.repairing);
      this.world.trackShadow(p.root.position);
      this.world.updateCulling(dt, this.camera.position);
    } else {
      (this.state === 'menu' || this.state === 'hangar') && this._menuCamera(dt);
      if (this.menuTank) this.menuTank.update(dt, this.effects, audio);
      if (this.state === 'hangar' && this.garage) this.garage.update(dt);
    }

    // 远景战场氛围烟柱
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0 && this.world && this.state !== 'hangar') {
      this.ambientTimer = 2.5 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 260;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const y = this.world.groundY(x, z);
      for (let i = 0; i < 6; i++) {
        this.ps.spawn('smoke', {
          x: x + (Math.random() - 0.5) * 8, y: y + Math.random() * 10, z: z + (Math.random() - 0.5) * 8,
          vx: 1 + Math.random(), vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5),
          life: 3 + Math.random() * 3, size0: 6, size1: 18, alpha: 0.16, drag: 0.3,
        });
      }
    }

    if (!this.paused && this.shells) {
      this.shells.update(dt);
      this.effects.update(dt);
      this.ps.update(dt);
    }
    this.ps.setFov(this.camera.fov, innerHeight);
    // 排气热浪热源登记（战斗=双方车辆；车库/主菜单=展示车怠速；暂停时保持登记避免 ESC 闪烁）
    this.heat.beginFrame();
    if (this.state === 'battle' || this.state === 'result') {
      if (this.player) this.heat.updateTank(this.player, dt, this.camera);
      for (const e of this.enemies) this.heat.updateTank(e, dt, this.camera);
    } else if ((this.state === 'menu' || this.state === 'hangar') && this.menuTank) {
      this.heat.updateTank(this.menuTank, dt, this.camera);
    }
    this.renderer.render(this.scene, this.camera);
    // 热浪时钟仅在非暂停时推进（暂停时全场冻结，含热浪抖动）
    if (!this.paused) this._heatClock = (this._heatClock || 0) + dt;
    this.heat.draw(this.renderer, this.camera, this._heatClock || 0);
  }

  _driveEffects(t, dt) {
    if (t.destroyed) return;
    const sp = Math.abs(t.speed);
    // 履带扬尘
    t.dustTimer -= dt;
    if (sp > 2 && t.dustTimer <= 0) {
      t.dustTimer = 0.05 - Math.min(sp / 40, 1) * 0.03;
      const mul = t.cfg.dustMul || 1;
      const reps = Math.floor(mul) + (Math.random() < mul % 1 ? 1 : 0);
      const inten = Math.min((sp / 18) * Math.sqrt(mul), 1);
      for (let r = 0; r < reps; r++) {
        for (const tl of t.cfg.trackLocal) {
          _v1.fromArray(tl);
          t.model.localToWorld(_v1);
          _v1.y = this.world.groundY(_v1.x, _v1.z) + 0.4;
          this.effects.trackDust(_v1, inten);
        }
      }
    }
    // 排气（拟真）：负荷（油门/原地转向/起步）→ 浓密急促；跑起来 → 清淡稀疏不拉烟。
    // accumulator 累积出团（帧率无关的均匀脉动，不再一团团断续），左右排气口交替，每团随机微差。
    const thr = Math.abs(t.throttle ?? 0);
    const steerK = Math.abs(t.steer ?? 0);
    const spN = Math.min(sp / t.cfg.maxSpeed, 1);
    const pivotK = (steerK > 0.2 && sp < 2.5) ? steerK : 0;                 // 原地转向 = 大负荷
    // 尾气透明度规则（2026-09-23 用户定）：全浓度 = 车速 <8km/h / 原地转向 / 加速段
    // （按 W/S 且未达地形极速）；半浓度（×0.5）= 其余时间（特别是极速平稳巡航）
    const _terr = TERRAIN_RULES[(this.world.map && this.world.map.terrain) || 'hard'] || TERRAIN_RULES.hard;
    const _effMaxK = _terr.base === 'road' ? _terr.speedK : (t.cfg.offroadK || 1) * _terr.speedK;
    const _vKmh = sp * 3.6;
    const _atMax = _vKmh > t.cfg.maxSpeed * _effMaxK * 3.6 * 0.95;
    const _alphaMul = (_vKmh < 8 || pivotK > 0 || (thr > 0.1 && !_atMax)) ? 1 : 0.5;
    const loadK = Math.min(Math.max(thr, pivotK), 1);
    const cruiseK = spN * (1 - loadK * 0.7);                                // 巡航因子：有速度且不深踩油门
    const starting = loadK > 0.3 && sp < 5;
    t.startK += ((starting ? 1 : 0) - t.startK) * Math.min(1, dt * (starting ? 6 : 0.8));
    const dark = clamp(0.05 + loadK * 0.45 + t.startK * 0.5 - cruiseK * 0.25, 0.03, 0.95);
    const rate = 3.0 + loadK * 9 + t.startK * 5;                            // 团/秒：巡航 3 → 满负荷 ~17
    t.exhaustAcc = (t.exhaustAcc || 0) + dt * rate;
    while (t.exhaustAcc >= 1) {
      t.exhaustAcc -= 1;
      t.exhaustSide = ((t.exhaustSide || 0) + 1) % t.cfg.exhaustLocal.length;
      const el = t.cfg.exhaustLocal[t.exhaustSide];
      _v1.fromArray(el);
      t.model.localToWorld(_v1);
      // V 字排烟管（苏系上喷型）：按排气口所在侧求外侧水平单位向量（左管偏左、右管偏右，勿交叉）
      _v2.set(Math.cos(t.heading), 0, -Math.sin(t.heading)).multiplyScalar(el[0] >= 0 ? 1 : -1);
      this.effects.exhaustPuff(_v1, loadK, dark * (0.75 + Math.random() * 0.5), false, spN, t.cfg.exhaustType, _alphaMul, _v2);
    }
  }
}

window.__game = new Game();
window.__audio = audio;
