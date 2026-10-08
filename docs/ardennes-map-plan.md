# 阿登森林 · 1944 地图设计（2026-09-28 定稿）

突出部战役主题：雪林山地 + 大雾低云，近中距遭遇/伏击，道路即生命线。
与现有三图差异化：库尔斯克=开阔远射 / 诺曼底=树篱中距 / 普罗霍罗夫卡=冲沟台地 / **阿登=密林软遮挡+脊线反斜面**。

## 用户裁决（2026-09-28）

1. **密林通行 = 方案 A**：树全部可碾倒、穿林慢但自由（不做不可通行林区）。
   **配套关键改动——炮弹穿树**：树不再挡炮弹。树干圆柱只决定"树是否被弹削倒"，
   炮弹穿林继续飞（destructibles.shellHit 树类命中后不再 return true）。
   雪灌木（snowbush1/2）与围栏同级：炮弹直接穿过，只能履带压毁。
2. **飘雪粒子**：做（js/snowfall.js，相机跟随循环雪幕，2400 点单次绘制）。
3. **尺寸 1600×1600**。
4. **不开放普罗霍罗夫卡**（下拉仍注释）。

## 基本参数

| 项 | 值 |
|---|---|
| 尺寸 | 1600×1600（±800） |
| 出生 | 东西矩形带（AR_SPAWNS，主路两端，间距 ~1400m） |
| 地形规则 | TERRAIN_RULES.snow：speedK 0.85 / turnK 0.85 |
| 压实雪路 | world.roadSpeedAt：主路 ×1.15 / 林道 ×1.10（tank.js 钩子早已预留） |
| 曝光/雾 | exposure 0.95；FogExp2 0xc3c9d0 密度 0.0024（视距 ~600m，"空中遮蔽"） |
| 光照 | 12 月阴昼：低角度冷阳 0xdfe6ee×2.3 + 雪面反弹 Hemi |

## 布局（js/mapdata-ardennes.js，纯数据无 three 依赖）

- **路网**：主路东西向沿谷过中心村；两条南北林道（西侧过村、东侧林间），林道过溪处即涉渡点
- **地形**：西脊/东脊（南北向高斯岭线 amp 10/11）+ 北部东西脊（amp 7）+ 中央宽谷；
  大尺度低频起伏（防高频碎坡上坡掉速的教训）；村台地压平；出生带 |x|>600 渐缓
- **雪溪**：AR_CREEK 浅谷下切（depth 3.2 / half 11 / slopeW 24），creekCarve() 供高度场
- **森林斑块**：AR_FOREST 12 块椭圆（[cx,cz,rx,rz,rot,密度]），坡地为主，覆盖 ~45%；
  网格抖动散点（间距 11.5m）+ 边缘羽化；避路 10m / 村 97m / 出生带 / 溪 8m
- **村庄**：中心村 8 栋（比利时 eu_ 组：nivelles 系/mons_shop/feluy/romedenne）+ 农舍点 ×2
- **实机数量**：雪树 3919（snowpine 2806 / snowbare 537 / snowdead 576）+ 雪灌木 131

## 雪树资产（otherModel/snow_trees_pack_lowpoly.glb）

拆分映射（maps.js buildArdennes SNOW_MAP）：
snowpine=snowtree / snowbare=TreeBareTall / snowdead=deadtreehero / snowdead2=deadtreewide /
snowbush1/2=雪灌木。处理要点：
- 材质 BLEND → **transparent=false + alphaTest 0.4**（密林免透明排序错乱）
- 包裹 Group 把包围盒**底面归零、平面居中**（原模型节点带布局位移且底面为负）
- **treeline 平卡弃用**：贴图底部是不透明白色雪地带（非 alpha），近看是白墙；
  0.0024 大雾已包住边界，不需要剪影
- 炮弹判定：cr = 0.55×scale 的树干圆柱（maps.js buildInstancedProps 统一），只触发倒伏不挡弹

## 视线遮挡

森林斑块整体注册 world.sightBlockers（大斑块加卫星圈，topY=地面+14）——
挡点亮判定（两层侦查模型生效），不挡移动不挡炮弹。

## 文件清单

| 文件 | 改动 |
|---|---|
| js/mapdata-ardennes.js | 新增：布局数据 + creekCarve + inPatch + distToPolyline |
| js/maps.js | MAPS.ardennes、ardennesHeight、雪地/雪路贴图、buildArdennes、分派 |
| js/destructibles.js | TREE_TYPES/isTreeType、isConiferType；shellHit 树类放行；INST_PROPS 雪树组 |
| js/snowfall.js | 新增：飘雪（main.js battle 帧驱动 world.snowfall） |
| js/config.js | TERRAIN_RULES.snow |
| js/main.js | PROPS 加载 snow_trees；主循环挂 snowfall.update |
| js/minimap.js | snow 地形底图配色（灰蓝→亮白） |
| index.html | 车库下拉加"阿登森林 · 1944" |
| scripts/ardennes-shot.js / ardennes-probe.js / ardennes-verify.js | 截图/单品审查/规则校验工具 |

## 验证结论（2026-09-28）

- 炮弹穿树：blocked=false 且树倒（treeAlive=false）✓；房屋仍挡弹 ✓
- roadSpeedAt：主路 1.15 / 林道 1.10 / 野地 null ✓；出生带高差 0.88m ✓
- 库尔斯克回归：0 错误 ✓
- 已修问题：treeline 白墙（弃用）、雪路贴图过亮（加深+强化车辙）、小地图绿底（雪配色）

## 已知余项

- 密林中第三人称相机可能插入树冠（近景斑驳）——低模树通病，暂未做相机避障
- 倒树落叶配色沿用绿/松针系（雪地可再调白）
- 无专属冬季 BGM/风声环境音

## 雪原特效主题（2026-09-30 追加，theme='snow'）

**隔离机制**：`Effects.theme`（构造默认 'default'），`maps.js buildMap()` 按图设置
（阿登='snow'，其余图复位 'default'）；`Destructibles._snow()` 读同一开关。其他关卡零影响（已回归验证）。

| 效果 | 默认图 | 阿登雪原 |
|---|---|---|
| AP/HE 落地（dirtHit 土块/黑烟/灰烟/土烟/掀土） | 土棕系 | 雪白+浅灰 5 组配色 |
| HE 爆压尘幕（heGround） | 深土尘 | 雪雾白灰 |
| 弹着尘堆（dustMound 四档） | 沙土系 | 雪白/浅白/浅灰/白灰 |
| 爆炸地面焦土尘（explosion） | 焦土色 | 白灰雪尘 |
| 倒树烟尘（updateFallingTrees/炮击倒树） | 灰白~土色 DUST_COLORS | SNOW_DUST_COLORS |
| 倒树持续烟源（addPropFire mode='smoke'，8~10s） | pickDust 灰褐 | _pickDust 雪白系（2026-09-30 补漏） |
| 村落配树 | 无 | 每栋村屋/农舍旁 1~2 棵积雪树（snowpine/snowbare 小一号，避路 8m/避建筑 2m） |
| 落叶碎片（leafBurst） | 叶绿/松针 | DEBRIS.snowFlake 雪团 + snowDirt 雪尘 |
| 行驶扬尘（trackDust） | 土棕 | 雪雾白 |
| 近地冲击尘环（groundShock 外/内圈） | 土黄 | 雪白/浅灰 |

**雪尘物理（2026-09-30 用户定）**：雪粒比土尘重——炮击地面浮尘沉降快、寿命短。
dirtHit/heGround 各烟段寿命 ×0.6、grav 由负（飘浮）转正 1.0~1.5（下沉）；
dustMound 寿命 ×0.5、grav 2.4→4.0（底云 2.0→3.2）。其余图不变。

配套修正：**炮弹穿树不再出爆炸火光**（shellHit 树类走 fellTree+leafBurst 直倒，
不再走 damageDestructible 的 explosion——穿树弹不在树上引爆，观感与机制一致；全图生效）。

### 后续候选（未做，待评估）

- scorch 焦痕贴花在雪地上可选降 alpha
- trackmarks 履带印在雪地可加深为雪泥色
- 雪灌木压毁碎屑（现木片色，可换 snowFlake）
- 冬季专属 BGM/风声环境音

## 坦克冬季白洗涂装（2026-09-30，js/snowwash.js）

**方案**：onBeforeCompile 片元注入（不动贴图资产）。map_fragment 之后叠加白洗层：
团块场（fbm ~1.2m 斑块）定覆盖、颗粒场（~14cm 喷点）打散边缘、朝上平面磨损加重（甲板踩踏掉漆）、
白浆色随基底明度压暗（半透明盖不实深色底；烧黑处白洗随之变暗=烧色压白洗）。
**每车独立随机种子**（各车组自刷，掉漆分布不同）；对象局部空间采样（车行不滑图）；
履带/负重轮/内衬跳过（parts.track + parts.wheels + interior 名单）。

**隔离**：`world.snowWash = isArd`（maps.js buildMap）；tank.js 构造时 `if (world.snowWash) applySnowWash(...)`。
材质本就逐车克隆，其他关卡零影响（库尔斯克回归确认无白洗）。

**观感调校旋钮**（snowwash.js SW_DEFAULTS）：uSwCover 0.62 覆盖 / uSwAlpha 0.70 不透明度 /
uSwGrain 0.55 边缘颗粒 / uSwScale 0.8 斑块尺度 / uSwScale2 7.0 颗粒尺度 / uSwWear 0.5 平面磨损。

**回滚备份**：`_backup_20260930_snowwash/`（白洗改动前全套 js + index.html）。
验证：scripts/ardennes-wash-shot.js（阿登有白洗/库尔斯克无）+ ardennes-wash-enemy.js。

## 2026-09-30 增补：新素材包 + 小地图路网

**小地图修正**：之前底图只画地形高度带+障碍物，不画路——玩家把溪线/坡影误读为路产生"偏移"感。
坐标映射经核对无误；现 minimap prerender 增加路网绘制（maps.js `MAP_ROADS` 注册表，与建图同源折线，
雪图雪泥灰/其他土黄），四张图全部生效。

**新素材**（main.js PROPS 加载，buildArdennes 使用）：
- `otherModel/rocas_low_poly.glb`（8 款巨石）→ 固态障碍 ×14（脊线露头+空地散布），
  boulder 规则（5 发炮毁/椭圆炮弹判定/挡坦克），替代原小碎石 inst
- `otherModel/snowy_pine_trees-pak.glb`（T1/T2/T3 三款高大松 10~19m）→ pine2_t1/t2/t3 注册树类，
  占林内 45%+宅旁混配；针叶贴图暖黄烘焙色用 m.color 0x93a8ba 冷中和（该材质仅本包）
- `otherModel/psx_electric_pole.glb`（spec-gloss 旧扩展，three 0.185 不支持）→ 脚本转 PBR 存
  `psx_electric_pole_fixed.glb`；主路北侧单排 ×32（52m 间距，pylon01 规则：可压倒/炮弹穿过/无碰撞），
  横担顺路。**不拉电线**（用户定）：倒杆无需处理线的悬空/联动

素材坑记录：sketchfab 包深层嵌套时 splitTownKit 只拆到 RootNode 子级——需对包内子件
按 matrixWorld.decompose 二次反解（松树包 T1/T2/T3 即此例，否则丢 -90°X 旋转树躺平）。
