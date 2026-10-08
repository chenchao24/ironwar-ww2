# 性能优化方案与评审（2026-10-08 · 第一批已落地）

**背景实测**（优化前，本地服务器 + headless Chrome）：
启动到封面 18.8s；JS 堆 840~950MB；FPS 库尔斯克 24 / 诺曼底 20.3 / 阿登 27.3。
根因：① 24 辆坦克 361MB + 全部地图资产开局全量加载；② 诺曼底 3844 软遮挡 / 阿登 4163 可破坏记录全表线性扫。

## 已落地（P0-① + P0-③）

### P0-① 按需加载（main.js）

- `_load()` 启动最小集：当前选中车 + common 布景 + 当前地图资产组；其余车型/图组用时再载
- `_ensureTankAssets(keys)`：GLB 懒加载（`_tankJobs` Map 去重，并发安全）
- 地图资产分组 `_loadPropGroup('common'|'eu'|'ard')`（幂等）：eu=欧洲小镇组（normandy/prokhorovka/ardennes），ard=阿登专属
- 挂载点：`_loadTankThenShow`（先装后进车库流程，车库 loading UI 复用）、`_startPrewarm`（邻居未载跳轮）、
  `_setupMenuShowcase`（资产未到跳过）、`_startBattle`（改 async：`_resolveEnemyKeys` 先解析编队，
  `Promise.all(参战车 + 地图资产)` 就绪后才动世界重建——旧世界保留至新世界可建，不黑屏）

### P0-③ 空间网格

- **destructibles**（16m 格）：registerGroup/registerInst 按包围盒入桶；shellHit 按弹道段 AABB 聚集、
  crushCheck 按车体范围聚集；邮票去重；死亡不摘桶（alive 标志短路）
- **sight blockers**（terrain.js World，32m 格）：addSightBlocker 入桶、removeSightBlocker 同步摘桶
  （灌木被毁失效是活路径，不可省）；visibility._los 软遮挡段按视线 AABB 聚集

## 实测效果

| 指标 | 前 | 后 | 变化 |
|---|---|---|---|
| 启动到封面 | 18.8s | 10.5s | **-44%** |
| JS 堆（战斗） | 860~950MB | 156~351MB | **-60~80%** |
| 进战斗（含懒加载） | ~1s（已预载） | 2.9~8.7s | 首次装载成本移到此（可接受，有 loading UI） |
| shellHit 热路径 | 84.9μs（阿登） | 13.4μs | **-84%** |
| crushCheck 热路径 | 101μs（阿登） | 2.8μs | **-97%** |
| 软遮挡 LOS 段 | 30.7μs（诺曼底） | 10.2μs | **-67%** |

回归：ardennes-verify（穿树/房屋挡弹/雪路/出生带）全过；三图 0 报错。

## 风险评审（修改前已逐条核对）

- R1 懒加载竞态：连续切车 → `_tankJobs` 去重 + 车库已有 `selectedTank` 完成校验 → 安全 ✓
- R2 战斗装载失败：try/catch + loading UI 关闭 + console 报错（不卡死） ✓
- R3 网格语义等价：shellHit"任一命中即爆"与顺序无关；crushCheck/LOS 粗筛条件原样保留于循环内 ✓
- R4 sightRemove 活路径（灌木毁→失效）：网格同步摘桶，无悬空引用 ✓
- R5 headless FPS 噪声大：不作为网格验收标准，改用微基准（scripts/perf-bench-grid.js） ✓
- R6 测试脚本固定 sleep：9 个脚本已改 `waitForFunction(player)` 适配异步战斗开始 ✓
- 回滚备份：`_backup_20261008_perf/`（改动前全套 js + index.html）

## P0-② 说明

DPR 无需改：`_applyQuality()` 已有分档 clamp（high=1.5 / medium=1.25 / low=1）。

## 下一步候选（P1，未做）

1. **GLB 离线瘦身**：贴图 202MB→webp/1024（-70~80%）、几何 meshopt 压缩（-60%）；
   全包 361→约 60~80MB， loader 已有 draco，补 meshopt decoder 即可
2. **资产 LRU 释放**：车库浏览多车后 heap 回升；按"不在 hangarCache/战斗引用中"淘汰车型资产
3. **TIME_TO_COVER 再拆**：10.5s 里世界构建/POI/首车装载占多少，打点后再定（可先做封面先行 + 后台建世界）
4. 静态子件 `matrixAutoUpdate=false`（装甲板/内饰/合批建筑）
5. 阿登雾 600m → 距离剔除 far 从 1100 收紧 ~700m（少画一半林）；EU 房模纹理合 atlas（208→<50 张）

## 复测入口

- `node scripts/perf-profile.js`（加载时长/堆/三图 FPS）
- `node scripts/perf-bench-grid.js`（shell/crush 微基准 A/B）
- `node server.js` → http://localhost:8081 实测

## 2026-10-08 第二批（P1 落地）

### P1-③ 启动拆解（打点结论）

资源并行加载 ~2.6s 即完；**车库构造 3.2s**（程序化贴图/合并网格/PMREM）与**首帧 shader 编译 ~2.4s** 才是主因。

### P1-④ 启动瘦身（10.5 → 4.7s）

- Garage 改为**进车库时按需创建**（其 loading 流程本就存在，体验无损）
- 首帧 shader 编译改 `renderer.compileAsync`（KHR_parallel_shader_compile 并行编译）
- **静态布景矩阵冻结**（terrain.js World 构造尾）：world.root 直下子件除阳光/雪幕外
  `matrixAutoUpdate=false + matrixWorldAutoUpdate=false`（战斗中新建的倒伏/废墟件为默认 true，不受影响）

### P1-② 车型资产 LRU

`_evictTankAssets()`：保留集（选中/参战/展示/车库缓存）外最多留 2 辆，淘汰时 dispose 几何+贴图、
清 `_tankJobs`（可再懒加载）；挂在战斗开始与车库装载完成两处。

### P1-① GLB 离线瘦身（361MB → 124MB，-66%）

- `scripts/optimize-glb.mjs`：dedup + prune + 贴图 WebP/≤1024/q85 + 几何量化（pos14/nor10/uv12）
- 产物 `model/opt/*.glb`，`config.js` 24 条 model 路径已切到 opt（**回退 = 路径切回 model/原文件**）
- 坑 1：meshopt 压缩部分模型触发 encoder assert（index 布局）→ 弃用 meshopt，webp+quantize 已够
- 坑 2：MeshoptDecoder 曾误引 bare 路径 `three/examples/...`（importmap 只映射 three 与 three/addons/）→
  整个 main.js 挂掉白屏——弃用 meshopt 后一并移除；教训：**新模块引用先查 importmap 映射**

### 终测（优化前 → 最终）

| 指标 | 优化前 | 最终 |
|---|---|---|
| 启动到封面 | 18.8s | **4.7s（-75%）** |
| JS 堆（战斗） | 860~950MB | **91~303MB（-70~90%）** |
| 进战斗（含懒加载） | ~1s | 6.8~12.1s（有 loading UI，首次装载成本位移） |
| 坦克 GLB 全包 | 361MB | **124MB（-66%）** |
| shellHit / crush / 软遮挡 | 84.9 / 101 / 30.7μs | **13.4 / 2.8 / 10.2μs** |
| FPS（headless，只看相对） | 20~28 | 27.3~27.7（复测正常；单次 15 系机器争用噪声，复跑排除） |

回归：ardennes-verify 全过、三图 0 报错、瘦身模型战斗观感无损（shot-perf-opt-battle.png）。

### 剩余候选（未做）

- EU 房模 34 个 GLB 同样可跑 optimize-glb（改脚本遍历 otherModel/EuropeCity/opt/）
- 诺曼底树篱 3844 sight blockers 整段合并长胶囊（数量级再降）
- 阿登剔除 far 随雾收紧至 ~700m
- server.js gzip/缓存头；粒子池上限自适应
