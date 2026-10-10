// ═══ 钢铁战线3·铁甲猎手 — 二战坦克全局配置（参数参考实车数据，适度游戏化）═══

export const GAME = {
  mapSize: 2200,            // 战场边长 (m)
  shellGravity: 9.8,
  quality: 'high',
  timeLimit: 600,           // 战斗时限 s（超时按存活乘员比例+击毁数判定）
  maxEnemies: 5,            // 猎杀模式敌方数量上限（1v1 ~ 1v5）
};

// 相机（继承钢铁战线2手感）
export const CAMERA = {
  fov: 62,
  aimFov: 32,               // 开镜基础 FOV（各车固定倍率由 zoomFov 覆盖）
  chaseDist: 10, chaseMin: 5.5, chaseMax: 22,
  chaseHeight: 2.6,
  followLerp: 9,
  aimLerp: 14,
};

// ═══ 点亮/侦查规则（成对观察；第七次迭代·察觉/确认两层对等模型，docs/ai-redesign-plan.md §3） ═══
export const VISIBILITY_RULES = {
  sightRangeHard: 1600,     // LOS 硬上限 m（原 1100；覆盖 fireContact 1400 + dwell 1200 余量）
  detectInterval: 0.3,      // 视线检测周期 s
  detectDelay: 0.5,         // 自动发现延迟 s
  spotHold: 3,              // 确认点亮保持 s（失去视线后）
  lostDuration: 7,          // 失联标记持续 s
  // ── 第 1 层：察觉圈（→疑似；不按车型，按目标行为） ──
  detectMove: 1200,         // 目标移动被察觉距离 m
  detectStationary: 900,    // 目标静止（开阔地、引擎运转）被察觉距离 m——开阔地静止坦克远距同样可见
  // ── 第 2 层 A：自动确认圈（基准；角色系数 ×autoConfirmK，AI 难度 ×obsK） ──
  autoStationary: 500,      // 目标静止
  autoMoving: 700,          // 目标移动（|speed| > movingSpeed）
  autoConcealed: 300,       // 目标仅被灌木等软遮挡遮蔽时的确认圈（concealCap）
  movingSpeed: 1,           // 移动判定速度阈值 m/s
  // ── 玩家主动侦查（望远镜/瞄准镜持续照射确认远处目标） ──
  dwellTime: 2.0,           // 确认所需照射 s
  dwellTimeConcealed: 3.0,  // 目标部分隐蔽（仅软遮挡）时
  dwellTol: 0.010,          // 照射角容差 rad（另加目标角尺寸补偿）
  // ── tgtK 目标修正（乘在确认距离上） ──
  ambushStillTime: 5,       // 静止 ≥该时长进入埋伏态 s
  tgtFireWindow: 3,         // 开火后被视认加成窗口 s
  tgtFireK: 1.5,            // 开火窗口内被确认距离系数
  tgtHeavyK: 1.15,          // 重型/大型车体
  tgtLowK: 0.85,            // 低矮车体（车高 <2m）
  tgtAmbushK: 0.8,          // 埋伏态
  tgtHullDownK: 0.5,        // 车体被地形遮蔽（hull-down）
  // ── obsK 观察者修正 ──
  opticsDamagedK: 0.7,      // 观瞄受损
  opticsDeadK: 0.4,         // 观瞄损毁
  obsFloor: 0.25,           // 综合 obsK 下限
  // ── 扇形视野 ──
  casemateFrontArc: 30,     // casemate 前向全距扇面 ±°
  casemateSideK: 0.5,       // casemate 侧后确认距离系数
  turretInArc: 60,          // 炮塔朝向 ±° 内确认延迟 detectDelay
  turretOutDelay: 1.2,      // 炮塔朝向之外确认延迟 s
  // ── AI 警戒/反应（按难度分档；obsK 见 js/ai/difficulty.js） ──
  aiAlertRange: { novice: 600, standard: 700, ace: 800 },   // 未接触前的发现圈 m（旧接口，WP2 起由 obsK×基准取代）
  aiReactDelay: { novice: 3.0, standard: 2.0, ace: 1.5 },   // 获得接触 → 有效反应 s
  // ── 开火暴露（双方对称；无视遮挡——炮声/炮口焰，含掩体后） ──
  fireContactRange: 1400,   // 开火听觉接触距离 m
  fireContactTime: 3,       // 疑似标记保持 s
  fireErrNear: 40,          // AI 声源定位误差（近）m
  fireErrFar: 80,           // （远）m
  fireErrConcealedMul: 1.5, // 射手在软遮挡后时误差加成
  fireErrDecay: 0.5,        // 连续开火误差收敛系数（<8m 视为锁定位置）
  farSnapshotError: 0,      // 玩家侧远距快照误差 m（0=关闭，裁决 #7 留旋钮）
  // ── 电台共享（AI 间，仅针对玩家；延迟 2~4s） ──
  radioDelayMin: 2, radioDelayMax: 4,
  radioErrMul: 1.3,         // 通报位置的误差放大
};

// 命中区域中文名（命中反馈用）
export const ZONE_NAMES = {
  hullFront: '车体正面', hullSide: '车体侧面', hullRear: '车体尾部', hullTop: '车体顶部',
  turretFront: '炮塔正面', turretSide: '炮塔侧面', turretRear: '炮塔尾部',
};

// ═══════════════════════ 坦克定义（1943 库尔斯克） ═══════════════════════
// 注意：两车模型均为 forwardAxis '+x'（车头朝模型 +X），加载时烘焙为 +Z 朝前。
// 因此所有局部坐标按「烘焙后」空间填写：(+x 前 / +y 上 / +z 右)，
// 换算公式（模型世界坐标 → 车体局部）：(x, y, z)_model → (-z, y, x)_local。
// ── 地形模式（每张地图一种；速度/转向系数逐级递减） ──
// 语义：公路最高速度 = 试验场理论极速（maxSpeed）；越野极速 = maxSpeed × 每车 offroadK（史实）
//   paved 城市石板：理论极速 ×0.70    （最快路面）
//   hard  硬地路面：越野极速 ×1.00    （诺曼底）
//   soft  松软土路：越野极速 ×0.90    （库尔斯克）
//   mud   泥泞路面：越野极速 ×0.80    （转向也最钝）
export const TERRAIN_RULES = {
  paved: { label: '城市石板路面', base: 'road', speedK: 0.70, turnK: 0.95 },
  hard:  { label: '硬地路面',     base: 'off',  speedK: 1.00, turnK: 1.00 },
  soft:  { label: '松软土路面',   base: 'off',  speedK: 0.90, turnK: 0.90 },
  mud:   { label: '泥泞路面',     base: 'off',  speedK: 0.80, turnK: 0.75 },
  snow:  { label: '积雪地面',     base: 'off',  speedK: 0.85, turnK: 0.85 },
};
export const TANKS = {
  // ── 虎式 Tiger I（1943 中期型）────────────────────
  'tiger1': {
    caliber: 88,             // mm 主炮口径（跳弹口径碾压用）
    id: 'tiger1',
    nation: 'de',
    reticle: 'de2',           // TZF 9b/9c 德式三角分划（js/reticles.js）
    zoomFov: [24.8, 12.4],    // TZF9b 双档 2.5×/5× 视场（开镜态 Shift 切档）
    aiRole: 'anchor',
    aiTraits: { tiltPref: 0.7, preferRangeK: 1.2 },   // 虎式手册 30~45° 摆角、偏好远距
    name: '虎式 Tiger I',
    nameEn: 'Tiger I',
    model: 'model/opt/tiger1.glb',
    scale: 1.0,               // 模型已 1:1 米制（实测全长 8.7m 含炮管）
    forwardAxis: '+x',
    // —— 部件节点名（Tank Model Maker v2.3 标注，见 model/tiger1.md；turret 节点含全部炮塔子树）——
    parts: {
      turret: ['turret'],
      mg: ['weapon2'],        // 同轴 MG34（炮塔内随炮塔）——右键发射
      hullMg: ['weapon3'],    // 车体前机枪 MG34（球座可旋转）——F 发射·射界内自动瞄准
      barrel: ['weapon', 'fixed-gun', 'interior.001'],   // 炮管+炮尾结构（随俯仰）
      track: ['track1', 'track2'],
      wheels: ['wheel01', 'wheel15', 'wheel16', 'wheel17', 'wheel18', 'wheel19', 'wheel20',
               'wheel21', 'wheel22', 'wheel23', 'wheel24', 'wheel25', 'wheel26', 'wheel27',
               'wheel28', 'wheel29', 'wheel30', 'wheel31', 'wheel32', 'wheel20.001'],
    },
    // 旋转轴心（车体局部坐标，米；由实测世界包围盒换算）
    turretPivot: [0, 1.93, 0.11],
    barrelPivot: [-0.03, 2.24, 1.45],
    muzzleLocal: [-0.03, 2.24, 5.45],       // 炮口（weapon 网格前端实测）
    exhaustLocal: [[0.3, 1.82, -3.05], [-0.28, 1.82, -3.06]],   // md 排气烟点×2.56 +0.4（斜向上管，出口在管顶）
    trackLocal: [[-1.44, 0.1, 0], [1.44, 0.1, 0]],             // 履带扬尘点
    trackScrollAxis: 'x',       // 虎式履带 UV 纵向=U（实测 corr(z,u)=0.56, U 跨 8.86 格；滚 V 会横向滑贴图）
    // —— 实车性能 ——
    mass: 57000,                 // kg（战斗全重）
    engineHp: 700,               // 迈巴赫 HL230 P45
    maxSpeedForward: 38 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 38 / 3.6,          // 10.6 m/s ≈38km/h（公路）
    offroadK: 0.53,              // 越野极速 ≈20km/h（史实）
    revSpeed: 2.2,
    enginePower: 2.3,            // 全油门功率 m/s²（57t 重坦加速肉）
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.6,
    hullTraverse: 0.55,          // 双流传向可原位转向
    turretTraverse: 0.18,        // 液压+手摇 ≈10°/s（全场最慢，史实弱点）
    gunDepression: -8.0,
    gunElevation: 15.0,
    wheelsRotate: true,
    gyroStab: false,             // 无稳定仪：行进间瞄准晃动大
    // —— 火力：8.8cm KwK36 L/56 ——
    gunCaliber: 88,
    shellName: 'PzGr.39 APCBC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 773,
    shellPen: 119,               // mm RHA @0m（30° 口径基准：史实30° 110@500/99@1000/91@1500/83@2000）
    shellPenDrop: 0.15,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40 APCR', nameCn: '钨芯穿甲弹', velocity: 930, pen: 171, penDrop: 0.18 },  // 次口径钨芯弹（3 键；156@500/110@2000）
    heShellName: 'Sprgr.39',
    heVelocity: 810,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 46, apcr: 3, he: 43 },   // 史实弹药分配
    spallPower: 130,             // 击穿后效基准（破片锥强度）
    reloadTime: 7.5,             // s 人工装填
    // —— 散布 σ（rad，高斯两轴独立，静止全收敛；2026-09-19 拟真改造）——
    // 旧值为均匀分布全角、大史实 5~10×（400m 每轴 ±0.88m）。高斯下 50% 弹着落在 0.67σ 内。
    // 移动/甩炮/乘员惩罚乘数在 tank.js updateFireControl（已按 σ 量级重标定）。
    dispersion: 0.00022,         // KwK36：1000m 50% 散布域 ~0.3m（史实靶测）
    aimTime: 2.3,
    // —— 装甲（mm RHA；正面近垂直）——
    armor: {
      hullFront: 100, hullSide: 80,  hullRear: 80,  hullTop: 25,
      turretFront: 110, turretSide: 80, turretRear: 80,
    },
    // —— 装甲判定模型（板图 v2：自由四边形板；判定盒仅作参照/宽相，板才是真正装甲面）——
    // 板：{ name, face（树分组用）, t: 厚度mm, pos:[x,y,z] 中心, size:[w,h], rot:[rx,ry,rz] 度,
    //       weak?, track?（击穿断履带）, mirror?（±x 镜像） }
    // rot 约定：rx>0 板的上缘向 +z（车头）倾；ry 绕 y；rz 绕 z。等效 = t / max(cos入射角, cosFloor)。
    // （2026-09-11 编辑器调参版：炮塔正面两侧板 ±70° 包角、炮盾前凸、车长塔拆除）
    armorModel: {
      hull: {
        box: { x0: -1.7, x1: 1.7, y0: 0.25, y1: 1.93, z0: -3, z1: 3 },
        plates: [
          { name: '首上', face: 'front', t: 100, pos: [0, 1.515, 2.94], size: [3.4, 0.83], rot: [-9, 0, 0] },
          { name: '首下', face: 'front', t: 100, pos: [0, 0.72, 2.82], size: [3.4, 0.84], rot: [25, 0, 0] },
          { name: '车尾', face: 'rear', t: 80, pos: [0, 1.09, -2.88], size: [3.4, 1.68], rot: [-8.5, 0, 0] },
          { name: '侧上', face: 'side', t: 80, pos: [1.7, 1.545, 0], size: [6, 0.77], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.7, 0.705, 0], size: [6, 0.91], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 25, pos: [0, 1.93, 0], size: [3.4, 6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.06, x1: 1.08, y0: 1.93, y1: 2.85, z0: -0.74, z1: 1.01 },
        plates: [
          { name: '炮盾', face: 'front', t: 120, pos: [0, 2.39, 1.57], size: [1.6, 0.92], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 100, pos: [-0.925, 2.39, 1.22], size: [0.75, 0.92], rot: [0, -70.5, 0] },
          { name: '炮塔正面', face: 'front', t: 100, pos: [0.925, 2.39, 1.23], size: [0.75, 0.92], rot: [0, 68, 0] },
          { name: '炮塔尾部', face: 'rear', t: 80, pos: [0, 2.37, -0.74], size: [2.6, 0.92], rot: [-5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 80, pos: [1.05, 2.39, 0.09], size: [1.78, 0.92], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 25, pos: [0, 2.85, 0.41], size: [2.2, 2.34], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 4500 },
    hullMgArc: 0.26,           // 前机枪水平射界 ±15°（Kugelblende 30 球座）
    heShell: { power: 1.0, nearMissR: 2 },   // 88mm HE：轻量近失弹（威力基准弹）
    // —— 内部布局（车体局部坐标 +z 车头；乘员/模块均为球形判定区）——
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.45, y: 2.15, z: -0.35, r: 0.35 },
        { id: 'gunner',    name: '炮手',   x: -0.35, y: 2.10, z: 0.70,  r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.50,  y: 2.10, z: 0.30,  r: 0.35 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.25, z: 2.30,  r: 0.35 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.25, z: 2.30,  r: 0.35 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.10, z: -1.89,  r: 0.70 }],
        fuel:        [{ x: -0.90, y: 1.00, z: -1.80,  r: 0.50 }, { x: 0.90, y: 1.00, z: -1.80, r: 0.50 }],
        ammoRacks:   [{ x: -1.10, y: 1.15, z: 1.29,  r: 0.50 }, { x: 1.10, y: 1.08, z: 1.36,  r: 0.50 },
                      { x: 0.95,  y: 1.36, z: -0.60, r: 0.45 }],
        breech:      [{ x: 0,     y: 2.20, z: 1.08,  r: 0.42 }],
        turretDrive: [{ x: -0.30, y: 1.95, z: 0.55,  r: 0.38 }],
        optics:      [{ x: -0.25, y: 2.30, z: 0.85,  r: 0.30 }],
      },
      ringY: 1.93,
      trackX: 1.45, trackY: 1.16,
    },
    dims: { length: 6.1, width: 3.6, hullHeight: 1.93, turretTop: 2.9 },
    trackWidth: 0.72,
    ammo: { shell: 92, mg: 4500 },
    // —— 音效（2026-09-25 实验换档形发动机 v2）：tiger-eg2.mp3=怠速循环；tiger-egAll2.mp3=引擎——
    //    三梯度加速段（0-2.37 / 3.63-7.6 / 8.2-11.93，逐段强模拟 1/2/3 档），段间（2.37-3.63 / 7.6-8.2）
    //    为换档衔接音（升/降相邻档时播放），巡航循环 11.97s~文件尾；档位随车速带自动切换（audio._updateEngineGear）。
    //    ★ 回退备份：注释掉本块换用下方「旧版·单文件时间线形」即可（音频文件均未动）★
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/gem/pz6e-88mm-fire2.mp3',             // 第三人称开炮：88mm KwK36 炮口声
      fireAim: 'tankSound/gem/pz6e-tiger-88mm-inner2.mp3',   // 瞄准镜开炮：88mm 炮膛内声
      idle: 'tankSound/gem/tiger-eg2.mp3',                   // 怠速循环（整条）
      drive: 'tankSound/gem/tiger-egAll2.mp3',               // 引擎：三梯度加速段 + 巡航
      seg: {
        engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09,
        gear: true,              // 换档实验形（audio._updateEngineGear）
        gears: [                 // 梯度加速段：start/end=该档循环区；shiftEnd=升/降档衔接音尾
          { start: 0, end: 2.37, shiftEnd: 3.63 },     // 1 档
          { start: 3.63, end: 7.6, shiftEnd: 8.2 },    // 2 档
          { start: 8.2, end: 11.93 },                  // 3 档（尾部直接接巡航）
        ],
        cruiseStart: 11.97,      // 巡航循环 [11.97, 文件尾]
        idleStart: 0,            // 怠速文件整条循环
      },
    },
    // ──────────── 旧版备份（单文件时间线形，2026-09-25 上午版）：回退时替换上面 sound 块 ────────────
    // sound: {
    //   engine: 'sound/t90-eg.mp3',
    //   mg: 'sound/t90-gun.mp3',
    //   fire: 'tankSound/gem/pz6e-88mm-fire2.mp3',
    //   fireAim: 'tankSound/gem/pz6e-tiger-88mm-inner2.mp3',
    //   idle: 'tankSound/gem/tiger-egAll.mp3',
    //   drive: 'tankSound/gem/tiger-egAll.mp3',
    //   seg: {
    //     engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09,
    //     timeline: true,
    //     driveAccel: 7,
    //     driveCruiseStart: 8,
    //     driveCruiseEnd: 12,
    //     driveDecelStart: 12,
    //     driveDecelEnd: 14,
    //     idleStart: 15.47,
    //     idleEnd: 16.47,
    //   },
    // },
  },

  // ── 虎王 Tiger II (H)（1944 亨舍尔炮塔）────────────────────
  // 模型 tankModel/pz.kpfw._vi.glb 经 scripts/split-wheels-kt.js 预处理：
  // 材质 specGloss→metalRough；外排 5 轮/侧连通岛整抽 + 主/诱导轮精滤切割（14 轮网格）；
  // Object_11 拆出车顶机枪 roofMg（隐藏），下部留作 hullMg
  'tiger2': {
    caliber: 88,             // mm 主炮口径（跳弹口径碾压用）
    id: 'tiger2',
    nation: 'de',
    reticle: 'de2',           // TZF 9d 德式三角分划（与虎式同族）
    zoomFov: [24.8, 12.4],    // TZF9d 双档 2.5×/5× 视场（开镜态 Shift 切档）
    aiRole: 'anchor',
    aiTraits: { tiltPref: 0.7, preferRangeK: 1.2 },   // 同虎式
    name: '虎王 Tiger II',
    nameEn: 'Tiger II',
    model: 'model/opt/tiger2.glb',
    scale: 1.0,               // 模型已 1:1 米制（实测全长 10.14m 含炮管）
    forwardAxis: '+z',        // 模型已 +Z 朝前、+Y 朝上，无需烘焙
    // —— 部件节点名（Tank Model Maker v2.3 标注，见 tankModel/pz.kpfw._vi.md）——
    parts: {
      turret: ['Object_4', 'Object_8', 'Object_9', 'Object_10'],   // 炮塔结构+车长塔（Object_6 隐藏）
      mg: ['Object_12'],        // 同轴 MG34（炮塔内随炮塔）——右键发射
      hullMg: ['Object_11'],    // 车体前机枪 MG34（split 已切掉上部车顶机枪为 roofMg）——F 发射
      barrel: ['Object_18'],    // 8.8cm KwK43 炮管+炮尾（随俯仰）
      track: ['Object_5', 'Object_7'],
      // 外排 5 轮/侧（连通岛整抽，旋转）；内排 4 轮交错位留车体静态（贴图原样，观感更好）
      wheels: ['wheelR1', 'wheelR3', 'wheelR5', 'wheelR7', 'wheelR9',
               'wheelL1', 'wheelL3', 'wheelL5', 'wheelL7', 'wheelL9',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI'],
      hidden: ['Object_6', 'roofMg'],
    },
    // 旋转轴心（车体局部坐标，米；实测世界包围盒）
    turretPivot: [0, 1.9, -0.15],
    barrelPivot: [-0.06, 2.19, 1.0],
    muzzleLocal: [-0.06, 2.19, 6.45],       // 炮口（Object_18 前端）
    exhaustLocal: [[0.26, 1.57, -3.37], [-0.24, 1.59, -3.37]],   // md 排气烟点×2.56 +0.4（斜向上管）+0.2 向车尾
    heatZShift: -0.4,          // 排气热浪比烟点再向车尾移 0.4m（管口伸出更后，仅热浪位移，烟不动）
    trackLocal: [[-1.4, 0.1, 0], [1.4, 0.1, 0]],             // 履带扬尘点
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（实测 vRange 跨 12.69 格，uRange 仅 1.0）
    trackScrollFlip: true,      // 底段 dv/dz=-1.5（V 车尾高、车头低）：前进时 offset 须递减，否则呈倒车式滑动
    // —— 实车性能 ——
    mass: 69800,                 // kg（战斗全重）
    engineHp: 700,               // 迈巴赫 HL230 P30
    maxSpeedForward: 35.5 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 35.5 / 3.6,         // 9.9 m/s ≈35.5km/h（公路，史实）
    offroadK: 0.45,              // 越野极速 ≈16km/h
    revSpeed: 2.2,
    enginePower: 2.0,            // 近 70t，加速比虎式更肉
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.5,
    slopePower: 0.55,
    hullTraverse: 0.5,
    turretTraverse: 0.16,        // 液压驱动 ≈9°/s
    gunDepression: -8.0,
    gunElevation: 15.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：8.8cm KwK43 L/71 ——
    gunCaliber: 88,
    shellName: 'PzGr.39/43 APCBC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 1000,
    shellPen: 203,               // mm RHA @0m（30° 口径基准：史实30° 185@500/165@1000/148@1500/132@2000）
    shellPenDrop: 0.17,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40/43 APCR', nameCn: '钨芯穿甲弹', velocity: 1130, pen: 238, penDrop: 0.18 },  // 次口径钨芯弹（3 键；217@500/153@2000）
    heShellName: 'Sprgr.43',
    heVelocity: 810,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 40, apcr: 4, he: 42 },   // 史实弹药分配
    spallPower: 135,
    reloadTime: 9.0,             // s 人工装填（大药筒分两式）
    dispersion: 0.00015,         // σ：KwK43（1000m ~0.2m，狙击级）
    aimTime: 2.5,
    // —— 装甲（mm RHA）——
    armor: {
      hullFront: 150, hullSide: 80, hullRear: 80, hullTop: 40,
      turretFront: 185, turretSide: 80, turretRear: 80,
    },
    // —— 装甲判定模型（板图 v2；2026-09-15 编辑器调参导出）——
    armorModel: {
      hull: {
        box: { x0: -1.64, x1: 1.64, y0: 0.25, y1: 1.9, z0: -3.69, z1: 3.63 },
        plates: [
          { name: '首上', face: 'front', t: 150, pos: [0, 1.48, 3.07], size: [3.3, 1.32], rot: [-50, 0, 0] },
          { name: '首下', face: 'front', t: 100, pos: [0, 0.78, 3.35], size: [3.36, 0.8], rot: [40, 0, 0] },
          { name: '车尾', face: 'rear', t: 80, pos: [0, 1.2, -3.23], size: [3.3, 1.5], rot: [-24, 0, 0] },
          { name: '侧上', face: 'side', t: 80, pos: [1.64, 1.45, 0], size: [7.3, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 50, pos: [1.64, 0.65, 0], size: [7.3, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 40, pos: [0, 1.9, 0], size: [3.3, 7.3], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.25, x1: 1.25, y0: 1.9, y1: 3.1, z0: -1.94, z1: 1.75 },
        plates: [
          { name: '炮盾', face: 'front', t: 185, pos: [0, 2.35, 1.6], size: [1.92, 1.07], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 185, pos: [-1.04, 2.35, 1.16], size: [1.04, 1.18], rot: [0, -70, 0] },
          { name: '炮塔正面', face: 'front', t: 185, pos: [1.01, 2.35, 1.17], size: [1.08, 0.9], rot: [0, 70, 0] },
          { name: '炮塔尾部', face: 'rear', t: 80, pos: [0, 2.45, -1.68], size: [2.5, 1.1], rot: [12, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 80, pos: [1.2, 2.28, -0.1], size: [3.4, 1.36], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 40, pos: [0, 2.87, -0.1], size: [2.5, 3.4], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 4500 },
    hullMgArc: 0.26,           // 前机枪水平射界 ±15°（Kugelblende 球座，与虎式一致）
    heShell: { power: 1.0, nearMissR: 2 },   // 88mm HE：轻量近失弹（威力基准弹）
    // —— 内部布局（车体局部坐标 +z 车头）——
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.45, y: 2.2,  z: -0.8,  r: 0.35 },
        { id: 'gunner',    name: '炮手',   x: -0.35, y: 2.15, z: 0.55,  r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.50,  y: 2.15, z: -0.2,  r: 0.35 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.25, z: 2.50,  r: 0.35 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.25, z: 2.50,  r: 0.35 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.15, z: -2.50,  r: 0.66 }],
        fuel:        [{ x: -0.90, y: 1.00, z: -2.30,  r: 0.50 }, { x: 0.90, y: 1.00, z: -2.30, r: 0.50 }],
        ammoRacks:   [{ x: -0.90, y: 1.36, z: 0.72,   r: 0.50 }, { x: 0.80, y: 1.43, z: 0.65,  r: 0.50 },
                      { x: 0,     y: 1.50, z: -0.97,  r: 0.41 }],
        breech:      [{ x: 0,     y: 2.19, z: 0.30,   r: 0.45 }],
        turretDrive: [{ x: -0.30, y: 1.95, z: 0.40,   r: 0.38 }],
        optics:      [{ x: -0.25, y: 2.35, z: 0.90,   r: 0.30 }],
      },
      ringY: 1.9,
      trackX: 1.4, trackY: 1.16,
    },
    dims: { length: 7.3, width: 3.76, hullHeight: 1.9, turretTop: 3.1 },
    trackWidth: 0.8,
    ammo: { shell: 86, mg: 4500 },
    sound: {
      cruiseVol: 0.8,                                          // 巡航/行驶段整体压 20%（2026-09-25 用户反馈巡航声偏大）
      idle: 'tankSound/gem/tiger2-eg.mp3',                     // 新式发动机：静止怠速循环
      drive: 'tankSound/gem/tiger2-egUp.mp3',                  // 新式发动机：油门段（前 3.5s 一次性播放）
      cruise: 'tankSound/gem/tiger2-start-egUp.mp3',           // 巡航循环：与猎虎共用（波形分析最优接缝 [4, 17.54]）
      decel: 'tankSound/gem/tiger2-egDown.mp3',                // 减速停车专用：动→停沿播末尾 2s（首段不用）
      mg: 'sound/t90-gun.mp3',
fire: 'tankSound/gem/pz62-tiger2-88mm-fire1.mp3',          // 第三人称开炮：88mm KwK43
fireAim: 'tankSound/gem/pz62-tiger2-88mm-inner.mp3',     // 瞄准镜开炮：88mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 3.5, cruiseStart: 4, cruiseEnd: 17.54, idleStart: 0.9, decelTail: 2 },
    },
  },

  // ── M4A3(76)W 谢尔曼 ────────────────────
  'm4a3': {
    caliber: 76,             // mm 主炮口径（跳弹口径碾压用）
    id: 'm4a3',
    nation: 'us',
    reticle: 'us2',           // M82 望远镜静态分划
    zoomFov: 20.7,            // M82 固定 3× 视场（二战直视瞄具，无变倍）
    aiRole: 'brawler',
    aiTraits: { movingFire: true },                   // 垂稳：行进间开火许可
    name: 'M4A3(76)W 谢尔曼',
    nameEn: 'M4A3 (76) W',
    model: 'model/opt/m4a376w.glb',
    scale: 1.0,
    forwardAxis: '+x',
    parts: {
      // 注意：GLTFLoader 会把节点名中的「.」剥掉（turret.001 → turret001），此处用加载后实际名
      turret: ['turret001'],
      mg: ['weapon4001'],      // 车顶 M2HB 12.7mm——右键发射
      hullMg: ['weapon3001'],  // 车体前机枪 M1919A4（球座可旋转）——F 发射·射界内自动瞄准
      barrel: ['weapon001', 'weapon2001', 'interior001'],   // 炮管+同轴机枪+炮尾
      track: ['track1', 'track1001'],
      wheels: ['wheel2', 'wheel3', 'wheel4', 'wheel5', 'wheel6', 'wheel7', 'wheel8',
               'wheel9', 'wheel10', 'wheel11', 'wheel12', 'wheel13', 'wheel14', 'wheel15',
               'wheel16', 'wheel17', 'wheel18', 'wheel19', 'wheel20', 'wheel21', 'wheel22',
               'wheel001'],
      // md 标注隐藏件：正面备用轮/首上杂物箱/沙袋（变体件）
      hidden: ['obj2', 'object01', 'sandbags'],
    },
    // 枢轴实测（2026-09-11，scripts 量测炮塔底层环带中心）：z 由 -0.10 前移 0.29m 至 0.19
    // （旧值偏后，炮塔旋转时绕错误轴心摆动；虎式同法实测 0.085 ≈ 配置 0.11，方法已校验）
    turretPivot: [0, 1.90, 0.19],
    barrelPivot: [0, 2.27, 1.40],
    muzzleLocal: [-0.01, 2.26, 4.20],
    exhaustLocal: [[0.42, 0.76, -2.81], [-0.4, 0.74, -2.86]],   // md 排气烟点×2.56
    trackLocal: [[-1.05, 0.1, 0], [1.05, 0.1, 0]],
    trackScrollAxis: 'x',       // M4 履带贴图轨道方向沿 U（虎式沿 V，缺省 y）
    mass: 33600,
    engineHp: 500,               // Ford GAA V8
    maxSpeedForward: 42 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 42 / 3.6,          // 11.7 m/s（公路）
    offroadK: 0.62,              // 越野极速 ≈26km/h（史实）
    revSpeed: 2.2,
    enginePower: 3.4,
    powerFalloff: 0.58,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.55,
    hullTraverse: 0.65,
    turretTraverse: 0.35,        // 电液转向 ≈20°/s（史实优势）
    gunDepression: -10.0,
    gunElevation: 25.0,
    wheelsRotate: true,
    gyroStab: true,              // 垂向陀螺稳定仪：行进间散布惩罚减半
    gunCaliber: 76,
    shellName: 'M62 APC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 792,
    shellPen: 105,               // mm RHA @0m（30° 口径基准：史实30° 98@500/90@1000/83@1500/76@2000）
    shellPenDrop: 0.14,          // 每千米穿深衰减比例
    apcrShell: { name: 'M93 HVAP', nameCn: '钨芯穿甲弹', velocity: 1036, pen: 178, penDrop: 0.22 },  // 次口径钨芯弹（3 键；158@500/99@2000）
    heShellName: 'M42A1',
    heVelocity: 820,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 35, apcr: 5, he: 31 },   // 史实弹药分配
    spallPower: 100,
    reloadTime: 6.0,
    dispersion: 0.00033,         // σ：76mm M1A2（1000m ~0.45m）
    aimTime: 1.9,
    armor: {
      hullFront: 63.5, hullSide: 38, hullRear: 38, hullTop: 19, // 首上 63.5mm@47°（原始厚度，倾角由板图几何承担）
      turretFront: 89, turretSide: 51, turretRear: 51,
    },
    // —— 装甲判定模型（板图 v2：自由四边形板；判定盒仅作参照/宽相，板才是真正装甲面）——
    // （2026-09-11 编辑器调参版：首上 47° 大倾角整板加高、炮塔正面颊板 ±55° 包角、炮盾微倾 6.5°、车长塔拆除）
    armorModel: {
      hull: {
        box: { x0: -1.26, x1: 1.26, y0: 0.25, y1: 1.9, z0: -2.88, z1: 2.84 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 63.5, pos: [0, 1.45, 2.45], size: [2.55, 1.36], rot: [-47, 0, 0] },
          { name: '首下', face: 'front', t: 63.5, pos: [0, 0.7, 2.75], size: [2.52, 0.75], rot: [30, 0, 0] },
          { name: '车尾', face: 'rear', t: 38, pos: [0, 1.075, -2.74], size: [2.52, 1.65], rot: [10, 0, 0] },
          { name: '侧上', face: 'side', t: 38, pos: [1.26, 1.51, 0], size: [5.76, 0.78], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 19, pos: [1.26, 0.685, 0], size: [5.76, 0.87], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 19, pos: [0, 1.9, 0], size: [2.52, 5.76], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.88, x1: 0.88, y0: 1.9, y1: 2.85, z0: -0.76, z1: 1.14 },
        plates: [
          { name: '炮盾', face: 'front', t: 89, pos: [0, 2.375, 1.43], size: [1.25, 0.95], rot: [6.5, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 64, pos: [-0.75, 2.375, 1.14], size: [0.91, 0.95], rot: [-1.5, -54.5, 0] },
          { name: '炮塔正面', face: 'front', t: 64, pos: [0.78, 2.375, 1.19], size: [0.79, 0.95], rot: [-0.5, 56, 0] },
          { name: '炮塔尾部', face: 'rear', t: 51, pos: [0, 2.375, -0.76], size: [1.76, 0.95], rot: [5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 51, pos: [0.99, 2.375, 0.1], size: [1.84, 0.95], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 19, pos: [0, 2.85, 0.29], size: [2.03, 2.38], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.014, range: 600, ammoMax: 2600 },
    hullMgArc: 0.35,           // 前机枪水平射界 ±20°（M4 球座）
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: 0.45,  y: 2.20, z: -0.27, r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: 0.40,  y: 2.15, z: 0.45,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: -0.50, y: 2.15, z: 0,     r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.30, z: 2.00,  r: 0.34 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.30, z: 2.00,  r: 0.34 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.08, z: -1.82,  r: 0.65 }],
        fuel:        [{ x: -0.80, y: 1.22, z: -1.90,  r: 0.45 }, { x: 0.80, y: 1.22, z: -1.90, r: 0.45 }],
        ammoRacks:   [{ x: -0.55, y: 0.85, z: 0.10,  r: 0.50 }, { x: 0.61, y: 0.95, z: -0.13, r: 0.50 }], // 水套弹药架（车底，殉爆率低）
        breech:      [{ x: 0,     y: 2.25, z: 0.87,  r: 0.40 }],
        turretDrive: [{ x: 0.30,  y: 1.95, z: 0.58,  r: 0.36 }],
        optics:      [{ x: 0.25,  y: 2.30, z: 0.60,  r: 0.30 }],
      },
      ringY: 1.90,
      trackX: 1.05, trackY: 1.12,
    },
    dims: { length: 5.9, width: 2.67, hullHeight: 1.90, turretTop: 2.95 },
    trackWidth: 0.58,
    ammo: { shell: 71, mg: 2600 },
    sound: {
      drive: 'tankSound/usa/m4-egDown.mp3',                 // 新式发动机（单文件三段）：前 3s=加速段 / 巡航 / 17.4~20s=减速停车段（20s 后剪除）
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/usa/us-76mm-fire.mp3',              // 第三人称开炮：76mm M62
      fireAim: 'tankSound/usa/us-76mm-inner.mp3',          // 瞄准镜开炮：76mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 3.0, driveCruiseEnd: 17.4, driveDecelStart: 17.4, driveDecelEnd: 20.0 },
    },
  },

  // ── 黑豹 Panther Ausf. A（1943 库尔斯克）────────────────────
  // 部件/点位：md 标注（model/panther-a.md）+ scripts/measure-new-tanks.js 实测
  // ── M4A3E2 (76)W Jumbo（2026-10-09 接入，第 25 辆；突击坦克：加厚装甲+T23 重炮塔） ──
  'jumbo': {
    caliber: 76,             // mm 主炮口径（跳弹口径碾压用）
    id: 'jumbo',
    nation: 'us',
    reticle: 'us2',           // M82 望远镜静态分划
    zoomFov: 20.7,            // M82 固定 3×
    aiRole: 'anchor',         // 重甲突击车：低速压阵线
    aiTraits: {},
    name: 'M4A3E2 重装突击坦克 "Jumbo"',
    nameEn: 'M4A3E2 (76)W Jumbo',
    model: 'model/opt/m4a3e2_jumbo.glb',
    scale: 1.0,
    parts: {
      // md 标注（tankModel/m4a3e2_76_w_jumbo.md）；GLTFLoader 剥点/空格转下划线
      turret: ['Object_24', 'Object_25', 'Object_2', 'Object_6', 'Object_27', 'Object_11', 'Object_3', 'Object_5', 'Object_12'],
      mg: ['Object_8'],        // 车顶 M2HB（右键）
      barrel: ['Object_22', 'Object_13', 'Object_26'],   // 炮管+炮口件+同轴机枪（随俯仰）
      track: ['Object_7', 'Object_9'],
      wheels: ['wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelLS', 'wheelRS', 'wheelLI', 'wheelRI'],
    },
    // 枢轴实测（2026-10-09 measure-td）：座圈圆心 z-0.04；炮管轴 y2.284 炮口 z3.93
    turretPivot: [0, 1.90, -0.04],
    barrelPivot: [0, 2.28, 0.90],
    muzzleLocal: [0, 2.28, 3.93],
    exhaustLocal: [[0.42, 0.90, -2.55], [-0.15, 0.87, -2.49]],   // md 排气烟点×2.56
    trackLocal: [[-1.05, 0.1, 0], [1.05, 0.1, 0]],
    trackScrollAxis: 'y',       // 实测纵向=V 底段 flip
    trackScrollFlip: true,
    mass: 38100,                 // kg（加厚装甲战斗全重，史实）
    engineHp: 500,               // Ford GAA V8
    maxSpeedForward: 35 / 3.6,   // 史实 35km/h（超重）
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 35 / 3.6,
    offroadK: 0.55,              // 越野 ≈19km/h（重车迟缓）
    revSpeed: 2.2,
    enginePower: 3.2,
    powerFalloff: 0.58,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.45,
    slopePower: 0.5,
    hullTraverse: 0.55,          // 重车车体转向偏钝
    turretTraverse: 0.30,        // T23 重炮塔电液转向
    gunDepression: -10.0,
    gunElevation: 25.0,
    wheelsRotate: true,
    gyroStab: true,              // 垂稳保留
    gunCaliber: 76,
    shellName: 'M62 APC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 792,
    shellPen: 105,               // mm RHA @0m（30° 基准，与 M4A3(76)W 同炮）
    shellPenDrop: 0.14,
    apcrShell: { name: 'M93 HVAP', nameCn: '钨芯穿甲弹', velocity: 1036, pen: 178, penDrop: 0.22 },
    heShellName: 'M42A1',
    heVelocity: 820,
    loadout: { ap: 40, apcr: 5, he: 26 },   // 71 发史实基数
    spallPower: 100,
    reloadTime: 6.5,             // 加厚炮塔内更局促
    dispersion: 0.00033,
    aimTime: 2.0,
    armor: {
      hullFront: 102, hullSide: 76, hullRear: 38, hullTop: 25,   // 史实：首上 63.5+38=101.6@47°、侧 76
      turretFront: 152, turretSide: 152, turretRear: 152,        // T23 重炮塔全向 6 英寸
    },
    armorModel: {
      hull: {
        box: { x0: -1.38, x1: 1.38, y0: 0.25, y1: 1.96, z0: -3.35, z1: 2.9 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 102, pos: [0, 1.45, 2.45], size: [2.6, 1.4], rot: [-47, 0, 0] },
          { name: '首下', face: 'front', t: 114, pos: [0, 0.7, 2.78], size: [2.56, 0.78], rot: [30, 0, 0] },
          { name: '车尾', face: 'rear', t: 38, pos: [0, 1.1, -3], size: [2.56, 1.7], rot: [10, 0, 0] },
          { name: '侧上', face: 'side', t: 76, pos: [1.34, 1.51, 0], size: [6.1, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 38, pos: [1.34, 0.685, 0], size: [6.1, 0.87], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 25, pos: [0, 1.96, -0.2], size: [2.68, 6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.02, x1: 1.02, y0: 1.96, y1: 3.03, z0: -1.76, z1: 0.98 },
        plates: [
          { name: '炮盾', face: 'front', t: 152, pos: [0, 2.42, 1.22], size: [1.5, 1], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 152, pos: [-0.62, 2.42, 0.95], size: [0.9, 1], rot: [-2, -48, 0] },
          { name: '炮塔正面', face: 'front', t: 152, pos: [0.62, 2.42, 0.95], size: [0.9, 1], rot: [-2, 48, 0] },
          { name: '炮塔尾部', face: 'rear', t: 152, pos: [0, 2.42, -1.5], size: [1.9, 1], rot: [5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 152, pos: [1, 2.42, -0.3], size: [2.2, 1], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 25, pos: [0, 2.95, -0.3], size: [2, 2.6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.014, range: 600, ammoMax: 2600 },
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: 0.45,  y: 2.3,  z: -0.3,  r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: 0.4,   y: 2.25, z: 0.42,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: -0.5,  y: 2.25, z: -0.05, r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.3,  z: 2,     r: 0.34 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.3,  z: 2,     r: 0.34 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.08, z: -1.9,  r: 0.65 }],
        fuel:        [{ x: -0.8,  y: 1.22, z: -2,    r: 0.45 }, { x: 0.8, y: 1.22, z: -2, r: 0.45 }],
        ammoRacks:   [{ x: -0.55, y: 0.85, z: 0.1,   r: 0.5 }, { x: 0.61, y: 0.95, z: -0.13, r: 0.5 }],
        breech:      [{ x: 0,     y: 2.3,  z: 0.58,  r: 0.4 }],
        turretDrive: [{ x: 0.3,   y: 2,    z: 0.58,  r: 0.36 }],
        optics:      [{ x: 0.25,  y: 2.35, z: 0.6,   r: 0.3 }],
      },
      ringY: 1.9,
      trackX: 1.05, trackY: 1.12,
    },
    dims: { length: 5.9, width: 2.76, hullHeight: 1.96, turretTop: 2.95 },
    trackWidth: 0.58,
    ammo: { shell: 71, mg: 2600 },
    sound: {
      drive: 'tankSound/usa/m4-egDown.mp3',                 // 复用 M4 系引擎（用户指定）
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/usa/us-76mm-fire.mp3',
      fireAim: 'tankSound/usa/us-76mm-inner.mp3',
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 3.0, driveCruiseEnd: 17.4, driveDecelStart: 17.4, driveDecelEnd: 20.0 },
    },
  },
  // ── M4A3E8 "Thunderbolt VII"（2026-10-09 接入，第 26 辆；HVSS 宽履带，阿布拉姆斯座驾） ──
  'thunderbolt': {
    caliber: 76,
    id: 'thunderbolt',
    nation: 'us',
    reticle: 'us2',
    zoomFov: 20.7,
    aiRole: 'brawler',
    aiTraits: { movingFire: true },                   // 垂稳 + HVSS：行进间开火许可
    name: 'M4A3E8 谢尔曼 "雷电七号"',
    nameEn: 'M4A3E8 Thunderbolt VII',
    model: 'model/opt/m4a3e8.glb',
    scale: 1.0,
    parts: {
      turret: ['Object_7'],          // md 标注：炮塔结构（整塔；车顶机枪已切出为 roofMg）
      mg: ['roofMg'],                // 车顶 M2HB——右键发射（Object_7 元件级质心拆分）
      barrel: ['Object_2'],          // 火炮结构+炮管
      track: ['Object_8', 'Object_3'],
      wheels: ['wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelLS', 'wheelRS', 'wheelLI', 'wheelRI',
               'wheelLT1', 'wheelLT2', 'wheelRT1', 'wheelRT2'],   // HVSS 含回转轮
    },
    // 枢轴实测（2026-10-09 measure-td）：座圈圆心 z-0.19；炮管轴 y2.332 炮口 z4.05
    turretPivot: [0, 2.0, -0.19],
    barrelPivot: [0, 2.33, 0.90],
    muzzleLocal: [0, 2.33, 4.05],
    exhaustLocal: [[0.27, 0.71, -2.36], [-0.19, 0.69, -2.37]],   // md 排气烟点×2.56
    trackLocal: [[-1.1, 0.1, 0], [1.1, 0.1, 0]],
    trackScrollAxis: 'y',       // 实测纵向=V，底段不翻
    mass: 30300,
    engineHp: 500,
    maxSpeedForward: 42 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 42 / 3.6,
    offroadK: 0.66,             // HVSS 宽履带：越野 ≈28km/h（略优于 VVSS）
    revSpeed: 2.2,
    enginePower: 3.5,
    powerFalloff: 0.58,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.55,
    hullTraverse: 0.65,
    turretTraverse: 0.35,
    gunDepression: -10.0,
    gunElevation: 25.0,
    wheelsRotate: true,
    gyroStab: true,
    gunCaliber: 76,
    shellName: 'M62 APC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 792,
    shellPen: 105,
    shellPenDrop: 0.14,
    apcrShell: { name: 'M93 HVAP', nameCn: '钨芯穿甲弹', velocity: 1036, pen: 178, penDrop: 0.22 },
    heShellName: 'M42A1',
    heVelocity: 820,
    loadout: { ap: 35, apcr: 5, he: 31 },
    spallPower: 100,
    reloadTime: 6.0,
    dispersion: 0.00033,
    aimTime: 1.9,
    armor: {
      hullFront: 123, hullSide: 68, hullRear: 38, hullTop: 19,   // 雷电七号战场改装附加甲（编辑器 2026-10-09 定稿）
      turretFront: 121, turretSide: 63, turretRear: 51,
    },
    armorModel: {
      hull: {
        box: { x0: -1.45, x1: 1.45, y0: 0.05, y1: 2.03, z0: -3.48, z1: 2.85 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 123, pos: [0, 1.48, 2.35], size: [2.72, 1.36], rot: [-47, 0, 0] },
          { name: '首下', face: 'front', t: 87, pos: [0, 0.72, 2.62], size: [2.7, 0.78], rot: [30, 0, 0] },
          { name: '车尾', face: 'rear', t: 38, pos: [0, 1.1, -2.95], size: [2.7, 1.7], rot: [10, 0, 0] },
          { name: '侧上', face: 'side', t: 68, pos: [1.4, 1.5, 0], size: [6.0, 0.85], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 51, pos: [1.4, 0.68, 0], size: [6.0, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 19, pos: [0, 2.0, -0.2], size: [2.8, 5.9], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.95, x1: 0.95, y0: 2.0, y1: 3.0, z0: -1.0, z1: 1.1 },
        plates: [
          { name: '炮盾', face: 'front', t: 121, pos: [0, 2.45, 1.4], size: [1.3, 0.95], rot: [6.5, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 64, pos: [-0.72, 2.45, 1.1], size: [0.9, 0.95], rot: [-1.5, -54, 0] },
          { name: '炮塔正面', face: 'front', t: 64, pos: [0.72, 2.45, 1.1], size: [0.9, 0.95], rot: [-1.5, 54, 0] },
          { name: '炮塔尾部', face: 'rear', t: 51, pos: [0, 2.45, -0.85], size: [1.8, 0.95], rot: [5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 63, pos: [0.98, 2.45, 0.05], size: [1.9, 0.95], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 19, pos: [0, 2.95, 0.1], size: [2.0, 2.2], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '12.7',
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: 0.45,  y: 2.35, z: -0.35, r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: 0.40,  y: 2.30, z: 0.40,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: -0.50, y: 2.30, z: -0.05, r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.35, z: 1.95,  r: 0.34 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.35, z: 1.95,  r: 0.34 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.10, z: -1.85,  r: 0.65 }],
        fuel:        [{ x: -0.80, y: 1.25, z: -1.95,  r: 0.45 }, { x: 0.80, y: 1.25, z: -1.95, r: 0.45 }],
        ammoRacks:   [{ x: -0.55, y: 0.85, z: 0.10,  r: 0.50 }, { x: 0.61, y: 0.95, z: -0.13, r: 0.50 }],
        breech:      [{ x: 0,     y: 2.35, z: 0.87,  r: 0.40 }],
        turretDrive: [{ x: 0.30,  y: 2.05, z: 0.58,  r: 0.36 }],
        optics:      [{ x: 0.25,  y: 2.40, z: 0.60,  r: 0.30 }],
      },
      ringY: 2.0,
      trackX: 1.1, trackY: 1.12,
    },
    dims: { length: 5.84, width: 2.99, hullHeight: 2.0, turretTop: 2.98 },
    trackWidth: 0.6,              // HVSS 宽履带 23in
    ammo: { shell: 71, mg: 2600 },
    sound: {
      drive: 'tankSound/usa/m4-egDown.mp3',                 // 复用 M4 系引擎（用户指定）
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/usa/us-76mm-fire.mp3',
      fireAim: 'tankSound/usa/us-76mm-inner.mp3',
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 3.0, driveCruiseEnd: 17.4, driveDecelStart: 17.4, driveDecelEnd: 20.0 },
    },
  },
  // ── Sherman Firefly（2026-10-09 接入，第 27 辆；英系：17 磅炮，无首机枪/4 乘员史实） ──
  'firefly': {
    caliber: 76,             // 17 磅 = 76.2mm（跳弹口径碾压用）
    id: 'firefly',
    nation: 'uk',
    reticle: 'us2',           // No.43 望远镜（暂用 M82 静态分划，与克伦威尔同款处理）
    zoomFov: 20.7,
    aiRole: 'ambusher',       // 史实用法：伏击坦歼——开火后撤掩
    aiTraits: { fireAndCover: true },
    name: '谢尔曼 萤火虫',
    nameEn: 'Sherman Firefly',
    model: 'model/opt/sherman_firefly.glb',
    scale: 1.0,
    parts: {
      turret: ['Object_10', 'Object_5', 'Object_11', 'Object_22', 'Object_4', 'Object_12', 'Object_7'],
      mg: ['Object_21'],       // 同轴/车顶机枪（md 标注同轴机枪）
      barrel: ['Object_8', 'Object_3'],   // 炮管+炮口制退器
      track: ['Object_6', 'Object_2'],
      wheels: ['wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelLS', 'wheelRS', 'wheelLI', 'wheelRI'],
      // md 标注隐藏件：Object_13/14/23（变体件）
      hidden: ['Object_13', 'Object_14', 'Object_23'],
    },
    // 枢轴实测（2026-10-09 measure-td）：座圈圆心 z-0.18；炮管轴 y2.127 炮口 z4.44
    turretPivot: [0, 1.98, -0.18],
    barrelPivot: [0, 2.13, 0.90],
    muzzleLocal: [0, 2.13, 4.44],
    exhaustLocal: [[0.30, 0.71, -2.60], [-0.21, 0.74, -2.60]],   // md 排气烟点×2.56
    trackLocal: [[-1.05, 0.1, 0], [1.05, 0.1, 0]],
    trackScrollAxis: 'y',       // 实测纵向=V 底段 flip
    trackScrollFlip: true,
    mass: 32500,                 // M4A4 底盘（Vc）
    engineHp: 425,               // Chrysler A57 多联
    maxSpeedForward: 40 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 40 / 3.6,
    offroadK: 0.58,
    revSpeed: 2.2,
    enginePower: 3.3,
    powerFalloff: 0.58,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.55,
    hullTraverse: 0.62,
    turretTraverse: 0.28,        // 17 磅炮塔重、手摇+电液混合
    gunDepression: -5.0,         // 史实：萤火虫俯角仅 -5°（17 磅炮尾干涉）
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,             // 萤火虫拆除垂稳（17 磅炮尾配平）
    gunCaliber: 76,
    shellName: 'APCBC Mk.8',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 884,          // 17pdr Mk.8 被帽穿甲弹初速
    shellPen: 148,               // mm RHA @0m（30° 基准：史实30° 134@500/122@1000/111@1500/101@2000）——强于 88L56、弱于 88L71
    shellPenDrop: 0.12,
    apcrShell: { name: 'APDS Mk.1', nameCn: '脱壳穿甲弹', velocity: 1204, pen: 209, penDrop: 0.28 },  // APDS（远端衰减快、精度差——史实）
    heShellName: 'HE Mk.1',
    heVelocity: 884,
    loadout: { ap: 50, apcr: 5, he: 22 },   // 77 发史实基数（APDS 稀有）
    spallPower: 105,
    reloadTime: 7.0,             // 17 磅弹药大、炮塔局促
    dispersion: 0.00025,         // 17pdr 精度高
    aimTime: 2.2,
    armor: {
      hullFront: 51, hullSide: 38, hullRear: 38, hullTop: 19,    // 标准谢尔曼：首上 51@56°
      turretFront: 76, turretSide: 51, turretRear: 51,
    },
    armorModel: {
      hull: {
        box: { x0: -1.32, x1: 1.32, y0: 0, y1: 1.9, z0: -3.45, z1: 2.83 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 51, pos: [0, 1.42, 2.42], size: [2.56, 1.36], rot: [-56, 0, 0] },
          { name: '首下', face: 'front', t: 51, pos: [0, 0.65, 2.7], size: [2.52, 0.75], rot: [30, 0, 0] },
          { name: '车尾', face: 'rear', t: 38, pos: [0, 1.05, -2.85], size: [2.52, 1.65], rot: [10, 0, 0] },
          { name: '侧上', face: 'side', t: 38, pos: [1.26, 1.48, 0], size: [5.8, 0.8], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 19, pos: [1.26, 0.66, 0], size: [5.8, 0.88], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 19, pos: [0, 1.9, 0], size: [2.52, 5.8], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.92, x1: 0.92, y0: 1.9, y1: 2.97, z0: -0.95, z1: 1.1 },
        plates: [
          { name: '炮盾', face: 'front', t: 89, pos: [0, 2.4, 1.35], size: [1.25, 0.95], rot: [6.5, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 76, pos: [-0.7, 2.4, 1.08], size: [0.9, 0.95], rot: [-1.5, -52, 0] },
          { name: '炮塔正面', face: 'front', t: 76, pos: [0.7, 2.4, 1.08], size: [0.9, 0.95], rot: [-1.5, 52, 0] },
          { name: '炮塔尾部', face: 'rear', t: 51, pos: [0, 2.4, -0.8], size: [1.78, 0.95], rot: [5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 51, pos: [0.95, 2.4, 0.05], size: [1.85, 0.95], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 19, pos: [0, 2.9, 0.1], size: [2, 2.3], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.014, range: 600, ammoMax: 2000 },
    internal: {
      crew: [   // 史实 4 乘员：无前机枪手（弹药库占首位），电台移炮塔尾
        { id: 'commander', name: '车长',   x: 0.45,  y: 2.28, z: -0.3,  r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: 0.4,   y: 2.2,  z: 0.42,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: -0.5,  y: 2.2,  z: -0.05, r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.3,  z: 2,     r: 0.34 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.08, z: -1.9,  r: 0.65 }],
        fuel:        [{ x: -0.8,  y: 1.22, z: -2,    r: 0.45 }, { x: 0.8, y: 1.22, z: -2, r: 0.45 }],
        ammoRacks:   [{ x: -0.55, y: 0.85, z: 0.1,   r: 0.5 }, { x: 0, y: 2.05, z: -0.34, r: 0.45 }],   // 车底+炮塔尾（萤火虫特征）
        breech:      [{ x: 0,     y: 2.2,  z: 0.8,   r: 0.42 }],
        turretDrive: [{ x: 0.3,   y: 1.98, z: 0.55,  r: 0.36 }],
        optics:      [{ x: 0.25,  y: 2.28, z: 0.6,   r: 0.3 }],
      },
      ringY: 1.98,
      trackX: 1.05, trackY: 1.12,
    },
    dims: { length: 5.89, width: 2.62, hullHeight: 1.90, turretTop: 2.97 },
    trackWidth: 0.58,
    ammo: { shell: 77, mg: 2000 },
    sound: {
      drive: 'tankSound/usa/m4-egDown.mp3',                 // 复用 M4 系引擎（用户指定）
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/usa/us-76mm-fire.mp3',
      fireAim: 'tankSound/usa/us-76mm-inner.mp3',
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 3.0, driveCruiseEnd: 17.4, driveDecelStart: 17.4, driveDecelEnd: 20.0 },
    },
  },
  'panther': {
    caliber: 75,             // mm 主炮口径（跳弹口径碾压用）
    id: 'panther',
    nation: 'de',
    reticle: 'de2',           // TZF 12a 德式三角分划（与虎式同族）
    zoomFov: [24.8, 12.4],    // TZF12a 双档 2.5×/5× 视场（开镜态 Shift 切档）
    aiRole: 'anchor',
    aiTraits: { tiltPref: 0, preferRangeK: 1.25, panicOnFlank: true },   // 侧甲薄：严格正面对敌
    name: '黑豹 Panther A',
    nameEn: 'Panther A',
    model: 'model/opt/panther-a.glb',
    scale: 1.0,               // 实测全长 8.9m 含炮管（实车 8.66m）≈1:1
    forwardAxis: '+x',
    parts: {
      turret: ['turret001_panther-a-mid-turret_1_0', 'weapon2001_panther-a-mid-turret_1_0',
               'spare-track_panther-a-mid-alpha_4_0', 'spare-track001_panther-a-mid-alpha_4_0',
               'spare-track002_panther-a-mid-alpha_4_0', 'spare-track003_panther-a-mid-alpha_4_0',
               'spare-track004_panther-a-mid-alpha_4_0', 'spare-track005_panther-a-mid-alpha_4_0',
               'spare-track01_panther-a-mid-alpha_4_0', 'spare-track02_panther-a-mid-alpha_4_0',
               'spare-track03_panther-a-mid-alpha_4_0', 'spare-track04_panther-a-mid-alpha_4_0',
               'spare-track05_panther-a-mid-alpha_4_0', 'spare-track06_panther-a-mid-alpha_4_0',
               'spare-track07_panther-a-mid-alpha_4_0', 'spare-track08_panther-a-mid-alpha_4_0',
               'spare-track09_panther-a-mid-alpha_4_0', 'spare-track10_panther-a-mid-alpha_4_0',
               'spare-track11_panther-a-mid-alpha_4_0', 'spare-track12_panther-a-mid-alpha_4_0',
               'gear_panther-a-mid-alpha_4_0', 'gear001_panther-a-mid-alpha_4_0',
               'gear002_panther-a-mid-alpha_4_0', 'gear003_panther-a-mid-alpha_4_0',
               'gear004_panther-a-mid-alpha_4_0', 'gear005_panther-a-mid-alpha_4_0',
               'gear006_panther-a-mid-alpha_4_0', 'gear007_panther-a-mid-alpha_4_0',
               'gear008_panther-a-mid-alpha_4_0', 'gear009_panther-a-mid-alpha_4_0',
               'gear010_panther-a-mid-alpha_4_0', 'gear011_panther-a-mid-alpha_4_0',
               'bracket_panther-a-mid-turret_1_0', 'bracket2_panther-a-mid-turret_1_0',
               'bracket03_panther-a-mid-turret_1_0', 'bracket04_panther-a-mid-turret_1_0',
               'hatch3001_panther-a-mid-turret_1_0', 'hatch4001_panther-a-mid-turret_1_0',
               'object01_panther-a-mid-turret_5_0', 'interior001_panther-a-mid-interior_3_0'],
      mg: ['weapon2001_panther-a-mid-turret_1_0'],        // 同轴 MG34——右键发射
      hullMg: ['weapon3001_panther-a-mid-hull_0_0'],      // 车体前机枪 MG34（球座）——F 发射
      barrel: ['weapon001_panther-a-mid-turret_1_0', 'mount001_panther-a-mid-turret_1_0',
               'interior_pz-vi-interior_2_0', 'interior002_panther-a-mid-interior_3_0'],
      track: ['track2_panther-a-track_7_0', 'track001_panther-a-track_7_0'],
      wheels: ['wheel001_panther-a-mid-wheels_6_0', 'wheel2_panther-a-mid-wheels_6_0',
               'wheel3_panther-a-mid-wheels_6_0', 'wheel4_panther-a-mid-wheels_6_0',
               'wheel5_panther-a-mid-wheels_6_0', 'wheel6_panther-a-mid-wheels_6_0',
               'wheel7_panther-a-mid-wheels_6_0', 'wheel8_panther-a-mid-wheels_6_0',
               'wheel9_panther-a-mid-wheels_6_0', 'wheel10_panther-a-mid-wheels_6_0',
               'wheel11_panther-a-mid-wheels_6_0', 'wheel12_panther-a-mid-wheels_6_0',
               'wheel13_panther-a-mid-wheels_6_0', 'wheel14_panther-a-mid-wheels_6_0',
               'wheel15_panther-a-mid-wheels_6_0', 'wheel16_panther-a-mid-wheels_6_0',
               'wheel17_panther-a-mid-wheels_6_0', 'wheel18_panther-a-mid-wheels_6_0',
               'wheel19_panther-a-mid-wheels_6_0', 'wheel20_panther-a-mid-wheels_6_0'],
    },
    // 枢轴实测：炮塔环带中心（turret-base 环 y=1.83，炮塔 bbox 中心 z=-0.09）
    turretPivot: [0, 1.83, -0.09],
    barrelPivot: [0, 2.24, 0.95],
    muzzleLocal: [0, 2.24, 5.33],               // weapon001 网格前端实测
    exhaustLocal: [[0.27, 2.02, -3.47], [-0.24, 2.01, -3.42]],   // md 排气烟点×2.56 +0.4（斜向上管）+0.2 上移 +0.3 向车尾（用户实测校准）
    heatZShift: -0.7,          // 排气热浪比烟点向车尾移 0.7m（管口伸出更后，仅热浪位移，烟不动）
    trackLocal: [[-1.26, 0.1, 0], [1.26, 0.1, 0]],
    trackScrollAxis: 'x',       // 履带 UV 纵向=U（corr(x,u) 最高）
    // —— 实车性能 ——
    mass: 44800,
    engineHp: 700,               // 迈巴赫 HL230 P30
    maxSpeedForward: 46 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 46 / 3.6,          // 12.8 m/s ≈46km/h（公路，调速器限速）
    offroadK: 0.48,              // 越野极速 ≈22km/h（史实）
    revSpeed: 2.4,
    enginePower: 3.2,
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.6,
    hullTraverse: 0.4,           // AK7-200 单半径转向，无原位转向（史实短板；原地转向慢）
    turretTraverse: 0.26,        // 液压转向 ≈15°/s（低速挡偏慢，史实短板）
    gunDepression: -8.0,
    gunElevation: 18.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：7.5cm KwK42 L/70 ——
    gunCaliber: 75,
    shellName: 'PzGr.39/42 APCBC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 935,
    shellPen: 136,               // mm RHA @0m（30° 口径基准：史实30° 124@500/111@1000/99@1500/89@2000）
    shellPenDrop: 0.17,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40/42 APCR', nameCn: '钨芯穿甲弹', velocity: 1120, pen: 197, penDrop: 0.23 },  // 次口径钨芯弹（3 键；174@500/106@2000）
    heShellName: 'Sprgr.42',
    heVelocity: 700,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 39, apcr: 3, he: 37 },   // 史实弹药分配
    spallPower: 110,             // 75mm 装药量小于 88
    reloadTime: 7.9,             // s 人工装填（炮塔局促）
    dispersion: 0.00017,         // σ：KwK42（1000m ~0.25m，高初速平弹道）
    aimTime: 2.2,
    // —— 装甲（mm RHA；大倾角首上）——
    armor: {
      hullFront: 80,  hullSide: 50, hullRear: 40, hullTop: 16,
      turretFront: 110, turretSide: 45, turretRear: 45,
    },
    // —— 装甲判定模型（板图 v2；2026-09-15 编辑器调参导出）——
    armorModel: {
      hull: {
        box: { x0: -1.6, x1: 1.6, y0: 0.25, y1: 1.92, z0: -3.28, z1: 3.23 },
        plates: [
          { name: '首上', face: 'front', t: 80, pos: [0, 1.46, 2.61], size: [3.2, 1.56], rot: [-55, 0, 0] },
          { name: '首下', face: 'front', t: 60, pos: [0, 0.8, 2.95], size: [3.2, 0.8], rot: [55, 0, 0] },
          { name: '车尾', face: 'rear', t: 40, pos: [0, 1.24, -2.88], size: [3.2, 1.5], rot: [-25, 0, 0] },
          { name: '侧上', face: 'side', t: 50, pos: [1.58, 1.55, 0], size: [6.5, 0.75], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 35, pos: [1.58, 0.75, 0], size: [6.5, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 16, pos: [0, 1.92, 0], size: [3.2, 6.5], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.16, x1: 1.16, y0: 1.83, y1: 2.91, z0: -1.39, z1: 1.21 },
        plates: [
          { name: '炮盾', face: 'front', t: 100, pos: [0, 2.24, 1.35], size: [1.55, 0.94], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 110, pos: [0, 2.35, 1.05], size: [2.3, 1.0], rot: [-12, 0, 0] },
          { name: '炮塔尾部', face: 'rear', t: 45, pos: [0, 2.35, -1.28], size: [2.3, 1.14], rot: [12, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 45, pos: [1.1, 2.35, -0.1], size: [2.69, 1.0], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 16, pos: [0, 2.82, -0.07], size: [2.3, 2.6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 4500 },
    hullMgArc: 0.26,
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.40, y: 2.17, z: -0.60, r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: -0.40, y: 2.14, z: 0.50,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: 0.45,  y: 2.17, z: 0.00,  r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.20, z: 2.14,  r: 0.34 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.20, z: 2.14,  r: 0.34 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.29, z: -2.03,  r: 0.58 }],
        fuel:        [{ x: -0.80, y: 1.00, z: -2.17,  r: 0.45 }, { x: 0.80, y: 1.00, z: -2.17, r: 0.45 }],
        ammoRacks:   [{ x: -0.90, y: 1.10, z: 0.44,  r: 0.50 }, { x: 0.90, y: 1.10, z: 0.65,  r: 0.50 },
                      { x: 0.60,  y: 1.78, z: -0.90, r: 0.40 }],
        breech:      [{ x: 0,     y: 2.24, z: 0.58,  r: 0.40 }],
        turretDrive: [{ x: -0.30, y: 1.57, z: 0.40,  r: 0.36 }],
        optics:      [{ x: -0.55, y: 2.40, z: 0.80,  r: 0.28 }],
      },
      ringY: 1.83,
      trackX: 1.26, trackY: 1.05,
    },
    dims: { length: 6.5, width: 3.3, hullHeight: 1.92, turretTop: 2.91 },
    trackWidth: 0.68,
    ammo: { shell: 79, mg: 4500 },
    // —— 音效（2026-09-24 二战音源：双开炮声 + 新式发动机，与猎豹共用 pz5a-egAll）——
    sound: {
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/gem/pz5a-fire1.mp3',                  // 第三人称开炮：75mm KwK42
      fireAim: 'tankSound/gem/pz5a-75mm-inner2.mp3',         // 瞄准镜开炮：75mm 炮膛内声
      drive: 'tankSound/gem/pz5a-egAll.mp3',                 // 新式发动机（单文件形）：前 7s=加速段 / 7~15s=巡航段 / 末尾 3.83s=怠速段（原4s，2026-09-26 裁掉文件尾 0.17s 收弱段消接缝停顿感）
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 7, driveCruiseEnd: 15, driveIdle: 3.83 },
    },
  },

  // ── 四号坦克 G 型（Panzer IV Ausf. G，1943 库尔斯克）────────────────────
  // 7.5cm KwK40 L/48 + 电动炮塔；德军装甲兵 1943 主力。轮系：scripts/split-wheels-td.js pz4g
  // 离线切出（28 轮：8 负重轮/前主动/后诱导/4 回转轮每侧）；翼子板上的备用负重轮（竖放/平放）
  // 按用户指定不切、留车体静态（discYMax 排除）
  'pz4g': {
    caliber: 75,             // mm 主炮口径（跳弹口径碾压用）
    id: 'pz4g',
    nation: 'de',
    reticle: 'de2',           // TZF 12a 德式三角分划（与黑豹同族，用户指定）
    zoomFov: [24.8, 12.4],    // TZF12a 双档 2.5×/5× 视场（开镜态 Shift 切档）
    aiRole: 'brawler',
    aiTraits: { preferRangeK: 0.9 },                    // 1943 主力中坦：中近距环绕
    name: '四号 G 型',
    nameEn: 'Panzer IV Ausf. G',
    model: 'model/opt/pz4g.glb',
    scale: 1.0,               // 实测全长 6.84m 含炮管（实车 6.63m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_9', 'Object_11'],                   // 炮塔壳+外挂件
      barrel: ['Object_10'],                               // KwK40 炮管+炮盾+炮尾（随俯仰）
      mg: ['Object_20'],        // 同轴 MG34（炮塔内随炮塔）——右键发射
      hullMg: ['Object_19'],    // 车体前机枪 MG34（球座）——F 发射·射界内自动瞄准
      track: ['Object_2', 'Object_5', 'Object_6', 'Object_8'],   // 履带内外两圈网格同滚动（防内侧看穿）
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6', 'wheelR7', 'wheelR8',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6', 'wheelL7', 'wheelL8',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3', 'wheelRT4',
               'wheelLT1', 'wheelLT2', 'wheelLT3', 'wheelLT4'],
    },
    turretPivot: [0.06, 1.30, -0.16],    // 炮塔座圈（Object_9 底环带圆拟合 x0.06/z-0.16）
    barrelPivot: [0.055, 1.94, 1.1],     // 炮盾耳轴（Object_10 炮盾段 z1.0~1.4）
    muzzleLocal: [0.055, 1.94, 4.10],    // 炮口（Object_10 前端，轴线 y1.94）
    exhaustLocal: [[0.56, 0.92, -2.76], [-0.10, 1.12, -2.92]],   // md 排气烟点×2.56
    trackLocal: [[-1.28, 0.1, 0], [1.28, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 12 格）
    trackScrollFlip: true,      // 底段 dv/dz<0（V 车尾高、车头低）：前进时 offset 须递减
    // —— 实车性能 ——
    mass: 23600,                // 战斗全重 23.6t
    engineHp: 300,              // 迈巴赫 HL120 TRM
    maxSpeedForward: 40 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 40 / 3.6,         // 公路（史实）
    offroadK: 0.50,             // 越野极速 ≈20km/h
    revSpeed: 2.2,
    enginePower: 2.4,           // 12.7hp/t
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.58,
    hullTraverse: 0.45,         // 单半径转向，无原位转向
    turretTraverse: 0.24,       // 电动转向 ≈14°/s
    gunDepression: -8.0,
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：7.5cm KwK40 L/48 ——
    gunCaliber: 75,
    shellName: 'PzGr.39 (KwK40)',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 750,
    shellPen: 107,               // mm RHA @0m（30° 口径基准：史实30° 97@500/86@1000/76@1500/67@2000）
    shellPenDrop: 0.19,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40 APCR', nameCn: '钨芯穿甲弹', velocity: 930, pen: 140, penDrop: 0.29 },  // 次口径钨芯弹（3 键；120@500/77@1500）
    heShellName: 'Sprgr.34',
    heVelocity: 550,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 43, apcr: 4, he: 40 },   // 史实弹药分配
    spallPower: 95,
    reloadTime: 7.0,
    dispersion: 0.00026,        // σ：KwK40 L/48
    aimTime: 2.0,
    // —— 装甲（mm RHA；后期 G 一体化 80 正面）——
    armor: {
      hullFront: 80, hullSide: 30, hullRear: 20, hullTop: 12,
      turretFront: 50, turretSide: 30, turretRear: 30,
    },
    // —— 装甲判定模型（板图 v2：按模型实测轮廓铺板，史实厚度）——
    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.25, y1: 1.32, z0: -2.75, z1: 2.95 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 80, pos: [0, 1.21, 2], size: [2.3, 0.75], rot: [-12, 0, 0] },
          { name: '首下', face: 'front', t: 80, pos: [0, 0.72, 2.88], size: [2.3, 0.55], rot: [9, 0, 0] },
          { name: '车首鼻', face: 'front', t: 30, pos: [0, 0.35, 2.7], size: [2.3, 0.5], rot: [30, 0, 0] },
          { name: '首上左', face: 'front', t: 80, pos: [0.02, 1.09, 2.42], size: [2.31, 1.05], rot: [-73.5, 0, 0] },
          { name: '首上右', face: 'front', t: 80, pos: [0, 1.57, 1.51], size: [2.39, 1.01], rot: [-87.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 20, pos: [0, 0.99, -2.42], size: [2.3, 1.08], rot: [-5, 0, 0] },
          { name: '侧上', face: 'side', t: 30, pos: [1.16, 1.1, 0], size: [5.5, 0.8], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.28, 0.55, 0], size: [5.5, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 12, pos: [0, 1.5, -0.19], size: [2.3, 4.56], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.15, x1: 1.15, y0: 1.32, y1: 2.35, z0: -1.47, z1: 1.04 },
        plates: [
          { name: '炮盾', face: 'front', t: 50, pos: [0, 1.98, 1.05], size: [1.39, 0.71], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 50, pos: [-0.8, 1.88, 0.7], size: [0.7, 0.92], rot: [0, -60, 0] },
          { name: '炮塔正面', face: 'front', t: 50, pos: [0.8, 1.87, 0.7], size: [0.7, 0.94], rot: [0, 60, 0] },
          { name: '炮塔尾部', face: 'rear', t: 30, pos: [0, 1.95, -1.11], size: [1.85, 0.9], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 30, pos: [0.89, 1.95, -0.34], size: [1.81, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 12, pos: [0, 2.33, -0.2], size: [1.9, 2.4], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 3150 },
    hullMgArc: 0.26,           // 前机枪水平射界 ±15°（Kugelblende 球座）
    // —— 内部布局（驾驶左前/机电员右前；炮手左/装填手右/车长后）——
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.30, y: 2.00, z: -0.50, r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: -0.30, y: 1.85, z: 0.50,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 1.85, z: 0.00,  r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.50, y: 1.05, z: 1.50,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.50,  y: 1.05, z: 1.36,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.00, z: -1.90,  r: 0.42 }],
        fuel:        [{ x: -0.83, y: 0.90, z: -1.70,  r: 0.36 }, { x: 0.51, y: 0.90, z: -1.70, r: 0.32 }],
        ammoRacks:   [{ x: -0.62, y: 0.90, z: -0.12,  r: 0.42 }, { x: 0.58, y: 0.90, z: -0.05, r: 0.42 },
                      { x: 0,     y: 1.50, z: -0.76,  r: 0.29 }],
        breech:      [{ x: 0.05,  y: 1.94, z: 0.60,   r: 0.34 }],
        turretDrive: [{ x: -0.25, y: 1.35, z: 0.10,   r: 0.30 }],
        optics:      [{ x: -0.30, y: 2.10, z: 0.80,   r: 0.26 }],
      },
      ringY: 1.30,
      trackX: 1.28, trackY: 1.0,
    },
    dims: { length: 5.9, width: 2.88, hullHeight: 1.32, turretTop: 2.6 },
    trackWidth: 0.56,
    ammo: { shell: 87, mg: 3150 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
fire: 'tankSound/gem/75mm-long-fire.mp3',                  // 第三人称开炮：75mm KwK40
fireAim: 'tankSound/gem/75mm-long-inner.mp3',            // 瞄准镜开炮：75mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── 四号坦克 J 型（Panzer IV Ausf. J，1944-45）────────────────────
  // 简化生产型：取消炮塔电机改手摇（全场最慢炮塔转速之一）；加厚部分装甲、侧裙板
  // 轮系同 pz4g 切法；Object_12（车体件）内的炮塔右后油桶 → 拆出 jerryCan 随炮塔旋转（用户指定）
  'pz4j': {
    caliber: 75,             // mm 主炮口径（跳弹口径碾压用）
    id: 'pz4j',
    nation: 'de',
    reticle: 'de2',           // TZF 12a 德式三角分划（与黑豹同族，用户指定）
    zoomFov: [24.8, 12.4],    // TZF12a 双档 2.5×/5× 视场（开镜态 Shift 切档）
    aiRole: 'brawler',
    aiTraits: { preferRangeK: 0.9 },
    name: '四号 J 型',
    nameEn: 'Panzer IV Ausf. J',
    model: 'model/opt/pz4j.glb',
    scale: 1.0,               // 实测全长 6.83m 含炮管（实车 6.63m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_23', 'Object_24', 'Object_16', 'Object_14', 'Object_22', 'jerryCan'],   // 炮塔壳+车长塔+外挂件+炮盾+油桶
      barrel: ['Object_17', 'Object_18'],                  // 炮盾/炮尾 + KwK40 炮管（随俯仰）
      mg: ['Object_20'],        // 同轴 MG34（炮塔内随炮塔）——右键发射
      hullMg: ['Object_19'],    // 车体前机枪 MG34（球座）——F 发射
      track: ['Object_2', 'Object_3'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6', 'wheelR7', 'wheelR8',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6', 'wheelL7', 'wheelL8',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3',
               'wheelLT1', 'wheelLT2', 'wheelLT3'],
    },
    turretPivot: [0.07, 1.30, -0.15],    // 炮塔座圈（Object_16 底环带圆拟合）
    barrelPivot: [0.054, 1.94, 1.1],     // 炮盾耳轴
    muzzleLocal: [0.054, 1.94, 4.10],    // 炮口
    exhaustLocal: [[0.18, 1.29, -2.96], [-0.52, 1.25, -2.96]],   // md 排气烟点×2.56
    trackLocal: [[-1.28, 0.1, 0], [1.28, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 7.8 格）
    trackScrollFlip: true,      // 底段 dv/dz<0
    // —— 实车性能 ——
    mass: 25000,                // 战斗全重 25t
    engineHp: 300,              // 迈巴赫 HL120 TRM
    maxSpeedForward: 38 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 38 / 3.6,         // 公路（史实）
    offroadK: 0.50,             // 越野极速 ≈19km/h
    revSpeed: 2.2,
    enginePower: 2.3,           // 12hp/t
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.58,
    hullTraverse: 0.45,
    turretTraverse: 0.09,       // 手摇转向 ≈5°/s（J 型取消电机，史实弱点）
    gunDepression: -8.0,
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：7.5cm KwK40 L/48（与 G 型同）——
    gunCaliber: 75,
    shellName: 'PzGr.39 (KwK40)',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 750,
    shellPen: 107,               // mm RHA @0m（30° 口径基准：史实30° 97@500/86@1000/76@1500/67@2000）
    shellPenDrop: 0.19,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40 APCR', nameCn: '钨芯穿甲弹', velocity: 930, pen: 140, penDrop: 0.29 },  // 次口径钨芯弹（3 键；120@500/77@1500）
    heShellName: 'Sprgr.34',
    heVelocity: 550,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 43, apcr: 4, he: 40 },   // 史实弹药分配
    spallPower: 95,
    reloadTime: 7.0,
    dispersion: 0.00026,
    aimTime: 2.0,
    // —— 装甲（mm RHA）——
    armor: {
      hullFront: 80, hullSide: 30, hullRear: 20, hullTop: 12,
      turretFront: 50, turretSide: 30, turretRear: 30,
    },
    // —— 装甲判定模型（同 G 型板图；J 型侧裙板为钢丝网，不计等效）——
    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.25, y1: 1.32, z0: -2.75, z1: 2.95 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 80, pos: [0, 1.21, 2], size: [2.3, 0.75], rot: [-12, 0, 0] },
          { name: '首下', face: 'front', t: 80, pos: [0, 0.72, 2.88], size: [2.3, 0.55], rot: [9, 0, 0] },
          { name: '车首鼻', face: 'front', t: 30, pos: [0, 0.35, 2.7], size: [2.3, 0.5], rot: [30, 0, 0] },
          { name: '首上左', face: 'front', t: 80, pos: [0.02, 1.09, 2.42], size: [2.31, 1.05], rot: [-73.5, 0, 0] },
          { name: '首上右', face: 'front', t: 80, pos: [0, 1.57, 1.51], size: [2.39, 1.01], rot: [-87.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 20, pos: [0, 0.99, -2.42], size: [2.3, 1.08], rot: [-5, 0, 0] },
          { name: '侧上', face: 'side', t: 30, pos: [1.16, 1.1, 0], size: [5.5, 0.8], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.28, 0.55, 0], size: [5.5, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 12, pos: [0, 1.5, -0.19], size: [2.3, 4.56], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.15, x1: 1.15, y0: 1.32, y1: 2.35, z0: -1.47, z1: 1.04 },
        plates: [
          { name: '炮盾', face: 'front', t: 50, pos: [0, 1.98, 1.05], size: [1.39, 0.71], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 50, pos: [-0.8, 1.88, 0.7], size: [0.7, 0.92], rot: [0, -60, 0] },
          { name: '炮塔正面', face: 'front', t: 50, pos: [0.8, 1.87, 0.7], size: [0.7, 0.94], rot: [0, 60, 0] },
          { name: '炮塔尾部', face: 'rear', t: 30, pos: [0, 1.95, -1.11], size: [1.85, 0.9], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 30, pos: [0.89, 1.95, -0.34], size: [1.81, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 12, pos: [0, 2.33, -0.2], size: [1.9, 2.4], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 3150 },
    hullMgArc: 0.26,
    // —— 内部布局（同 G 型）——
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.30, y: 2.00, z: -0.50, r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: -0.30, y: 1.85, z: 0.50,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 1.85, z: 0.00,  r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.50, y: 1.05, z: 1.50,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.50,  y: 1.05, z: 1.36,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.00, z: -1.90,  r: 0.42 }],
        fuel:        [{ x: -0.83, y: 0.90, z: -1.70,  r: 0.36 }, { x: 0.51, y: 0.90, z: -1.70, r: 0.32 }],
        ammoRacks:   [{ x: -0.62, y: 0.90, z: -0.12,  r: 0.42 }, { x: 0.58, y: 0.90, z: -0.05, r: 0.42 },
                      { x: 0,     y: 1.50, z: -0.76,  r: 0.29 }],
        breech:      [{ x: 0.05,  y: 1.94, z: 0.60,   r: 0.34 }],
        turretDrive: [{ x: -0.25, y: 1.35, z: 0.10,   r: 0.30 }],
        optics:      [{ x: -0.30, y: 2.10, z: 0.80,   r: 0.26 }],
      },
      ringY: 1.30,
      trackX: 1.28, trackY: 1.0,
    },
    dims: { length: 5.9, width: 2.88, hullHeight: 1.32, turretTop: 2.6 },
    trackWidth: 0.56,
    ammo: { shell: 87, mg: 3150 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
fire: 'tankSound/gem/75mm-long-fire.mp3',                  // 第三人称开炮：75mm KwK40
fireAim: 'tankSound/gem/75mm-long-inner.mp3',            // 瞄准镜开炮：75mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── M10 狼獾坦克歼击车（美）────────────────────
  'm10': {
    caliber: 76.2,             // mm 主炮口径（跳弹口径碾压用）
    id: 'm10',
    nation: 'us',
    reticle: 'us2',           // M82 望远镜静态分划
    zoomFov: 20.7,            // M82 固定 3× 视场
    aiRole: 'ambusher',
    aiTraits: { scootChance: 0.5 },                   // TD 心态：远距、避近战（有炮塔特例）
    name: 'M10 狼獾',
    nameEn: 'M10 Wolverine',
    model: 'model/opt/m10_wolverine.glb',
    scale: 1.0,               // 实测全长 6.84m 含炮管（实车 6.83m）=1:1
    forwardAxis: '+x',
    parts: {
      turret: ['turret001_m10-turret_2_0', 'mount001_m10-turret_2_0',
               'gun-interior_m10-interior_3_0', 'turret-interior_m10-interior_3_0',
               'gear11_us_gear_4_0',
               'shell_m10-interior_3_0', 'shell2_m10-interior_3_0', 'shell3_m10-interior_3_0',
               'shell4_m10-interior_3_0', 'shell5_m10-interior_3_0', 'shell6_m10-interior_3_0'],
      mg: ['mount2_m4a3-turret_5_0', 'weapon2001_m2hb_6_0'],   // 炮塔尾部 M2HB 12.7mm——右键发射
      barrel: ['weapon001_m10-turret_2_0', 'gun-interior_m10-interior_3_0', 'mount001_m10-turret_2_0'],
      track: ['track1_m10-track_7_0', 'track1001_m10-track_7_0'],
      wheels: ['wheel001_m10-wheels_8_0', 'wheel2_m10-wheels_8_0', 'wheel3_m10-wheels_8_0',
               'wheel4_m10-wheels_8_0', 'wheel5_m10-wheels_8_0', 'wheel6_m10-wheels_8_0',
               'wheel7_m10-wheels_8_0', 'wheel8_m10-wheels_8_0', 'wheel9_m10-wheels_8_0',
               'wheel10_m10-wheels_8_0', 'wheel11_m10-wheels_8_0', 'wheel12_m10-wheels_8_0',
               'wheel13_m10-wheels_8_0', 'wheel14_m10-wheels_8_0', 'wheel15_m10-wheels_8_0',
               'wheel16_m10-wheels_8_0', 'wheel17_m10-wheels_8_0', 'wheel18_m10-wheels_8_0',
               'wheel19_m10-wheels_8_0', 'wheel20_m10-wheels_8_0', 'wheel21_m10-wheels_8_0',
               'wheel22_m10-wheels_8_0'],
      // md 标注隐藏件：首上沙袋/备用轮/杂物箱（变体件）
      hidden: ['sandbags_sandbag_12_0', 'obj2_m10-wheels_8_0', 'object01_us_gear_4_0', 'object02_m4a3-track_10_0'],
    },
    turretPivot: [0, 1.78, -0.10],
    barrelPivot: [0, 2.19, 1.50],
    muzzleLocal: [0, 2.19, 4.02],
    exhaustLocal: [[0.35, 0.93, -2.58], [-0.21, 0.92, -2.59]],   // md 排气烟点×2.56
    trackLocal: [[-1.03, 0.1, 0], [1.03, 0.1, 0]],
    trackScrollAxis: 'x',
    mass: 29600,
    engineHp: 410,               // GM 6046 双柴油机
    maxSpeedForward: 48 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 48 / 3.6,          // 公路
    offroadK: 0.54,              // 越野极速 ≈26km/h（史实）
    revSpeed: 2.4,
    enginePower: 3.0,
    powerFalloff: 0.58,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.55,
    hullTraverse: 0.65,
    turretTraverse: 0.12,        // 手摇转向 ≈7°/s（全场最慢，坦歼史实弱点）
    gunDepression: -10.0,
    gunElevation: 19.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：3-inch M7 ——
    gunCaliber: 76,
    shellName: 'M62 APC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 792,
    shellPen: 105,               // mm RHA @0m（30° 口径基准：史实30° 98@500/90@1000/83@1500/76@2000）
    shellPenDrop: 0.14,          // 每千米穿深衰减比例
    apcrShell: { name: 'M93 HVAP', nameCn: '钨芯穿甲弹', velocity: 1036, pen: 178, penDrop: 0.22 },  // 次口径钨芯弹（3 键；158@500/99@2000）
    heShellName: 'M42A1',
    heVelocity: 820,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 28, apcr: 4, he: 22 },   // 史实弹药分配
    spallPower: 100,
    reloadTime: 6.5,
    dispersion: 0.00034,         // σ：3in M7（同 76mm M1 弹族）
    aimTime: 1.9,
    // —— 装甲（mm RHA；薄甲坦歼，敞篷炮塔）——
    armor: {
      hullFront: 51,  hullSide: 25, hullRear: 25, hullTop: 19,
      turretFront: 57, turretSide: 25, turretRear: 25,
    },
    // —— 装甲判定模型（板图 v2；2026-09-15 编辑器调参导出；敞篷炮塔：无顶板）——
    armorModel: {
      hull: {
        box: { x0: -1.5, x1: 1.5, y0: 0.25, y1: 1.82, z0: -2.81, z1: 2.94 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 38, pos: [0, 1.43, 2.5], size: [3.0, 1.53], rot: [-55, 0, 0] },
          { name: '首下', face: 'front', t: 51, pos: [0, 0.65, 2.75], size: [3.0, 0.97], rot: [30, 0, 0] },
          { name: '车尾', face: 'rear', t: 25, pos: [0, 1.28, -2.77], size: [3.0, 1.5], rot: [29.5, 0, 0] },
          { name: '侧上', face: 'side', t: 25, pos: [1.5, 1.45, 0], size: [5.75, 0.75], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 19, pos: [1.5, 0.7, 0], size: [5.75, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 19, pos: [0, 1.82, 0], size: [3.0, 5.75], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.15, x1: 1.15, y0: 1.78, y1: 2.79, z0: -1.73, z1: 1.53 },
        plates: [
          { name: '炮盾', face: 'front', t: 76, pos: [0, 2.2, 1.78], size: [1.2, 0.65], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 57, pos: [-0.83, 2.18, 1.26], size: [1.18, 0.76], rot: [0, -62.5, 0] },
          { name: '炮塔正面', face: 'front', t: 57, pos: [0.8, 2.17, 1.25], size: [1.29, 0.76], rot: [0, 61.5, 0] },
          { name: '炮塔尾部', face: 'rear', t: 25, pos: [0, 2.26, -1.42], size: [2.2, 0.79], rot: [-17.5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 25, pos: [1.1, 2.22, -0.27], size: [2.48, 0.76], rot: [0, 90, 0], mirror: true },
        ],
        extras: [],
      },
    },
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.014, range: 600, ammoMax: 1200 },
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.40, y: 2.35, z: -0.90, r: 0.34 },
        { id: 'gunner',    name: '炮手',   x: -0.40, y: 2.30, z: 0.60,  r: 0.32 },
        { id: 'loader',    name: '装填手', x: 0.45,  y: 2.30, z: -0.20, r: 0.34 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.20, z: 1.78,  r: 0.34 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.20, z: 1.86,  r: 0.34 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.22, z: -2.09,  r: 0.53 }],
        fuel:        [{ x: -0.85, y: 1.16, z: -2.26,  r: 0.42 }, { x: 0.85, y: 1.20, z: -2.23, r: 0.42 }],
        ammoRacks:   [{ x: -0.69, y: 1.50, z: -0.69, r: 0.39 }, { x: 0.80, y: 1.50, z: -0.05, r: 0.44 },
                      { x: 0.44,  y: 2.20, z: -0.97, r: 0.31 }],
        breech:      [{ x: 0,     y: 2.19, z: 1.20,  r: 0.40 }],
        turretDrive: [{ x: -0.30, y: 1.85, z: 0.30,  r: 0.34 }],
        optics:      [{ x: -0.30, y: 2.40, z: 0.90,  r: 0.28 }],
      },
      ringY: 1.78,
      trackX: 1.03, trackY: 1.00,
    },
    dims: { length: 5.75, width: 3.0, hullHeight: 1.82, turretTop: 2.79 },
    trackWidth: 0.44,
    ammo: { shell: 54, mg: 1200 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/usa/us-75mm-fire.mp3',              // 第三人称开炮：75mm M3（敞开炮塔，与镜内同声）
      fireAim: 'tankSound/usa/us-75mm-fire.mp3',           // 瞄准镜开炮：同上（敞篷无舱内音差）
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── M26 潘兴（Pershing，1945 欧洲战场）────────────────────
  // 90mm M3 L/53 + 垂稳；模型负重轮/回转轮/主诱导轮焊死合并 → scripts/split-wheels-m26.js
  // 离线切出（§12 费迪南变体：满盘种子+同心环归桶，26 轮全切）；Object_23 双机枪合并件
  // 按 y=1.6 拆分：上簇同轴 M1919（coaxMg 随炮塔）/ 下簇车体前机枪（Object_23 留 hullMg）
  'm26': {
    caliber: 90,             // mm 主炮口径（跳弹口径碾压用）
    id: 'm26',
    nation: 'us',
    reticle: 'us3',           // M71C 望远镜静态分划（中央短竖十字，js/reticles.js）
    zoomFov: [15.5, 7.75],    // 4×/8× 双档视场（开镜态 Shift 切档）
    aiRole: 'brawler',
    aiTraits: { movingFire: true },                     // 垂稳：行进间开火许可
    name: 'M26 潘兴',
    nameEn: 'M26 Pershing',
    model: 'model/opt/m26_pershing.glb',
    scale: 1.0,               // 实测全长 8.92m 含炮管（实车 8.65m）≈1:1
    forwardAxis: '+z',        // 模型已 +Z 朝前、+Y 朝上，无需烘焙
    // —— 部件节点名（Tank Model Maker v2.3 标注，见 tankModel/m26_pershing.md）——
    parts: {
      turret: ['Object_9', 'Object_10', 'Object_2', 'Object_7', 'Object_21', 'Object_19', 'Object_3', 'Object_5'],   // 炮塔结构+车长塔+车顶 M2HB+天线
      mg: ['coaxMg'],         // 同轴 M1919 .30（split 自 Object_23 上簇，随炮塔）——右键发射
      hullMg: ['Object_23'],  // 车体前机枪 M1919（split 后仅剩下簇球座枪身）——F 发射·射界内自动瞄准
      barrel: ['Object_22'],  // 90mm M3 炮管+炮盾（随俯仰）
      track: ['Object_4', 'Object_6'],
      // 负重轮×6/侧 + 后主动轮 + 前诱导轮 + 回转轮×5/侧（连通分量归桶切割，轮毂/螺栓随轮）
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3', 'wheelRT4', 'wheelRT5',
               'wheelLT1', 'wheelLT2', 'wheelLT3', 'wheelLT4', 'wheelLT5'],
    },
    // 旋转轴心（车体局部坐标，米；座圈 Object_9 底环带圆拟合 x0.02/z0.70 r0.93）
    turretPivot: [0, 1.55, 0.70],
    barrelPivot: [0, 1.95, 1.65],          // 炮盾耳轴（Object_22 炮盾段 z1.6~1.8）
    muzzleLocal: [0, 1.95, 5.67],          // 炮口（Object_22 前端实测，轴线 y1.947）
    exhaustLocal: [[0.08, 0.85, -3.04], [-0.04, 0.85, -3.04]],   // md 排气烟点×2.56（车尾下置双管）
    trackLocal: [[-1.4, 0.1, 0], [1.4, 0.1, 0]],             // 履带扬尘点
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 11 格，uRange 仅 1.0）
    // 底段 dv/dz>0（V 车头高、车尾低）：前进 offset 递增即正向滑动，无需 flip
    // —— 实车性能 ——
    mass: 41700,                 // kg（战斗全重 46 短吨）
    engineHp: 500,               // Ford GAF V8 汽油机（与谢尔曼同机，功重比仅 12hp/t）
    maxSpeedForward: 40 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 40 / 3.6,          // 11.1 m/s ≈40km/h（公路 25mph 限速器值，史实）
    offroadK: 0.45,              // 越野极速 ≈18km/h（虎式与虎王之间：功重比 12hp/t 与虎式同级，
                                 // 但 Torqmatic 液力传动损耗+车重饱受诟病，史实越野迟缓）
    revSpeed: 2.2,
    enginePower: 2.3,            // 功重比与虎式同级（12hp/t）
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.58,
    hullTraverse: 0.55,          // Torqmatic 双流可原位转向
    turretTraverse: 0.33,        // 液压驱动 ≈19°/s（360° ≈19s，史实）
    gunDepression: -10.0,
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: true,              // 垂向陀螺稳定仪（M26 标配）：行进间散布惩罚减半
    // —— 火力：90mm M3 L/53 ——
    gunCaliber: 90,
    shellName: 'M82 APCBC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 853,
    shellPen: 137,               // mm RHA @0m（30° 口径基准：M82 后期强装药 853m/s；史实30° 129@500/122@1000/114@1500/106@2000）
    shellPenDrop: 0.11,          // 每千米穿深衰减比例
    apcrShell: { name: 'M304 HVAP', nameCn: '钨芯穿甲弹', velocity: 1021, pen: 243, penDrop: 0.18 },  // 次口径钨芯弹（3 键；221@500/156@2000）
    heShellName: 'M71',
    heVelocity: 810,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 35, apcr: 5, he: 30 },   // 史实弹药分配
    spallPower: 120,             // M82 小装药后效
    reloadTime: 8.0,             // s 人工装填（19kg 定装弹，~8rpm）
    dispersion: 0.00020,         // σ：90mm M3（精度优良）
    aimTime: 2.2,
    // —— 装甲（mm RHA）——
    armor: {
      hullFront: 102, hullSide: 51, hullRear: 51, hullTop: 22,
      turretFront: 102, turretSide: 76, turretRear: 76,
    },
    // —— 装甲判定模型（板图 v2：按模型实测轮廓铺板，史实厚度；编辑器可再调）——
    armorModel: {
      hull: {
        box: { x0: -1.3, x1: 1.3, y0: 0.25, y1: 1.52, z0: -3.2, z1: 2.8 },
        plates: [
          { name: '首上', face: 'front', t: 102, pos: [0, 1.18, 2.48], size: [2.5, 1.01], rot: [-45.5, 0, 0] },
          { name: '首下', face: 'front', t: 76, pos: [0, 0.58, 2.38], size: [2.5, 1.04], rot: [56.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 51, pos: [0, 0.95, -2.88], size: [2.5, 1.18], rot: [-12.5, 0, 0] },
          { name: '侧上', face: 'side', t: 51, pos: [1.15, 0.94, 0], size: [6.2, 1.25], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 25, pos: [1.45, 0.6, 0], size: [6.2, 1], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 22, pos: [0, 1.52, -0.33], size: [2.3, 4.99], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.97, x1: 1.08, y0: 1.55, y1: 2.56, z0: -1.4, z1: 1.32 },
        plates: [
          { name: '炮盾', face: 'front', t: 114, pos: [0, 1.99, 1.75], size: [1.4, 0.91], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 102, pos: [-0.87, 1.99, 1.32], size: [1.15, 0.94], rot: [0, -68, 0] },
          { name: '炮塔正面', face: 'front', t: 102, pos: [0.86, 1.91, 1.34], size: [1.01, 1.07], rot: [0, 68, 0] },
          { name: '炮塔尾部', face: 'rear', t: 76, pos: [0, 1.97, -1.04], size: [1.53, 0.95], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 76, pos: [0.85, 1.98, -0.05], size: [2.13, 0.95], rot: [0, 100, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 22, pos: [0, 2.43, 0.38], size: [2.16, 2.91], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    mg: { rate: 10, dispersion: 0.016, range: 550, ammoMax: 5000 },   // M1919 .30 ×2 合并弹池
    hullMgArc: 0.26,           // 前机枪水平射界 ±15°（球座）
    heShell: { power: 1.0, nearMissR: 2 },   // 90mm M71 HE：与 88mm HE 同级
    // —— 内部布局（车体局部坐标 +z 车头；驾驶左前/机电员右前，炮手右/车长右后/装填手左）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: 0.45, y: 1.99, z: -0.03, r: 0.37 },
        { id: 'gunner', name: '炮手', x: 0.35, y: 1.78, z: 0.8, r: 0.4 },
        { id: 'loader', name: '装填手', x: -0.45, y: 1.64, z: 0.16, r: 0.36 },
        { id: 'driver', name: '驾驶员', x: -0.5, y: 1.05, z: 2, r: 0.33 },
        { id: 'radio', name: '通讯员', x: 0.5, y: 1.05, z: 2, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 1, z: -1.54, r: 0.5 }],
        fuel: [{ x: -0.69, y: 0.9, z: -2.03, r: 0.48 }, { x: 0.65, y: 0.9, z: -2.03, r: 0.47 }],
        ammoRacks: [{ x: -0.55, y: 0.8, z: 0.4, r: 0.45 }, { x: 0.65, y: 0.8, z: 0.4, r: 0.45 }, { x: -0.27, y: 1.9, z: -0.34, r: 0.4 }],
        breech: [{ x: 0, y: 1.95, z: 0.8, r: 0.4 }],
        turretDrive: [{ x: -0.3, y: 1.58, z: 1, r: 0.34 }],
        optics: [{ x: 0.3, y: 2.2, z: 1.3, r: 0.28 }],
      },
      ringY: 1.55,
      trackX: 1.4, trackY: 1.1,
    },
    dims: { length: 6.35, width: 3.5, hullHeight: 1.52, turretTop: 2.85 },
    trackWidth: 0.61,
    ammo: { shell: 70, mg: 5000 },
    sound: {
      drive: 'tankSound/usa/m26-egDown.mp3',                // 新式发动机（单文件三段）：前 4.9s=加速段 / 巡航 / 16.4s 起=减速停车段
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/usa/m26-90mm-fire.mp3',             // 第三人称开炮：90mm M82
      fireAim: 'tankSound/usa/m26-90mm-inner.mp3',         // 瞄准镜开炮：90mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.06, driveDecelStart: 16.4 },
    },
  },

  // ── M18 地狱猫坦克歼击车（美）────────────────────
  // 76mm M1A1 + 89km/h 全场最快（史实：二战最快履带战斗车辆）；12.7mm 纸甲、开顶炮塔
  // 轮系：scripts/split-wheels-td.js m18 离线切出（分量岛归桶，22 轮：5 负重轮/前主动/后诱导/4 回转轮每侧）；
  // 炮管：Object_14 与炮塔储物杂件（篮/油桶/架/帆布）合并 → 质心 z>0.6 切出 barrelTube 随俯仰
  'm18': {
    caliber: 76,             // mm 主炮口径（跳弹口径碾压用）
    openTop: true,           // 开顶炮塔：开镜不启用舱内发动机衰减（audio 新式引擎）
    id: 'm18',
    nation: 'us',
    reticle: 'us2',           // M70G 望远镜静态分划
    zoomFov: 20.7,            // M70G 固定 3× 视场
    aiRole: 'ambusher',
    aiTraits: { scootChance: 0.9, fleeOnConfirm: true },   // 纸甲高速：被确认即脱离、打了就跑（地狱猫教条）
    name: 'M18 地狱猫',
    nameEn: 'M18 Hellcat',
    model: 'model/opt/m18.glb',
    scale: 1.0,               // 实测全长 7.06m 含炮管（实车 6.65m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_13', 'Object_16', 'Object_9', 'Object_14'],   // 炮塔壳+吊篮+炮盾鼓包（含天线）+炮塔储物杂件（Object_14 切出炮管后的剩余部分：篮/油桶/架/帆布，随炮塔）
      barrel: ['barrelTube', 'Object_15', 'Object_12', 'Object_17'],   // 炮管+炮尾+摇架+炮闩（随俯仰）
      mg: ['Object_5', 'Object_2', 'Object_6'],            // 车顶 M2HB 12.7mm 环架+弹药箱——右键发射（随炮塔+伺服回转）
      track: ['Object_3', 'Object_4'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3', 'wheelRT4',
               'wheelLT1', 'wheelLT2', 'wheelLT3', 'wheelLT4'],
    },
    turretPivot: [0, 1.32, -0.13],       // 炮塔座圈（Object_16 吊篮底环带圆拟合 x-0.01/z-0.13）
    barrelPivot: [-0.05, 1.87, 0.95],    // 炮盾耳轴（barrelTube 轴线实测 y1.87）
    muzzleLocal: [-0.05, 1.87, 4.21],    // 炮口（barrelTube 前端）
    exhaustLocal: [[0.80, 1.40, -2.89], [-0.80, 1.40, -2.89]],   // md 排气烟点×2.56（车尾甲板双管）
    trackLocal: [[-1.24, 0.1, 0], [1.24, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 7.5 格，底段 dv/dz>0 无需 flip）
    // —— 实车性能 ——
    mass: 17700,                // 战斗全重 17.7t
    engineHp: 350,              // 大陆 R-975-C1 星型 9 缸
    maxSpeedForward: 89 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 89 / 3.6,         // 24.7 m/s ≈89km/h（公路 55mph，二战最快履带车辆）
    offroadK: 0.47,             // 越野极速 ≈42km/h（史实，26mph；全场越野最快）
    revSpeed: 2.6,
    enginePower: 4.0,           // 19.8hp/t（仅次克伦威尔）
    powerFalloff: 0.58,
    clutchDelay: 0.35,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.40,
    slopePower: 0.55,
    hullTraverse: 0.7,          // Torqmatic 双流可原位转向
    turretTraverse: 0.35,       // 液压驱动 ≈20°/s
    gunDepression: -9.0,
    gunElevation: 19.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：76mm M1A1 L/52 ——
    gunCaliber: 76,
    shellName: 'M62 APC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 792,
    shellPen: 105,               // mm RHA @0m（30° 口径基准：史实30° 98@500/90@1000/83@1500/76@2000）
    shellPenDrop: 0.14,          // 每千米穿深衰减比例
    apcrShell: { name: 'M93 HVAP', nameCn: '钨芯穿甲弹', velocity: 1036, pen: 178, penDrop: 0.22 },  // 次口径钨芯弹（3 键；158@500/99@2000）
    heShellName: 'M42A1',
    heVelocity: 820,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 22, apcr: 4, he: 19 },   // 史实弹药分配
    spallPower: 100,
    reloadTime: 5.5,            // s 人工装填（战斗室宽裕射速快）
    dispersion: 0.00033,        // σ：76mm M1A1
    aimTime: 1.8,
    // —— 装甲（mm RHA；纸甲开顶）——
    armor: {
      hullFront: 13, hullSide: 13, hullRear: 13, hullTop: 8,
      turretFront: 25, turretSide: 19, turretRear: 19,
    },
    // —— 装甲判定模型（板图 v2：按模型实测轮廓铺板，史实厚度；开顶炮塔无顶板）——
    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.25, y1: 1.35, z0: -2.85, z1: 2.6 },
        plates: [
          { name: '首上', face: 'front', t: 12.7, pos: [0, 1.15, 2.14], size: [2.5, 1.09], rot: [-45.5, 0, 0] },
          { name: '首下', face: 'front', t: 12.7, pos: [0, 0.5, 2.23], size: [2.5, 0.73], rot: [41, 0, 0] },
          { name: '车尾', face: 'rear', t: 12.7, pos: [0, 1, -2.68], size: [2.5, 1.1], rot: [-17, 0, 0] },
          { name: '侧上', face: 'side', t: 12.7, pos: [1.08, 1.05, 0], size: [5.4, 0.65], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 12.7, pos: [1.24, 0.55, 0], size: [5.4, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 8, pos: [0, 1.33, -0.1], size: [2.2, 5.2], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.11, x1: 1.11, y0: 1.32, y1: 2.5, z0: -1.86, z1: 1.05 },
        plates: [
          { name: '炮盾', face: 'front', t: 25.4, pos: [0, 1.95, 1], size: [1.45, 0.9], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 25.4, pos: [-0.85, 1.95, 0.72], size: [0.6, 0.9], rot: [0, -60, 0] },
          { name: '炮塔正面', face: 'front', t: 25.4, pos: [0.85, 1.95, 0.72], size: [0.6, 0.9], rot: [0, 60, 0] },
          { name: '炮塔尾部', face: 'rear', t: 19, pos: [0, 1.9, -1.86], size: [2, 1], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 19, pos: [0.98, 1.9, -0.4], size: [2.8, 1], rot: [0, 90, 0], mirror: true },
        ],
        extras: [],
      },
    },
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.014, range: 600, ammoMax: 1000 },   // M2HB 12.7mm
    // —— 内部布局（驾驶左前/副驾右前；炮手右前/车长右后/装填手左）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: 0.4, y: 1.95, z: -0.5, r: 0.34 },
        { id: 'gunner', name: '炮手', x: 0.35, y: 1.85, z: 0.35, r: 0.32 },
        { id: 'loader', name: '装填手', x: -0.4, y: 1.85, z: 0, r: 0.34 },
        { id: 'driver', name: '驾驶员', x: -0.5, y: 1, z: 1.64, r: 0.33 },
        { id: 'radio', name: '通讯员', x: 0.5, y: 1, z: 1.71, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 0.85, z: -2, r: 0.47 }],
        fuel: [{ x: -0.68, y: 0.74, z: -1.6, r: 0.4 }, { x: 0.64, y: 0.85, z: -1.6, r: 0.4 }],
        ammoRacks: [{ x: -0.66, y: 0.8, z: 0.24, r: 0.4 }, { x: 0.58, y: 0.8, z: 0.35, r: 0.4 }, { x: 0, y: 1.8, z: -1.18, r: 0.4 }],
        breech: [{ x: -0.05, y: 1.87, z: 0.3, r: 0.38 }],
        turretDrive: [{ x: -0.3, y: 1.35, z: 0.3, r: 0.3 }],
        optics: [{ x: 0.35, y: 2.1, z: 0.7, r: 0.26 }],
      },
      ringY: 1.32,
      trackX: 1.24, trackY: 1,
    },
    dims: { length: 5.45, width: 2.87, hullHeight: 1.35, turretTop: 2.55 },
    trackWidth: 0.35,
    ammo: { shell: 45, mg: 1000 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/76mm-fire.mp3',                 // 第三人称开炮：76mm M1A2（敞开炮塔，与镜内同声）
      fireAim: 'tankSound/rus/76mm-fire.mp3',              // 瞄准镜开炮：同上（敞篷无舱内音差）
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── M36 GMC 杰克逊坦克歼击车（美）────────────────────
  // M10A1 底盘换 90mm M3 重炮（与 M26 同弹道）；开顶大尾舱配重炮塔（后部 127mm 配重甲）
  // 轮系：scripts/split-wheels-td.js m36 离线切出（VVSS 平衡肘合并件，分量 bbox 中心贴近归桶：
  //   6 负重轮/前主动/后诱导/3 回转轮每侧，共 22 轮）；Object_8 清出 roofMg（散落车体件留静态）
  'm36': {
    caliber: 90,             // mm 主炮口径（跳弹口径碾压用）
    openTop: true,           // 开顶配重炮塔：开镜不启用舱内发动机衰减（audio 新式引擎）
    id: 'm36',
    nation: 'us',
    reticle: 'us2',           // M76 望远镜静态分划
    zoomFov: 20.7,            // M76 固定 3× 视场
    aiRole: 'ambusher',
    aiTraits: { scootChance: 0.5 },                   // TD 心态：远距、避近战（与 M10 同族，有炮塔特例）
    name: 'M36 杰克逊',
    nameEn: 'M36 Jackson',
    model: 'model/opt/m36_gmc.glb',
    scale: 1.0,               // 实测全长 7.65m 含炮管（实车 7.46m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_11', 'Object_12'],                  // 炮塔壳+外挂件（含尾部配重舱）
      barrel: ['Object_13', 'Object_3', 'Object_10'],      // 炮管+制退器+炮尾摇架（随俯仰）
      mg: ['roofMg', 'Object_21', 'Object_5'],             // 车尾顶部 M2HB 12.7mm——右键发射（随炮塔+伺服回转）
      track: ['Object_4', 'Object_6'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3',
               'wheelLT1', 'wheelLT2', 'wheelLT3'],
    },
    turretPivot: [0.04, 1.55, -0.16],    // 炮塔座圈（Object_12 底环带圆拟合，r0.83 与实车 1.75m 座圈吻合）
    barrelPivot: [0, 2.09, 0.9],         // 炮盾耳轴（Object_13 炮盾段 z0.8~1.0）
    muzzleLocal: [0, 2.09, 4.07],        // 炮口（Object_3 制退器前端，轴线 y2.09）
    exhaustLocal: [[0.27, 0.83, -2.48], [-0.31, 0.83, -2.29]],   // md 排气烟点×2.56
    trackLocal: [[-1.06, 0.1, 0], [1.06, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 7.8 格）
    trackScrollFlip: true,      // 底段 dv/dz<0（V 车尾高、车头低）：前进时 offset 须递减
    // —— 实车性能 ——
    mass: 28100,                // 战斗全重 28.1t
    engineHp: 450,              // Ford GAA V8
    maxSpeedForward: 42 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 42 / 3.6,         // 11.7 m/s ≈42km/h（公路，史实）
    offroadK: 0.55,             // 越野极速 ≈23km/h（M10 底盘同族）
    revSpeed: 2.4,
    enginePower: 3.3,           // 16hp/t
    powerFalloff: 0.58,
    clutchDelay: 0.4,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.55,
    hullTraverse: 0.65,
    turretTraverse: 0.35,       // 液压驱动 ≈20°/s（M36 换装液压转向，优于 M10 手摇）
    gunDepression: -10.0,
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：90mm M3 L/53（与 M26 同弹道）——
    gunCaliber: 90,
    shellName: 'M82 APCBC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 853,
    shellPen: 137,               // mm RHA @0m（30° 口径基准：M82 后期强装药 853m/s；史实30° 129@500/122@1000/114@1500/106@2000）
    shellPenDrop: 0.11,          // 每千米穿深衰减比例
    apcrShell: { name: 'M304 HVAP', nameCn: '钨芯穿甲弹', velocity: 1021, pen: 243, penDrop: 0.18 },  // 次口径钨芯弹（3 键；221@500/156@2000）
    heShellName: 'M71',
    heVelocity: 810,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 25, apcr: 4, he: 18 },   // 史实弹药分配
    spallPower: 120,
    reloadTime: 8.0,            // s 人工装填
    dispersion: 0.00020,        // σ：90mm M3
    aimTime: 2.2,
    heShell: { power: 1.0, nearMissR: 2 },   // 90mm M71 HE
    // —— 装甲（mm RHA；M10 底盘 51 正面，大尾舱炮塔）——
    armor: {
      hullFront: 51, hullSide: 25, hullRear: 25, hullTop: 13,
      turretFront: 76, turretSide: 51, turretRear: 127,
    },
    // —— 装甲判定模型（板图 v2：按模型实测轮廓铺板；开顶炮塔无顶板，尾舱 127 配重甲）——
    armorModel: {
      hull: {
        box: { x0: -1.1, x1: 1.1, y0: 0.25, y1: 1.4, z0: -3.5, z1: 2.6 },
        plates: [
          { name: '首上', face: 'front', t: 51, pos: [0, 1.28, 2.03], size: [2.3, 1.67], rot: [-56.5, 0, 0] },
          { name: '首下', face: 'front', t: 51, pos: [0, 0.6, 2.45], size: [2.3, 0.65], rot: [36, 0, 0] },
          { name: '车尾', face: 'rear', t: 25, pos: [0, 1.01, -3.15], size: [2.2, 1.5], rot: [31, 0, 0] },
          { name: '侧上', face: 'side', t: 25, pos: [0.98, 1.01, -0.12], size: [5.6, 1.29], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 19, pos: [1.1, 0.55, 0], size: [5.6, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 12.7, pos: [0, 1.4, -0.55], size: [2.34, 5.4], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.11, x1: 1.11, y0: 1.55, y1: 2.58, z0: -2.46, z1: 0.98 },
        plates: [
          { name: '炮盾', face: 'front', t: 76, pos: [0, 2.07, 0.95], size: [1.52, 0.9], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 76, pos: [-0.9, 2, 0.5], size: [1.02, 1.02], rot: [0, -70, 0] },
          { name: '炮塔正面', face: 'front', t: 76, pos: [0.9, 2, 0.5], size: [1.04, 1.02], rot: [0, 71.5, 0] },
          { name: '炮塔尾部', face: 'rear', t: 127, pos: [0, 2.05, -2.17], size: [2, 1], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 51, pos: [1.05, 2, -1.04], size: [2.34, 1], rot: [0, 90, 0], mirror: true },
        ],
        extras: [],
      },
    },
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.014, range: 600, ammoMax: 1200 },   // M2HB 12.7mm
    // —— 内部布局（驾驶左前/副驾右前；炮手右前/车长右后/装填手左后）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: 0.4, y: 2.15, z: -0.7, r: 0.34 },
        { id: 'gunner', name: '炮手', x: 0.35, y: 2, z: 0.3, r: 0.32 },
        { id: 'loader', name: '装填手', x: -0.4, y: 2, z: -0.5, r: 0.34 },
        { id: 'driver', name: '驾驶员', x: -0.5, y: 1.05, z: 1.64, r: 0.33 },
        { id: 'radio', name: '通讯员', x: 0.5, y: 1.05, z: 1.57, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 1, z: -2.1, r: 0.6 }],
        fuel: [{ x: -0.62, y: 0.9, z: -1.8, r: 0.42 }, { x: 0.51, y: 0.9, z: -1.8, r: 0.42 }],
        ammoRacks: [{ x: -0.62, y: 0.9, z: 0.4, r: 0.42 }, { x: 0.51, y: 0.9, z: 0.4, r: 0.42 }, { x: 0, y: 2.17, z: -1.38, r: 0.34 }],
        breech: [{ x: 0, y: 2, z: 0.2, r: 0.37 }],
        turretDrive: [{ x: -0.3, y: 1.55, z: 0.2, r: 0.32 }],
        optics: [{ x: 0.3, y: 2.14, z: 0.6, r: 0.28 }],
      },
      ringY: 1.55,
      trackX: 1.06, trackY: 1,
    },
    dims: { length: 5.97, width: 3.05, hullHeight: 1.4, turretTop: 2.72 },
    trackWidth: 0.4,
    ammo: { shell: 47, mg: 1200 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/usa/m26-90mm-inner.mp3',            // 第三人称开炮：90mm（敞开炮塔，与镜内同声）
      fireAim: 'tankSound/usa/m26-90mm-inner.mp3',         // 瞄准镜开炮：同上（敞篷无舱内音差）
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── 克伦威尔 Cromwell IV（英）────────────────────
  'cromwell': {
    caliber: 75,             // mm 主炮口径（跳弹口径碾压用）
    id: 'cromwell',
    nation: 'uk',
    reticle: 'us2',           // 暂用美系 M82 静态分划（后续换英制 No.41 样式）
    zoomFov: 21,
    aiRole: 'scout',
    aiTraits: { fleeOnConfirm: true },                // 高速巡航：被确认即脱离
    name: '克伦威尔 Mk IV',
    nameEn: 'Cromwell Mk IV',
    model: 'model/opt/cromwell_iv.glb',
    scale: 1.0,               // 实测全长 6.81m（实车 6.42m）≈1:1
    forwardAxis: '+x',
    parts: {
      turret: ['turret001_cromwell-iv-turret_4_0', 'weapon2001_cromwell-iv-hull_0_0',
               'turret_lens_cromwell-iv-turret_4_0', 'interior_turret_cromwell-iv-interior_3_0',
               'hatch2b_cromwell-iv-turret_4_0', 'hatch2001_cromwell-iv-turret_4_0',
               'hatchb_cromwell-iv-turret_4_0', 'hatch001_cromwell-iv-turret_4_0'],
      mg: ['weapon2001_cromwell-iv-hull_0_0'],        // 同轴 Besa 7.92mm——右键发射
      hullMg: ['weapon3001_cromwell-iv-hull_0_0'],    // 车体前机枪 Besa——F 发射
      barrel: ['weapon001_cromwell-iv-turret_4_0', 'mount001_cromwell-iv-turret_4_0'],
      track: ['track001_cromwell-iv-tracks_2_0', 'track2_cromwell-iv-tracks_2_0'],
      wheels: ['wheel001_cromwell-iv-wheel_1_0', 'wheel2_cromwell-iv-wheel_1_0',
               'wheel3_cromwell-iv-wheel_1_0', 'wheel4_cromwell-iv-wheel_1_0',
               'wheel5_cromwell-iv-wheel_1_0', 'wheel6_cromwell-iv-wheel_1_0',
               'wheel7_cromwell-iv-wheel_1_0', 'wheel8_cromwell-iv-wheel_1_0',
               'wheel9_cromwell-iv-wheel_1_0', 'wheel10_cromwell-iv-wheel_1_0',
               'wheel11_cromwell-iv-wheel_1_0', 'wheel12_cromwell-iv-wheel_1_0',
               'wheel13_cromwell-iv-wheel_1_0', 'wheel14_cromwell-iv-wheel_1_0'],
    },
    turretPivot: [0.05, 1.50, 0.43],
    barrelPivot: [0, 1.78, 1.40],
    muzzleLocal: [0, 1.78, 3.40],
    exhaustLocal: [[0.56, 1.36, -2.82], [-0.46, 1.34, -2.82]],   // md 排气烟点×2.56
    trackLocal: [[-1.24, 0.1, 0], [1.24, 0.1, 0]],
    trackScrollAxis: 'x',
    mass: 28000,
    engineHp: 600,               // 劳斯莱斯流星（梅林减功率版）
    maxSpeedForward: 52 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 52 / 3.6,          // 14.4 m/s（公路，调速器限速，解除可达 64）
    offroadK: 0.54,              // 越野极速 ≈28km/h（史实）
    revSpeed: 2.6,
    enginePower: 4.2,            // 功重比全场最高
    powerFalloff: 0.58,
    clutchDelay: 0.38,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.40,
    slopePower: 0.55,
    hullTraverse: 0.7,
    turretTraverse: 0.35,        // 液压转向
    gunDepression: -12.0,
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：75mm QF Mk V ——
    gunCaliber: 75,
    shellName: 'M61 APC',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 620,
    shellPen: 71,               // mm RHA @0m（30° 口径基准：史实30° 66@500/60@1000/55@1500/50@2000）
    shellPenDrop: 0.15,          // 每千米穿深衰减比例
    heShellName: 'M48',
    heVelocity: 625,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 30, apcr: 0, he: 34 },   // 史实弹药分配
    spallPower: 85,
    reloadTime: 5.5,             // 分装轻便，射速快
    dispersion: 0.00036,         // σ：75mm ROQF
    aimTime: 1.8,
    // —— 装甲（mm RHA；铆接箱体，近垂直）——
    armor: {
      hullFront: 63,  hullSide: 32, hullRear: 32, hullTop: 20,
      turretFront: 76, turretSide: 63, turretRear: 57,
    },
    // —— 装甲判定模型（板图 v2；2026-09-15 编辑器调参导出）——
    armorModel: {
      hull: {
        box: { x0: -1.15, x1: 1.15, y0: 0.25, y1: 1.77, z0: -3.21, z1: 3.04 },
        plates: [
          { name: '首上', face: 'front', t: 63, pos: [0, 1.15, 2.9], size: [2.3, 0.73], rot: [4, 0, 0] },
          { name: '首下', face: 'front', t: 63, pos: [0, 0.6, 2.84], size: [2.3, 0.65], rot: [31, 0, 0] },
          { name: '车尾', face: 'rear', t: 32, pos: [0, 0.87, -3.02], size: [2.3, 1.45], rot: [0, 0, 0] },
          { name: '侧上', face: 'side', t: 32, pos: [1.12, 1.22, 0], size: [6.1, 0.65], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 25, pos: [1.14, 0.65, 0], size: [6.1, 0.85], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.5, 0], size: [2.3, 6.1], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.07, x1: 1.07, y0: 1.45, y1: 2.55, z0: -0.57, z1: 1.44 },
        plates: [
          { name: '炮盾', face: 'front', t: 76, pos: [0, 1.9, 1.57], size: [0.6, 0.76], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 76, pos: [0, 1.89, 1.45], size: [2.1, 0.79], rot: [0, 0, 0] },
          { name: '炮塔尾部', face: 'rear', t: 57, pos: [0, 1.86, -0.52], size: [2.0, 0.8], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 63, pos: [1.02, 1.87, 0.47], size: [2.02, 0.79], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 20, pos: [0, 2.24, 0.45], size: [2.1, 2.0], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 4950 },
    hullMgArc: 0.26,
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: 0.35,  y: 1.86, z: -0.10, r: 0.32 },
        { id: 'gunner',    name: '炮手',   x: -0.35, y: 1.78, z: 0.75,  r: 0.30 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 1.86, z: 0.40,  r: 0.32 },
        { id: 'driver',    name: '驾驶员', x: 0.50,  y: 1.10, z: 2.14,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: -0.50, y: 1.10, z: 2.14,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 0.94, z: -1.89,  r: 0.52 }],
        fuel:        [{ x: -0.60, y: 0.90, z: -2.60,  r: 0.40 }, { x: 0.60, y: 0.90, z: -2.60, r: 0.40 }],
        ammoRacks:   [{ x: -0.55, y: 1.10, z: -0.12, r: 0.39 }, { x: 0.65, y: 1.10, z: -0.05, r: 0.39 }],
        breech:      [{ x: 0,     y: 1.95, z: 1.10,  r: 0.30 }],
        turretDrive: [{ x: 0.30,  y: 1.36, z: 0.80,  r: 0.34 }],
        optics:      [{ x: -0.62, y: 1.86, z: 1.00,  r: 0.26 }],
      },
      ringY: 1.50,
      trackX: 1.24, trackY: 0.98,
    },
    dims: { length: 6.17, width: 2.9, hullHeight: 1.77, turretTop: 2.55 },
    trackWidth: 0.35,
    ammo: { shell: 64, mg: 4950 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/uk/57mm-fire.mp3',                 // 第三人称开炮：57mm QF 6pdr
      fireAim: 'tankSound/uk/57mm-inner.mp3',              // 瞄准镜开炮：57mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── T-34-85（苏）────────────────────
  't34-85': {
    caliber: 85,             // mm 主炮口径（跳弹口径碾压用）
    id: 't34-85',
    nation: 'ru',
    reticle: 'su2',           // TSh-16 望远镜静态分划
    zoomFov: 15.5,            // TSh-16 固定 4× 视场
    aiRole: 'brawler',
    aiTraits: { preferRangeK: 0.6 },                  // 冲锋 doctrine 载体
    name: 'T-34-85',
    nameEn: 'T-34-85',
    model: 'model/opt/t-34-85_85_mm.glb',
    scale: 1.0,               // 实测全长 8.18m 含炮管（实车 8.15m）=1:1
    forwardAxis: '+x',
    parts: {
      turret: ['Object_38'],
      barrel: ['Object_40'],
      track: ['Object_6', 'Object_4'],
      wheels: ['Object_22', 'Object_24', 'Object_26', 'Object_28', 'Object_30', 'Object_32', 'Object_34',
               'Object_8', 'Object_10', 'Object_12', 'Object_14', 'Object_16', 'Object_18', 'Object_20'],
    },
    // md 未标注机枪节点：同轴 DT 用虚拟枪口点（炮盾右侧）
    mgMuzzleLocal: [-0.25, 2.05, 2.10],
    turretPivot: [0, 1.60, 0.50],
    barrelPivot: [0, 2.01, 1.70],
    muzzleLocal: [0, 2.01, 5.22],
    exhaustLocal: [[0.39, 0.78, -3.06], [-0.39, 0.78, -3.05]],   // md 排气烟点×2.56
    trackLocal: [[-1.23, 0.1, 0], [1.23, 0.1, 0]],
    trackScrollAxis: 'y',       // T-34 履带 UV 纵向=V（实测 vRange 跨 12 格；滚 U 横向滑贴图）
    trackScrollFlip: true,      // V 轴绕向相反：前进时 offset 递减（否则前进呈倒车式滑动）
    mass: 32000,
    engineHp: 500,               // V-2-34 柴油机
    maxSpeedForward: 53 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 53 / 3.6,          // 14.7 m/s ≈53km/h（公路，史实）
    offroadK: 0.53,              // 越野极速 ≈28km/h（史实）
    revSpeed: 2.4,
    enginePower: 3.5,
    powerFalloff: 0.56,
    clutchDelay: 0.42,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.58,
    hullTraverse: 0.45,          // 离合-制动转向：无原位转向，原地只能刹单边磨蹭（史实短板）
    turretTraverse: 0.30,        // 电动+手摇
    gunDepression: -5.0,         // 苏系俯角短板
    gunElevation: 22.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：85mm ZiS-S-53 ——
    gunCaliber: 85,
    shellName: 'BR-365A APHEBC',
    shellNameCn: '风帽穿甲弹',
    shellVelocity: 792,
    shellPen: 112,               // mm RHA @0m（30° 口径基准：史实30° 103@500/94@1000/86@1500/77@2000）
    shellPenDrop: 0.16,          // 每千米穿深衰减比例
    apcrShell: { name: 'BR-365P APCR', nameCn: '钨芯穿甲弹', velocity: 1030, pen: 132, penDrop: 0.33 },  // 次口径钨芯弹（3 键；110@500/45@2000）
    heShellName: 'O-365K',
    heVelocity: 792,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 30, apcr: 4, he: 26 },   // 史实弹药分配
    spallPower: 115,             // BR-365 装药量大，后效凶猛
    reloadTime: 7.5,
    dispersion: 0.00045,         // σ：ZiS-S-53（苏炮公差大，1000m ~0.6m）
    aimTime: 2.1,
    // —— 装甲（mm RHA；全车大倾角）——
    armor: {
      hullFront: 45,  hullSide: 45, hullRear: 45, hullTop: 20,
      turretFront: 90, turretSide: 75, turretRear: 52,
    },
    // —— 装甲判定模型（板图 v2；2026-09-15 编辑器调参导出）——
    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.44, y1: 1.77, z0: -2.93, z1: 3.10 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 45, pos: [0, 1.24, 2.31], size: [2.4, 1.88], rot: [-60, 0, 0] },
          { name: '首下', face: 'front', t: 45, pos: [0, 0.61, 2.73], size: [2.4, 0.75], rot: [50, 0, 0] },
          { name: '车尾', face: 'rear', t: 45, pos: [0, 1.13, -2.74], size: [2.4, 1.55], rot: [35, 0, 0] },
          { name: '侧上', face: 'side', t: 45, pos: [1.2, 1.35, 0], size: [6.0, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 20, pos: [1.23, 0.65, 0], size: [6.0, 0.8], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.77, 0], size: [2.4, 6.0], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.02, x1: 1.02, y0: 1.6, y1: 2.72, z0: -0.83, z1: 1.99 },
        plates: [
          { name: '炮盾', face: 'front', t: 90, pos: [0, 2.13, 2.02], size: [1.15, 0.67], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 90, pos: [0, 2.15, 1.5], size: [1.9, 0.85], rot: [-10, 0, 0] },
          { name: '炮塔尾部', face: 'rear', t: 52, pos: [0, 2.15, -0.75], size: [1.9, 0.9], rot: [5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 75, pos: [0.95, 2.15, 0.41], size: [2.38, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 20, pos: [0, 2.52, 0.5], size: [2.0, 2.6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    mg: { rate: 10, dispersion: 0.016, range: 550, ammoMax: 1900 },
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.30, y: 2.10, z: 0.30,  r: 0.33 },
        { id: 'gunner',    name: '炮手',   x: -0.30, y: 2.20, z: 0.90,  r: 0.30 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 2.20, z: 0.50,  r: 0.33 },
        { id: 'driver',    name: '驾驶员', x: -0.45, y: 1.10, z: 1.57,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.45,  y: 1.10, z: 1.50,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.00, z: -1.82,  r: 0.57 }],
        fuel:        [{ x: -0.85, y: 1.10, z: -0.90,  r: 0.42 }, { x: 0.85, y: 1.10, z: -0.90, r: 0.42 }],
        ammoRacks:   [{ x: 0.60,  y: 1.29, z: 0.72,  r: 0.44 }, { x: 0, y: 1.90, z: -0.33, r: 0.33 }],
        breech:      [{ x: 0,     y: 2.05, z: 1.30,  r: 0.32 }],
        turretDrive: [{ x: -0.25, y: 1.60, z: 0.30,  r: 0.34 }],
        optics:      [{ x: -0.25, y: 2.14, z: 1.10,  r: 0.28 }],
      },
      ringY: 1.60,
      trackX: 1.23, trackY: 1.00,
    },
    dims: { length: 6.03, width: 3.0, hullHeight: 1.77, turretTop: 2.72 },
    trackWidth: 0.54,
    ammo: { shell: 60, mg: 1900 },
    sound: {
      drive: 'tankSound/rus/t34-egAll.mp3',                // 新式发动机（单文件三段，与 SU-100 共用）：前 4.9s=加速段 / 巡航 / 13.8s 起=减速停车段
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/t34-85mm-fire1.mp3',           // 第三人称开炮：85mm ZiS-S-53
      fireAim: 'tankSound/rus/t34-85mm-inner.mp3',         // 瞄准镜开炮：85mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.24, driveDecelStart: 13.8 },
    },
  },

  // ── T-34-85（精英）特型（苏）────────────────────
  // 精英车组特型：装甲模型/火力/机动参数与 t34-85 完全一致；装填 -0.8s、极速 +15%（53→61km/h）、
  // 炮塔转速 +10%（0.30→0.33）。新模型 tankModel/t-34-85.glb（同 Sketchfab 作者 T-34 族）：
  // 轮系 scripts/split-wheels-td.js t3485e 离线切出（14 轮：5 负重轮/后主动/前诱导每侧；
  // Object_20/25 各焊死前诱导+后主动，Object_24/30 混入塔顶/翼子板散件已归桶退回车体）；
  // Object_13 双 DT 合并件按 y 分簇：下簇 hullMgDt（车体前机枪 F）/ 上簇同轴 DT（随炮塔，右键）
  't34-85e': {
    caliber: 85,
    id: 't34-85e',
    nation: 'ru',
    reticle: 'su2',           // TSh-16 望远镜静态分划
    zoomFov: 15.5,            // TSh-16 固定 4× 视场
    aiRole: 'brawler',
    aiTraits: { preferRangeK: 0.6 },
    name: 'T-34-85（精英）',
    nameEn: 'T-34-85 Elite',
    model: 'model/opt/t3485e.glb',
    scale: 1.0,               // 实测全长 8.33m 含炮管（实车 8.15m）≈1:1
    forwardAxis: '+z',        // 模型已 +Z 朝前、+Y 朝上，无需烘焙
    modelYOffset: 0.064,      // 模型履带底 -0.064（2026-10-09 实测沉地），抬升到履带接地
    // —— 部件节点名（Tank Model Maker v2.3 标注，见 tankModel/t-34-85.md）——
    parts: {
      turret: ['Object_14', 'Object_15', 'Object_9', 'Object_4'],   // 炮塔结构+车长塔+天线
      mg: ['Object_13'],        // 同轴 DT（split 后仅上簇，随炮塔）——右键发射
      hullMg: ['hullMgDt'],     // 车体前 DT（split 下簇）——F 发射·射界内自动瞄准
      barrel: ['Object_12', 'Object_6'],   // 85mm ZiS-S-53 炮管+炮口段（随俯仰）
      track: ['Object_2', 'Object_7'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI'],
      // md 标注隐藏件：变体/内饰件
      hidden: ['Object_10', 'Object_11', 'Object_36', 'Object_37'],
    },
    turretPivot: [0, 1.60, 0.60],      // 炮塔座圈（环带圆拟合 y1.5~1.62 r0.81）
    barrelPivot: [-0.03, 2.00, 1.70],  // 炮盾耳轴（炮管轴线实测 y2.00）
    muzzleLocal: [-0.03, 2.00, 5.14],  // 炮口（Object_12/6 前端实测）
    exhaustLocal: [[0.42, 0.86, -2.87], [-0.35, 0.85, -2.87]],   // md 排气烟点×2.56
    trackLocal: [[-1.24, 0.1, 0], [1.24, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 跨 12.2 格）
    trackScrollFlip: false,     // 实测底段 dv/dz>0：前进 offset 递增即正向
    mass: 32000,
    engineHp: 500,               // V-2-34 柴油机
    maxSpeedForward: 61 / 3.6,   // 精英 +15%：53→61km/h
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 61 / 3.6,
    offroadK: 0.53,              // 越野极速 ≈32km/h（随公路 +15%）
    revSpeed: 2.4,
    enginePower: 4.0,            // 精英动力调校（+15% 加速匹配）
    powerFalloff: 0.56,
    clutchDelay: 0.42,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.58,
    hullTraverse: 0.45,          // 离合-制动转向：无原位转向（史实短板）
    turretTraverse: 0.33,        // 精英 +10%：0.30→0.33
    gunDepression: -5.0,         // 苏系俯角短板
    gunElevation: 22.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：85mm ZiS-S-53（与 t34-85 一致；装填 7.5-0.8=6.7s）——
    gunCaliber: 85,
    shellName: 'BR-365A APHEBC',
    shellNameCn: '风帽穿甲弹',
    shellVelocity: 792,
    shellPen: 112,               // mm RHA @0m（30° 口径基准：史实30° 103@500/94@1000/86@1500/77@2000）
    shellPenDrop: 0.16,
    apcrShell: { name: 'BR-365P APCR', nameCn: '钨芯穿甲弹', velocity: 1030, pen: 132, penDrop: 0.33 },
    heShellName: 'O-365K',
    heVelocity: 792,
    loadout: { ap: 30, apcr: 4, he: 26 },
    spallPower: 115,
    reloadTime: 6.7,             // 精英车组装填 -0.8s（7.5→6.7）
    dispersion: 0.00045,
    aimTime: 2.1,
    // —— 装甲（mm RHA；与 t34-85 完全一致）——
    armor: {
      hullFront: 45,  hullSide: 45, hullRear: 45, hullTop: 20,
      turretFront: 90, turretSide: 75, turretRear: 52,
    },
    // —— 装甲判定模型（板图 v2；用户指定与现有 t34-85 一致，整块沿用）——
    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.44, y1: 1.77, z0: -2.93, z1: 3.10 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 45, pos: [0, 1.24, 2.31], size: [2.4, 1.88], rot: [-60, 0, 0] },
          { name: '首下', face: 'front', t: 45, pos: [0, 0.61, 2.73], size: [2.4, 0.75], rot: [50, 0, 0] },
          { name: '车尾', face: 'rear', t: 45, pos: [0, 1.13, -2.74], size: [2.4, 1.55], rot: [35, 0, 0] },
          { name: '侧上', face: 'side', t: 45, pos: [1.2, 1.35, 0], size: [6.0, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 20, pos: [1.23, 0.65, 0], size: [6.0, 0.8], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.77, 0], size: [2.4, 6.0], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.02, x1: 1.02, y0: 1.6, y1: 2.72, z0: -0.83, z1: 1.99 },
        plates: [
          { name: '炮盾', face: 'front', t: 90, pos: [0, 2.13, 2.02], size: [1.15, 0.67], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 90, pos: [0, 2.15, 1.5], size: [1.9, 0.85], rot: [-10, 0, 0] },
          { name: '炮塔尾部', face: 'rear', t: 52, pos: [0, 2.15, -0.75], size: [1.9, 0.9], rot: [5, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 75, pos: [0.95, 2.15, 0.41], size: [2.38, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 20, pos: [0, 2.52, 0.5], size: [2.0, 2.6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    mg: { rate: 10, dispersion: 0.016, range: 550, ammoMax: 1900 },
    hullMgArc: 0.26,
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.30, y: 2.10, z: 0.30,  r: 0.33 },
        { id: 'gunner',    name: '炮手',   x: -0.30, y: 2.20, z: 0.90,  r: 0.30 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 2.20, z: 0.50,  r: 0.33 },
        { id: 'driver',    name: '驾驶员', x: -0.45, y: 1.10, z: 1.57,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.45,  y: 1.10, z: 1.50,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 1.00, z: -1.82,  r: 0.57 }],
        fuel:        [{ x: -0.85, y: 1.10, z: -0.90,  r: 0.42 }, { x: 0.85, y: 1.10, z: -0.90, r: 0.42 }],
        ammoRacks:   [{ x: 0.60,  y: 1.29, z: 0.72,  r: 0.44 }, { x: 0, y: 1.90, z: -0.33, r: 0.33 }],
        breech:      [{ x: 0,     y: 2.05, z: 1.30,  r: 0.32 }],
        turretDrive: [{ x: -0.25, y: 1.60, z: 0.30,  r: 0.34 }],
        optics:      [{ x: -0.25, y: 2.14, z: 1.10,  r: 0.28 }],
      },
      ringY: 1.60,
      trackX: 1.24, trackY: 1.00,
    },
    dims: { length: 6.03, width: 3.0, hullHeight: 1.77, turretTop: 2.72 },
    trackWidth: 0.54,
    ammo: { shell: 60, mg: 1900 },
    sound: {
      drive: 'tankSound/rus/t34-egAll.mp3',                // 新式发动机（单文件三段，与 T-34-85/SU-100 共用）
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/t34-85mm-fire1.mp3',           // 第三人称开炮：85mm ZiS-S-53
      fireAim: 'tankSound/rus/t34-85mm-inner.mp3',         // 瞄准镜开炮：85mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.24, driveDecelStart: 13.8 },
    },
  },

  // ── T-34-57（1943）（苏）────────────────────
  // 1943 年复产的长身管反坦克特化型：57mm ZiS-4 L/73（高初速平弹道）+ 1943 型铸造炮塔。
  // 轮系：scripts/split-wheels-td.js t3457（Object_11 全轮系焊死合并件 → 14 轮）；
  // Object_10 双 DT 合并件按 y 分簇：下簇 hullMgDt（车体前机枪 F）/ 上簇同轴 DT（随炮塔，右键）
  't34-57': {
    caliber: 57,
    id: 't34-57',
    nation: 'ru',
    reticle: 'su2',
    zoomFov: 15.5,
    aiRole: 'brawler',
    aiTraits: { preferRangeK: 0.9 },                    // 高穿长管炮：偏好中远距对射
    name: 'T-34-57（1943）',
    nameEn: 'T-34-57 1943',
    model: 'model/opt/t3457.glb',
    scale: 1.0,               // 实测全长 7.57m 含炮管 ≈1:1
    forwardAxis: '+z',
    // —— 部件节点名（Tank Model Maker v2.3 标注，见 tankModel/t-34-57_1943.md）——
    parts: {
      turret: ['Object_9'],                              // 炮塔结构（整塔）
      mg: ['Object_10'],        // 同轴 DT（split 后仅上簇，随炮塔）——右键发射
      hullMg: ['hullMgDt'],     // 车体前 DT（split 下簇）——F 发射
      barrel: ['Object_15', 'Object_2'],                 // ZiS-4 炮管+炮口段（随俯仰）
      track: ['Object_5', 'Object_6'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI'],
    },
    turretPivot: [-0.03, 1.55, 0.49],  // 炮塔座圈（环带圆拟合 y1.57~1.69）
    barrelPivot: [0.01, 2.03, 1.45],   // 炮盾耳轴（炮管轴线实测 y2.03）
    muzzleLocal: [0.01, 2.03, 4.55],   // 炮口（Object_2 前端实测）
    exhaustLocal: [[0.43, 0.89, -3.00], [-0.36, 0.90, -3.01]],   // md 排气烟点×2.56
    trackLocal: [[-1.26, 0.1, 0], [1.26, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 跨 12.1 格）
    trackScrollFlip: true,      // 底段 dv/dz<0：前进时 offset 须递减
    // —— 实车性能 ——
    mass: 28100,                // 战斗全重 ≈28.1t（比 85 型轻）
    engineHp: 500,              // V-2-34 柴油机
    maxSpeedForward: 53 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 53 / 3.6,         // 公路（史实，T-34 族标准）
    offroadK: 0.55,             // 越野极速 ≈29km/h（较轻车体略优）
    revSpeed: 2.4,
    enginePower: 3.6,           // 17.8hp/t
    powerFalloff: 0.56,
    clutchDelay: 0.42,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.58,
    hullTraverse: 0.45,
    turretTraverse: 0.22,       // 双人炮塔（1943 部分电动）≈13°/s
    gunDepression: -5.0,        // 苏系俯角短板
    gunElevation: 25.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：57mm ZiS-4 L/73 ——
    gunCaliber: 57,
    shellName: 'BR-271K APHEBC',
    shellNameCn: '风帽穿甲弹',
    shellVelocity: 990,
    shellPen: 98,                // mm RHA @0m（30° 口径基准：史实30° ≈88@500/57@2000 两点拟合）
    shellPenDrop: 0.21,          // 每千米穿深衰减比例（小口径高初速衰减偏快）
    apcrShell: { name: 'BR-271P APCR', nameCn: '钨芯穿甲弹', velocity: 1150, pen: 140, penDrop: 0.36 },  // 次口径钨芯弹（3 键；远端衰减快）
    heShellName: 'O-271',
    heVelocity: 990,             // HE 初速逐炮族（史实 ≈AP 初速）
    loadout: { ap: 56, apcr: 4, he: 40 },   // 100 发编制（反坦克型 AP 为主）
    spallPower: 85,              // 57mm 小装药，后效弱
    reloadTime: 5.5,             // s 人工装填（定装小弹快装）
    dispersion: 0.00032,         // σ：ZiS-4（高初速平弹道，精度优于 76 苏炮）
    aimTime: 2.0,
    // —— 装甲（mm RHA；1943 铸造炮塔加厚正面，车体不变）——
    armor: {
      hullFront: 45,  hullSide: 45, hullRear: 45, hullTop: 20,
      turretFront: 70, turretSide: 52, turretRear: 52,
    },
    // —— 装甲判定模型（板图 v2：车体板沿用 T-34 族（45mm 大倾角同构），炮塔按 1943 实测轮廓铺）——
    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.44, y1: 1.77, z0: -2.93, z1: 3.10 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 45, pos: [0, 1.24, 2.31], size: [2.4, 1.88], rot: [-60, 0, 0] },
          { name: '首下', face: 'front', t: 45, pos: [0, 0.61, 2.73], size: [2.4, 0.75], rot: [50, 0, 0] },
          { name: '车尾', face: 'rear', t: 45, pos: [0, 1.13, -2.74], size: [2.4, 1.55], rot: [35, 0, 0] },
          { name: '侧上', face: 'side', t: 45, pos: [1.2, 1.35, 0], size: [6.0, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 20, pos: [1.23, 0.65, 0], size: [6.0, 0.8], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.77, 0], size: [2.4, 6.0], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.95, x1: 0.95, y0: 1.47, y1: 2.57, z0: -0.65, z1: 1.60 },
        plates: [
          { name: '炮盾', face: 'front', t: 70, pos: [0, 2.00, 1.45], size: [1.1, 0.70], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 70, pos: [-0.60, 1.98, 1.20], size: [0.75, 0.80], rot: [0, -42, 0] },
          { name: '炮塔正面', face: 'front', t: 70, pos: [0.60, 1.98, 1.20], size: [0.75, 0.80], rot: [0, 42, 0] },
          { name: '炮塔尾部', face: 'rear', t: 52, pos: [0, 1.95, -0.55], size: [1.6, 0.85], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 52, pos: [0.90, 1.95, 0.35], size: [2.1, 0.90], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 20, pos: [0, 2.50, 0.40], size: [1.8, 2.0], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    mg: { rate: 10, dispersion: 0.016, range: 550, ammoMax: 3000 },
    hullMgArc: 0.26,
    // —— 内部布局（史实 4 乘员：双人炮塔车长兼炮手；驾驶左前/通讯员右前）——
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.30, y: 1.95, z: 0.35,  r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 1.95, z: 0.20,  r: 0.33 },
        { id: 'driver',    name: '驾驶员', x: -0.45, y: 1.05, z: 1.60,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.45,  y: 1.05, z: 1.50,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 0.95, z: -1.90,  r: 0.55 }],
        fuel:        [{ x: -0.85, y: 1.00, z: -0.70,  r: 0.42 }, { x: 0.85, y: 1.00, z: -0.70, r: 0.42 }],
        ammoRacks:   [{ x: 0.60,  y: 1.10, z: 0.70,  r: 0.40 }, { x: -0.60, y: 1.10, z: 0.70, r: 0.40 },
                      { x: 0,     y: 1.85, z: -0.40, r: 0.30 }],
        breech:      [{ x: 0,     y: 2.00, z: 1.10,  r: 0.32 }],
        turretDrive: [{ x: -0.25, y: 1.55, z: 0.30,  r: 0.32 }],
        optics:      [{ x: -0.25, y: 2.05, z: 1.10,  r: 0.26 }],
      },
      ringY: 1.55,
      trackX: 1.26, trackY: 1.00,
    },
    dims: { length: 5.92, width: 3.0, hullHeight: 1.72, turretTop: 2.57 },
    trackWidth: 0.55,
    ammo: { shell: 100, mg: 3000 },
    sound: {
      drive: 'tankSound/rus/t34-egAll.mp3',                // T-34 族同款 V-2 发动机
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/76mm-fire.mp3',                 // 第三人称开炮：57mm ZiS-4（就近音源）
      fireAim: 'tankSound/rus/76mm-inner.mp3',             // 瞄准镜开炮：57mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.24, driveDecelStart: 13.8 },
    },
  },

  // ── T-34（1941）（苏）────────────────────
  // 1941 年型：76.2mm F-34 L/41 + 焊接双人炮塔（45mm 全向）。卫国战争初期的中坦标杆。
  // 轮系：scripts/split-wheels-td.js t3441（Object_7 全轮系+翼子板杂件合并 → 14 轮，
  //   radialCap 1.05 排除轮间悬挂短杆）；Object_11 双 DT 合并件按 y 分簇：下簇 hullMgDt / 上簇同轴
  't34-41': {
    caliber: 76.2,
    id: 't34-41',
    nation: 'ru',
    reticle: 'su2',
    zoomFov: 15.5,
    aiRole: 'brawler',
    aiTraits: { preferRangeK: 0.7 },                    // 短 76 炮：中近距机动战
    name: 'T-34（1941）',
    nameEn: 'T-34 Model 1941',
    model: 'model/opt/t3441.glb',
    scale: 1.0,               // 实测全长 6.63m 含炮管（实车 6.68m）≈1:1
    forwardAxis: '+z',
    // —— 部件节点名（Tank Model Maker v2.3 标注，见 tankModel/t-34_1941.md）——
    parts: {
      turret: ['Object_14', 'Object_12'],                // 炮塔结构（焊接 1941 型）
      mg: ['Object_11'],        // 同轴 DT（split 后仅上簇，随炮塔）——右键发射
      hullMg: ['hullMgDt'],     // 车体前 DT（split 下簇）——F 发射
      barrel: ['Object_13', 'Object_2'],                 // F-34 炮管+炮口段（随俯仰）
      track: ['Object_3', 'Object_6'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI'],
    },
    turretPivot: [0, 1.55, 0.49],      // 炮塔座圈（环带圆拟合 y1.57~1.79）
    barrelPivot: [0, 1.93, 1.40],      // 炮盾耳轴（炮管轴线实测 y1.93）
    muzzleLocal: [0, 1.93, 3.62],      // 炮口（Object_2 前端实测）
    exhaustLocal: [[0.48, 1.03, -2.97], [-0.45, 1.04, -2.97]],   // md 排气烟点×2.56
    trackLocal: [[-1.26, 0.1, 0], [1.26, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 跨 12.1 格）
    trackScrollFlip: true,      // 底段 dv/dz<0：前进时 offset 须递减
    // —— 实车性能 ——
    mass: 27500,                // 战斗全重 ≈27.5t（1941 型）
    engineHp: 500,              // V-2-34 柴油机
    maxSpeedForward: 53 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 53 / 3.6,         // 公路（史实）
    offroadK: 0.55,             // 越野极速 ≈29km/h
    revSpeed: 2.4,
    enginePower: 3.7,           // 18.2hp/t（族内最优推重比）
    powerFalloff: 0.56,
    clutchDelay: 0.42,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.58,
    hullTraverse: 0.45,
    turretTraverse: 0.18,       // 双人炮塔手摇为主 ≈10°/s（史实短板）
    gunDepression: -5.0,        // 苏系俯角短板
    gunElevation: 28.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：76.2mm F-34 L/41（与 KV-1 同炮族弹道）——
    gunCaliber: 76,
    shellName: 'BR-350A APBC',
    shellNameCn: '钝头穿甲弹',
    shellVelocity: 662,
    shellPen: 61,                // mm RHA @0m（30° 口径基准：史实30° 56@500/50@1000/45@1500/40@2000）
    shellPenDrop: 0.17,
    apcrShell: { name: 'BR-354P APCR', nameCn: '钨芯穿甲弹', velocity: 950, pen: 112, penDrop: 0.39 },  // 次口径钨芯弹（3 键；90@500/24@2000）
    heShellName: 'OF-350',
    heVelocity: 680,
    loadout: { ap: 34, apcr: 3, he: 40 },   // 77 发编制（1941 型）
    spallPower: 100,
    reloadTime: 7.2,             // s 人工装填（双人炮塔局促，车长兼炮手）
    dispersion: 0.00042,         // σ：F-34（苏炮公差大）
    aimTime: 2.1,
    // —— 装甲（mm RHA；1941 焊接炮塔 45mm 全向）——
    armor: {
      hullFront: 45,  hullSide: 45, hullRear: 45, hullTop: 20,
      turretFront: 45, turretSide: 45, turretRear: 45,
    },
    // —— 装甲判定模型（板图 v2：车体板沿用 T-34 族，炮塔按 1941 焊接实测轮廓铺）——
    armorModel: {
      hull: {
        box: { x0: -1.2, x1: 1.2, y0: 0.44, y1: 1.77, z0: -2.93, z1: 3.10 },
        plates: [
          { name: '首上(大倾角)', face: 'front', t: 45, pos: [0, 1.24, 2.31], size: [2.4, 1.88], rot: [-60, 0, 0] },
          { name: '首下', face: 'front', t: 45, pos: [0, 0.61, 2.73], size: [2.4, 0.75], rot: [50, 0, 0] },
          { name: '车尾', face: 'rear', t: 45, pos: [0, 1.13, -2.74], size: [2.4, 1.55], rot: [35, 0, 0] },
          { name: '侧上', face: 'side', t: 45, pos: [1.2, 1.35, 0], size: [6.0, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 20, pos: [1.23, 0.65, 0], size: [6.0, 0.8], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.77, 0], size: [2.4, 6.0], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.90, x1: 0.90, y0: 1.47, y1: 2.36, z0: -0.65, z1: 1.62 },
        plates: [
          { name: '炮盾', face: 'front', t: 45, pos: [0, 1.90, 1.50], size: [1.0, 0.60], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 45, pos: [-0.58, 1.88, 1.22], size: [0.70, 0.75], rot: [0, -40, 0] },
          { name: '炮塔正面', face: 'front', t: 45, pos: [0.58, 1.88, 1.22], size: [0.70, 0.75], rot: [0, 40, 0] },
          { name: '炮塔尾部', face: 'rear', t: 45, pos: [0, 1.88, -0.58], size: [1.6, 0.80], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 45, pos: [0.85, 1.88, 0.40], size: [2.0, 0.80], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 16, pos: [0, 2.32, 0.45], size: [1.7, 2.0], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    mg: { rate: 10, dispersion: 0.016, range: 550, ammoMax: 3000 },
    hullMgArc: 0.26,
    // —— 内部布局（史实 4 乘员：双人炮塔车长兼炮手；驾驶左前/通讯员右前）——
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.30, y: 1.90, z: 0.30,  r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.40,  y: 1.90, z: 0.15,  r: 0.33 },
        { id: 'driver',    name: '驾驶员', x: -0.45, y: 1.05, z: 1.60,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.45,  y: 1.05, z: 1.50,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 0.95, z: -1.90,  r: 0.55 }],
        fuel:        [{ x: -0.85, y: 1.00, z: -0.70,  r: 0.42 }, { x: 0.85, y: 1.00, z: -0.70, r: 0.42 }],
        ammoRacks:   [{ x: 0.60,  y: 1.10, z: 0.70,  r: 0.40 }, { x: -0.60, y: 1.10, z: 0.70, r: 0.40 },
                      { x: 0,     y: 1.80, z: -0.40, r: 0.30 }],
        breech:      [{ x: 0,     y: 1.93, z: 1.00,  r: 0.32 }],
        turretDrive: [{ x: -0.25, y: 1.55, z: 0.30,  r: 0.32 }],
        optics:      [{ x: -0.25, y: 1.98, z: 1.05,  r: 0.26 }],
      },
      ringY: 1.55,
      trackX: 1.26, trackY: 1.00,
    },
    dims: { length: 5.92, width: 3.0, hullHeight: 1.75, turretTop: 2.36 },
    trackWidth: 0.55,
    ammo: { shell: 77, mg: 3000 },
    sound: {
      drive: 'tankSound/rus/t34-egAll.mp3',                // T-34 族同款 V-2 发动机
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/76mm-fire.mp3',                 // 第三人称开炮：76.2mm F-34
      fireAim: 'tankSound/rus/76mm-inner.mp3',             // 瞄准镜开炮：76.2mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.24, driveDecelStart: 13.8 },
    },
  },

  // ── KV-1 1942 型（苏）────────────────────
  // 76.2mm F-34 + 焊接附加装甲的 1941-42 主力重坦；轮系：scripts/split-wheels-td.js kv1 离线切出
  // （22 轮：6 负重轮/后主动/前诱导/3 回转轮每侧）；Object_10 双 DT 合并件按 y 分簇：
  // 下簇 hullMgDt（车体机枪，F 发射）/ 上簇 Object_10 同轴机枪（随炮塔，右键发射）
  'kv1': {
    caliber: 76.2,             // mm 主炮口径（跳弹口径碾压用）
    id: 'kv1',
    nation: 'ru',
    reticle: 'su2',           // TSh-16 望远镜静态分划
    zoomFov: 15.5,            // TSh-16 固定 4× 视场
    aiRole: 'anchor',
    aiTraits: { preferRangeK: 0.9 },                    // 突破重坦：正面顶上去
    name: 'KV-1 1942 型',
    nameEn: 'KV-1 1942',
    model: 'model/opt/kv1.glb',
    scale: 1.0,               // 实测全长 6.79m 含炮管（实车 6.75m）=1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_12', 'Object_11'],                  // 炮塔壳+炮塔后向 DT（装饰，随炮塔）
      barrel: ['Object_9', 'Object_6'],                    // F-34 炮管+炮口段（随俯仰）
      mg: ['Object_10'],        // 同轴 DT（split 后仅上簇，随炮塔）——右键发射
      hullMg: ['hullMgDt'],     // 车体前 DT（split 下簇，固定车体）——F 发射
      track: ['Object_2', 'Object_3'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3',
               'wheelLT1', 'wheelLT2', 'wheelLT3'],
    },
    turretPivot: [-0.05, 1.62, 0.50],    // 炮塔座圈（Object_12 底环带圆拟合）
    barrelPivot: [-0.024, 1.98, 1.4],    // 炮盾耳轴（Object_9 炮盾段 z1.2~1.7）
    muzzleLocal: [-0.024, 1.98, 3.05],   // 炮口（Object_6 前端，轴线 y1.98）
    exhaustLocal: [[0.68, 1.03, -1.82], [-0.68, 1.03, -1.82]],   // 车尾甲板双管（视觉校准：累计向车头移 1.4m）
    exhaustType: 'up',           // 苏系甲板朝天管：烟先上喷 0.5~1m 再回落飘散
    trackLocal: [[-1.31, 0.1, 0], [1.31, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 11 格）
    trackScrollFlip: true,      // 底段 dv/dz<0
    // —— 实车性能 ——
    mass: 45000,                // 战斗全重 45t
    engineHp: 600,              // V-2K 柴油机
    maxSpeedForward: 35 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 35 / 3.6,         // 公路（史实）
    offroadK: 0.47,             // 越野极速 ≈16.5km/h
    revSpeed: 2.0,
    enginePower: 2.4,           // 13.3hp/t
    powerFalloff: 0.55,
    clutchDelay: 0.5,
    engineBrake: 1.7,
    brakeDecel: 5.5,
    turnDrag: 0.5,
    slopePower: 0.55,
    hullTraverse: 0.5,
    turretTraverse: 0.22,       // 电动+手摇 ≈13°/s
    gunDepression: -5.0,        // 苏系俯角短板
    gunElevation: 24.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：76.2mm F-34 L/41 ——
    gunCaliber: 76,
    shellName: 'BR-350A APBC',
    shellNameCn: '钝头穿甲弹',
    shellVelocity: 662,
    shellPen: 61,               // mm RHA @0m（30° 口径基准：史实30° 56@500/50@1000/45@1500/40@2000）
    shellPenDrop: 0.17,          // 每千米穿深衰减比例
    apcrShell: { name: 'BR-354P APCR', nameCn: '钨芯穿甲弹', velocity: 950, pen: 112, penDrop: 0.39 },  // 次口径钨芯弹（3 键；90@500/24@2000）
    heShellName: 'OF-350',
    heVelocity: 680,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 55, apcr: 4, he: 52 },   // 史实弹药分配
    spallPower: 100,
    reloadTime: 7.2,
    dispersion: 0.00042,        // σ：F-34（苏炮公差大）
    aimTime: 2.1,
    // —— 装甲（mm RHA；1942 型焊接附加）——
    armor: {
      hullFront: 105, hullSide: 75, hullRear: 70, hullTop: 30,
      turretFront: 100, turretSide: 75, turretRear: 75,
    },
    // —— 装甲判定模型（板图 v2：按模型实测轮廓铺板，史实厚度）——
    armorModel: {
      hull: {
        box: { x0: -1.25, x1: 1.25, y0: 0.25, y1: 1.62, z0: -3.36, z1: 3.36 },
        plates: [
          { name: '首上', face: 'front', t: 75, pos: [0, 1.17, 2.82], size: [2.5, 0.95], rot: [-73, 0, 0] },
          { name: '首上竖直', face: 'front', t: 105, pos: [0, 1.44, 2.42], size: [2.2, 0.47], rot: [-24, 0, 0] },
          { name: '首下', face: 'front', t: 75, pos: [0, 0.72, 2.99], size: [2.5, 0.97], rot: [43.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 70, pos: [0, 1.04, -3.02], size: [2.5, 1.22], rot: [4, 0, 0] },
          { name: '侧上', face: 'side', t: 75, pos: [1.15, 1.2, 0], size: [6.4, 0.8], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 75, pos: [1.31, 0.6, 0], size: [6.4, 0.95], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 30, pos: [0, 1.62, -0.19], size: [2.3, 5], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.93, x1: 0.93, y0: 1.62, y1: 2.5, z0: -1.11, z1: 1.66 },
        plates: [
          { name: '炮盾', face: 'front', t: 90, pos: [0, 2, 1.5], size: [1.6, 1.04], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 90, pos: [-0.85, 2.05, 1.1], size: [0.85, 0.9], rot: [0, -78, 0] },
          { name: '炮塔正面', face: 'front', t: 90, pos: [0.87, 2.05, 1.08], size: [0.9, 0.86], rot: [0, 77, 0] },
          { name: '炮塔尾部', face: 'rear', t: 75, pos: [0, 2, -1], size: [1.8, 0.94], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 75, pos: [-0.93, 2, -0.12], size: [1.92, 0.97], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 30, pos: [0, 2.48, 0.2], size: [1.8, 2.6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    mg: { rate: 10, dispersion: 0.016, range: 550, ammoMax: 3000 },
    hullMgArc: 0.26,           // 前机枪水平射界 ±15°（球座）
    // —— 内部布局（驾驶居中前/机电员右前；炮手左前/车长左后/装填手右）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: -0.4, y: 2.05, z: 0, r: 0.34 },
        { id: 'gunner', name: '炮手', x: -0.35, y: 1.95, z: 1, r: 0.32 },
        { id: 'loader', name: '装填手', x: 0.4, y: 1.95, z: 0.4, r: 0.34 },
        { id: 'driver', name: '驾驶员', x: -0.62, y: 1, z: 2, r: 0.33 },
        { id: 'radio', name: '通讯员', x: 0.5, y: 1, z: 2.07, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 1.01, z: -2.4, r: 0.55 }],
        fuel: [{ x: -0.9, y: 1, z: -1.8, r: 0.45 }, { x: 0.9, y: 1, z: -1.8, r: 0.45 }],
        ammoRacks: [{ x: -0.95, y: 1, z: 0.6, r: 0.45 }, { x: 0.95, y: 1, z: 0.6, r: 0.45 }, { x: 0, y: 1.7, z: -0.6, r: 0.4 }],
        breech: [{ x: 0, y: 1.98, z: 0.9, r: 0.4 }],
        turretDrive: [{ x: -0.3, y: 1.7, z: 0.6, r: 0.34 }],
        optics: [{ x: -0.3, y: 2.15, z: 1.2, r: 0.26 }],
      },
      ringY: 1.62,
      trackX: 1.31, trackY: 1.1,
    },
    dims: { length: 6.75, width: 3.32, hullHeight: 1.62, turretTop: 2.7 },
    trackWidth: 0.7,
    ammo: { shell: 111, mg: 3000 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/76mm-fire.mp3',                 // 第三人称开炮：76.2mm ZiS-5
      fireAim: 'tankSound/rus/76mm-inner.mp3',             // 瞄准镜开炮：76.2mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── IS-1（IS-85，1943）────────────────────
  // IS 底盘 + 85mm D-5T：IS-2 的前身，122 未成熟前的应急重坦。轮系同族切法；
  // Object_10 双 DT 合并件按 y 分簇（同 kv1）：下簇 hullMgDt 车体机枪 / 上簇同轴（随炮塔）
  'is1': {
    caliber: 85,             // mm 主炮口径（跳弹口径碾压用）
    id: 'is1',
    nation: 'ru',
    reticle: 'su2',           // TSh-17 望远镜静态分划（沿用苏系）
    zoomFov: 15.5,            // TSh-17 固定 4× 视场
    aiRole: 'anchor',
    aiTraits: { preferRangeK: 0.8 },                    // 重型突破：偏好近战
    name: 'IS-1（IS-85）',
    nameEn: 'IS-1',
    model: 'model/opt/is1.glb',
    scale: 1.0,               // 实测全长 8.79m 含炮管（实车 8.49m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_13', 'Object_14', 'Object_12'],     // 炮塔壳+吊篮+车长塔
      barrel: ['Object_28', 'Object_5'],                   // D-5T 炮管+炮口段（随俯仰）
      mg: ['Object_10'],        // 同轴 DT（split 后仅上簇，随炮塔）——右键发射
      hullMg: ['hullMgDt'],     // 车体前 DT（split 下簇，固定车体）——F 发射
      track: ['Object_2', 'Object_7'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3',
               'wheelLT1', 'wheelLT2', 'wheelLT3'],
    },
    turretPivot: [0.0, 1.62, 0.62],      // 炮塔座圈（Object_13 底环带圆拟合）
    barrelPivot: [0, 2.01, 1.3],         // 炮盾耳轴（Object_28 炮盾段 z1.2~1.4）
    muzzleLocal: [0, 2.01, 5.23],        // 炮口（Object_5 前端，轴线 y2.01）
    exhaustLocal: [[0.69, 1.04, -1.57], [-0.65, 1.04, -1.6]],   // IS 底盘通用（视觉校准：向车头移 0.7m）
    exhaustType: 'up',           // 苏系甲板朝天管：烟先上喷 0.5~1m 再回落飘散
    trackLocal: [[-1.25, 0.1, 0], [1.25, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 12 格，底段 dv/dz>0 无需 flip）
    // —— 实车性能 ——
    mass: 44000,                // 战斗全重 44t
    engineHp: 520,              // V-2IS 柴油机
    maxSpeedForward: 37 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 37 / 3.6,         // 公路（史实）
    offroadK: 0.52,             // 越野极速 ≈19km/h（IS 底盘同 is2）
    revSpeed: 2.0,
    enginePower: 2.2,
    powerFalloff: 0.55,
    clutchDelay: 0.5,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.55,
    hullTraverse: 0.45,
    turretTraverse: 0.25,       // 电动转向 ≈14°/s
    gunDepression: -5.0,        // D-5T 俯角短板
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：85mm D-5T L/43（与 ZiS-S-53 同弹道）——
    gunCaliber: 85,
    shellName: 'BR-365A APHEBC',
    shellNameCn: '风帽穿甲弹',
    shellVelocity: 792,
    shellPen: 112,               // mm RHA @0m（30° 口径基准：史实30° 103@500/94@1000/86@1500/77@2000）
    shellPenDrop: 0.16,          // 每千米穿深衰减比例
    apcrShell: { name: 'BR-365P APCR', nameCn: '钨芯穿甲弹', velocity: 1030, pen: 132, penDrop: 0.33 },  // 次口径钨芯弹（3 键；110@500/45@2000）
    heShellName: 'O-365K',
    heVelocity: 785,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 29, apcr: 4, he: 26 },   // 史实弹药分配
    spallPower: 115,
    reloadTime: 8.0,            // s（IS 炮塔宽敞，快于 T-34-85）
    dispersion: 0.00045,        // σ：D-5T
    aimTime: 2.1,
    // —— 装甲（mm RHA；IS 底盘 120 首上）——
    armor: {
      hullFront: 120, hullSide: 90, hullRear: 60, hullTop: 20,
      turretFront: 100, turretSide: 90, turretRear: 90,
    },
    // —— 装甲判定模型（板图 v2：按模型实测轮廓铺板，史实厚度）——
    armorModel: {
      hull: {
        box: { x0: -1.25, x1: 1.25, y0: 0.25, y1: 1.5, z0: -3.56, z1: 3.3 },
        plates: [
          { name: '首上', face: 'front', t: 75, pos: [0, 1.23, 2.7], size: [2.5, 1.32], rot: [-75.5, 0, 0] },
          { name: '首上竖直', face: 'front', t: 105, pos: [0, 1.24, 2.14], size: [2.2, 0.86], rot: [-19, 0, 0] },
          { name: '首下', face: 'front', t: 90, pos: [0, 0.8, 3.13], size: [2.5, 0.7], rot: [32, 0, 0] },
          { name: '车尾', face: 'rear', t: 60, pos: [0, 1.16, -3.14], size: [2.4, 1.41], rot: [41, 0, 0] },
          { name: '侧上', face: 'side', t: 90, pos: [1.2, 1.01, 0], size: [6.2, 1.22], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.3, 0.55, 0], size: [6.2, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.5, 0], size: [2.4, 6], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.14, x1: 1.14, y0: 1.62, y1: 2.65, z0: -0.88, z1: 2.22 },
        plates: [
          { name: '炮盾', face: 'front', t: 100, pos: [0, 2.07, 2.14], size: [1.29, 0.86], rot: [0, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 100, pos: [-0.79, 2.05, 1.57], size: [1.23, 0.89], rot: [0, -68, 0] },
          { name: '炮塔正面', face: 'front', t: 100, pos: [0.8, 2.05, 1.63], size: [1.16, 0.88], rot: [0, 67.5, 0] },
          { name: '炮塔尾部', face: 'rear', t: 90, pos: [0, 2.05, -0.88], size: [2, 0.9], rot: [0, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 90, pos: [1, 2.05, 0.09], size: [2.06, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 30, pos: [0, 2.46, 0.6], size: [1.9, 3], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    mg: { rate: 10, dispersion: 0.016, range: 550, ammoMax: 2000 },
    hullMgArc: 0.26,
    // —— 内部布局（IS 系 4 乘员：驾驶居中，炮手左前/车长左后/装填手右）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: -0.4, y: 2.1, z: 0.3, r: 0.34 },
        { id: 'gunner', name: '炮手', x: -0.35, y: 1.95, z: 1.2, r: 0.32 },
        { id: 'loader', name: '装填手', x: 0.45, y: 1.95, z: 0.6, r: 0.34 },
        { id: 'driver', name: '驾驶员', x: 0, y: 1.17, z: 1.71, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 0.93, z: -1.47, r: 0.56 }],
        fuel: [{ x: -0.9, y: 0.95, z: -2, r: 0.45 }, { x: 0.9, y: 0.95, z: -2, r: 0.45 }],
        ammoRacks: [{ x: -0.62, y: 1.1, z: 0.5, r: 0.45 }, { x: 0.51, y: 1.1, z: 0.5, r: 0.45 }, { x: 0, y: 1.8, z: -0.27, r: 0.4 }],
        breech: [{ x: 0, y: 2, z: 0.8, r: 0.38 }],
        turretDrive: [{ x: -0.3, y: 1.55, z: 0.5, r: 0.32 }],
        optics: [{ x: -0.3, y: 2.2, z: 1.4, r: 0.26 }],
      },
      ringY: 1.62,
      trackX: 1.25, trackY: 1.05,
    },
    dims: { length: 6.9, width: 3.1, hullHeight: 1.5, turretTop: 2.75 },
    trackWidth: 0.64,
    ammo: { shell: 59, mg: 2000 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/85mm-fire.mp3',                 // 第三人称开炮：85mm D-5T
      fireAim: 'tankSound/rus/85mm-inner.mp3',             // 瞄准镜开炮：85mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── SU-100 自行反坦克炮（苏）────────────────────
  // T-34 底盘 + 100mm D-10S L/56：战后仍在服役的名炮。无炮塔（casemate ±8°），无机枪
  // 轮系：scripts/split-wheels-td.js su100 离线切出（14 轮：5 负重轮/后主动/前诱导每侧，T-34 无回转轮）
  // 注：本模型左主/诱导轮为单面扁平环片（资产 LOD 不对称，内容为模型原样）
  'su100': {
    caliber: 100,             // mm 主炮口径（跳弹口径碾压用）
    id: 'su100',
    nation: 'ru',
    reticle: 'su2',           // TSh-19 望远镜静态分划（沿用苏系）
    zoomFov: 15.5,            // TSh-19 固定 4× 视场
    aiRole: 'ambusher',
    aiTraits: { scootChance: 0.6, aimErrMulRole: 0.85 },   // 坦歼伏击+换位（同四号歼击车族）
    name: 'SU-100',
    nameEn: 'SU-100',
    model: 'model/opt/su100.glb',
    scale: 1.0,               // 实测全长 9.41m 含炮管（实车 9.45m）=1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_12'],                   // 火炮结构（炮架随动 ±8°）
      barrel: ['Object_12', 'Object_6'],       // D-10S 炮管+炮口段（随俯仰）
      track: ['Object_4', 'Object_5'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI'],
    },
    casemate: { arc: 8 },     // D-10S 炮架水平射界 ±8°（史实 16° 总行程）
    // 炮轴枢轴 = 战斗室前板耳轴（炮左偏 0.24m 实车布局）；俯仰同点
    turretPivot: [-0.24, 1.55, 2.3],
    barrelPivot: [-0.24, 1.55, 2.3],
    muzzleLocal: [-0.24, 1.54, 6.39],    // 炮口（Object_6 前端，轴线 y1.54 x-0.24）
    exhaustLocal: [[0.35, 0.74, -3.00], [-0.31, 0.78, -3.03]],   // md 排气烟点×2.56（T-34 系车尾下置）
    trackLocal: [[-1.27, 0.1, 0], [1.27, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 12 格）
    trackScrollFlip: true,      // 底段 dv/dz<0
    // —— 实车性能 ——
    mass: 31500,                // 战斗全重 31.5t
    engineHp: 500,              // V-2-34M 柴油机
    maxSpeedForward: 45 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 45 / 3.6,         // 公路（史实）
    offroadK: 0.53,             // 越野极速 ≈24km/h
    revSpeed: 2.4,
    enginePower: 3.4,           // 15.9hp/t
    powerFalloff: 0.56,
    clutchDelay: 0.42,
    engineBrake: 1.6,
    brakeDecel: 6.5,
    turnDrag: 0.42,
    slopePower: 0.58,
    hullTraverse: 0.45,         // 离合-制动转向，无原位转向
    turretTraverse: 0.10,       // 炮架手摇 ≈6°/s
    gunDepression: -3.0,        // 俯角短板
    gunElevation: 17.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：100mm D-10S L/56 ——
    gunCaliber: 100,
    shellName: 'BR-412B APHEBC',
    shellNameCn: '风帽穿甲弹',
    shellVelocity: 895,
    shellPen: 147,               // mm RHA @0m（30° 口径基准：30° 换算 ~135@500/~123@1000/~112@1500/~100@2000）
    shellPenDrop: 0.16,          // 每千米穿深衰减比例
    heShellName: 'UOF-412',
    heVelocity: 895,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 20, apcr: 0, he: 13 },   // 史实弹药分配
    spallPower: 150,
    reloadTime: 10.5,           // s 定装重弹（战斗室局促）
    dispersion: 0.00018,        // σ：D-10S 精密炮
    aimTime: 2.4,
    heShell: { power: 1.4, nearMissR: 3 },   // 100mm UOF-412 HE
    // —— 装甲（mm RHA；大倾角战斗室正面）——
    armor: {
      hullFront: 75, hullSide: 45, hullRear: 40, hullTop: 20,
      turretFront: 75, turretSide: 45, turretRear: 45,
    },
    // —— 装甲判定模型（板图 v2：按模型实测轮廓铺板，史实厚度）——
    armorModel: {
      hull: {
        box: { x0: -1.3, x1: 1.3, y0: 0.25, y1: 1.6, z0: -3, z1: 2.9 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 75, pos: [0, 1.65, 1.75], size: [2.4, 1.2], rot: [-50, 0, 0] },
          { name: '首上(大倾角)', face: 'front', t: 45, pos: [0, 1.01, 2.62], size: [2.6, 1.08], rot: [-56.5, 0, 0] },
          { name: '首下', face: 'front', t: 45, pos: [0, 0.5, 2.45], size: [2.6, 0.7], rot: [50, 0, 0] },
          { name: '车尾', face: 'rear', t: 40, pos: [0, 1.25, -2.55], size: [2.5, 1.11], rot: [45, 0, 0] },
          { name: '战斗室侧板', face: 'side', t: 45, pos: [1.2, 1.7, 0.87], size: [2.03, 0.8], rot: [0, 90, 0], mirror: true },
          { name: '战斗室后板', face: 'rear', t: 45, pos: [0, 1.75, -0.05], size: [2.4, 0.7], rot: [0, 0, 0] },
          { name: '车体后部顶板', face: 'top', t: 20, pos: [0, 1.6, -1.28], size: [2.4, 2.26], rot: [-90, 0, 0] },
          { name: '车尾下斜板', face: 'rear', t: 40, pos: [0, 0.66, -2.79], size: [2.4, 0.6], rot: [-25, 0, 0] },
          { name: '侧上', face: 'side', t: 45, pos: [1.2, 1.2, 0], size: [5, 0.85], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 20, pos: [1.27, 0.55, 0], size: [5.8, 0.85], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 2.08, 0.58], size: [2.4, 1.51], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.9, x1: 0.6, y0: 1.3, y1: 2.2, z0: 1.2, z1: 2.6 },
        plates: [
          { name: '炮盾', face: 'front', t: 100, pos: [-0.24, 1.59, 2.28], size: [1.04, 0.86], rot: [-27.5, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    // 无机枪（史实 SU-100 无车载机枪）
    ammo: { shell: 33, mg: 0 },
    // —— 内部布局（4 乘员：驾驶左前/炮手左/装填手右/车长左后）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: -0.4, y: 1.8, z: 0.3, r: 0.34 },
        { id: 'gunner', name: '炮手', x: -0.35, y: 1.6, z: 0.72, r: 0.32 },
        { id: 'loader', name: '装填手', x: 0.45, y: 1.6, z: 1, r: 0.34 },
        { id: 'driver', name: '驾驶员', x: 0.58, y: 1, z: 1.78, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 0.9, z: -1.33, r: 0.6 }],
        fuel: [{ x: -0.85, y: 0.85, z: -1.8, r: 0.42 }, { x: 0.85, y: 0.85, z: -1.8, r: 0.42 }],
        ammoRacks: [{ x: -0.83, y: 0.9, z: 0.5, r: 0.45 }, { x: 0.58, y: 0.9, z: 0.5, r: 0.45 }, { x: 0.3, y: 1.5, z: 0.37, r: 0.32 }],
        breech: [{ x: -0.24, y: 1.55, z: 1.22, r: 0.33 }],
        turretDrive: [{ x: -0.24, y: 1.3, z: 1.64, r: 0.18 }],
        optics: [{ x: -0.5, y: 1.7, z: 0.94, r: 0.26 }],
      },
      ringY: 1.55,
      trackX: 1.27, trackY: 0.9,
    },
    dims: { length: 6.05, width: 3.0, hullHeight: 1.6, turretTop: 2.25 },
    trackWidth: 0.55,
    sound: {
      drive: 'tankSound/rus/t34-egAll.mp3',                // 新式发动机（单文件三段，与 T-34-85 共用）：前 4.9s=加速段 / 巡航 / 13.8s 起=减速停车段
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/100mm-fire.mp3',                // 第三人称开炮：100mm D-10S
      fireAim: 'tankSound/rus/100mm-inner.mp3',            // 瞄准镜开炮：100mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4.9, driveCruiseEnd: 13.24, driveDecelStart: 13.8 },
    },
  },

  // ── SU-152 自行重型榴弹炮（苏，KV 底盘）────────────────────
  // 152mm ML-20S 攻坚榴炮：「动物杀手」。无炮塔（casemate ±5°），无机枪；默认弹种 HE（史实主攻方式）
  // 轮系：split-wheels-td.js su152（22 轮，KV 底盘同 kv1）；排气 KV 系甲板上喷（exhaustType 'up'）
  'su152': {
    caliber: 152,             // mm 主炮口径（跳弹口径碾压用）
    id: 'su152',
    nation: 'ru',
    reticle: 'su2',           // 望远镜静态分划
    zoomFov: 15.5,            // 固定 4× 视场
    aiRole: 'ambusher',
    aiTraits: { fireAndCover: true, scootChance: 0.5 },   // 自行火炮纪律：开火必退掩+换位，不冲锋
    defaultShell: 'he',       // 默认高爆 OF-540（史实：攻坚/反工事为主，AP 为辅）
    name: 'SU-152',
    nameEn: 'SU-152',
    model: 'model/opt/su152.glb',
    scale: 1.0,               // 实测全长 8.89m 含炮管（实车 8.78m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_10'],                   // 火炮结构（炮架随动 ±5°）
      barrel: ['Object_10', 'Object_9'],       // ML-20S 炮管+炮口段（随俯仰）
      track: ['Object_2', 'Object_7'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3',
               'wheelLT1', 'wheelLT2', 'wheelLT3'],
    },
    casemate: { arc: 5 },     // ML-20S 炮架水平射界 ±5°（史实 10° 总行程）
    turretPivot: [-0.19, 1.79, 2.2],     // 炮架枢轴 = 战斗室前板耳轴（炮左偏 0.19m）
    barrelPivot: [-0.19, 1.79, 2.2],
    muzzleLocal: [-0.19, 1.79, 5.53],    // 炮口（Object_9 前端，轴线 y1.79）
    exhaustLocal: [[0.68, 1.03, -1.82], [-0.68, 1.03, -1.82]],   // KV 底盘甲板双管（同 kv1 校准位）
    exhaustType: 'up',          // KV 系甲板朝天管（用户指定：与 kv1 同类上喷）
    trackLocal: [[-1.31, 0.1, 0], [1.31, 0.1, 0]],
    trackScrollAxis: 'y',
    trackScrollFlip: true,
    // —— 实车性能 ——
    mass: 45500,                // 战斗全重 45.5t
    engineHp: 600,              // V-2K 柴油机
    maxSpeedForward: 43 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 43 / 3.6,         // 公路（史实）
    offroadK: 0.47,             // 越野极速 ≈20km/h
    revSpeed: 2.0,
    enginePower: 2.4,
    powerFalloff: 0.55,
    clutchDelay: 0.5,
    engineBrake: 1.7,
    brakeDecel: 5.5,
    turnDrag: 0.5,
    slopePower: 0.55,
    hullTraverse: 0.5,
    turretTraverse: 0.09,       // 炮架手摇 ≈5°/s
    gunDepression: -3.0,
    gunElevation: 18.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：152mm ML-20S L/28.8 ——
    gunCaliber: 152,
    shellName: 'OF-540 HE / BR-540 AP',
    shellNameCn: '穿甲弹',
    shellVelocity: 655,
    shellPen: 107,               // mm RHA @0m（30° 口径基准：BR-540；30° 换算 ~100@500/~92@1000/~85@1500/~78@2000）
    shellPenDrop: 0.14,          // 每千米穿深衰减比例
    heShellName: 'OF-540',
    heVelocity: 655,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 4, apcr: 0, he: 16 },   // 史实弹药分配
    spallPower: 240,            // 152mm 弹体毁伤巨大
    reloadTime: 15.5,           // s 分装重弹
    dispersion: 0.00050,        // σ：ML-20S 榴弹炮（精度逊于加农炮）
    aimTime: 2.8,
    heShell: { power: 3.0, penMult: 0.12, nearMissR: 5 },   // 152mm OF-540 43.6kg 弹体
    // —— 装甲（mm RHA；KV 底盘 + 箱型战斗室）——
    armor: {
      hullFront: 75, hullSide: 75, hullRear: 70, hullTop: 30,
      turretFront: 75, turretSide: 60, turretRear: 60,
    },
    armorModel: {
      hull: {
        box: { x0: -1.25, x1: 1.25, y0: 0.25, y1: 1.62, z0: -3.36, z1: 3.36 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 75, pos: [0, 1.91, 2.14], size: [2.5, 1.25], rot: [-25, 0, 0] },
          { name: '战斗室侧板', face: 'side', t: 60, pos: [1.15, 1.95, 1], size: [2.8, 1], rot: [0, 90, 0], mirror: true },
          { name: '战斗室后板', face: 'rear', t: 60, pos: [0, 1.95, -0.4], size: [2.3, 1], rot: [0, 0, 0] },
          { name: '战斗室顶板', face: 'top', t: 30, pos: [0, 2.45, 0.8], size: [2.3, 2.45], rot: [-90, 0, 0] },
          { name: '首上', face: 'front', t: 75, pos: [0, 1.22, 2.84], size: [2.5, 1.08], rot: [-69.5, 0, 0] },
          { name: '首下', face: 'front', t: 75, pos: [0, 0.75, 3.1], size: [2.5, 0.77], rot: [35, 0, 0] },
          { name: '车尾', face: 'rear', t: 70, pos: [0, 1.01, -3.23], size: [2.5, 1.29], rot: [8, 0, 0] },
          { name: '侧上', face: 'side', t: 75, pos: [1.15, 1.2, 0], size: [6.4, 0.8], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 75, pos: [1.31, 0.6, 0], size: [6.4, 0.95], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 30, pos: [0, 1.62, 0], size: [2.3, 6.4], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.18, x1: 1.15, y0: 1.5, y1: 2.35, z0: -0.48, z1: 2.6 },
        plates: [
          { name: '炮盾', face: 'front', t: 75, pos: [-0.19, 1.79, 2.7], size: [1.2, 1.11], rot: [-13.5, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    // 无机枪
    ammo: { shell: 20, mg: 0 },
    // —— 内部布局（5 乘员：驾驶居中前/炮手左前/车长左后/双装填手右）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: -0.55, y: 2, z: 0, r: 0.34 },
        { id: 'gunner', name: '炮手', x: -0.4, y: 1.85, z: 1, r: 0.32 },
        { id: 'loader', name: '装填手', x: 0.65, y: 1.85, z: 0.58, r: 0.34 },
        { id: 'loader2', name: '装填手', x: -0.12, y: 1.85, z: 0.16, r: 0.34 },
        { id: 'driver', name: '驾驶员', x: 0, y: 1.05, z: 2, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 0.94, z: -1.61, r: 0.62 }],
        fuel: [{ x: -0.62, y: 1, z: -1.8, r: 0.45 }, { x: 0.58, y: 1, z: -1.8, r: 0.45 }],
        ammoRacks: [{ x: -0.55, y: 1, z: 0.09, r: 0.45 }, { x: 0.72, y: 1, z: 0.37, r: 0.45 }, { x: 0, y: 1.8, z: 0.3, r: 0.4 }],
        breech: [{ x: -0.19, y: 1.79, z: 1.2, r: 0.42 }],
        turretDrive: [{ x: -0.19, y: 1.29, z: 1.9, r: 0.22 }],
        optics: [{ x: -0.5, y: 2.1, z: 1.5, r: 0.26 }],
      },
      ringY: 1.79,
      trackX: 1.31, trackY: 1.1,
    },
    dims: { length: 6.75, width: 3.32, hullHeight: 1.62, turretTop: 2.45 },
    trackWidth: 0.7,
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/152mm-fire.mp3',                // 第三人称开炮：152mm ML-20S
      fireAim: 'tankSound/rus/152mm-inner.mp3',            // 瞄准镜开炮：152mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── ISU-152 自行重型榴弹炮（苏，IS 底盘）────────────────────
  // IS 底盘 + 152mm ML-20S：更厚甲的「动物杀手」。casemate ±5°，无机枪；默认 HE
  // 轮系：split-wheels-td.js isu152（22 轮，IS 底盘同 is1）；排气 IS 系甲板上喷（exhaustType 'up'）
  'isu152': {
    caliber: 152,             // mm 主炮口径（跳弹口径碾压用）
    id: 'isu152',
    nation: 'ru',
    reticle: 'su2',
    zoomFov: 15.5,
    aiRole: 'ambusher',
    aiTraits: { fireAndCover: true, scootChance: 0.5 },   // 同 su152：退掩装填、不冲锋
    defaultShell: 'he',       // 默认高爆
    name: 'ISU-152',
    nameEn: 'ISU-152',
    model: 'model/opt/isu152.glb',
    scale: 1.0,               // 实测全长 8.96m 含炮管（实车 9.18m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_22'],                   // 火炮结构（炮架随动 ±5°）
      barrel: ['Object_22', 'Object_5'],       // ML-20S 炮管+炮口段（随俯仰）
      track: ['Object_6', 'Object_8'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3',
               'wheelLT1', 'wheelLT2', 'wheelLT3'],
      hidden: ['Object_4', 'Object_10', 'Object_21'],   // md 标注隐藏件（战斗室顶部变体件）
    },
    casemate: { arc: 5 },
    turretPivot: [-0.27, 1.70, 2.3],     // 炮架枢轴 = 战斗室前板耳轴（炮左偏 0.27m，实车布局）
    barrelPivot: [-0.27, 1.70, 2.3],
    muzzleLocal: [-0.27, 1.70, 5.56],    // 炮口（轴线 y1.70）
    exhaustLocal: [[0.69, 1.04, -1.57], [-0.65, 1.04, -1.6]],   // IS 底盘甲板双管（同 is1 校准位）
    exhaustType: 'up',          // IS 系甲板朝天管（用户指定：与 is1 同类上喷）
    trackLocal: [[-1.2, 0.1, 0], [1.2, 0.1, 0]],
    trackScrollAxis: 'y',
    trackScrollFlip: true,
    // —— 实车性能 ——
    mass: 47400,                // 战斗全重 47.4t
    engineHp: 520,              // V-2IS 柴油机
    maxSpeedForward: 37 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 37 / 3.6,         // 公路（史实）
    offroadK: 0.52,             // 越野极速 ≈19km/h
    revSpeed: 2.0,
    enginePower: 2.2,           // 11hp/t
    powerFalloff: 0.55,
    clutchDelay: 0.5,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.55,
    hullTraverse: 0.45,
    turretTraverse: 0.09,       // 炮架手摇 ≈5°/s
    gunDepression: -3.0,
    gunElevation: 18.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：152mm ML-20S L/28.8（与 SU-152 同弹道）——
    gunCaliber: 152,
    shellName: 'OF-540 HE / BR-540 AP',
    shellNameCn: '穿甲弹',
    shellVelocity: 655,
    shellPen: 107,               // mm RHA @0m（30° 口径基准：BR-540；30° 换算 ~100@500/~92@1000/~85@1500/~78@2000）
    shellPenDrop: 0.14,          // 每千米穿深衰减比例
    heShellName: 'OF-540',
    heVelocity: 655,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 4, apcr: 0, he: 17 },   // 史实弹药分配
    spallPower: 240,
    reloadTime: 15.5,
    dispersion: 0.00050,
    aimTime: 2.8,
    heShell: { power: 3.0, penMult: 0.12, nearMissR: 5 },
    // —— 装甲（mm RHA；IS 底盘 + 大盾战斗室）——
    armor: {
      hullFront: 90, hullSide: 90, hullRear: 60, hullTop: 20,
      turretFront: 90, turretSide: 90, turretRear: 60,
    },
    armorModel: {
      hull: {
        box: { x0: -1.25, x1: 1.25, y0: 0.25, y1: 1.5, z0: -3.56, z1: 3.3 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 90, pos: [0, 1.68, 2.28], size: [2.6, 1.34], rot: [-30, 0, 0] },
          { name: '战斗室侧板', face: 'side', t: 90, pos: [1.2, 1.88, 0.9], size: [3, 0.76], rot: [0, 90, 0], mirror: true },
          { name: '战斗室后板', face: 'rear', t: 60, pos: [0, 1.91, -0.5], size: [2.43, 0.74], rot: [0, 0, 0] },
          { name: '战斗室顶板', face: 'top', t: 20, pos: [0, 2.21, 0.72], size: [2.4, 2.62], rot: [-90, 0, 0] },
          { name: '首上', face: 'front', t: 90, pos: [0, 1.15, 2.81], size: [2.5, 0.94], rot: [-71, 0, 0] },
          { name: '首下', face: 'front', t: 90, pos: [0, 0.67, 2.99], size: [2.5, 0.97], rot: [35, 0, 0] },
          { name: '车尾', face: 'rear', t: 60, pos: [0, 0.9, -3.16], size: [2.4, 1.3], rot: [28.5, 0, 0] },
          { name: '侧上', face: 'side', t: 90, pos: [1.2, 1.01, 0], size: [6.2, 1.15], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.3, 0.55, 0], size: [6.2, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.5, -1.75], size: [2.4, 2.59], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1, x1: 0.55, y0: 1.5, y1: 2.35, z0: 1, z1: 2.6 },
        plates: [
          { name: '炮盾', face: 'front', t: 120, pos: [-0.27, 1.7, 2.77], size: [1.3, 0.9], rot: [-27.5, 0, 0] },
        ],
        extras: [],
      },
    },
    mgCaliber: '7.62',
    // 无机枪（史实 ISU-152 初期型无车载机枪）
    ammo: { shell: 21, mg: 0 },
    // —— 内部布局（5 乘员：驾驶居中/炮手左前/车长左后/双装填手右）——
    internal: {
      crew: [
        { id: 'commander', name: '车长', x: -0.45, y: 1.86, z: 0.2, r: 0.34 },
        { id: 'gunner', name: '炮手', x: -0.4, y: 1.75, z: 1.2, r: 0.32 },
        { id: 'loader', name: '装填手', x: 0.45, y: 1.75, z: 0.8, r: 0.34 },
        { id: 'loader2', name: '装填手', x: 0.45, y: 1.75, z: 0.16, r: 0.34 },
        { id: 'driver', name: '驾驶员', x: 0, y: 1, z: 2.07, r: 0.33 },
      ],
      modules: {
        engine: [{ x: 0, y: 0.87, z: -1.25, r: 0.57 }],
        fuel: [{ x: -0.69, y: 0.95, z: -2, r: 0.45 }, { x: 0.58, y: 0.95, z: -2, r: 0.45 }],
        ammoRacks: [{ x: -0.55, y: 1.1, z: 0.5, r: 0.45 }, { x: 0.65, y: 1.1, z: 0.5, r: 0.45 }, { x: 0, y: 1.7, z: 0.02, r: 0.42 }],
        breech: [{ x: -0.27, y: 1.56, z: 1.4, r: 0.42 }],
        turretDrive: [{ x: -0.27, y: 1.5, z: 1.8, r: 0.3 }],
        optics: [{ x: -0.5, y: 1.86, z: 1.6, r: 0.28 }],
      },
      ringY: 1.7,
      trackX: 1.2, trackY: 1.05,
    },
    dims: { length: 6.9, width: 3.2, hullHeight: 1.5, turretTop: 2.45 },
    trackWidth: 0.64,
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/152mm-fire.mp3',                // 第三人称开炮：152mm ML-20S
      fireAim: 'tankSound/rus/152mm-inner.mp3',            // 瞄准镜开炮：152mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── 黄鼠狼 III M 型（Marder III Ausf. M，Sd.Kfz. 138）────────────────────
  // 38(t) 底盘歼击车：发动机后置、开顶战斗室居中偏后，7.5cm PaK 40/3 炮架限角 ±10.5°
  // 无炮塔（casemate）：parts.turret=炮架组（炮盾+上架随炮水平限角转动），炮管前伸越车首
  'marder3m': {
    caliber: 75,             // mm 主炮口径（跳弹口径碾压用）
    openTop: true,           // 开顶战斗室：开镜不启用舱内发动机衰减（audio 新式引擎）
    id: 'marder3m',
    nation: 'de',
    reticle: 'de2td',
    zoomFov: 15.5,              // Z.F. 4×8 固定 4× 视场
    aiRole: 'ambusher',
    aiTraits: { scootChance: 0.9, fleeOnConfirm: true },   // 纸甲开顶：被确认即逃、打完就换位
    name: '黄鼠狼 III M',
    nameEn: 'Marder III M',
    model: 'model/opt/marder_iiim.glb',
    scale: 1.0,                 // 实测全长 4.94m（实车 4.95m）=1:1
    forwardAxis: '+x',
    parts: {
      turret: ['mount001_marder-iiim-gun_1_0', 'mount2_marder-iiim-gun_1_0', 'shield_marder-iiim-hull_0_0',
               'backet_marder-iiim-interior_2_0', 'optics_marder-iiim-interior_3_0', 'optics001_marder-iiim-interior_3_0'],
      barrel: ['weapon001_marder-iiim-gun_1_0'],
      track: ['track1_marder-iiim-track_5_0', 'track2_marder-iiim-track_5_0'],
      wheels: ['wheel001_marder-iiim-wheels_4_0', 'wheel2_marder-iiim-wheels_4_0', 'wheel3_marder-iiim-wheels_4_0',
               'wheel4_marder-iiim-wheels_4_0', 'wheel5_marder-iiim-wheels_4_0', 'wheel6_marder-iiim-wheels_4_0',
               'wheel7_marder-iiim-wheels_4_0', 'wheel8_marder-iiim-wheels_4_0', 'wheel9_marder-iiim-wheels_4_0',
               'wheel10_marder-iiim-wheels_4_0', 'wheel11_marder-iiim-wheels_4_0', 'wheel12_marder-iiim-wheels_4_0',
               'mesh08_marder-iiim-wheels_4_0', 'mesh09_marder-iiim-wheels_4_0'],
      hidden: ['gear33001_marder-iiim-track_6_0', 'gear34001_marder-iiim-track_6_0', 'gear35001_marder-iiim-track_6_0',
               'gear54001_marder-iiim-track_6_0', 'gear55001_marder-iiim-track_6_0', 'gear77001_marder-iiim-track_6_0',
               'gear78001_marder-iiim-track_6_0', 'gear79001_marder-iiim-track_6_0'],   // .001 重复件（与原件同位叠放）
    },
    casemate: { arc: 10.5 },    // PaK 40/3 炮架水平射界 ±10.5°（史实 21° 总行程）
    // 炮架枢轴 = 上架耳轴（模型 x≈-0.9, y≈1.78 → 局部 (0, 1.78, -0.90)）
    turretPivot: [0, 1.78, -0.90],
    barrelPivot: [0, 1.78, -0.90],
    muzzleLocal: [0, 1.97, 2.31],
    exhaustLocal: [[0.53, 1.68, -3.16], [0.88, 1.69, -3.09]],   // md 排气烟点×2.56
    trackLocal: [[-0.87, 0.1, 0], [0.87, 0.1, 0]],
    trackScrollAxis: 'x',       // 履带 UV 纵向=U（uRange 平铺 ~10 格；两侧同向无镜像）
    mass: 10500,                // 战斗全重 10.5t
    engineHp: 150,              // Praga AC 汽油机
    maxSpeedForward: 42 / 3.6,
    maxSpeedReverse: 7.5 / 3.6,
    maxSpeed: 42 / 3.6,         // 公路
    offroadK: 0.55,             // 越野极速 ≈23km/h（史实）
    revSpeed: 2.6,
    enginePower: 3.2,           // 14hp/t 轻甲歼击车加速灵
    powerFalloff: 0.6,
    clutchDelay: 0.35,
    engineBrake: 1.5,
    brakeDecel: 6.5,
    turnDrag: 0.4,
    slopePower: 0.55,
    hullTraverse: 0.6,
    turretTraverse: 0.10,       // 炮架手摇 ≈6°/s（限角歼击车弱点）
    gunDepression: -5.0,
    gunElevation: 18.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：7.5cm PaK 40/3 L/46 ——
    gunCaliber: 75,
    shellName: 'PzGr.39 (PaK 40)',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 790,
    shellPen: 107,               // mm RHA @0m（30° 口径基准：PaK40 药筒；史实30° 96@500/85@1000/74@1500/64@2000）
    shellPenDrop: 0.2,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40 APCR', nameCn: '钨芯穿甲弹', velocity: 990, pen: 140, penDrop: 0.29 },  // 次口径钨芯弹（3 键；120@500/77@1500）
    heShellName: 'Sprgr.34',
    heVelocity: 550,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 15, apcr: 3, he: 9 },   // 史实弹药分配
    spallPower: 95,
    reloadTime: 5.8,
    dispersion: 0.00026,         // σ：PaK40/3 L/46
    aimTime: 2.0,
    // —— 装甲（mm RHA；开顶薄甲）——
    armor: {
      hullFront: 50, hullSide: 15, hullRear: 15, hullTop: 10,
      turretFront: 50, turretSide: 10, turretRear: 10,
    },
    // —— 装甲判定模型（2026-09-18 用户编辑器调参导出：38(t) 大倾角首上 + 开顶战斗室）——
    armorModel: {
      hull: {
        box: { x0: -1.06, x1: 1.06, y0: 0.25, y1: 1.55, z0: -2.45, z1: 2.35 },
        plates: [
          { name: '首上', face: 'front', t: 50, pos: [0, 1.12, 1.93], size: [1.9, 1.41], rot: [-53, 0, 0] },
          { name: '首下', face: 'front', t: 50, pos: [0, 0.5, 2.18], size: [1.9, 0.7], rot: [45, 0, 0] },
          { name: '车尾', face: 'rear', t: 15, pos: [0, 1.15, -2.32], size: [2, 1.64], rot: [0.5, 0, 0] },
          { name: '车体侧', face: 'side', t: 15, pos: [0.94, 1.15, 0], size: [4.9, 0.9], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 15, pos: [0.95, 0.45, 0], size: [4.9, 0.8], rot: [0, 90, 0], mirror: true, track: true },
          { name: '战斗室侧', face: 'side', t: 10, pos: [0.94, 1.85, -1.18], size: [2.31, 0.83], rot: [0, 90, 0], mirror: true },
          { name: '动力舱顶', face: 'top', t: 10, pos: [0, 1.55, 0.65], size: [1.9, 2], rot: [-90, 0, 0] },
          // 战斗室开顶：无顶板（缝隙穿过=未命中）
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.8, x1: 0.8, y0: 1.55, y1: 2.3, z0: -1.1, z1: 0.3 },
        plates: [
          { name: '炮盾', face: 'front', t: 50, pos: [0, 1.95, -0.05], size: [1.85, 0.79], rot: [-15, 0, 0] },
        ],
        extras: [],
      },
    },
    // —— 内部布局（2026-09-18 用户编辑器调参导出，按模型内构目视摆放）——
    internal: {
      crew: [
        { id: 'commander', name: '车长兼炮手', x: -0.3,  y: 1.85, z: -1.18, r: 0.33 },
        { id: 'loader',    name: '装填手',     x: 0.35,  y: 1.8,  z: -1.54, r: 0.33 },
        { id: 'driver',    name: '驾驶员',     x: -0.35, y: 1,    z: 0.51,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0.37,  y: 0.9,  z: 0.51,  r: 0.48 }],
        fuel:        [{ x: -0.4,  y: 0.55, z: -0.48, r: 0.33 }, { x: 0.4,  y: 0.55, z: -0.62, r: 0.35 }],
        ammoRacks:   [{ x: 0.51,  y: 1.1,  z: -1.6,  r: 0.4 }, { x: -0.5, y: 1.1,  z: -1.3,  r: 0.35 }],
        breech:      [{ x: 0,     y: 1.64, z: -0.48, r: 0.25 }],
        turretDrive: [{ x: 0,     y: 1.22, z: -0.34, r: 0.21 }],
        optics:      [{ x: -0.48, y: 2,    z: -1.11, r: 0.3 }],
      },
      ringY: 1.78,
      trackX: 0.78, trackY: 1,
    },
    dims: { length: 4.9, width: 2.1, hullHeight: 1.55, turretTop: 2.3 },
    trackWidth: 0.35,
    // 无机枪（模型无机枪节点，史实仅乘员自卫 MP40）
    ammo: { shell: 27, mg: 0 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
fire: 'tankSound/gem/mur3-75mm-inner.mp3',                 // 第三人称开炮：75mm PaK40（敞开战斗室，与镜内同声）
fireAim: 'tankSound/gem/mur3-75mm-inner.mp3',           // 瞄准镜开炮：同上（敞开式炮塔无舱内音差）
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── 追猎者四号 L/70（Jagdpanzer IV L/70 (V) 后期型）────────────────────
  // Pz IV 底盘歼击车：80mm/50° 大倾角战斗室正面，7.5cm StuK 42 L/70（与黑豹 KwK42 同弹道）
  // 无炮塔：火炮在车首战斗室内限角 ±10°，车顶前部有 MG42 架（F 前机枪）
  'jpz4l70': {
    caliber: 75,             // mm 主炮口径（跳弹口径碾压用）
    id: 'jpz4l70',
    nation: 'de',
    reticle: 'de2td7',
    zoomFov: 12.4,              // Sfl.Z.F.1a 固定 5× 视场
    aiRole: 'ambusher',
    aiTraits: { scootChance: 0.6 },                   // 低矮车体：伏击+换位
    name: '四号歼击车 L/70',
    nameEn: 'Jagdpanzer IV L/70',
    model: 'model/opt/jagdpanzer_iv_late.glb',
    scale: 1.0,                 // 实测车体 5.93m（实车 5.9m）=1:1
    forwardAxis: '+x',
    parts: {
      turret: ['mount001_jpz-iv-late-hull_0_0'],            // Saukopf 猪头炮盾（随炮限角转动）
      barrel: ['weapon001_jpz-iv-late-hull_0_0'],
      hullMg: ['weapon2001_jpz-iv-late-hull_0_0'],          // 车顶 MG42 架（前向自动瞄准）
      track: ['track1_jpz-iv-late-track_2_0', 'track2_jpz-iv-late-track_2_0'],
      wheels: ['wheel001_jpz-iv-late-wheels_4_0', 'wheel2_jpz-iv-late-wheels_4_0', 'wheel3_jpz-iv-late-wheels_4_0',
               'wheel4_jpz-iv-late-wheels_4_0', 'wheel5_jpz-iv-late-wheels_4_0', 'wheel6_jpz-iv-late-wheels_4_0',
               'wheel7_jpz-iv-late-wheels_4_0', 'wheel8_jpz-iv-late-wheels_4_0', 'wheel9_jpz-iv-late-wheels_4_0',
               'wheel10_jpz-iv-late-wheels_4_0', 'wheel11_jpz-iv-late-wheels_4_0', 'wheel12_jpz-iv-late-wheels_4_0',
               'wheel13_jpz-iv-late-wheels_4_0', 'wheel14_jpz-iv-late-wheels_4_0', 'wheel15_jpz-iv-late-wheels_4_0',
               'wheel16_jpz-iv-late-wheels_4_0', 'wheel17_jpz-iv-late-wheels_4_0', 'wheel18_jpz-iv-late-wheels_4_0',
               'wheel19_jpz-iv-late-wheels_4_0', 'wheel20_jpz-iv-late-wheels_4_0', 'wheel21_jpz-iv-late-wheels_4_0',
               'wheel22_jpz-iv-late-wheels_4_0', 'wheel23_jpz-iv-late-wheels_4_0', 'wheel24_jpz-iv-late-wheels_4_0',
               'wheel25_jpz-iv-late-wheels_4_0', 'wheel26_jpz-iv-late-wheels_4_0', 'wheel27_jpz-iv-late-wheels_4_0',
               'wheel28_jpz-iv-late-wheels_4_0'],
      // 侧裙/挡泥板变体叠放（optiona~f 同位 4~6 层）→ 只留 a 档防 z-fighting
      hidden: ['skirt-optionb_jpz-iv-late-skirt_9_0', 'skirt-optionc_jpz-iv-late-skirt_9_0', 'skirt-optiond_jpz-iv-late-skirt_9_0',
               'skirt2-optionb_jpz-iv-late-skirt_9_0', 'skirt2-optionc_jpz-iv-late-skirt_9_0', 'skirt2-optiond_jpz-iv-late-skirt_9_0',
               'skirt3-optionb_jpz-iv-late-skirt_9_0', 'skirt3-optionc_jpz-iv-late-skirt_9_0', 'skirt3-optiond_jpz-iv-late-skirt_9_0',
               'skirt4-optionb_jpz-iv-late-skirt_9_0', 'skirt4-optionc_jpz-iv-late-skirt_9_0', 'skirt4-optiond_jpz-iv-late-skirt_9_0',
               'skirt5-optionb_jpz-iv-late-skirt_9_0', 'skirt5-optionc_jpz-iv-late-skirt_9_0', 'skirt5-optiond_jpz-iv-late-skirt_9_0',
               'skirt6-optionb_jpz-iv-late-skirt_9_0', 'skirt6-optionc_jpz-iv-late-skirt_9_0', 'skirt6-optiond_jpz-iv-late-skirt_9_0',
               'skirt7-optionb_jpz-iv-late-skirt_9_0', 'skirt7-optionc_jpz-iv-late-skirt_9_0', 'skirt7-optiond_jpz-iv-late-skirt_9_0',
               'skirt8-optionb_jpz-iv-late-skirt_9_0', 'skirt8-optionc_jpz-iv-late-skirt_9_0', 'skirt8-optiond_jpz-iv-late-skirt_9_0',
               'guard-optionb_jpz-iv-late-hull_0_0', 'guard-optionc_jpz-iv-late-hull_0_0', 'guard-optiond_jpz-iv-late-hull_0_0', 'guard-optione_jpz-iv-late-hull_0_0', 'guard-optionf_jpz-iv-late-hull_0_0',
               'guard2-optionb_jpz-iv-late-hull_0_0', 'guard2-optionc_jpz-iv-late-hull_0_0', 'guard2-optiond_jpz-iv-late-hull_0_0', 'guard2-optione_jpz-iv-late-hull_0_0', 'guard2-optionf_jpz-iv-late-hull_0_0',
               'guard3-optionb_jpz-iv-late-hull_0_0', 'guard3-optionc_jpz-iv-late-hull_0_0', 'guard3-optiond_jpz-iv-late-hull_0_0', 'guard3-optione_jpz-iv-late-hull_0_0', 'guard3-optionf_jpz-iv-late-hull_0_0',
               'guard4-optionb_jpz-iv-late-hull_0_0', 'guard4-optionc_jpz-iv-late-hull_0_0', 'guard4-optiond_jpz-iv-late-hull_0_0', 'guard4-optione_jpz-iv-late-hull_0_0', 'guard4-optionf_jpz-iv-late-hull_0_0'],
    },
    casemate: { arc: 10 },      // StuK 42 战斗室射界 ±10°（史实 20° 总行程）
    // 炮架枢轴 = Saukopf 耳轴（模型 (2.17,1.55,0.22) → 局部 (-0.22, 1.55, 2.17)，炮中线左偏 0.22m）
    turretPivot: [-0.22, 1.55, 2.17],
    barrelPivot: [-0.22, 1.55, 2.17],
    muzzleLocal: [-0.22, 1.51, 3.92],
    exhaustLocal: [[0.05, 1.17, -2.89], [-0.19, 1.2, -2.92]],   // md 排气烟点×2.56
    trackLocal: [[-1.22, 0.1, 0], [1.22, 0.1, 0]],
    trackScrollAxis: 'x',
    mass: 25700,                // 战斗全重 25.7t
    engineHp: 300,              // 迈巴赫 HL120 TRM
    maxSpeedForward: 35 / 3.6,
    maxSpeedReverse: 5.5 / 3.6,
    maxSpeed: 35 / 3.6,         // 公路（L/70 超载，比黑豹慢不少）
    offroadK: 0.54,             // 越野极速 ≈19km/h
    revSpeed: 2.0,
    enginePower: 2.0,           // 11.7hp/t 机动笨重
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.55,
    hullTraverse: 0.5,
    turretTraverse: 0.10,       // 炮架手摇 ≈6°/s
    gunDepression: -5.0,
    gunElevation: 15.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：7.5cm StuK 42 L/70 ——
    gunCaliber: 75,
    shellName: 'PzGr.39/42 (StuK 42)',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 925,
    shellPen: 136,               // mm RHA @0m（30° 口径基准：史实30° 124@500/111@1000/99@1500/89@2000）
    shellPenDrop: 0.17,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40/42 APCR', nameCn: '钨芯穿甲弹', velocity: 1120, pen: 197, penDrop: 0.23 },  // 次口径钨芯弹（3 键；174@500/106@2000）
    heShellName: 'Sprgr.42',
    heVelocity: 700,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 30, apcr: 3, he: 22 },   // 史实弹药分配
    spallPower: 125,
    reloadTime: 8.2,            // s（战斗室局促）
    dispersion: 0.00017,         // σ：KwK42（同黑豹）
    aimTime: 2.2,
    // —— 装甲（mm RHA）——
    armor: {
      hullFront: 80, hullSide: 40, hullRear: 20, hullTop: 20,
      turretFront: 80, turretSide: 30, turretRear: 20,
    },
    // —— 装甲判定模型（2026-09-18 用户编辑器调参导出：Saukopf 炮盾斜置 -41.5° 对齐首上倾角）——
    armorModel: {
      hull: {
        box: { x0: -1.5, x1: 1.5, y0: 0.25, y1: 1.87, z0: -2.95, z1: 3.1 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 80, pos: [0, 1.44, 2.55], size: [2.9, 1.43], rot: [-50, 0, 0] },
          { name: '首下', face: 'front', t: 60, pos: [0, 0.68, 2.72], size: [2.9, 0.9], rot: [30, 0, 0] },
          { name: '车尾', face: 'rear', t: 20, pos: [0, 1.1, -2.88], size: [2.9, 1.4], rot: [10, 0, 0] },
          { name: '侧上', face: 'side', t: 40, pos: [1.45, 1.3, 0], size: [5.9, 1.1], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 20, pos: [1.45, 0.5, 0], size: [5.9, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.87, -0.27], size: [3.05, 4.84], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.7, x1: 0.3, y0: 1.3, y1: 1.8, z0: 2, z1: 3 },
        plates: [
          { name: '炮盾', face: 'front', t: 80, pos: [-0.22, 1.55, 2.56], size: [0.85, 0.7], rot: [-41.5, 0, 0] },
        ],
        extras: [],
      },
    },
    // —— 内部布局（2026-09-18 用户编辑器调参导出：驾驶居右前，机电位并入驾驶）——
    internal: {
      crew: [
        { id: 'driver',    name: '驾驶员', x: 0.8,  y: 1.22, z: 1.43,  r: 0.33 },
        { id: 'gunner',    name: '炮手',   x: -0.5, y: 1.3,  z: 0.9,   r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.55, y: 1.3,  z: 0.7,   r: 0.33 },
        { id: 'commander', name: '车长',   x: 0.6,  y: 1.6,  z: -0.35, r: 0.35 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 0.9,  z: -2.2,  r: 0.6 }],
        fuel:        [{ x: -0.9,  y: 0.6,  z: -0.5,  r: 0.4 }, { x: 0.9,  y: 0.6,  z: -0.5,  r: 0.4 }],
        ammoRacks:   [{ x: -1,    y: 0.9,  z: 0.3,   r: 0.4 }, { x: 1,    y: 0.9,  z: 0.3,   r: 0.4 }, { x: 0.2,  y: 0.9,  z: -1.2,  r: 0.35 }],
        breech:      [{ x: -0.22, y: 1.5,  z: 1.57,  r: 0.4 }],
        turretDrive: [{ x: 0,     y: 0.94, z: 1.3,   r: 0.29 }],
        optics:      [{ x: -0.97, y: 1.57, z: 1.15,  r: 0.3 }],
      },
      ringY: 1.55,
      trackX: 1.1, trackY: 1,
    },
    dims: { length: 5.9, width: 3.2, hullHeight: 1.87, turretTop: 1.95 },
    trackWidth: 0.45,
    hullMgArc: 0.35,            // 车顶 MG42 架水平射界 ±20°
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 3600 },
    ammo: { shell: 55, mg: 3600 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
fire: 'tankSound/gem/75mm-pak-inner.mp3',                  // 第三人称开炮：75mm PaK42（用户指定同款内声）
fireAim: 'tankSound/gem/pz4g-75mm-inner.mp3',           // 瞄准镜开炮：75mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── IS-2 1945 型（斯大林 2 突击坦克，直鼻型）────────────────────
  // 122mm D-25T 重炮：heShell 大口径威力体系（hePower 2.2 / HE 穿深可掀薄顶甲 / 近失弹 4m，docs/heavy-he-damage-plan.md）
  'is2': {
    caliber: 122,             // mm 主炮口径（跳弹口径碾压用）
    id: 'is2',
    nation: 'ru',
    reticle: 'su2',             // TSh-17 望远镜静态分划（沿用苏系）
    zoomFov: 15.5,              // TSh-17 固定 4× 视场
    aiRole: 'anchor',
    aiTraits: { fireAndCover: true, preferRangeK: 0.8 },   // 装填 17.5s：开火必退掩；偏好近战
    name: 'IS-2 1945 型',
    nameEn: 'IS-2 1945',
    model: 'model/opt/is-2_1945.glb',
    scale: 1.0,                 // 实测全长 9.93m 含炮管（实车 9.9m）=1:1
    bakeY180: true,             // 模型车头朝 -Z：绕 Y 180° 烘焙到 +Z 朝前（无 FBX 包裹旋转，仅此一步）
    parts: {
      turret: ['Object_56'],    // 炮塔结构（Object_4 炮管进 barrelGroup）
      barrel: ['Object_4'],
      track: ['Object_28', 'Object_40'],
      wheels: ['Object_8', 'Object_44',                      // 前诱导轮
               'Object_12', 'Object_18', 'Object_24', 'Object_36', 'Object_48', 'Object_54',   // 回转轮 ×3/侧
               'Object_10', 'Object_14', 'Object_16', 'Object_20', 'Object_22', 'Object_26',   // 负重轮 ×6/侧（左）
               'Object_32', 'Object_34', 'Object_38', 'Object_46', 'Object_50', 'Object_52'],  // 负重轮 ×6/侧（右）
    },
    turretPivot: [0.02, 1.55, 0.53],     // 炮塔座圈（Object_56 底环中心实测）
    barrelPivot: [0.02, 1.97, 2.3],      // D-25T 耳轴
    muzzleLocal: [0.02, 1.97, 6.45],     // 炮口（带制退器）
    exhaustLocal: [[0.69, 1.04, -1.57], [-0.65, 1.04, -1.6]],   // md 排气烟点×2.56（视觉校准：向车头移 0.7m）
    exhaustType: 'up',           // IS 甲板朝天管：烟先上喷 0.5~1m 再回落飘散（与 KV/IS 同类）
    trackLocal: [[-1.2, 0.1, 0], [1.2, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 ~12 格；两侧已离线同向化 prep-new3.js）
    trackScrollFlip: true,      // 底段 V 朝车尾递增（同 T-34-85 规则）
    mass: 46000,                // 战斗全重 46t
    engineHp: 520,              // V-2IS 柴油机
    maxSpeedForward: 37 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 37 / 3.6,         // 公路
    offroadK: 0.52,             // 越野极速 ≈19km/h
    revSpeed: 2.0,
    enginePower: 2.2,
    powerFalloff: 0.55,
    clutchDelay: 0.5,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.55,
    hullTraverse: 0.45,
    turretTraverse: 0.22,       // 电动+手摇 ≈13°/s（1945 型电驱动）
    gunDepression: -3.0,        // D-25T 俯角极差（史实弱点）
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：122mm D-25T ——
    gunCaliber: 122,
    shellName: 'BR-471B / OF-471',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 795,
    shellPen: 135,               // mm RHA @0m（30° 口径基准：BR-471B；30° 换算 ~125@500/~115@1000/~105@1500/~95@2000）
    shellPenDrop: 0.15,          // 每千米穿深衰减比例
    heShellName: 'OF-471',
    heVelocity: 800,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 12, apcr: 0, he: 16 },   // 史实弹药分配
    spallPower: 190,            // 25kg 弹体毁伤巨大
    reloadTime: 17.5,           // s 分装重弹（史实 15~22s）
    dispersion: 0.00067,         // σ：D-25T 松公差+炮口制退器（1000m ~0.9m）
    aimTime: 2.8,
    heShell: { power: 2.2, penMult: 0.16, nearMissR: 4, velMult: 1.0 },   // 大口径 HE（OF-471 ≈AP 初速）
    // —— 装甲（mm RHA；1945 直鼻型）——
    armor: {
      hullFront: 120, hullSide: 90, hullRear: 60, hullTop: 20,
      turretFront: 150, turretSide: 90, turretRear: 90,
    },
    // —— 装甲判定模型（2026-09-18 用户编辑器调参导出：铸造炮塔多面棱近似，两颊不对称修形）——
    armorModel: {
      hull: {
        box: { x0: -1.56, x1: 1.56, y0: 0.25, y1: 1.55, z0: -3.44, z1: 3.44 },
        plates: [
          { name: '首上', face: 'front', t: 120, pos: [0, 1.19, 2.7], size: [3.08, 1.6], rot: [-60, 0, 0] },
          { name: '首下', face: 'front', t: 90, pos: [0, 0.55, 3.05], size: [2.6, 0.8], rot: [48.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 60, pos: [0, 1, -3.32], size: [3.12, 1.6], rot: [45, 0, 0] },
          { name: '侧上', face: 'side', t: 90, pos: [1.5, 1.15, 0], size: [6.8, 0.85], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.5, 0.5, 0], size: [6.8, 0.95], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.55, -0.34], size: [3.08, 5], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.2, x1: 1.2, y0: 1.5, y1: 2.56, z0: -1.25, z1: 2.4 },
        plates: [
          { name: '炮盾', face: 'front', t: 200, pos: [0.02, 2.06, 2.38], size: [0.94, 1.03], rot: [-3.5, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 150, pos: [-0.55, 2.04, 2.1], size: [0.75, 0.9], rot: [-3.5, -59, 0] },
          { name: '炮塔正面', face: 'front', t: 150, pos: [0.59, 2.03, 2.1], size: [0.75, 0.9], rot: [0, 48.5, 0] },
          { name: '炮塔颊面', face: 'front', t: 120, pos: [-0.92, 1.99, 1.55], size: [1.01, 0.9], rot: [0, -59.5, 0] },
          { name: '炮塔颊面', face: 'front', t: 120, pos: [0.96, 2, 1.55], size: [0.78, 0.9], rot: [0, 60.5, 0] },
          { name: '炮塔尾部', face: 'rear', t: 90, pos: [0.02, 2, -0.83], size: [2.2, 1.29], rot: [12, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 90, pos: [1.15, 2.09, 0.16], size: [2.2, 1.1], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 30, pos: [0.02, 2.42, 0.87], size: [2.2, 3.26], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    // —— 内部布局（2026-09-18 用户编辑器调参导出：驾驶员居中车首，车长/炮手左炮塔，装填手右炮塔）——
    internal: {
      crew: [
        { id: 'driver',    name: '驾驶员', x: 0,     y: 1.15, z: 1.57, r: 0.33 },
        { id: 'commander', name: '车长',   x: -0.55, y: 1.93, z: 0.5,  r: 0.35 },
        { id: 'gunner',    name: '炮手',   x: -0.55, y: 2.07, z: 1.3,  r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.6,   y: 1.78, z: 0.16, r: 0.35 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 0.8,  z: -2.03, r: 0.63 }],
        fuel:        [{ x: -0.9,  y: 0.94, z: -2.17, r: 0.49 }, { x: 0.9,  y: 0.8,  z: -2.17, r: 0.48 }],
        ammoRacks:   [{ x: -0.45, y: 1.95, z: -0.19, r: 0.4 }, { x: 0.45, y: 0.94, z: -0.27, r: 0.4 }, { x: 0.72, y: 1.78, z: -0.41, r: 0.35 }],
        breech:      [{ x: 0.02,  y: 1.86, z: 1.6,   r: 0.39 }],
        turretDrive: [{ x: 0,     y: 1.22, z: 0.3,   r: 0.36 }],
        optics:      [{ x: -0.27, y: 1.78, z: 1.75,  r: 0.3 }],
      },
      ringY: 1.55,
      trackX: 1.15, trackY: 1.05,
    },
    dims: { length: 6.9, width: 3.13, hullHeight: 1.55, turretTop: 3.1 },
    trackWidth: 0.65,
    mgMuzzleLocal: [0, 3.25, -0.7],   // 车顶 DShK 高射机枪（无独立节点，虚拟枪口点；右键发射）
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.018, range: 600, ammoMax: 900 },
    ammo: { shell: 28, mg: 900 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/122mm-fire.mp3',                // 第三人称开炮：122mm D-25T
      fireAim: 'tankSound/rus/122mm-inner.mp3',            // 瞄准镜开炮：122mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── IS-2 1945 型·B（同车第二模型）────────────────────
  // 用户指定：全部参数与 IS-2 1945 型一致（同一坦克换模）；仅模型/部件节点/枢轴/履带UV 取自
  // tankModel/is-2.glb（轮系与双机枪切分同 is1/kv1 同族法；Object_25 拆出车体机枪 hullMgDt，
  // 炮塔后向 DT 留 Object_25 挂炮塔组；同轴为独立节点 Object_26；DShK 在 Object_22 随炮塔）
  'is2m': {
    caliber: 122,             // mm 主炮口径（跳弹口径碾压用）
    id: 'is2m',
    nation: 'ru',
    reticle: 'su2',             // TSh-17 望远镜静态分划（沿用苏系）
    zoomFov: 15.5,              // TSh-17 固定 4× 视场
    aiRole: 'anchor',
    aiTraits: { fireAndCover: true, preferRangeK: 0.8 },   // 装填 17.5s：开火必退掩；偏好近战
    name: 'IS-2 1945 型·B',
    nameEn: 'IS-2 1945 B',
    model: 'model/opt/is2m.glb',
    scale: 1.0,                 // 实测全长 10.08m 含炮管（实车 9.9m）≈1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_23', 'Object_24', 'Object_22', 'Object_25'],   // 炮塔壳+吊篮+车长塔/DShK+炮塔后向 DT
      barrel: ['Object_27', 'Object_3', 'Object_26'],     // D-25T 炮管+制退器段+同轴 DT（随俯仰装饰）
      hullMg: ['hullMgDt'],     // 车体前 DT（split 下簇，固定车体）——F 发射
      track: ['Object_4', 'Object_7'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'wheelRS', 'wheelLS', 'wheelRI', 'wheelLI',
               'wheelRT1', 'wheelRT2', 'wheelRT3',
               'wheelLT1', 'wheelLT2', 'wheelLT3'],
    },
    turretPivot: [0.0, 1.52, 0.66],      // 炮塔座圈（Object_23 底环带圆拟合）
    barrelPivot: [0, 2.0, 1.3],          // D-25T 耳轴（Object_27 炮盾段 z1.0~1.6）
    muzzleLocal: [0, 2.0, 6.50],         // 炮口（带制退器，轴线 y2.0）
    exhaustLocal: [[0.69, 1.04, -1.57], [-0.65, 1.04, -1.6]],   // 同 is2（视觉校准：向车头移 0.7m）
    exhaustType: 'up',           // 苏系甲板朝天管：烟先上喷 0.5~1m 再回落飘散
    trackLocal: [[-1.25, 0.1, 0], [1.25, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 12 格，底段 dv/dz>0 无需 flip）
    mass: 46000,                // 战斗全重 46t
    engineHp: 520,              // V-2IS 柴油机
    maxSpeedForward: 37 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 37 / 3.6,         // 公路
    offroadK: 0.52,             // 越野极速 ≈19km/h
    revSpeed: 2.0,
    enginePower: 2.2,
    powerFalloff: 0.55,
    clutchDelay: 0.5,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.55,
    hullTraverse: 0.45,
    turretTraverse: 0.22,       // 电动+手摇 ≈13°/s（1945 型电驱动）
    gunDepression: -3.0,        // D-25T 俯角极差（史实弱点）
    gunElevation: 20.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：122mm D-25T ——
    gunCaliber: 122,
    shellName: 'BR-471B / OF-471',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 795,
    shellPen: 135,               // mm RHA @0m（30° 口径基准：BR-471B；30° 换算 ~125@500/~115@1000/~105@1500/~95@2000）
    shellPenDrop: 0.15,          // 每千米穿深衰减比例
    heShellName: 'OF-471',
    heVelocity: 800,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 12, apcr: 0, he: 16 },   // 史实弹药分配
    spallPower: 190,            // 25kg 弹体毁伤巨大
    reloadTime: 17.5,           // s 分装重弹（史实 15~22s）
    dispersion: 0.00067,         // σ：D-25T 松公差+炮口制退器（1000m ~0.9m）
    aimTime: 2.8,
    heShell: { power: 2.2, penMult: 0.16, nearMissR: 4, velMult: 1.0 },   // 大口径 HE（OF-471 ≈AP 初速）
    // —— 装甲（mm RHA；与 is2 一致）——
    armor: {
      hullFront: 120, hullSide: 90, hullRear: 60, hullTop: 20,
      turretFront: 150, turretSide: 90, turretRear: 90,
    },
    // —— 装甲判定模型（与 is2 相同板图）——
    armorModel: {
      hull: {
        box: { x0: -1.56, x1: 1.56, y0: 0.25, y1: 1.55, z0: -3.44, z1: 3.44 },
        plates: [
          { name: '首上', face: 'front', t: 120, pos: [0, 1.19, 2.7], size: [3.08, 1.6], rot: [-60, 0, 0] },
          { name: '首下', face: 'front', t: 90, pos: [0, 0.55, 3.05], size: [2.6, 0.8], rot: [48.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 60, pos: [0, 1, -3.32], size: [3.12, 1.6], rot: [45, 0, 0] },
          { name: '侧上', face: 'side', t: 90, pos: [1.5, 1.15, 0], size: [6.8, 0.85], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 30, pos: [1.5, 0.5, 0], size: [6.8, 0.95], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 20, pos: [0, 1.55, -0.34], size: [3.08, 5], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.2, x1: 1.2, y0: 1.5, y1: 2.56, z0: -1.25, z1: 2.4 },
        plates: [
          { name: '炮盾', face: 'front', t: 200, pos: [0.02, 2.06, 2.38], size: [0.94, 1.03], rot: [-3.5, 0, 0] },
          { name: '炮塔正面', face: 'front', t: 150, pos: [-0.55, 2.04, 2.1], size: [0.75, 0.9], rot: [-3.5, -59, 0] },
          { name: '炮塔正面', face: 'front', t: 150, pos: [0.59, 2.03, 2.1], size: [0.75, 0.9], rot: [0, 48.5, 0] },
          { name: '炮塔颊面', face: 'front', t: 120, pos: [-0.92, 1.99, 1.55], size: [1.01, 0.9], rot: [0, -59.5, 0] },
          { name: '炮塔颊面', face: 'front', t: 120, pos: [0.96, 2, 1.55], size: [0.78, 0.9], rot: [0, 60.5, 0] },
          { name: '炮塔尾部', face: 'rear', t: 90, pos: [0.02, 2, -0.83], size: [2.2, 1.29], rot: [12, 0, 0] },
          { name: '炮塔侧面', face: 'side', t: 90, pos: [1.15, 2.09, 0.16], size: [2.2, 1.1], rot: [0, 90, 0], mirror: true },
          { name: '炮塔顶', face: 'top', t: 30, pos: [0.02, 2.42, 0.87], size: [2.2, 3.26], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
    },
    // —— 内部布局（与 is2 相同：驾驶员居中车首，车长/炮手左炮塔，装填手右炮塔）——
    internal: {
      crew: [
        { id: 'driver',    name: '驾驶员', x: 0,     y: 1.15, z: 1.57, r: 0.33 },
        { id: 'commander', name: '车长',   x: -0.55, y: 1.93, z: 0.5,  r: 0.35 },
        { id: 'gunner',    name: '炮手',   x: -0.55, y: 2.07, z: 1.3,  r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.6,   y: 1.78, z: 0.16, r: 0.35 },
      ],
      modules: {
        engine:      [{ x: 0,     y: 0.8,  z: -2.03, r: 0.63 }],
        fuel:        [{ x: -0.9,  y: 0.94, z: -2.17, r: 0.49 }, { x: 0.9,  y: 0.8,  z: -2.17, r: 0.48 }],
        ammoRacks:   [{ x: -0.45, y: 1.95, z: -0.19, r: 0.4 }, { x: 0.45, y: 0.94, z: -0.27, r: 0.4 }, { x: 0.72, y: 1.78, z: -0.41, r: 0.35 }],
        breech:      [{ x: 0.02,  y: 1.86, z: 1.6,   r: 0.39 }],
        turretDrive: [{ x: 0,     y: 1.22, z: 0.3,   r: 0.36 }],
        optics:      [{ x: -0.27, y: 1.78, z: 1.75,  r: 0.3 }],
      },
      ringY: 1.55,
      trackX: 1.15, trackY: 1.05,
    },
    dims: { length: 6.9, width: 3.13, hullHeight: 1.55, turretTop: 3.1 },
    trackWidth: 0.65,
    mgMuzzleLocal: [0, 3.25, -0.7],   // 车顶 DShK 高射机枪（与 is2 同：虚拟枪口点，Object_22 实体随炮塔；右键发射）
    mgCaliber: '12.7',
    mg: { rate: 8, dispersion: 0.018, range: 600, ammoMax: 900 },
    ammo: { shell: 28, mg: 900 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/rus/122mm-fire.mp3',                // 第三人称开炮：122mm D-25T
      fireAim: 'tankSound/rus/122mm-inner.mp3',            // 瞄准镜开炮：122mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── 费迪南（Ferdinand，Sd.Kfz. 184）────────────────────
  // 保时捷虎底盘重型歼击车：电传动、200mm 战斗室正面、8.8cm StuK 43/2 L/71、后置主动轮
  // 无炮塔（casemate ±11°）；无机枪（模型无机枪节点，史实初期型无自卫机枪）
  // 轮系：模型负重轮焊死合并 → scripts/split-wheels-ferdjag.js 离线切出 6 轮/侧 + 主动/诱导轮
  'ferdinand': {
    caliber: 88,             // mm 主炮口径（跳弹口径碾压用）
    id: 'ferdinand',
    nation: 'de',
    reticle: 'de2td7',
    zoomFov: [12.4, 8.9],       // Sfl.Z.F. 双档 5×/7×（开镜态 Shift 切档）
    aiRole: 'sniper',
    aiTraits: { scootChance: 0, aimErrMulRole: 0.8 },  // 阵地化：原地靠甲、炮口恒指威胁轴
    name: '费迪南',
    nameEn: 'Ferdinand',
    model: 'model/opt/ferdinand.glb',
    scale: 1.0,                 // 实测车体 6.88m / 全长 8.0m 含炮（实车 8.14m）=1:1
    forwardAxis: '+z',          // 模型 +Z 朝前，无需烘焙
    parts: {
      turret: ['Object_17'],                    // 火炮结构（炮架随动 ±11°）
      barrel: ['Object_17', 'Object_4'],        // 炮管+炮口制退段
      track: ['Object_18', 'Object_19'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6',
               'sprocketR', 'sprocketL', 'idlerR', 'idlerL'],
    },
    casemate: { arc: 11 },      // StuK 43/2 炮架水平射界 ±11°（史实 22° 总行程）
    // 偏航/俯仰轴均定于车体中心（z 0，炮轴线高 2.31）——pivot-editor.html 用户标定（2026-09-18）。
    // 炮尾臂 2.57m：-5° 俯角炮尾顶 2.90 < 顶板 3.0 不穿；炮尾 ±11° 摆幅 ±0.49m 在战斗室内
    turretPivot: [0, 2.31, 0.0],
    barrelPivot: [0, 2.31, 0.0],
    muzzleLocal: [0, 2.31, 4.58],
    exhaustLocal: [[0.35, 0.8, -2.82], [-0.09, 0.8, -2.82]],   // md 排气烟点×2.56
    trackLocal: [[-1.37, 0.1, 0], [1.37, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 平铺 ~12 格）
    mass: 65000,                // 战斗全重 65t
    engineHp: 530,              // 2× 迈巴赫 HL120 TRM（电传动）
    maxSpeedForward: 30 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 30 / 3.6,         // 公路
    offroadK: 0.5,              // 越野极速 ≈15km/h（65t 压垮传动）
    revSpeed: 1.8,
    enginePower: 1.6,           // 8.2hp/t 全场最笨重
    powerFalloff: 0.5,
    clutchDelay: 0.55,
    engineBrake: 1.8,
    brakeDecel: 5.5,
    turnDrag: 0.48,
    slopePower: 0.5,
    hullTraverse: 0.4,          // 电传动可原位转向，但 65t 转不快
    turretTraverse: 0.09,       // 炮架手摇 ≈5°/s
    gunDepression: -5.0,
    gunElevation: 14.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：8.8cm StuK 43/2 L/71（与虎王 KwK43 同弹道）——
    gunCaliber: 88,
    shellName: 'PzGr.39/43 (StuK 43)',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 1000,
    shellPen: 203,               // mm RHA @0m（30° 口径基准：史实30° 185@500/165@1000/148@1500/132@2000）
    shellPenDrop: 0.17,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40/43 APCR', nameCn: '钨芯穿甲弹', velocity: 1130, pen: 238, penDrop: 0.18 },  // 次口径钨芯弹（3 键；217@500/153@2000）
    heShellName: 'Sprgr.43',
    heVelocity: 810,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 26, apcr: 2, he: 22 },   // 史实弹药分配
    spallPower: 165,
    reloadTime: 9.5,            // s 分装重弹、战斗室局促
    dispersion: 0.00015,         // σ：PaK43/2（狙击级）
    aimTime: 2.4,
    heShell: { power: 1.0, nearMissR: 2 },   // 88mm HE：轻量近失弹（与虎式/虎王一致）
    // —— 装甲（mm RHA；正面 200mm 战斗室）——
    armor: {
      hullFront: 200, hullSide: 80, hullRear: 80, hullTop: 30,
      turretFront: 200, turretSide: 80, turretRear: 80,
    },
    armorModel: {
      // 2026-09-19 编辑器调参版（用户标定）：战斗室后置（正面墙 z0.09 rot −19）、长前甲板、
      // 首上两段（鼻端 + 后缩驾驶舱前壁）、前车体顶板 ×2（甲板 y1.83 长 3.26）、29° 内倾侧板、
      // 35.5° 后倾车尾；乘员/模块随战斗室后移（车长/炮手/双装填手 z −0.97~−2.1）
      hull: {
        box: { x0: -1.7, x1: 1.7, y0: 0.25, y1: 1.86, z0: -3.44, z1: 3.44 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 200, pos: [0, 2.32, 0.09], size: [3.29, 1.36], rot: [-19, 0, 0] },
          { name: '战斗室侧面', face: 'side', t: 80, pos: [1.26, 2.35, -1.54], size: [1.39, 3.79], rot: [90, 119, 0], mirror: true },
          { name: '战斗室顶', face: 'top', t: 30, pos: [0, 2.94, -1.4], size: [1.96, 3.43], rot: [-90, 0, 0] },
          { name: '战斗室后部', face: 'rear', t: 80, pos: [0, 2.13, -3.36], size: [3.04, 1.65], rot: [19, 0, 0] },
          { name: '首上一段', face: 'front', t: 100, pos: [0, 1.15, 3.28], size: [3.3, 0.58], rot: [-20, 0, 0] },
          { name: '首上二段', face: 'front', t: 100, pos: [0, 1.57, 2.49], size: [3.2, 0.69], rot: [-12.5, 0, 0] },
          { name: '前车体顶板', face: 'top', t: 30, pos: [0.82, 1.83, 1.43], size: [1.6, 3.26], rot: [-90, 0, 0], mirror: true },
          { name: '首下', face: 'front', t: 80, pos: [0, 0.62, 3.13], size: [3.3, 0.75], rot: [42.5, 0, 0] },
          { name: '车尾', face: 'rear', t: 80, pos: [0, 1.22, -3.15], size: [3.12, 1.53], rot: [-35.5, 0, 0] },
          { name: '侧上', face: 'side', t: 80, pos: [1.57, 1.17, 0], size: [6.8, 1.36], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 50, pos: [1.55, 0.45, 0], size: [5, 0.9], rot: [0, 90, 0], mirror: true, track: true },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.4, x1: 1.36, y0: 1.85, y1: 3, z0: -3.37, z1: 0.37 },
        plates: [
          { name: '炮盾', face: 'front', t: 100, pos: [0, 2.31, 0.65], size: [0.84, 0.9], rot: [0, 0, 0] },
        ],
        extras: [],
      },
    },
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.6,  y: 2.42, z: -2.03, r: 0.35 },
        { id: 'gunner',    name: '炮手',   x: -0.5,  y: 2.3,  z: -0.97, r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.5,   y: 2.3,  z: -2.1,  r: 0.35 },
        { id: 'loader2',   name: '装填手', x: 0.6,   y: 2.3,  z: -0.97, r: 0.35 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.35, z: 2.07,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.35, z: 1.93,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,    y: 1.15, z: 1.01,  r: 0.57 }, { x: 0,    y: 1.15, z: -2.1,  r: 0.45 }],
        fuel:        [{ x: -0.9, y: 1.15, z: 0.02,  r: 0.45 }, { x: 0.9,  y: 1.08, z: -0.05, r: 0.45 }],
        ammoRacks:   [{ x: -0.9, y: 1.9,  z: -1.89, r: 0.45 }, { x: 0.9,  y: 1.9,  z: -1.75, r: 0.45 }, { x: 0, y: 1.36, z: -1.11, r: 0.3 }],
        breech:      [{ x: 0,    y: 2.2,  z: -0.48, r: 0.4 }],
        turretDrive: [{ x: 0,    y: 2,    z: -1.68, r: 0.05 }],
        optics:      [{ x: -0.45, y: 2.55, z: -0.34, r: 0.3 }],
      },
      ringY: 2.31,
      trackX: 1.3, trackY: 1.1,
    },
    dims: { length: 6.9, width: 3.4, hullHeight: 1.85, turretTop: 3.0 },
    trackWidth: 0.52,
    // 无机枪（无机枪节点/史实无自卫机枪）
    ammo: { shell: 50, mg: 0 },
    sound: {
      engine: 'sound/t90-eg.mp3',
      mg: 'sound/t90-gun.mp3',
fire: 'tankSound/gem/jpz-fdn-88mm-fire.mp3',               // 第三人称开炮：88mm KwK43（与猎豹同炮）
fireAim: 'tankSound/gem/jpz-fdn-88mm-inner.mp3',        // 瞄准镜开炮：88mm 炮膛内声
      seg: { engineStart: 0.24, mgLoopStart: 0.03, mgLoopEnd: 0.09 },
    },
  },

  // ── 猎豹 G1（Jagdpanther G1，Sd.Kfz. 173）────────────────────
  // 黑豹底盘重型歼击车：8.8cm PaK 43/3 L/71、80mm/55° 大倾角正面、前置主动轮
  // 无炮塔（casemate ±11°）；同轴机枪节点 Object_2（右键随炮发射）
  // 轮系：scripts/split-wheels-ferdjag.js 离线切出 8 轮/侧（交错内排留静态）+ 主动/诱导轮
  'jagdpanther': {
    caliber: 88,             // mm 主炮口径（跳弹口径碾压用）
    id: 'jagdpanther',
    nation: 'de',
    reticle: 'de2td7',
    zoomFov: 12.4,              // Sfl.Z.F. 1a 固定 5× 视场
    aiRole: 'ambusher',
    aiTraits: { scootChance: 0.7, aimErrMulRole: 0.8 },   // 低矮车体：伏击+高频换位
    name: '猎豹 G1',
    nameEn: 'Jagdpanther',
    model: 'model/opt/jagdpanther_g1.glb',
    scale: 1.0,                 // 实测车体 6.8m / 全长 9.6m 含炮（实车 9.86m）=1:1
    forwardAxis: '+z',
    parts: {
      turret: ['Object_7'],                     // 火炮结构（炮架随动 ±11°）
      barrel: ['Object_7', 'Object_6'],         // 炮管+炮口制退器
      mg: ['Object_2'],                         // 战斗室顶前部 MG（随炮架，右键发射）
      track: ['Object_8'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5', 'wheelR6', 'wheelR7', 'wheelR8',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5', 'wheelL6', 'wheelL7',
               'sprocketR', 'sprocketL', 'idlerR', 'idlerL'],
    },
    casemate: { arc: 11 },      // PaK 43/3 炮架水平射界 ±11°（史实 22° 总行程）
    // 炮架枢轴 = 战斗室前板耳轴（yaw）；俯仰轴前移至摇架中段（z 0.6）——
    // 模型炮尾臂 3.04m，-8° 俯角炮尾上翘 0.42m 会顶穿战斗室顶板（2.67），前移后 2.60 贴顶不穿
    turretPivot: [0, 1.96, 2.0],
    barrelPivot: [0, 1.96, 0.6],
    muzzleLocal: [0, 1.93, 6.13],
    exhaustLocal: [[0.22, 1.61, -3.23], [-0.04, 1.65, -3.32]],   // md 排气烟点×2.56 +0.4（斜向上管）+0.2 向车尾
    heatZShift: -0.4,          // 排气热浪比烟点再向车尾移 0.4m（管口伸出更后，仅热浪位移，烟不动）
    trackLocal: [[-1.35, 0.1, 0], [1.35, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（单节点双侧同向，vRange 平铺 ~9 格）
    trackScrollFlip: true,      // 底段 V 朝车尾递增（实测 corr(z,v)<0）
    mass: 45500,                // 战斗全重 45.5t
    engineHp: 700,              // 迈巴赫 HL230 P30
    maxSpeedForward: 46 / 3.6,
    maxSpeedReverse: 6 / 3.6,
    maxSpeed: 46 / 3.6,         // 公路（黑豹机动）
    offroadK: 0.52,             // 越野极速 ≈24km/h
    revSpeed: 2.2,
    enginePower: 2.4,           // 15.4hp/t
    powerFalloff: 0.55,
    clutchDelay: 0.45,
    engineBrake: 1.7,
    brakeDecel: 6.0,
    turnDrag: 0.45,
    slopePower: 0.55,
    hullTraverse: 0.5,
    turretTraverse: 0.10,       // 炮架手摇 ≈6°/s
    gunDepression: -8.0,
    gunElevation: 14.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：8.8cm PaK 43/3 L/71（与虎王 KwK43 同弹道）——
    gunCaliber: 88,
    shellName: 'PzGr.39/43 (PaK 43)',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 1000,
    shellPen: 203,               // mm RHA @0m（30° 口径基准：史实30° 185@500/165@1000/148@1500/132@2000）
    shellPenDrop: 0.17,          // 每千米穿深衰减比例
    apcrShell: { name: 'PzGr.40/43 APCR', nameCn: '钨芯穿甲弹', velocity: 1130, pen: 238, penDrop: 0.18 },  // 次口径钨芯弹（3 键；217@500/153@2000）
    heShellName: 'Sprgr.43',
    heVelocity: 810,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 30, apcr: 3, he: 24 },   // 史实弹药分配
    spallPower: 165,
    reloadTime: 9.0,            // s
    dispersion: 0.00015,         // σ：PaK43/3（同费迪南）
    aimTime: 2.3,
    heShell: { power: 1.0, nearMissR: 2 },   // 88mm HE：轻量近失弹
    // —— 装甲（mm RHA）——
    armor: {
      hullFront: 80, hullSide: 50, hullRear: 40, hullTop: 25,
      turretFront: 80, turretSide: 50, turretRear: 40,
    },
    armorModel: {
      // 2026-09-19 编辑器调参版（用户标定）：战斗室斜正面 55.5°（z2.3）、侧壁 26° 内倾+前缘后收
      // （z −1.6~2.76）、35° 前倾战斗室后部、车尾前移后仰（z−2.81 rot−33）、发动机甲板 y1.87、
      // 炮盾嵌于斜正面（z2.0）；乘员前舱布局（驾驶员/通讯员 z2.2，车长 z−0.5）
      hull: {
        box: { x0: -1.65, x1: 1.65, y0: 0.25, y1: 2.63, z0: -3.49, z1: 3.31 },
        plates: [
          { name: '战斗室斜正面', face: 'front', t: 80, pos: [0, 1.72, 2.3], size: [3.1, 2.55], rot: [-55.5, 0, 0] },
          { name: '首下', face: 'front', t: 60, pos: [0, 0.74, 2.95], size: [3.24, 0.84], rot: [46, 0, 0] },
          { name: '战斗室侧面', face: 'side', t: 50, pos: [1.325, 1.93, 0.58], size: [1.35, 4.35], rot: [90, 116, 0], mirror: true },
          { name: '战斗室后部', face: 'rear', t: 40, pos: [0, 2.135, -1.27], size: [3.02, 0.94], rot: [34, 0, 0] },
          { name: '车尾', face: 'rear', t: 40, pos: [0, 1.17, -2.81], size: [3.2, 1.7], rot: [-33, 0, 0] },
          { name: '发动机甲板', face: 'top', t: 25, pos: [0, 1.87, -2.31], size: [3.22, 2.13], rot: [-90, 0, 0] },
          { name: '侧上', face: 'side', t: 50, pos: [1.57, 1.33, 0], size: [6.7, 1.08], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 40, pos: [1.62, 0.5, 0], size: [6.7, 0.9], rot: [0, 90, 0], mirror: true, track: true },
          { name: '车顶', face: 'top', t: 25, pos: [0, 2.52, 0.28], size: [2.13, 2.9], rot: [-90, 0, 0] },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -1.33, x1: 1.36, y0: 1.4, y1: 2.56, z0: -1.33, z1: 1.5 },
        plates: [
          { name: '炮盾', face: 'front', t: 100, pos: [0, 2, 2], size: [1.15, 1.25], rot: [-50, 0, 0] },
        ],
        extras: [],
      },
    },
    hullMgArc: 0.35,
    mgCaliber: '7.92',
    mg: { rate: 12, dispersion: 0.016, range: 550, ammoMax: 3000 },
    // —— 内部布局（5 乘员，2026-09-19 用户标定：乘员前舱，发动机后置）——
    internal: {
      crew: [
        { id: 'driver',    name: '驾驶员', x: 0.7,  y: 1.15, z: 2.2,   r: 0.33 },
        { id: 'radio',     name: '通讯员', x: -0.7, y: 1.15, z: 2.2,   r: 0.33 },
        { id: 'gunner',    name: '炮手',   x: -0.5, y: 1.35, z: 0.9,   r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.55, y: 1.35, z: 0.7,   r: 0.35 },
        { id: 'commander', name: '车长',   x: 0.6,  y: 1.7,  z: -0.5,  r: 0.35 },
      ],
      modules: {
        engine:      [{ x: 0,    y: 1.2,  z: -1.84, r: 0.61 }],
        fuel:        [{ x: -0.9, y: 1,    z: -1.54, r: 0.4 }, { x: 0.9, y: 0.9, z: -0.8, r: 0.4 }],
        ammoRacks:   [{ x: -0.9, y: 1.43, z: -0.12, r: 0.45 }, { x: 0.58, y: 1.01, z: -0.4, r: 0.45 }, { x: 0.2, y: 1, z: 1.01, r: 0.13 }],
        breech:      [{ x: 0,    y: 1.9,  z: 1.5,   r: 0.42 }],
        turretDrive: [{ x: 0,    y: 1.43, z: 1.57,  r: 0.27 }],
        optics:      [{ x: -0.5, y: 1.75, z: 1.6,   r: 0.3 }],
      },
      ringY: 1.96,
      trackX: 1.3, trackY: 1.05,
    },
    dims: { length: 6.8, width: 3.3, hullHeight: 1.5, turretTop: 2.65 },
    trackWidth: 0.65,
    ammo: { shell: 57, mg: 3000 },
    // —— 音效（2026-09-24 二战音源：双开炮声 + 新式发动机，与黑豹共用 pz5a-egAll）——
    sound: {
      mg: 'sound/t90-gun.mp3',
      fire: 'tankSound/gem/jpz-fdn-88mm-fire.mp3',           // 第三人称开炮：88mm KwK43
      fireAim: 'tankSound/gem/jpz-fdn-88mm-inner.mp3',       // 瞄准镜开炮：88mm 炮膛内声
      drive: 'tankSound/gem/pz5a-egAll.mp3',                 // 新式发动机（单文件形）：前 7s=加速段 / 7~15s=巡航段 / 末尾 3.83s=怠速段（原4s，2026-09-26 裁掉文件尾 0.17s 收弱段消接缝停顿感）
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 7, driveCruiseEnd: 15, driveIdle: 3.83 },
    },
  },

  // ── 猎虎（Jagdtiger，Sd.Kfz. 186）────────────────────
  // 虎王底盘重型歼击车：128mm PaK 44 L/55、250mm 战斗室正面、71.7t
  // 无炮塔（casemate ±10°，史实总行程 20°）；前机枪 Object_5（F 发射）
  // 轮系：scripts/split-wheels-jt.js 离线切出外排 5 轮/侧（x±1.56 盘+内环同桶）+ 前主动/后诱导轮；
  //   内排交错轮 4/侧（x±1.22 满盘）按虎王定策留静态
  'jagdtiger': {
    caliber: 128,             // mm 主炮口径（跳弹口径碾压用）
    id: 'jagdtiger',
    nation: 'de',
    reticle: 'de2td7',
    zoomFov: 6.2,               // Sfl.Z.F. 固定 10× 视场
    aiRole: 'sniper',
    aiTraits: { scootChance: 0, aimErrMulRole: 0.8 },  // 10× 瞄具对应最远交战；原地靠甲
    name: '猎虎',
    nameEn: 'Jagdtiger',
    model: 'model/opt/jagdtiger.glb',
    scale: 1.0,                 // 实测全长 10.35m 含炮（实车 10.65m）≈1:1
    forwardAxis: '+z',          // 模型 +Z 朝前，无需烘焙
    parts: {
      turret: ['Object_15', 'Object_2'],          // 火炮结构+炮口制退器（随炮架 ±10°）
      barrel: ['Object_15', 'Object_2'],
      track: ['Object_3', 'Object_7'],
      wheels: ['wheelR1', 'wheelR2', 'wheelR3', 'wheelR4', 'wheelR5',
               'wheelL1', 'wheelL2', 'wheelL3', 'wheelL4', 'wheelL5',
               'sprocketR', 'sprocketL', 'idlerR', 'idlerL'],
      hullMg: ['Object_5'],                       // 前机枪（车体前左，球座）
      hidden: ['Object_4'],                       // md 标注隐藏件
    },
    casemate: { arc: 10 },      // PaK 44 炮架水平射界 ±10°（史实 20° 总行程）
    // 炮轴枢轴 = md 标注的炮塔旋转轴语义（火炮固定位点），按网格实测定于炮盾位（z1.6 / 炮轴线 y2.0）：
    // 炮尾臂 3.0m：-7.5° 俯角炮尾顶 2.39 < 顶板 2.62 不穿；±10° 摆幅 ±0.52m 在战斗室内
    turretPivot: [0, 2.0, 1.6],
    barrelPivot: [0, 2.0, 1.6],
    muzzleLocal: [0, 2.0, 6.28],
    exhaustLocal: [[0.33, 1.45, -3.92], [-0.26, 1.45, -3.9]],   // md 排气烟点 ×3.16
    trackLocal: [[-1.41, 0.1, 0], [1.41, 0.1, 0]],
    trackScrollAxis: 'y',       // 履带 UV 纵向=V（vRange 跨 ~13 格）
    trackScrollFlip: true,      // 底段 dv/dz=-1.5（与虎王同向，翻转）
    mass: 71700,                // 战斗全重 71.7t（全场最重）
    engineHp: 700,              // 迈巴赫 HL230 P30
    maxSpeedForward: 34 / 3.6,
    maxSpeedReverse: 8 / 3.6,
    maxSpeed: 34 / 3.6,         // 公路
    offroadK: 0.5,              // 越野极速 ≈17km/h
    revSpeed: 1.8,
    enginePower: 1.75,          // 9.8hp/t：比虎王还肉
    powerFalloff: 0.5,
    clutchDelay: 0.55,
    engineBrake: 1.8,
    brakeDecel: 5.5,
    turnDrag: 0.5,
    slopePower: 0.5,
    hullTraverse: 0.4,          // 虎王底盘 L801 双流可原位转向，71.7t 转得极慢
    turretTraverse: 0.09,       // 炮架手摇 ≈5°/s
    gunDepression: -7.5,
    gunElevation: 15.0,
    wheelsRotate: true,
    gyroStab: false,
    // —— 火力：12.8cm PaK 44 L/55（PzGr.39/43 28.3kg 920m/s）——
    gunCaliber: 128,
    shellName: 'PzGr.39/43 (PaK 44)',
    shellNameCn: '被帽穿甲弹',
    shellVelocity: 920,
    shellPen: 230,               // mm RHA @0m（30° 口径基准：折中估值 215@500/200@1000/185@1500/170@2000（来源冲突））
    shellPenDrop: 0.13,          // 每千米穿深衰减比例
    heShellName: 'Sprgr. L/5,0',
    heVelocity: 750,             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）
    loadout: { ap: 20, apcr: 0, he: 18 },   // 史实弹药分配
    spallPower: 200,            // 128mm 装药后效（88mm 为 165）
    reloadTime: 13.8,           // s 分装重弹双装填手
    dispersion: 0.00018,        // σ：PaK 44 精密炮
    aimTime: 2.6,
    heShell: { power: 2.4, nearMissR: 4 },   // 128mm Sprgr. 28kg 装药（122mm IS-2 为 2.2）
    // —— 装甲（mm RHA；250mm 战斗室正面，虎王底盘 150/100 首上/首下）——
    armor: {
      hullFront: 150, hullSide: 80, hullRear: 80, hullTop: 40,
      turretFront: 250, turretSide: 80, turretRear: 80,
    },
    armorModel: {
      // 2026-09-20 编辑器调参版（用户标定后整块导出替换）：战斗室正面 z1.22 高 1.07、首上 rot −45、
      // 战斗室侧 24° 内倾（rot [90,114,0]）、车顶 y2.77、战斗室后部前移 z−1.78、发动机甲板 y1.86、
      // 车尾 rot−29、行走部 t50；炮盾 rot−11 z1.86；乘员/模块随新板位微调（炮手 z0.23、发动机 z−2.67）
      hull: {
        box: { x0: -1.95, x1: 1.95, y0: 0.1, y1: 1.97, z0: -4.05, z1: 3.75 },
        plates: [
          { name: '战斗室正面', face: 'front', t: 250, pos: [0, 2.3, 1.22], size: [2.62, 1.07], rot: [-12, 0, 0] },
          { name: '战斗室侧面', face: 'side', t: 80, pos: [1.21, 2.26, -0.19], size: [1.15, 3.21], rot: [90, 114, 0], mirror: true },
          { name: '战斗室顶', face: 'top', t: 40, pos: [0, 2.77, -0.33], size: [2.6, 2.96], rot: [-90, 0, 0] },
          { name: '战斗室后部', face: 'rear', t: 80, pos: [0, 2.27, -1.78], size: [2.92, 1.1], rot: [0, 0, 0] },
          { name: '首上', face: 'front', t: 150, pos: [0, 1.48, 3.27], size: [3.2, 1.13], rot: [-45, 0, 0] },
          { name: '首下', face: 'front', t: 100, pos: [0, 0.72, 3.27], size: [3.2, 1.01], rot: [38, 0, 0] },
          { name: '前车体顶板', face: 'top', t: 40, pos: [0, 1.86, 2.35], size: [3.05, 2.1], rot: [-90, 0, 0] },
          { name: '发动机甲板', face: 'top', t: 40, pos: [0, 1.86, -2.74], size: [3.12, 2.06], rot: [-90, 0, 0] },
          { name: '车尾', face: 'rear', t: 80, pos: [0, 1.22, -3.37], size: [3.1, 1.53], rot: [-29, 0, 0] },
          { name: '侧上', face: 'side', t: 80, pos: [1.45, 1.1, -0.15], size: [7.1, 1.53], rot: [0, 90, 0], mirror: true },
          { name: '行走部', face: 'side', t: 50, pos: [1.7, 0.5, 0.15], size: [6.7, 0.8], rot: [0, 90, 0], mirror: true, track: true },
        ],
        extras: [],
      },
      turret: {
        box: { x0: -0.9, x1: 0.9, y0: 1.3, y1: 2.7, z0: -1.4, z1: 2.6 },
        plates: [
          { name: '炮盾', face: 'front', t: 150, pos: [0, 2.16, 1.86], size: [1.5, 1.24], rot: [-11, 0, 0] },
        ],
        extras: [],
      },
    },
    internal: {
      crew: [
        { id: 'commander', name: '车长',   x: -0.55, y: 2.35, z: -0.6,  r: 0.35 },
        { id: 'gunner',    name: '炮手',   x: -0.5,  y: 2.25, z: 0.23,  r: 0.33 },
        { id: 'loader',    name: '装填手', x: 0.55,  y: 2.25, z: -1.2,  r: 0.35 },
        { id: 'loader2',   name: '装填手', x: 0.55,  y: 2.25, z: 0.1,   r: 0.35 },
        { id: 'driver',    name: '驾驶员', x: -0.55, y: 1.35, z: 2.55,  r: 0.33 },
        { id: 'radio',     name: '通讯员', x: 0.55,  y: 1.35, z: 2.55,  r: 0.33 },
      ],
      modules: {
        engine:      [{ x: 0,    y: 1.25, z: -2.67, r: 0.55 }],
        fuel:        [{ x: -0.9, y: 1.2,  z: -2.4,  r: 0.45 }, { x: 0.9, y: 1.2, z: -2.4, r: 0.45 }],
        ammoRacks:   [{ x: -0.69, y: 1.9, z: -1.04, r: 0.5 }, { x: 0.65, y: 1.29, z: 0.23, r: 0.5 }, { x: 0.9, y: 1.7, z: -0.8, r: 0.45 }],
        breech:      [{ x: 0,    y: 2.05, z: 0.8,   r: 0.4 }],
        turretDrive: [{ x: 0,    y: 1.71, z: 0.94,  r: 0.21 }],
        optics:      [{ x: -0.3, y: 2.5,  z: 0.72,  r: 0.3 }],
      },
      ringY: 2.0,
      trackX: 1.41, trackY: 0.85,
    },
    dims: { length: 7.8, width: 3.6, hullHeight: 1.97, turretTop: 2.9 },
    trackWidth: 0.8,
    ammo: { shell: 38, mg: 2925 },
    sound: {
      idle: 'tankSound/gem/tiger2-eg.mp3',                     // 新式发动机：静止怠速循环
      drive: 'tankSound/gem/tiger2-start-egUp.mp3',            // 新式发动机：前 4s=油门段，其后=循环引擎声
      decel: 'tankSound/gem/tiger2-egDown.mp3',                // 减速停车专用：动→停沿播末尾 2s（与虎王共用）
      mg: 'sound/t90-gun.mp3',
      fire: ['tankSound/gem/jtiger-128mm-fire1.mp3', 'tankSound/gem/128mm-pk-fire.mp3'],   // 第三人称开炮：128mm 双音源每发随机
      fireAim: 'tankSound/gem/128mm-pk-inner.mp3',             // 瞄准镜开炮：128mm 炮膛内声
      seg: { mgLoopStart: 0.03, mgLoopEnd: 0.09, driveAccel: 4, driveCruiseEnd: 17.54, idleStart: 0.9, decelTail: 2 },
    },
  },
};

// 备弹注入（保持旧字段名 shellAmmoMax / mg.ammoMax，供旧框架读取）
for (const id in TANKS) {
  TANKS[id].shellAmmoMax = TANKS[id].ammo.shell;
  if (TANKS[id].mg) TANKS[id].mg.ammoMax = TANKS[id].ammo.mg;
}

// ═══════════════════════ 弹种（AP / APCR / HE） ═══════════════════════
// ap: 被帽穿甲弹（双方均带装药 = APHE 后效）。穿深随距离衰减。
// 跳弹（2026-09-23 史实化）：不再是固定角度必跳，而是概率曲线 ——
//   P = clamp((入射角-ricStart)/(ricFull-ricStart)) × ricK(弹种) × 口径碾压系数(tank.js applyHit)
//   口径/板厚 ≥3 → ×0.1（薄板压不住大弹，塑性失效而非弹跳）；2.5~3 →×0.3；1.5~2.5 →×0.7。
// he: 榴弹。穿深极低、永不跳弹；外部毁伤（断履带/坏炮闩/伤观瞄），对薄甲面可震伤舱内乘员。
export const SHELL_TYPES = {
  ap: {
    key: 'ap', name: 'AP', full: '穿甲弹', keyHint: '1',
    penMult: 1.0,
    penDropK: 1.0,
    ricStart: 50,               // 跳弹概率曲线起点（°）：以下必不跳
    ricFull: 80,                // 跳弹概率曲线满点（°）：以上 ≈必跳
    ricK: 0.85,                 // APCBC 被帽转正：概率略降
    cosFloor: 0.5,              // 角度等效装甲 cos 下限（最多 2 倍）
    velMult: 1.0,
    spallMult: 1.0,             // 后效 = cfg.spallPower × spallMult
    trackBreakK: 1.0,
  },
  apcr: {
    key: 'apcr', name: 'APCR', full: '钨芯穿甲弹', keyHint: '3',
    penMult: 1.0,             // 穿深由 cfg.apcrShell.pen 直接给定（次口径弹弹道独立）
    penDropK: 1.0,
    ricStart: 45,             // 钨芯弹更脆：曲线起点更早
    ricFull: 72,
    ricK: 1.3,                // 且同角度概率更高
    cosFloor: 0.5,
    velMult: 1.0,             // 初速由 cfg.apcrShell.velocity 给定
    spallMult: 0.65,          // 无装药纯动能弹芯：后效明显弱于 APHE
    trackBreakK: 1.0,
  },
  he: {
    key: 'he', name: 'HE', full: '榴弹', keyHint: '2',
    penMult: 0.10,              // 穿深 ≈ 口径/10 量级（88mm→~13mm）
    penDropK: 0,
    ricochetAngle: 180,         // 永不跳弹
    cosFloor: 1.0,              // 按面装甲值直接比
    velMult: 0.72,
    spallMult: 1.8,             // 击穿时爆轰范围更大
    trackBreakK: 0.85,
  },
};

// 备弹拆分：优先读每车 cfg.loadout（史实分配，含 APCR）；缺省退化为 65/35 AP/HE
export const AMMO_SPLIT = { ap: 0.65, he: 0.35 };
export function buildShellLoadout(total, loadout = null) {
  if (loadout) return { ap: loadout.ap ?? 0, apcr: loadout.apcr ?? 0, he: loadout.he ?? 0 };
  const ap = Math.max(2, Math.round(total * AMMO_SPLIT.ap));
  const he = Math.max(2, total - ap);
  return { ap, apcr: 0, he };
}

// ═══════════════ 乘员 + 模块伤害规则（无血条制「铁甲猎手」系统） ═══════════════
// 击杀路径：乘员全灭 / 弹药殉爆 / 起火烧死乘员。坦克无 HP。
export const DAMAGE_RULES = {
  // —— 跳弹口径碾压（2026-09-23 史实化）：caliber/板厚 ≥ 阈值 → 跳弹概率乘 k；薄板压不住大弹 ——
  ricochet: {
    overmatch: [[3, 0.1], [2.5, 0.3], [1.5, 0.7]],   // 从高到低匹配，低于 1.5 → ×1
    maxP: 0.97,                                      // 跳弹概率上限（无绝对必跳）
  },
  // —— 击穿后效：破片锥 + 装药爆轰 ——
  spall: {
    range: 3.8,              // 后效作用距离 m（从命中点起）
    coneAngle: 0.6,          // 破片锥半角 rad（约 35°）
    crewKillDirect: 0.9,     // 弹芯直击乘员 → 阵亡概率
    crewKillSpall: 0.45,     // 破片命中乘员 → 阵亡概率（否则受伤）
    apheBurst: 0.95,         // AP 装药爆轰半径 m（命中点前方 0.6m 处球心）
    heBurst: 2.0,            // HE 击穿爆轰半径 m
    crewKillBurst: 0.85,     // 爆轰半径内乘员 → 阵亡概率
    moduleHitDmg: [45, 90],  // 后效命中模块伤害区间（× spallPower/110 缩放）
  },
  // —— 模块 HP（三档：完好 >50% / 受损 <50% / 损毁 0）——
  modules: {
    engine:      { hp: 110, name: '发动机' },
    fuel:        { hp: 60,  name: '油箱' },
    ammoRacks:   { hp: 50,  name: '弹药架' },
    breech:      { hp: 80,  name: '炮闩' },
    turretDrive: { hp: 60,  name: '方向机' },
    optics:      { hp: 40,  name: '观瞄' },
  },
  // 模块效果倍率
  effects: {
    engineDamagedPower: 0.5,   // 发动机受损功率
    engineDamagedSpeedCap: 0.6,// 发动机受损极速倍率
    fuelDeadSpeedCap: 0.5,     // 油箱损毁（供油受损）极速倍率
    fuelDeadImmobilize: 0.3,   // 油箱损毁 → 直接趴窝（油泵打穿）概率
    breechDamagedReload: 1.6,  // 炮闩受损装填倍率
    driveDamagedTraverse: 0.4, // 方向机受损炮塔转速
    driveDeadTraverse: 0.08,   // 方向机损毁（手摇应急）
    opticsDamagedSpread: 1.8,  // 观瞄受损散布倍率
    opticsDeadSpread: 4.0,     // 观瞄损毁散布倍率
  },
  // —— 乘员受伤/阵亡效果（拟真档：阵亡即重残） ——
  // 驾驶员阵亡 = 立即瘫痪（没人开车，永久，不可修）；车长阵亡 = 索敌减半 + 反应 +30%
  crewEffects: {
    gunner:    { woundSpread: 1.6, woundAim: 1.4, deadSpread: 2.6, deadTraverse: 0.55 },
    loader:    { woundReload: 1.5, deadReload: 2.4 },
    driver:    { woundPower: 0.7, woundTraverse: 0.7 },
    commander: { woundSpot: 0.8, deadSpot: 0.5, deadReact: 1.3 },
    radio:     { woundSpot: 0.95, deadSpot: 0.85 },
  },
  // —— 弃车士气检定（拟真核心：不再战斗到最后一人） ——
  // 触发时机：乘员阵亡 / 模块损毁 / 被击穿后各一次；每车每场最多 maxChecks 次
  bail: {
    maxChecks: 3,
    dead2: 0.40,           // 阵亡 ≥2 人基础弃车率
    dead3: 0.75,           // 阵亡 ≥3 人
    immobileAdd: 0.25,     // 瘫痪中（驾驶员亡 / 发动机毁 / 断带 / 油泵毁）
    burningAdd: 0.30,      // 起火中
    noGunAdd: 0.30,        // 炮闩损毁无法开炮
    recentPensAdd: 0.20,   // 近 10s 被击穿 ≥2 次
    recentPensWindow: 10,
  },
  // —— 修理（读条制）：原地停车读条，可开炮/转炮塔；R 开始/中止 ——
  // 可修项 = 断履带 + 受损（非损毁）的发动机/油箱/炮闩；方向机/观瞄/损毁级损伤不可修
  repair: {
    uses: 3,               // 维修包次数/场
    baseTime: 8,           // 基础时长 s
    perItem: 3,            // 每多一项损坏 +s
    repairableModules: ['engine', 'fuel', 'breech'],   // 仅受损档（moduleState===1）
  },
  // —— 殉爆 / 起火 ——
  ammoDetHit: 0.32,          // 弹药架被后效命中 → 殉爆概率（玩家被打 ×0.3）
  ammoDetOnDestroy: 0.55,    // 弹药架模块 HP 打空 → 殉爆概率
  fuelFireOnHit: 0.4,        // 油箱被命中 → 起火概率（玩家 ×0.5）
  engineFireOnDead: 0.35,    // 发动机损毁 → 起火概率
  fireCrewWoundPerSec: 0.55, // 起火中每秒乘员受伤判定概率
  fireCrewKillPerSec: 0.25,  // 起火中每秒乘员阵亡判定概率（已受伤者 ×1.6）
  fireDetPerSec: 0.06,       // 起火中每秒殉爆概率（玩家 ×0.3）
  fireDuration: 9,           // 起火自然熄灭 s
  // —— 履带 ——
  trackRepair: 1,            // 断履带标记值（不再自修：必须原地读条修理才能开动）
  trackChance: 0.5,          // 履带区被 AP 击穿 → 断履带概率
  heTrackChance: 0.55,       // HE 命中履带区（含未击穿）→ 断履带概率
  // —— HE 未击穿外部毁伤 ——
  heSplash: {
    opticsChance: 0.5,       // 命中炮塔 → 伤观瞄概率
    breechChance: 0.35,      // 命中炮塔正面 → 伤炮闩概率
    thinArmorWound: 30,      // 面装甲 ≤ 此值 → 冲击波震伤舱内乘员
    thinWoundChance: 0.4,
    thinWoundRadius: 1.4,    // 震伤判定：命中点附近乘员半径 m
  },
  // —— 大口径 HE 未击穿结构震伤 + 装甲内崩落（hePower ≥ minPower 才生效；docs/heavy-he-damage-plan.md 方案 C）——
  heShock: {
    minPower: 2,           // 威力系数门槛（122=2.2 / 128=2.4 / 152=3.0）；88/90mm=1 不受影响
    // ① 内崩落：厚板被大口径命中 → 装甲内层崩落破片伤乘员（板越厚崩落越狠——重甲挨大口径也死人）
    scabBase: 0.2,         // 概率 = min(scabMax, scabBase×(P−1) + scabArmorK×armor)；2026-09-23 由 0.12 上调（152 打虎式 44%→60%）
    scabArmorK: 0.002,     // 板厚系数 /mm
    scabMax: 0.65,
    scabRadius: 2.0,       // 崩落破片波及：命中点附近乘员判定半径 m
    scabCrewMax: 2,        // 最多波及乘员数
    scabKillP: 0.35,       // 崩落破片直接阵亡率（未死则受伤）；代码内按 +0.075×(P−1) 缩放，上限 0.55
    // ② 结构震伤：方向机（座圈受震）/ 发动机（支架变形）
    structP: 0.3,          // 每模块概率 = min(structMax, structP×(P−1))；命中部位对应模块 ×1.5（2026-09-23 由 0.2 上调）
    structMax: 0.6,
    structDmg: [20, 40],
    // ③ 薄甲震伤增强（P≥2）：波及人数 1→2、判定半径 += thinWoundRadiusK×(P−1)
    thinWoundCrew: 2,
    thinWoundRadiusK: 0.3,
    // ④ 超压毁伤（2026-09-23）：大口径直击未击穿 → 整车毁伤判定。概率 = tiers 基准 × (P−1)/pScale
    //    分档（P=3 基准）：面甲≤85mm 35% / ≤150mm 15% / 超重甲 5%；122(P=2.2) 实际 21%/9%/3%
    overpressure: {
      minPower: 2,
      tiers: [[85, 0.35], [150, 0.15], [Infinity, 0.05]],
      pScale: 2,
      crewRadius: 2.8,     // 冲击波席卷战斗室：乘员判定半径 m
      crewMax: 3,          // 最多波及乘员数
      crewKillP: 0.7,      // 波及乘员的阵亡率（未死则受伤）
      moduleDmg: [40, 70], // 伴随重创：炮闩 + 方向机/发动机 伤害区间
    },
  },
  // —— 命中反馈文案 ——
  text: {
    pen: '击穿！', bounce: '未击穿', ricochet: '跳弹！',
    kill: '目标歼灭！', ammo: '弹药殉爆！', fire: '敌方起火！', track: '打断履带！',
  },
};

// ═══ 机枪扫射（骚扰压制：无法穿透主装甲，不杀伤乘员；仅小概率破坏观瞄，按命中距离） ═══
// 射程 500-600m；命中率随距离衰减；观瞄破坏概率：≤100m 0.5% / ≤200m 0.3% / ≤300m 0.2%（每有效命中掷一次）
export const MG_RULES = {
  rangeFalloff: [            // 距离衰减锚点（分段线性）：hit=有效命中率
    { d: 50,  hit: 0.5 },
    { d: 100, hit: 0.4 },
    { d: 200, hit: 0.225 },
    { d: 300, hit: 0.12 },
    { d: 500, hit: 0.04 },
    { d: 600, hit: 0 },
  ],
  opticsKill: [              // 观瞄破坏概率（按命中距离阶梯取值）
    { d: 100, p: 0.005 },
    { d: 200, p: 0.003 },
    { d: 300, p: 0.002 },
  ],
};
export function mgFalloff(dist) {
  const F = MG_RULES.rangeFalloff;
  if (dist <= F[0].d) return F[0].hit;
  for (let i = 1; i < F.length; i++) {
    if (dist <= F[i].d) {
      const t = (dist - F[i - 1].d) / (F[i].d - F[i - 1].d);
      return F[i - 1].hit + (F[i].hit - F[i - 1].hit) * t;
    }
  }
  return 0;
}
export function mgOpticsChance(dist) {
  for (const o of MG_RULES.opticsKill) if (dist <= o.d) return o.p;
  return 0;
}

// ── AI 机枪（瞄准自动；开火由 AI 决策触发）──
export const AI_MG_RULES = {
  range: 600,
  reactMin: 1.4, reactMax: 2.8,
  burstMin: 4, burstMax: 7,
  pauseMin: 2.0, pauseMax: 3.6,
  aimErr: 0.02,
  hitMul: 0.5,
};

// ── 命中大烟尘规则（保留）──
export const BIG_DUST_RULES = {
  penChance: 0.5, bounceChance: 0.3, ricochetChance: 0,
  penScale: 1.0, bounceScale: 0.75,
};

// ── 背景音乐 ──
export const BGM = {
  menu: 'bgm/end.mp3',        // 封面 / 菜单 / 车库 / 结算（无缝循环）
  battle: [                   // 战斗曲库：洗牌随机轮播（2026-09-24 增补四首）
    'bgm/start.mp3',
    'bgm/adevnAs.mp3',
    'bgm/fight.mp3',
    'bgm/highWar.mp3',
    'bgm/kersk.mp3',
  ],
  gap: 10,
  nations: {},                // 二战国别曲后续加入（个性化模式并入战斗曲库一起洗牌）
};
