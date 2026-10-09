# 钢铁战线3 — 铁甲猎手 · 项目技术文档

> **用途**：供后续 AI 或开发者接手维护时快速理解项目全貌。
> **基底**：整体继承自《钢铁战线2 — 装甲前锋》（C:\Users\CC\Desktop\ironWar-Tank），渲染/特效/粒子/相机/AI 框架/车库/音频引擎复用；伤害模型重写为**无血条·乘员+模块制**。
> **最后更新**：2026-10-09（**阿登森林地图 + 雪地特效主题 + 炮弹穿树 + 冬季白洗涂装 + 小地图路网 + 新素材包 + 步兵 v2（未接入）+ 性能优化两批 + Git/CF Pages/绿色包发布体系**——新图"阿登森林·1944"（1600² 雪林山地大雾：山脊/溪谷/中心村/12 森林斑块 3900+ 雪树/飘雪/压实雪路提速/比利时房模，js/mapdata-ardennes.js + buildArdennes，docs/ardennes-map-plan.md）；**炮弹穿树**（destructibles.shellHit 树类放行——不爆不挡弹，用户裁决）；**Effects.theme 雪原主题**（按图差异化白尘系+雪尘物理，其余图零改动）；**snowwash.js 冬季白洗涂装**（onBeforeCompile 注入，每车独立掉漆分布，履带/轮组跳过）；**三素材包**（rocas 巨石=真掩体 / snowy_pines 高松混林 / psx 电线杆沿路——spec-gloss 转 PBR + 嵌套包 matrixWorld 反解两坑已录迭代手册）；**小地图画路网**（MAP_ROADS 注册表，"偏移"实为底图从未画路）；**性能两批**（懒加载启动 18.8→4.7s、堆 -80%；destructibles/软遮挡空间网格热路径 -67~-97%；GLB 瘦身 361→124MB（model/opt/，scripts/optimize-glb.mjs）；静态布景矩阵冻结；车库按需创建；compileAsync；资产 LRU——全案 docs/perf-plan.md）；**发布体系**：git 建仓（分批提交+断线续传）+ Cloudflare Pages（ironwar-ww2.pages.dev；wrangler 按 .gitignore 跳文件坑→three 迁 vendor/）+ 绿色包 IronWar3-绿色版.zip（bin/node.exe+启动 bat——bat 必须 GBK+CRLF）；**步兵 v2**（js/infantry2.js+infantry2-test.html，德美苏三阵营+IK 姿态机+班组炮击/机枪，已完成并验证，按用户裁决暂不接入，接入清单 docs/infantry-plan.md）；**迭代手册 docs/迭代手册.md**（新车/新地图/新系统接入 checklist 与历次事故勿踩清单））；2026-09-24（**虎式二战音源接入 + 新式发动机声体系（audio.js）**：①**开镜炮声**——虎式 `sound.fireAim` → `tankSound/gem/pz6e-tiger-88mm-inner2.mp3`（88mm 炮膛内声，`playFire(1, rig.aiming)` 既有 aiming 分支直接生效）；**第三人称开炮**——`sound.fire` → `tankSound/gem/pz6e-88mm-fire2.mp3`（88mm KwK36 炮口声 9.89s，同日补齐）；②**新式发动机双循环**（`cfg.sound.idle`+`drive` 都在才启用）：`tiger2-eg.mp3` 静止怠速循环 / `tiger-egAll.mp3` 油门行驶循环（前进·后退·原地转向，**末尾 `seg.driveTail` 3.5s = 松油门减速段不进循环**）——状态机 `_updateEngineDrive`（main 每帧经 `setEngine(rpm,load,st)` 第三参喂 `{active,atTop,sp}`）：active=油门|转向输入、atTop=TERRAIN_RULES 地形生效极速 ×0.95 阈值（同排气规则式）——**音量档：加速 100%（ENGINE_VOL 1.0）→ 极速后 80%（0.8）→ 松油门减速尾段播一次线性衰减（自然降低，再踩油门即断、刹停快速淡出）→ 停稳回怠速 0.55**；`killEngine()` 击毁熄火（destroyed 早退分支调用，旧式振荡器引擎同享）；stopEngine 新式收尾播减速段；③**连续声模型（同日两次用户反馈定稿）**：行驶声**常驻不中断**——给油=100%（极速 80%）；**松油门仍在动 → 行驶循环不中断，音量按速度滑移 50%~80%**（ENGINE_COAST_MIN 0.5 + SPAN 0.3×spRatio，spRatio=速度/地形生效极速，main `_engineAudioState` 增传）；静止（<0.8m/s）→ 怠速（0.55，与滑行下限几乎等声，停车衔接无缝）；第一脚油门淡入 τ0.35；**开镜=舱内视角 ×0.7**（ENGINE_ATTAIN_K，`_engineAudioState` 增传 aiming）——**敞开式炮塔车豁免**：cfg.openTop=m18/m36/marder3m（装甲模型均无顶板；M10 有车体顶板归封闭）；初版"减速尾段一次播"方案（虎式 3.5s 尾段指数衰减/形 B 交叉淡入）被此模型取代——尾段段仍留在文件里不进行驶循环、只作 stopEngine 熄火收尾声；④**黑豹/猎豹接入二战音源（同日）**——**引擎单文件三段式（形 B）**：`pz5a-egAll.mp3`（20.57s）两车共用，按内容分段使用（`seg.driveAccel 7 / driveCruiseEnd 15 / driveIdle 4`）：**前 7s=加速段独立循环**（踩油门未到极速，accelG 专线）、**7~15s=巡航段**（到极速 80% 档/松油门滑行档），**末尾 4s=怠速段**切段循环（idleSrc loopStart=d−4=16.57），**15~16.57s 减速过渡不进任何循环**（用户反馈：旧切点 17.07 把衰减声裹进了油门循环）——加速↔巡航两段内容相接（7s 处），切换即交叉淡入淡出无缝过渡；**循环接缝/交替截断治理（同日三次迭代）**：①**无缝循环链**（`_startXLoop/_tickXLoops`）：怠速/巡航循环改双拷贝交叉淡化——当前拷贝到循环尾前 0.15s 调度下一份从段首起、在接缝两侧等功率 ramp 交叉，消除硬跳回的波形断点（暂停错过接缝则从段首即时续播）；②**加速段一次性播放**（不再原地循环——长加速中反复跳回段首是截断感主因）：踩油门沿从段首播一遍，accelG 用**逐帧直写 gain.value（JS 侧指数平滑，绕开 Chrome 自动化时间线；cancel/setValue/ramp 混用后 setTarget 会冻结——实测踩坑）**，末 0.4s 线性让位、巡航链提前淡入（两段内容相接→无截断交接）；松油门即断加速段；③踩油门沿用 raw 输入判定（`_wasActive`），不会被 throttleSmooth 慢衰减的尾沿虚假重触发；**循环边界波形级定标（`scripts/analyze-loop-seam.cjs`：浏览器解码 PCM→20ms 窗 RMS/过零率包络→搜索电平匹配+避瞬态+长度奖励的最优接缝对）**：虎王巡航循环 7.87→**6.9**（波形实测 7.2~7.5 能量隆起 0.145、7.5~7.87 塌陷至 0.078——用户听到的"结尾 0.5s 衔接不好"）；tiger2-eg.mp3 怠速文件头 0~0.9s 为静音+起振（每圈一次突兀）——新增 **seg.idleStart 0.9**（虎式/虎王/猎虎共用该怠速文件，均跳过）；**虎王巡航循环换猎虎 start-egUp（同日）**：新增 **cfg.sound.cruise 独立巡航文件字段**（缺省仍用 drive 切段）——虎王 cruise=start-egUp、`seg.cruiseStart 4 / cruiseEnd 17.54`（波形分析最优接缝，电平匹配 0.001；该文件尾部 20.6~21.07 有衰减故不循环到文件尾），油门段保持 egUp [0,3.5]，加速段→cruise 文件交接走既有总线交叉；猎虎循环同分析修至 **driveAccel 4 + driveCruiseEnd 17.54**（3~4s 过渡归入油门段保持交接连续），并补 **decel=tiger2-egDown.mp3**（减速停车音与虎王共用）；stopEngine 熄火收尾优先用减速文件末段（无 decel 车型仍用行驶音尾段）；**循环边界波形级定标（同日，`scripts/analyze-loop-seam.cjs`：浏览器解码 PCM→20ms 窗 RMS/过零率包络→搜索电平匹配+避瞬态+长度奖励的最优接缝对）**：虎王巡航循环 7.87→**6.9**（波形实测 7.2~7.5 能量隆起 0.145、7.5~7.87 塌陷至 0.078——用户听到的"结尾 0.5s 衔接不好"，seg.driveCruiseEnd 排除）；tiger2-eg.mp3 怠速文件头 0~0.9s 为静音+起振（每圈一次突兀）——新增 **seg.idleStart 0.9**（虎式/虎王/猎虎共用该怠速文件，均跳过）；**美/苏/英批次（同日，24 车炮声全覆盖）**：m4a3 `us-76mm-fire/inner`、m26 `m26-90mm-fire/inner`、**m36/m10/m18 敞篷单声**（m36=m26-90mm-inner、m10=us-75mm-fire、m18=rus/76mm-fire，fire==fireAim）、cromwell `uk/57mm-fire/inner`、t34-85 `t34-85mm-fire1/inner`、su100 `100mm-fire/inner`、is2/is2m `122mm-fire/inner`、su152/isu152 `152mm-fire/inner`、kv1 `76mm-fire/inner`、is1 `85mm-fire/inner`（usa/m38-90mm-* 两文件未指派——用户口径以 M36 敞篷单声为准）；**引擎扩展（单文件三段形，无独立怠速）**：m26 `usa/m26-egDown.mp3`（22.22s：加速 4.9 / 巡航→13.06 / 减速 16.4 起）、m4a3 `usa/m4-egDown.mp3`（23.16s：3 / →17.4 / 17.4~20，**20s 后剪除**=driveDecelEnd）、t34-85+su100 `rus/t34-egAll.mp3`（16.99s：4.9 / →13.24 / 13.8 起）——新增 **seg.driveDecelStart/driveDecelEnd**（同文件减速段：巡航循环止于起点，动→停沿播 [start, end||文件尾] 一次）+ **无独立怠速回退**（静止=巡航循环低速 0.35 代怠速，ENGINE_NOIDLE_STILL）；边界均由 analyze-loop-seam 波形定标（m26 尾部 17s 起塌陷至 0.02、m4 19s 后近静音、t34 13.8s 起衰减）；回归 `scripts/usa-rus-sound-test.cjs`（21 文件 HTTP200 + 14 车静态字段 + 4 引擎 seg + m26/m4a3/t34-85 三场 e2e：静止低速回退/加速段/滑行/减速段偏移捕获/双开炮声）；**命中音距离衰减 + 程序化着火音移除（同日用户反馈）**：`audio.setListenerPos`（main 每帧喂玩家位置）+ `_hitAtten(d)`（120m 内全量→线性衰减→1120m 触底 0.08）——`playHitArmor(pen, dist)` 四处 shell 调用点传 `_distToPlayer(shell.pos)`、AI 互撞闷响（main）传中点距离；跳弹（playRicochet）按用户要求不动、爆炸 playExplosion/prop 音既有距离衰减不变；**startFire 程序化着火音（LFO 脉冲噪声）移除**——startFire/stopFire 保留空壳接口待配音文件；验证：usa-rus 套件新增近/远命中增益断言（0.8 vs 0.096）+ startFire 空操作 + 1v3 回归零报错；黑豹开炮 `pz5a-fire1.mp3`（8.0s）+ 镜内 `pz5a-75mm-inner2.mp3`（8.7s），猎豹 `jpz-fdn-88mm-fire.mp3`（9.5s）+ 镜内 `jpz-fdn-88mm-inner.mp3`（9.2s），虎式第三人称开炮同日换 `pz6e-88mm-fire2.mp3`（9.9s）；**第二批开火声（同日）**：黄鼠狼 `mur3-75mm-inner.mp3`（**敞开式炮塔第三人称/镜内同声**）、虎王 `pz62-tiger2-88mm-fire1/inner`、费迪南与猎豹共用 `jpz-fdn-88mm-fire/inner`、四号 G/J `75mm-long-fire/inner`、四号歼击车 fire=`75mm-pak-inner`/fireAim=`pz4g-75mm-inner`（用户指定）、**猎虎 fire=双音源数组**（`jtiger-128mm-fire1` 3.7s + `128mm-pk-fire` 7.6s，`sound.fire` 支持数组→playFire 每发随机，loadExtSounds 展开解码）/镜内 `128mm-pk-inner`；**虎王/猎虎引擎（同日）**——虎王三件套：怠速 `tiger2-eg.mp3`、油门 `tiger2-egUp.mp3`（前 3.5s=加速段独立循环，其后=巡航段）、**减速停车专用 `tiger2-egDown.mp3`**（`sound.decel` + `seg.decelTail 2`：动→停沿播**末尾 2s** 一次、首段不用，音量随时间衰减；再踩油门即断，静止不重触发）；猎虎：怠速同 `tiger2-eg.mp3`、`tiger2-start-egUp.mp3` 前 3s=油门段+其后=循环引擎声（无 driveTail 时巡航循环默认到文件尾）；⑤其余车 idle/drive 缺省 → 自动回退旧 t90 单循环引擎路径，行为不变。验证 `scripts/tiger-sound-test.cjs`（29 项全过：三文件+fire HTTP200/解码时长 3.7/16.61/8.21s/静止怠速/加速 driveG=1.0/软土极速 18.1km/h 时 0.8/**开镜 0.56·退镜恢复**/松油门 tailSrc 挂起/刹停回怠速/开镜开炮实选 8.21s 缓冲/**第三人称开炮实选 9.89s 缓冲** + 1v3 回归零报错））；2026-09-21~23（**新车十连接入（第 14~24 辆）+ 参数化轮系切割脚本 + 车库两级下拉选择器 + 排气类型系统**——**美系**：M26 潘兴（90mm M3·148 穿·40/20 公路越野·垂稳·brawler）、M18 地狱猫（76mm M1A1·89/42 全场最快·ambusher 打了就跑+fleeOnConfirm）、M36 杰克逊（90mm M3·ambusher scoot 0.5）；**德系**：四号 G 型（KwK40 L/48·100 穿·电动炮塔 14°/s·brawler）、四号 J 型（同炮·**手摇炮塔 5°/s 史实弱点**·38km/h）；**苏系**：KV-1 1942（76mm F-34·105 首上·anchor）、IS-1（85mm D-5T·120 首上·anchor）、IS-2 1945 型·B（is2m=同车第二模型，全参数克隆 is2）、SU-100（100mm D-10S·170 穿·casemate ±8°·ambusher 坦歼）、SU-152（KV 底盘）/ISU-152（IS 底盘）（152mm ML-20S·hePower 3.0·**defaultShell 'he' 默认高爆·史实主攻方式**·ambusher+fireAndCover 退掩不冲锋）。**轮系切割统一参数化**（`scripts/split-wheels-td.js`，CFG 表驱动；bucket 分量岛归桶 / disk 平衡肘模式）——新判据全部见 `docs/wheel-split-playbook.md §十三`：`discYMax`（四号 G 翼子板**竖放备用负重轮**不成种子、留车体，用户指定）；`spanXCap 0.6`（KV/IS 主动轮环 spanX 0.56~0.57 超默认 0.5 帽会漏种子）；假回转轮种子剔除（翼子板泥瓦弧：真回转轮须同心双环 ≥2 分量 + 离主/诱导轮 ≥0.30）；**盘面筋件豁免**（SU-152 加强筋=窄角跨 4~29° 径向件、偏心 0.22~0.29、x 在盘上——弧段规则不得误杀；修复后 SU-152 轮提取 15477→19413 面、KV-1 +2184 面，全车型 0 非圆轮）；**非轮拆分**：M18 Object_14 炮管+炮塔储物杂件合并 → 质心 z>0.6 拆出 barrelTube（杂件留 Object_14 挂炮塔组随炮塔）；KV-1/IS-1 Object_10 与 IS-2 Object_25 为**双 DT 合并件**（y 直方图两簇）→ 下簇拆出 hullMgDt（固定车体 F 发射）、上簇同轴留原节点（随炮塔右键发射）；M36 Object_8 清出 roofMg（y>2.7，避免碎件拉偏伺服支点）；四号 J Object_12 内的炮塔右后**油桶**切出 jerryCan 挂炮塔组随炮塔旋转（用户指定）；SU-100 左主/诱导轮为资产扁平环片（原样保留，注释归档）；**排气类型系统**：`cfg.exhaustType:'up'`（KV/IS 类甲板朝天管——上喷 0.5~1m 后**指数减速渐停、无重力下落**、V 字 15~25° 外向倾角不交叉、寿命 ×0.7）；main.js 按车速/油门算 `alphaMul`（<8km/h 或按 W/S 加速段或原地转向=全浓度，**极速平稳巡航 ×0.5**），effects.exhaustPuff 默认型同云化（size0 0.9 起步）；**车库**：翻页器下新增 国家→坦克 两级下拉（ui._initTankSelector + main._selectHangarTank，翻页/直选/同步全通）；史实越野速度全标定（M26 40/0.45→18km/h 实测 16.2/18.1 全中等，详见地形模式速度体系条目）。验证：check-pz4-out（0 非圆轮）+ verify-td（各车装配/行驶/弹种断言 0 报错）+ verify-tanksel（下拉全链路 0 报错）+ verify-exhaust-alpha/jet-v*（透明度规则/喷起 0.76~0.91m/V 字出生角 18.1°）+ speed-test-m26 等；2026-09-23（**大口径 HE 方案 C 落地：未击穿结构震伤 + 装甲内崩落**（`docs/heavy-he-damage-plan.md`）——`DAMAGE_RULES.heShock` 新块，hePower≥2（122/128mm）HE 未击穿厚甲追加三判定：①**内崩落**（命中板 > 薄甲阈值时按 0.12×(P−1)+0.002×板mm 概率封顶 0.65——122 打虎式首上 100mm ≈34%，命中点 2m 内 1~2 名乘员 35% 击毙否则击伤，"没打穿也死人"史实机制）②**结构伤**（方向机/发动机各掷 0.2×(P−1)、命中部位对应项 ×1.5，吃 20~40 点，座圈受震/支架变形）③薄甲震伤波及 1→2 人、半径 +0.3×(P−1)；P=1（88/90mm）行为逐字节不变，直接命中强度自此高于落地近失弹、倒挂消除。验证 `scripts/heavy-he-test.js`（122 未击穿虎式 ×300：崩落 31%/结构伤 54%/崩落击毙击伤前舱驾驶员通讯员/方向机受损/触发弃车；88mm 对照 ×100 零事件）+ damage/crew-bail/plate-hit 回归全绿 + 零报错）；2026-09-20（**弹着尘堆（dustMound）**：火炮命中地面/坦克均以弹着点为中心，0.5s 延迟后经 `effects._delayed` 队列生成——**出现方式与配色完全对齐房屋倒塌烟尘**（destructibles DUST_COLORS 灰白/灰/灰褐/土色四档 + _jCol/_jA 逐团抖动——**后按用户改浅沙土系**：沙白/浅沙/浅灰/沙色（无深土色，含一档特别浅的灰），"地面主要是尘土沙土而非灰、土色不要太深"）：大团出生（size0 4~7.2 × 边缘 0.55 缩径）+ **全寿命持续膨胀**（size1 11~21、sizeEase 1.6，用户否决 growT 截停方案——"停止膨胀非常假"）+ 低初速外涌（vy 0.3~0.9）drag 0.4 落定成堆；**贴地粘附感：峰高 0.5~3m、团径 ×2 互相重叠连成一片**（用户："不要腾起圆形团子"）；堆积云状、面积均匀布点 + 外缘不规则、中间高两侧低；范围 R=10~20m 随口径（75→10 / 128→20）；存活 20~30s，**初浓随机 60~70%（命中坦克 50~60%）**；**漂移改为重力沉降：grav 0.004~0.007 全程高度降 15~25% 回落贴地**（用户纠正：地面扬尘应重力下降而非上升）；**粒子系统新增 alphaPow 消退曲线（a=1−t^p，可叠加 fadeIn 短渐入防硬跳——出生防硬跳 + 前慢后快淡出）**；**新增 dragH 水平阻尼独立项**（备用，drag 只压垂直时保持水平匀速）。windK 0.12 缓推全堆同风向漂移 4~10m（drag 0.4 下终端速度饱和，25s ≈6m）。shell.js 地面命中（AP/HE）与坦克命中（板缝穿过不触发）均挂接，**命中坦克 opt 整套覆盖**（r/size 0.7、h 0.8、a→α0.6、life 0.7、wind 1.3）；tank.fire 数据新增 caliber。验证 `scripts/dust-mound-test.js`（延迟/生成数量/消退曲线/漂移方向位移/坦克命中 5 项全对 + 双截图）+ smoke 零报错）；2026-09-20（**新车接入：猎虎 Jagdtiger（重型歼击车，第 13 辆）**：`tankModel/jagdtiger.glb`（specGloss→metalRough + 轮系切割 `scripts/split-wheels-jt.js`，playbook 第四例：轮件 Object_8/10 同心环多分量——外排负重轮 5/侧（x±1.56 盘+x±1.39 内环同桶）+ 前主动（z3.00 y0.87 五件/侧）+ 后诱导（z−2.74 y0.70 三件/侧），**内排交错轮 4/侧（x±1.22 满盘）按虎王定策留静态——种子发现加 roadMinX 1.3 外排门**）；模型 +Z 原生 1:1（全长 10.35m 含炮）；**履带 V 轴 + trackScrollFlip:true（底段 dv/dz=−1.5，虎王同签名）**；炮轴枢轴 = md 炮塔旋转轴语义，实测定 [0,2.0,1.6]（炮盾位：俯角 −7.5° 炮尾顶 2.39<顶板 2.62 不穿）；casemate ±10°；史实参数：71.7t / HL230 700hp / 34km/h / PaK 44 L/55 230 穿 920m/s / 装填 13.8s / hePower 2.4 nearMissR 4 / 前机枪 Object_5（hullMg）/ hidden Object_4；armorModel 先网格实测（profile-jt×3）后**编辑器定稿**（2026-09-20 用户标定整块导出替换）：战斗室正面 250 rot−12 z1.22 高 1.07、首上 150 rot−45、首下 100 rot38、**战斗室侧 24° 内倾 80**（rot [90,114,0]，同费迪南 29°/猎豹 26° 写法）、**前车体顶板 y1.86 t40**、车顶 y2.77/40、战斗室后部 z−1.78/80、发动机甲板 y1.86/40、车尾 rot−29、行走部 t50、炮盾 rot−11 z1.86；乘员/模块随板位微调（炮手 z0.23、发动机 z−2.67、方向机 y1.71 r0.21）+ 内部布局（6 乘员：车长/炮手/双装填手/驾驶/通讯；弹药架两侧后置）。tank-display 文案。验证 verify-new3 七车全绿（猎虎：装配/14 轮组/±10° 钳制/hullMg/920 初速）+ plate-hit-test jagdtiger 用例全对（250@0°/65° 跳弹/炮盾随动 yaw0.3/gap/track）+ smoke 零报错）；2026-09-19（**残骸烟柱调参（大火段保持原版不动）**：余烬段/小火点升速降 30%（smolder 主烟 1.7→1.19+0.63r·副烟 1.3→0.91+0.49r / wreckFire 1.2→0.84+0.49r）；初始烟团加大——smolder 主烟 size0 1.5→**3.5**（副烟 1.15→2.2、wreckFire 0.55→1.0）；**偏斜规范化：5~20° 随机方向**（水平分量 = vy·tanθ，替代原 vx/vz ±均匀随机），风偏系数下调保住角度（windK smolder 1.5→0.9·0.85 / wreckFire 1.3→0.8）。验证 kill-effects-test 全绿 + smoke 零报错）；2026-09-19（**残骸烟柱增强 + 40% 持续小火点**：①余烬段烟柱加浓加大——smolder 出烟 0.045→0.034s、主烟 1.0→1.5/4.2→6.2 alpha 0.17→0.24、副烟概率 0.55→0.8 size 0.8→1.15/3.4→5.0 alpha 0.13→0.18（大火段 burning(big) 后续按用户要求恢复原版，不动）；②**destroy 40% 掷持续小火点**（`_wreckFires`，洗牌取 1~2 处：发动机顶部=engine spot 顶 hullHeight+0.1 / 炮塔舱口顶=turretPivot+1.05 / 驾驶室顶=driver 位 hullHeight+0.1，车体局部坐标 update 逐帧转世界，弃车残骸同可能），新 effects.wreckFire（浓黑烟 0.55→3.0/α0.36 + 小火苗 0.4→1.3/α0.8，~0.055s/点节奏）。验证 kill-effects-test（mock 断言：random 0.85→0 处 / 0.1→1 处+坐标合理；泄漏=0）+ 截图烟柱明显增浓 + smoke 零报错）；2026-09-19（**敌方编队编辑器 + 1v5**：车库「敌方数量」固定三按钮改为**编队槽位编辑器**——数量步进器 1~5（`GAME.maxEnemies` 3→5）+ 每槽一个车型下拉（`随机` + 12 车，**选项由 TANKS 动态生成，新车自动进列表**）；settings 新增 `enemyTanks` 槽位数组（长度即敌方数量，旧存档按 enemyCount 迁移补 `random`）；固定阵营开启时下拉只列敌对阵营车型，玩家换车/切阵营后失效选择自动回退「随机」（`ui._refreshEnemySlotOptions`，refreshHangar/阵营开关挂钩）；main.js `_startBattle` 逐槽解析——`random`/未知/同阵营回退旧池随机逻辑；预览区只留模式/地图两行（对手/规则/弹药/消耗品四行移除，给编队面板让位避免右栏过高）。heathaze `MAX_SOURCES` 8→12（1v5 满编 6 车×双排气口）。验证 `scripts/enemy-slots-test.js` 10 项全对（步进封顶封底/阵营过滤/失效回退/混编全车型/5 敌指定编成进战斗型号逐一核对）+ kill-effects/crew-bail/damage/spotting/smoke 全绿）；2026-09-19（**猎豹装甲/内部布局用户编辑器定稿**：整块导出替换——斜正面 55.5°（z2.3 高 2.55）、侧壁 26° 内倾 50mm 且**前缘后收**（z −1.6~2.76，原矩形前伸会抢斜正面跳弹射线）、35° 前倾战斗室后部、车尾前移后仰（z−2.81 rot−33）、发动机甲板 y1.87、炮盾嵌于斜正面（z2.0，turret 盒 z−1.33~1.5）；乘员前舱（驾驶员/通讯员 z2.2，发动机后置 z−1.84，炮闩/观瞄 z1.5+）。plate-hit-test 猎豹用例同步（斜正面 x0.8 rot−55.5 / **ricCenter [1.1,...]** 偏移避开炮盾——CASES 新增可选 ricCenter 字段，ricCenter 未设回退 front.center / 76.2° 跳弹 / 炮盾 yaw0.3 / gap / track）+ verify-new3 猎豹炮盾行移除（炮盾嵌于斜正面面距 ~10cm，2m 回溯段边界极薄——plate-hit-test 已覆盖）。验证 plate-hit-test 全对 + verify-new3 + smoke 零报错）；2026-09-19（**费迪南装甲/内部布局用户编辑器定稿**：用户在 armor-editor 标定后整块导出替换——**战斗室后置**（200 正面墙 z0.09 rot −19 x±1.64、侧面 80 rot[90,119,0] z−3.44~0.36、顶 y2.94、后部 19° 前倾 z−3.36）、**长前甲板**（前车体顶板 y1.83 长 3.26 ×2）、首上两段（一段 y1.15 z3.28 rot−20 / 二段 y1.57 z2.49 rot−12.5）、首下 rot42.5、车尾 rot−35.5 后仰、行走部 t50 长 5；**乘员/模块随战斗室后移**（车长/炮手/双装填手 z−0.97~−2.1，驾驶员/通讯员 z2.0，发动机双球 z1.01/−2.1，弹药架 z−1.1~−1.89）；炮盾移至 z0.65（turret 盒 z−3.37~0.37）。测试同步：plate-hit-test 费迪南用例改新板位（front x0.8 rot−19 / **ricDir 75**——65° 时射线擦炮盾，75° 入射 75.8° 且距炮盾 1.1m / **yaw 0.3**——炮盾距 200 墙仅 0.56m，yaw 0 的 2m 回溯段被墙抢先）/ verify-new3 费迪南炮盾行移除（同因，已由 plate-hit-test 覆盖））。验证 plate-hit-test 全对（200@0/75.8° 跳弹/炮盾随动/行走部/gap）+ verify-new3 + smoke 零报错；⚠ 后续调猎豹装甲时同样注意：炮盾贴近正面墙的车型，垂直入射例需偏轴 + 小 yaw）；2026-09-19（**费迪南/猎豹装甲 v3 网格实测修形**：写 `tmp-armor-profile/planes` 探针直接聚类模型顶点平面片，按真实板面重写两车 armorModel——**费迪南**：战斗室侧壁实为 **29° 内倾斜板**（y1.25~2.92，x1.72→0.79，正面投影=上窄梯形，rot [90,119,0] 写法：ry=90+b 使法线上仰）、200 正面墙实测位（z2.74 近垂直 x±1.0 y2.31~3.02）、**首上分两段**（一段=鼻端近垂直 y1.0~1.45；二段=后缩驾驶舱前壁 y1.5~1.9 z2.68）、**前车体顶板 ×2**（甲板 y1.96 z2.2~2.8 mirror）、19° 后倾战斗室后部（y1.35~2.91 一体斜面）、车顶实测 y2.94 x±0.85、侧上缩为 y0.9~1.25；**猎豹**：侧壁 26° 内倾（y1.26~2.63，x1.66→0.99，rot [90,116,0]）、**61° 长斜正面**（rot −61，鼻端 z2.83 → 车顶前缘 z0.93 一体斜面，替代原 −35 短板）、35° 前倾战斗室后部（y1.55~2.71）、车顶实测 y2.49 x±1.0、首下近垂直鼻端（y0.3~1.47）；⚠ 侧板矩形前缘勿超越斜正面（猎豹侧板初版前伸 z2.8 会抢掉跳弹例——截短至 z1.4）；armor-view.html 加 `__armor.setOverlays()` 看模型本体。验证 plate-hit-test 双车全对（费迪南 200@0/65° 跳弹/炮盾随动/行走部；猎豹 斜正面 80@0/78° 跳弹/炮盾 100@50°/gap/track）+ verify-new3 + smoke 零报错）；2026-09-19（**费迪南/猎豹装甲模型补全**：两车此前的入库占位板仅"战斗室正面+炮盾"——①费迪南：新增战斗室侧面 80/后部 80/顶 30（战斗室封闭盒 z −2.0~2.4）、战斗室正面从 2.2m 窄条加宽到 3.36 全宽并与侧/顶封边、车尾对齐 y0.25~1.85、新增发动机甲板 30（战斗室后发动机舱上表面）；②猎豹：**战斗室斜正面修形**——占位 rot −55/h1.7 上缘止于 y2.0 与车顶 2.6 之间留 0.6m 豁口，改为 55°自水平（rot −35）h2.06 下接首下上抵车顶；新增战斗室侧面 40/后部 40（z −2.3~2.6）+ 发动机甲板 25； hull 参考盒 y1 提到战斗室顶（盒仅编辑器参照，运行时只判定板）；战斗室侧/后板放 **hull 组**（战斗室随机体固定，勿放 turret 组——turret 组随 ±arc 旋转会整体带偏板面）；③plate-hit-test.js 扩多车用例（ferdinand/jagdpanther：正面垂直/65° 跳弹/炮盾/行走部/无板区穿透），用例新增可选 `yaw` 字段——**猎豹炮盾距枢轴仅 0.8m，1.2rad 大 yaw 时炮盾转入战斗室正面之后被合法遮挡，用 0.3rad 验证炮盾板**。验证 plate-hit-test 双车全对（费迪南 200 正面/65° 跳弹/行走部 track；猎豹 80 斜正面/69.7° 跳弹/炮盾 100@50°）+ verify-new3 五车 TOTAL_ERRORS 0 + smoke 零报错）；2026-09-19（**车姿显示器 v4（仪表化三件套）**：①内侧装饰边框圈 r62（刻度环内，`#att-inner`）；②**红色火炮瞄准星指示线**（`#att-gunline`，沿炮管轴线从塔圈到内圈，固定朝上）；③**观测视野扇形**（`#att-sector`，透明深蓝 rgba(46,92,210,.16)+界缘，半角 27.5° 同小地图 SECTOR_SPREAD，随视线相对炮线方位（heading+turretYaw−aimYaw）旋转，**全车型**——替代 v2 的歼击车专属 FoV 浅蓝扇形，main.js 调用去掉 fov 参数）。层级：外环→刻度→内圈→扇形→车体→弧刻线→红炮线→炮塔→车名。验证 attitude-test 全绿（结构含三新件/扇形随视线/卡缘/旋转）+ 截图 shot-attitude-casemate.png + smoke 零报错）；2026-09-19（**车姿显示器 v3（方向语义定稿）**：用户反馈 v1"车体左右反"、v2 改转炮塔也不对——定稿语义：**炮塔/炮管固定朝上作参考，车体轮廓按 +turretYaw 旋转体现车体姿态**（炮塔往哪边转、车体轮廓同侧摆动，与小地图镜像手性一致），v1 的符号恰好相反；射界弧刻线移出车体组改**固定**在炮线两侧 ±arc（车体艏部转到弧缘=卡限位，刻线提亮）；视野扇形改**相对炮线**方位（heading+turretYaw−aimYaw，与小地图 sector 同式）。结构：#att-arc 从 #att-hull 移出为固定层；att-turret 不再带 transform）；2026-09-19（**车姿显示器 v2（按用户反馈定稿）**：①左右反向修复——旧版"炮塔朝上+车体旋转"的旋转要素被读作炮线且几何手性反；改为**车体轮廓固定朝上（+z 车头、+x 车体右=屏右）、炮塔/炮管按 +turretYaw 旋转**（正=右→顺时针），受击标记落点语义随之更直观（车体哪侧被打亮哪侧）；②去掉角度数字与"炮塔↔车体"文字，改显**英文车名**（config 12 车新增 `nameEn`：Tiger I/II、Panther A、M4A3 (76) W、M10 Wolverine、Cromwell Mk IV、T-34-85、Marder III M、Jagdpanzer IV L/70、IS-2 1945、Ferdinand、Jagdpanther）；③歼击车（cfg.casemate）姿态表新增**观察视野扇形**（浅蓝透明，随 rig.aimYaw 相对车体方位旋转、半角=当前相机 FoV/2，与炮管错位一目了然）；④歼击车炮卡弧缘改为**射界弧刻线提亮**（`.clamp`，原数字琥珀随文字移除）；⑤**小地图歼击车射界覆盖扇形**（透明深蓝 rgba(46,92,210,.16)+界缘）：世界航向 ±arc、车头朝上地图上恒朝上，红炮线在扇内摆动。验证 attitude-test 全绿 + 截图 shot-attitude-casemate/shot-minimap-casemate + smoke 零报错）；2026-09-19（**车姿显示器**：`#attitude`（index.html 容器 + ui.js 构建 SVG，战雷式）——右下油门集群左侧 `right:206px`，**炮塔固定朝上**、车体轮廓（履带+车体+车首箭头）按 `−turretYaw` 实时旋转，下方带符号相对角读数；**受击标记**：shell.js 受击回调增传 `hit.worldPos`（跳弹传 `shell.pos`），main.js 转 hull-local 后 `ui.addAttitudeHit` 在车体轮廓上放色点（穿深红/溅射橙/弹跳灰，随车体旋转，2.6s 淡出，最多 8 个）；**歼击车射界弧**：cfg.casemate 车型画 ±arc 琥珀刻线（随车体旋转，炮管须落在其间），炮卡弧缘时读数转琥珀（`.clamp`）。验证 `scripts/attitude-test.js`（旋转跟随/颜色分档/淡出/卡限位实战断言 + 截图 shot-attitude-*.png）+ smoke 零报错；⚠ 开镜真态在 `input.aiming`（主循环每帧回写 rig），测试脚本直接设 rig 会被覆盖）；2026-09-19（**拟真弹道·散布重做 + 测距弹道积分门控**：① 12 车 `dispersion` 由均匀全角 0.0018~0.003 rad 改为**高斯 σ** 0.00015~0.00067 rad（按史实 1000m 50% 散布域反推：KwK43/PaK43 0.15、KwK42 0.17、KwK36 0.22、PaK40/3 0.26、76mm 族 0.33、75mm ROQF 0.36、ZiS-S-53 0.45、D-25T 0.67 mrad）；② `fire()` 改 Box-Muller 高斯两轴独立（噪声加在垂直炮线的正交基上，弃世界 xyz 三轴）——**元凶修复：后坐散布膨胀原在采样之前执行，每发实际按 ≥3× 收敛档打（虎式旧值 400m 每轴 ±2.6m），400m+ 命中率虚低的根因**；改为先采样后膨胀（bloom ×8、切弹 ×6 只作用于后续收圈）；③ `updateFireControl` 乘数按 σ 量级重标定：满速 ×13（无垂稳行进间基本打不中，垂稳减半不变）、aimOffset×40（甩炮中开火散布爆炸）；④ `main._updateRanging` 重写：敌车锁定后对**炮口→瞄准点抛物线逐 ~4m 地形积分**，途中擦地（炮口低于瞄线的近中段视差、hull-down 棱线擦掠）→ 瞄准点抢到碰地点 + `aimBlocked=true`（旧"浅掠让位" dip/hArc 解析豁免缺视差项，废弃；地形步进仅保留无敌车时的锁地）；⑤ HUD：aimBlocked 时炮口指示器琥珀脉动 + 第三人称/开镜距离读数转琥珀（css `#gun-marker.blk`/`#aim-range.blk`/`#gs-range.blk`）——瞄准点永远在准星正下方，玩家此前无法分辨锁的是敌车/棱线/远地；⑥ AI `spreadOk` 门限改相对 σ 倍数（短停 ≤~3σ/行进 ≤10σ，ace `stopSpread`→`stopSpreadK: 2.2`）。验证 `scripts/ballistic-hitrate.js`（静止全收敛实弹：tiger1 四距 100%、t34-85 100/100/88/92、is2 100/100/100/76——史实分级呈现；**探针踩坑：开镜真态是 `input.aiming`（主循环每帧回写 rig.setAimMode）；连射 susPitchV 踢累加需重置悬挂再收敛**）+ graze-verify v3（弹道净空→保留敌坦弹着炮塔；擦地→抢碰地）+ smoke 零报错）；2026-09-19（**排气口热浪**：`js/heathaze.js` 屏幕空间真折射——主渲染直出后 `gl.blitFramebuffer` 把多重采样画布解析拷贝到同尺寸 RGBA8 纹理，排气口处相机朝向公告牌按升腾噪声对拷贝纹理做 UV 偏移重绘，即真背景折射；**零管线侵入**——拷贝=最终显示字节，不动 ACES/sRGB/MSAA 主路径，天空等原样写屏 ShaderMaterial 不受影响；直径 0.6~0.76m 椭圆（垂直 ×1.2 热羽、上飘 ~0.44m/s、双频去周期感），公告牌深度测试+向相机回撤 8cm 被车体/地形遮挡自动失效；强度=怠速 0.3+油门/原地转向/起步加成，击毁/发动机损毁 damp 衰减熄火；MAX 8 源（4 车×双排气口），>260m 亚像素剔除，无热源零开销（不拷贝不渲染），暂停时热浪时钟冻结；二次迭代：抖幅减半 0.07m + engineHp 功率联动（黄鼠狼≈不可见）+ 热羽后移（虎王/猎豹 -0.4、黑豹 -0.7 且烟点上移 0.2m，heatZShift）；验证 `scripts/heat-test.js` 全过（含功率联动公式/虎王·黑豹偏移解析比对）+ smoke 无回归）；2026-09-18（**新车五连 + 大口径 HE 体系 + 歼击车限角机制**：黄鼠狼 III M（marder3m，开顶炮架 ±10.5°·3 乘员·无机枪）/ 四号歼击车 L/70（jpz4l70，±10°·车顶 MG42 走 hullMg）/ IS-2 1945（is2，122mm D-25T：heShell 大口径 HE——hePower 2.2、HE 穿深 penMult 0.16≈25.6mm 可掀薄顶甲入车爆轰、近失弹 nearMissR 4m、HE 初速 velMult 1.0 与 AP 同速）；**费迪南（ferdinand，65t·200mm 战斗室·±11°·无机枪·6 乘员）与猎豹 G1（jagdpanther，46km/h·PaK43 L/71·±11°·同轴机枪走炮架）**——specGloss 材质（split-wheels-ferdjag.js 一并转 metalRough）+ **焊死轮系切割第二三例**：轮在独立轮件节点内但一轮=同心环多分量，切法改「满盘分量发现轮心种子 → 全部分量最近锚点归桶（road 0.3 / S+I 含齿圈放宽）→ 逐轮生成独立网格」；费迪南 6 轮/侧+内排偏移弧留静态、猎豹 8+7 轮/侧（交错内排底弧留静态）；轮心对中性 ≤4cm 全过；履带 UV：费迪南 V 朝车头不翻 / 猎豹单节点双侧同向 V 朝车尾 flip；**casemate 机制**（cfg.casemate.arc：updateTurret 炮架偏航钳制 ±arc，目标超界炮卡弧缘需车体转向；AI engage 横向机动 clampYaw 收进射界，玩家手动对准）；**HE 近失弹**（tank.applyHENearMiss：爆点半径内断带/震观瞄/震伤乘员——乘员判定水平距为主垂直×0.3 加权，88mm 车族 heShell nearMissR 2 轻量版；方案 A/B/D+velMult 落地，C 结构震伤/内崩落未做，见 docs/heavy-he-damage-plan.md）；模型接入：IS-2 车头 -Z 走 bakeY180 + 履带 V 轴离线同向化翻转 Object_40 + trackScrollFlip；jpz 侧裙/挡泥板变体叠放 hidden optionb+；UI 无机枪容错 + HE 提示随威力动态。回归 scripts/verify-new3.js（**五车**装配/限角/HE 参数/近失弹/装甲板法线垂直入射全对）+ smoke + crew-bail + 1v3 零错误）；2026-09-16（**诺曼底 v2 定稿重做 + v3 迭代**：按用户手绘布局稿 + 四轮核对——布局数据抽离为 `js/mapdata-normandy.js`（建图/平面图同源）；紧凑小镇以丁字口为西南角重建（70 栋欧洲小镇组连续沿街立面 + 石板小路 + 硬化广场）；田块分区切块共享边零重叠、邻路随形；树篱新规（内圈每块 ≤2 边 / 外圈零星点缀 / 篱上穿插树木 / R1 镇南伴随篱）；缘带 60~80m 草场只散树。**v3 迭代**：地形——镇台地（附近最高，顶平坡缓）+ 浅洼地 ×2 + 整体起伏加大；地面——去泥土色全绿加深 + 作物行/杂色点/加密颗粒压"动画感"；房屋全线 EU_SCALE **0.88**（09-16 定 ×0.8 偏大 20%，09-18 复看偏小回调 +10%，le_mans_h2/h4 对调保压路零违规）+ 镇区加密（背院填充低模小宅、主街南排）+ 宅旁小灌木/镇内绿化树/镇外围绿带 + 程序化路灯 ×10；**eu 可破坏修复**（placeKit 规则查找缺 EU_PROP_RULE 兜底，旧版静默退化为不可破坏）；**朝向校准**（四向探针：全部模型正面=局部+Z，仅 bourges_h1=-Z；端头件必须用双面可观模型——fumay/feluy/romedenne/romeree/mons-X 山墙素面只能藏组内，L 形 le_mans_corner 内角素面不能放端头）；晨阳背光墙面 Ambient/Hemi 略抬不死黑。**新增欧洲小镇建筑组 29 件**（otherModel/EuropeCity）：specGloss→metalRough 必转 + 单位/枢轴归一离线预处理，全套仅 26k 三角，使用文档 `docs/europe-city-buildings.md`。帧耗时 诺曼底 22.8ms ≈ 库尔斯克 21.3ms）；2026-09-20（**AI 体系重构 P1（实施规格 `docs/ai-redesign-plan.md`）**：数据层 13 车 aiRole/aiTraits（aiHull×角色 scout/brawler/anchor/ambusher/sniper + 历史特性：虎式摆角 0.7/黑豹严格正面/IS-2 开火必退掩/黄鼠狼被击穿即逃/猎豹四号 scoot/费迪南猎虎阵地狙击）；**点亮 v3 两层对等模型**（察觉：移动 1200/开火 1400/静止 700/遮蔽 300 → 确认：基准 500/700 ×角色×难度×tgtK×obsK×扇形；AI/玩家 dwell 光学确认按角色 900~1200m；`spotMult` 死代码启用；观瞄/埋伏/hull-down/开火窗口系数接线；casemate 扇形 ±30°/炮塔朝向延迟 0.5/1.2s）；js/ai/ 新模块 difficulty/roles/doctrine/poi（51 兴趣点）；ai.js 状态机重构——POI 搜索**删全图感知**、节奏总监 L0~L3 防僵局、超时表全落地（holding/peek/stopMaxT/被挡 2 发/engage-hold 12s/evade 统一冷却/修理中断）、casemate 伏击纪律（射界×0.8 才开火）/scoot/panic 甩头、movingFire/fireAndCover/fleeOnConfirm（alert 态撤退优先通道）；备份 `_backup_20260920_ai`。验证 wp1~wp7 分项脚本 + wp8-soak（T1/T2/T6）+ 回归四件套全绿，详见 PROJECT.md 三.六 v3）

***

## 一、项目概述

- **名称**：钢铁战线3 — 铁甲猎手（IRON WAR III: IRON HUNTER）
- **类型**：3D 二战坦克对战网页游戏（猎杀模式 1v1~1v5）
- **技术栈**：Three.js 0.185.1 + WebGL2 + WebAudio API + ES Modules
- **启动**：双击 `start.bat` 或 `node server.js` → http://localhost:**8081**（端口与旧作 8080 区分）
- **时代背景**：1943 库尔斯克。当前坦克（13 辆；2026-09-21~23 十连扩至 24 辆，现役清单以 js/config.js TANKS 为准）：**虎式 Tiger I** / **虎王 Tiger II** / **黑豹 Panther A** / **黄鼠狼 III M**（歼击车，无炮塔限角 ±10.5°）/ **四号歼击车 L/70**（歼击车，±10°）/ **费迪南**（重型歼击车，200mm 正面，±11°）/ **猎豹 G1**（重型歼击车，PaK43，±11°）/ **猎虎**（重型歼击车，128mm PaK 44 + 250mm 战斗室正面，±10°）（德）/ **M4A3(76)W 谢尔曼** / **M10 狼獾**（美）/ **克伦威尔 Mk IV**（英）/ **T-34-85** / **IS-2 1945 型**（苏，122mm 大口径 HE）
- **新车接入备忘**（2026-09-13，panther/m10/cromwell/t34-85）：模型与 md 标注放 `model/`；部件名按 md（GLTFLoader 剥点、**空格转下划线**——原始名含空格的节点如 `interior turret_xxx` 须写 `interior_turret_xxx`，否则部件不匹配、不随炮塔转）；枢轴用 `scripts/measure-new-tanks.js` 实测包围盒（md 坐标系不可直接用，比例 ≈2.56 仅排气点参考）；履带滚轴看 UV 量程：t34-85 纵向=V（vRange 跨 12 格）用 `trackScrollAxis:'y'`，其余三车纵向=U 用 'x'；阵营 FACTION 在 main.js（uk/ru=allies）；分划 reticles.js 新增 us2/su2（克伦威尔暂用 us2）；展示文案 tank-display.js；验证 `scripts/verify-new-tanks.js`
- **虎王接入备忘**（2026-09-13，tiger2）：源模型 `tankModel/pz.kpfw._vi.glb` 负重轮焊死在 Object_13/15 → 离线预处理 `scripts/split-wheels-kt.js`（@gltf-transform）产出 `model/tiger2.glb`：**①材质** specGloss→metalRough；**②外排 5 轮/侧**（z=-1.94/-0.90/0.13/1.16/2.19，y=0.47，x 1.35~1.65 轮盘+侧壁）按**连通岛整抽**（共享顶点建分量、整岛抽出，贴图零误伤），**内排 4 轮交错位不切留车体**（贴图切割必坏，静态观感更好——用户反馈定稿）；**③主动/诱导轮**按轮心圆盘分类 + 五重精滤（连通 BFS / 法线连续 <60° / 叶剥离 / 长边>0.40&rc>0.30 竖板剔除 / 后轮摆臂尖刺剔除 rv>0.42 且 |x|∈(1.37,1.57) 两齿环居间——不去掉会偏心 ~8cm 轮转晃动 + rc>0.43 兜底）；**④Object_11 拆分**：质心 y>2.2 的车顶高射机枪 → roofMg（hidden），下部车体前机枪留 Object_11 → hullMg（F 键，hullMgArc 0.26）；`+z` 模型无需烘焙；履带 V 轴且 `trackScrollFlip:true`（底段 dv/dz=-1.5）；轮系结构分析 scripts/analyze-kt*.js；渲染复核 scripts/check-tiger2-*.js（glbview.html `?glb=&only=`）；游戏内验证 `scripts/verify-tiger2.js`（14 轮组/hullMg/行驶断言）。**焊死轮系切割的完整操作手册（判别式、阈值、九步验证清单、踩坑史）见 `docs/wheel-split-playbook.md`，后续所有负重轮无独立元件的新坦克一律照此执行**

### 游戏流程

```
加载 → 封面 → 主菜单 →(猎杀模式)→ 车库（选车+敌方数量1~3）→ 战斗 → 结算 → 返回菜单
```

主菜单：猎杀模式 / 生存模式（占位禁用）/ 战役模式（占位禁用）/ 游戏设置（AI 难度、画质、战斗音乐模式）/ 声音设置（主音量/音效/环境声/BGM 开关+音量）。车库：选车 + **AI 难度直选（新兵/标准/王牌，与主菜单弹窗同 settings.difficulty，2026-09-21 加）** + **敌方编队编辑器（数量步进 1~5 + 逐槽选车型，选项由 TANKS 动态生成；settings.enemyTanks 槽位数组）** + **固定阵营开关（默认开：敌人只从敌对阵营抽取，锁定时下拉也只列敌对阵营车型，失效选择自动回退随机）** + **地图选择（库尔斯克·1943 / 诺曼底·1944 / 阿登森林·1944，settings.mapId 持久化；`_startBattle` 按选图重建 world——dispose 旧图 + `_buildWorld`，双向切换已验证）**。

### 操作

- **WASD** 驾驶 · **鼠标** 炮塔瞄准 · **左键** 开炮 · **右键** 开镜（直视瞄具按车定档：虎/豹 TZF 2.5×/5×、美系 M82 3×、苏系 TSh 4×、黄鼠狼 4×、四号/猎豹 5×、费迪南 5×/7×、猎虎 10×；多档开镜态 Shift 切档） · **空格** 刹车
- **中键（按住）** 同轴/车顶机枪连发 · **F（按住）** 前机枪连发（自动瞄准射界内点亮目标，无目标/超界沿枪管直射）
- **1/2** 切弹（AP / HE） · **R** 维修包（修模块，不复活乘员） · **T** 灭火器 · **C** 自由视角 · **ESC** 暂停
- **Q** 车长望远镜（交叠双圆视野；机位在车长塔顶，观察不联动炮塔、禁火；Shift 切换 7×/12× 定档；少量密位刻度 + 测距阶梯 + 目标标记透传；与瞄准镜互斥）；**600m+ 目标须用望远镜/瞄准镜持续照射 ~2s 才确认标注（主动侦查，见三.六）**
- **歼击车（黄鼠狼 III M / 四号歼击车 L/70）无炮塔**：火炮水平射界 ±10.5°/±10°（cfg.casemate.arc），超界炮卡弧缘——需驾驶车体把目标带进射界（炮口指示器红脉动 = 未收敛提示）

***

## 二、与前作的核心差异

| 项 | 前作（现代坦克） | 本作（二战） |
|---|---|---|
| 伤害模型 | HP 血条 + 模块定时器 | **无血条**：5 乘员（完好/受伤/阵亡）+ 6 模块 HP（发动机/油箱/弹药架/炮闩/方向机/观瞄） |
| 击杀 | HP 归零 / 殉爆 | **乘员全灭 / 弹药殉爆 / 起火烧死乘员** |
| 弹种 | AP/HEAT/HE | **AP（APCBC 带装药）/ HE** |
| 瞄具 | 电子变倍 + 热像仪 | **固定档位直视瞄具**：德系虎式 TZF9b/虎王 TZF9d/黑豹 TZF12a（双档 2.5×/5×，开镜态空格切档，de2 刻度鼓分划）/ M4·M10 M82（3×，us2 静态分划）/ T-34-85 TSh-16（4×，su2 静态分划） |
| 稳定仪 | 全电子稳定 | 虎式无（行进晃动大）；M4 垂向陀螺稳定（移动散布惩罚减半，`gyroStab`） |
| 现代系统 | ERA/APS/LWS/烟雾弹/热像 | **全部移除**（thermal.js/smoke.js 已删除） |
| 模式 | 1v1 | **1v1~1v5**（车库编队编辑器逐槽选车型，敌群扇形出生） |

***

## 三、伤害系统「铁甲猎手」（js/tank.js + js/shell.js + config.js DAMAGE_RULES）

### 命中流程（2026-09-11 装甲板图 v2 落地）

```
shell.update → _segmentHitsTank（包围球粗判）→ tank.resolveHitZone（板面求交）
→ tank.applyHit(hit, pen, shellType, hitWorld, dir, spall)
    ├─ 跳弹角（AP 55° / HE 永不，对板法线）→ ricochet
    ├─ 等效装甲 pen < armor/max(cosA, 0.5) → bounce（HE 例外 → applyHESplash）
    └─ 击穿 → spallDamage() 后效（**2026-09-14 坐标系修复**：resolveHitZone/spallDamage/legacy 的弹向变换从"仅偏航 rotY(-heading)"改为 root 完整逆四元数（含车体俯仰/侧倾）——旧版在车体倾斜时（坡上/顶石头翘头）点系与方向系不一致，破片锥/弹芯路径整体跑偏，贴脸侧射也只有"击穿"零毁伤；实测前倾 12.6° 乘员杀伤事件 30→0，修复后三种姿态一致）：
        ① 弹芯路径直击乘员（阵亡率 0.9）
        ② 破片锥（锥角 0.6rad，解析法：垂直距离+锥内即判定，0.45 阵亡）
        ③ 装药爆轰（AP 穿入 0.6m 处 r=0.95m 球，0.85 阵亡；HE 半径 2.0m）
        ④ 模块毁伤（HP 扣减，受损 <50% / 损毁 0 两档事件）
        ⑤ 弹芯穿出 exit 事件（特效）
```

**装甲板图 v2（resolveHitZone 重写）**：每车 `armorModel`（config.js，armor-editor.html 调参导出）——
- 板 = 自由四边形 `{name, face, t, pos, size, rot[rx,ry,rz]°, weak?, track?, mirror?}`；判定盒仅作参照/宽相；**板缝穿过 = 不算命中**（resolveHitZone 返回 null，shell 不改向续飞）；**板缝穿过时 shell 位置不吸附包围球最近点**（2026-09-14 修复：旧逻辑把 pos 拉回 _closest，未中板的弹每子步被吸住 → 卡成空中光柱 6s；现记入 `s._gaps` 跳过该车重测）；
- 求交：段（包围球接触点前 2m → 后 8m）× 各板平面 + 面内 u/v 边界检查，取最近 t；车体板车体系直接测，**炮塔板转炮塔系**（减 turretPivot + rotY(-turretYaw)，缓存时已把炮塔板/附加盒转成枢轴相对坐标）；附加盒（车长塔）走轴对齐盒 slab 求交；
- 命中返回板名（plateName，hitlog/飘字直接显示「击穿首上」）、板法线（倾角参与等效/跳弹）、track flag（替代旧 trackX/trackY 区域判定断履带）；
- 镜像板（mirror）缓存时展开为 ±x 两份（ry/rz 取反）；
- 旧 6 面平板判定保留为 `_resolveHitZoneLegacy` 回退（无 armorModel 时）。

调参工作流：`armor-editor.html`（左树/中 3D/右属性，滑块+四档步进，点选板/球，可隐藏模型）→ 一键导出 config 片段 → 贴回 config.js；`armor-view.html` 只读查看；渲染共用 `js/armorviz.js`。**两页模型朝向按 `cfg.forwardAxis`/`bakeY180`/`bakeX90` 复现 tank.js 的烘焙旋转（2026-09-14 修复：原写死 rotY(-90°)，+Z 原生朝向的虎王在页面里与装甲板图十字交叉错位）**。回归：`scripts/plate-hit-test.js`（板名/角度/跳弹/炮塔随动/板缝穿透/行走部 flag）。

### 乘员（config internal.crew 球体判定区，+z 车头局部坐标）

- 效果（拟真档，2026-09-11 重构）：炮手（散布/缩圈/炮塔转速）、装填手（装填时长）、驾驶员（受伤功率/转向；**阵亡=立即永久瘫痪**）、车长（阵亡索敌×0.5 + AI 反应 ×1.3）+通讯员（索敌距离 spotMult）
- 受伤再中弹阵亡率 ×1.3；乘员不可恢复；全灭 → destroy(false)

### 弃车体系（拟真核心，tank.js `_checkBail`/`bailOut`）

- **士气检定**（DAMAGE_RULES.bail）：乘员阵亡/模块损毁/被击穿后触发，每场每车最多 3 次——阵亡≥2 人 40% / ≥3 人 75%；瘫痪 +25%、起火 +30%、炮闩损毁 +30%、近 10s 被击穿≥2 次 +20%
- **AI 弃车**：计为击毁（main.js 帧循环统一战果计数 `_killCounted`）；表现 = 炮管低垂 + 炮塔停在最后角度 + **舱口灰黑烟柱升起（effects.hatchSmoke，烟源为车体局部坐标逐帧转世界，持续 120s，随车 dispose 消失——不再用 destructibles addPropFire 世界固定烟源，旧方案跨局残留）**：发动机毁→发动机舱/其余→炮塔舱门；断带弃车→车体歪斜；**弃车不熏黑不爆炸**（destroy(false) 内 bailedOut 分支跳过 multiplyScalar 熏黑——车组跑了，车没炸）；AI 修理中指示标记变黄色 + REPAIR 字样
- **玩家弃车**：强制模态「你已无法战斗，需要立即弃车」仅确认按钮 → 判负结算（结束路径 `_onDefeat`）

### 击毁效果分类（第九次迭代，tank.js `destroy` + effects.js）

- **殉爆（destroy(true)）**：三段延爆 + 二分之一随机分支——**飞头**：炮塔 attach 到场景根做弹道抛飞（落地小爆；**dispose 时须单独摘除+释放，否则跨局残留孤儿炮塔**）；**不飞头**：高压燃气从**炮塔顶端舱盖**喷出近垂直火柱 5~8s（effects.jetFire，jetFirePos=turretPivot 世界坐标+1.05m）。
- **残骸燃烧时间轴**：`_wreckAge` / `_wreckBigT`（20~30s 随机）——大火段 effects.burning(big)；之后转 **effects.smolder**：明火变零星小火苗，烟更薄（alpha 0.13~0.17）但升速快（vy 1.3~2.6）、寿命长（5~9.5s）→ 高细烟柱。**（2026-09-19 增强：余烬段出烟加密 0.034s、size 1.5→6.2 α0.24、升速降 30%、偏斜 5~20°；大火段烟柱保持原版不动）**
- **残骸持续小火点（2026-09-19）**：destroy 时 40% 概率掷 1~2 处火点（`_wreckFires`：发动机顶部/炮塔舱口顶部/驾驶室顶部，车体局部坐标随车走，弃车残骸同可能）——effects.wreckFire 小火苗 + 浓黑烟持续燃烧，随车 dispose 消失。
- **非殉爆击毁（destroy(false)）**：熏黑（multiplyScalar 0.42——0.22 太死黑，2026-09-12 调浅保留焦痕层次）+ 常规大火段 → 余烬段；弃车见上（不熏黑）。
- **跨局清理**：`_clearBattle` 兜底清空 `world.destructibles.propFires`（world 跨局不重建，废墟火/旧烟源不清会定在原地带进下一局）。
- 验证：`scripts/kill-effects-test.js`（双殉爆分支/弃车烟/余烬相/再来一局残留=0）。

### 模块（DAMAGE_RULES.modules 定义 HP；config internal.modules 球体布局）

- 弹药架：命中即掷殉爆（ammoDetHit 0.32，玩家被打 ×0.3）；HP 打空再掷（0.55）→ **destroy(true) 殉爆**
- 油箱：命中概率起火（0.4）；损毁必起火 + **极速×0.5 + 30% 概率油泵打穿永久趴窝**
- 发动机：受损 → 功率×0.5 + 极速×0.6；**损毁 → 立即趴窝（不可修）** + 概率起火 0.35
- 炮闩：损毁 → 无法开火（不可修，高弃车率）；方向机：损毁 → 炮塔转速 ×0.08（不可修）；观瞄：损毁 → 散布 ×4（不可修）
- 起火：每秒烧灼乘员（受伤 0.55 / 阵亡 0.25，已伤 ×1.6）+ 殉爆 0.06/s（玩家 ×0.3），9s 自然熄灭；灭火器（每场 1 次）扑灭
- 履带：**断带不再自修**，趴窝直到读条修理（AP 行走部板 50% / HE 55%）
- **修理（读条制，DAMAGE_RULES.repair）**：维修包 **3 次/场**；R 开始/再按中止；**8s 基础 + 每项 +3s**，一次修好全部可修项（断履带 + 受损档发动机/油箱/炮闩）；**读条中不能移动、可开炮/转炮塔**；被击穿打断；HUD 底部琥珀读条；AI 脱战（无接触或 >260m）时同规则读条修理

### HE 未击穿（applyHESplash）

断履带（履带区 55%）/ 命中炮塔伤观瞄（50%）伤炮闩（正面 35%）/ 薄甲 ≤30mm 震伤最近乘员（40%）——以上概率均随 hePower 缩放（断带 +0.17×(P−1) 封顶 0.95 等）。
**大口径结构震伤/内崩落（`DAMAGE_RULES.heShock`，hePower≥2 即 122/128mm 才生效，2026-09-23 方案 C）**：①**内崩落**——命中板厚于薄甲阈值（122 时 62mm）按 `0.12×(P−1)+0.002×板mm`（封顶 0.65；122 打虎式首上 100mm ≈34%）崩落装甲内层，命中点 2m 内 1~2 名乘员 35% 击毙否则击伤（没打穿也死人的史实机制）；②**结构伤**——方向机/发动机各掷 `0.2×(P−1)`（命中部位对应项 ×1.5）吃 20~40 点（座圈受震/支架变形）；③薄甲震伤波及 1→2 人、半径 +0.3×(P−1)。P=1（88/90mm 及无 heShell 车）行为与实施前逐字节一致。验证 `scripts/heavy-he-test.js`。

### 机枪（MG_RULES · 第二次迭代重构）

骚扰压制定位：射程 500~600m，命中率随距离衰减（mgFalloff）；无法穿透主装甲，**不伤乘员/不断履带**；命中仅小概率破坏观瞄（≤100m 0.5% / ≤200m 0.3% / ≤300m 0.2%，mgOpticsChance，直接打空观瞄 HP）。玩家：**右键=同轴/车顶机枪**（随炮塔指向连发）；**F=前机枪**（cfg.parts.hullMg 挂车体，射界 cfg.hullMgArc 内自动瞄准最近点亮目标，无目标/超界沿枪管直射，始终开火）；双枪共用 MG 弹链。**曳光 = 真实体积弹体（圆柱 5cm×1.5cm）+ 微型拖尾（拖尾 ~1m、宽 ~2cm，ShaderMaterial 头亮尾暗渐隐亮带）**，从枪口起生长（飞多长拖多长，不向 muzzle 后方穿出），弹头消失后残留段前飞追平消散；每帧绕弹道轴 billboard 对齐（effects.mgTracer + trails 池）。渲染带屏幕像素保底（不薄于 ~14px 长 / 1.8px 宽，随距离自动补偿）——远景下始终是一条可辨的小弹线。音频：双枪并发循环 audio.startMGLoop('coax'|'hull')，AI 单发 playMGShot（旧 playMG 静音 bug 已修）。AI 机枪由 AI 决策触发（AI_MG_RULES）。HUD：弹药面板极简改版（字母+数字）、装填横条（镜内中心下方 / 第三人称屏幕底部）、炮口指示器（炮管弹着点投影：按瞄准点水平距离做弹道积分，收敛后与准星像素级重合；updateTurret 弹道解算起点=炮口）。瞄准镜（第三次迭代，按 TZF 9b 实物照片还原）：**中央 5 三角列**（中央大三角顶点=瞄准点，左右各 2 无底边尖角，顶点同线，小尺寸）；**旋转刻度鼓 `#gs-dial`**（`reticles.js buildWw2Dial`；de2=虎/豹，**de2td=黄鼠狼 / de2td7=猎豹·四号·费迪南·猎虎（2026-09-20 歼击车分划差异化：刻度圈半径 +40% 整鼓同步外扩；de2td7 中央 7 三角列——左右各 3 尖角、整体 ×0.8 同比例缩小，de2td 保持 5 三角列）**；美系 us2=M82 / 苏系 su2=TSh-16 为静态分划，按实物刻线还原、无旋转测距件；视场适配：de2 系=meet + gs-fit 1.25 放大（圆视野缩到略大于屏高，上下微裁、四周黑边，介于满屏与全圆之间），静态分划=meet 完整圆形视野 + even-odd 黑幕遮边）——**单圈**空心圆点（火炮弧段 3°/格，其余 6°/格）；右半 0 点~4 点=坦克炮刻度（密刻线+外圈数字 0..40×100m）；右侧 11:55~5:25=机枪刻度（短刻线+内侧数字 0..20，测距参考）；左半外侧=机枪数字（装饰）；左/右侧内部=HEAT/HE/HVAP 弹种刻度+数字（装饰）；鼓上铭文随鼓一体旋转；**数字无白边**（gs-num2）；**顶部长针指标**指向当前距离。测距时整鼓阻尼旋转（100m=3°，跟随右侧外圈火炮标尺：0..40×100m 分布在 0°~120°；火炮弧段圆点加密为 3°/格与数字严格对齐），**测距门控**：炮口圆"套住"敌坦克才启动，移出冻结。装填指示器：第三人称=底部横条（**开镜时隐藏**），开镜=圆环进度 #reload-ring（琥珀=装填中/绿=就绪，环内剩余秒数）。炮口指示圆（`#gun-marker`）：**固定 1cm 圆，不随缩圈缩放**（只标识炮口当前弹着点；开镜实线/第三人称虚线）；弹着点按瞄准点水平距离做弹道积分投影（炮伺服收敛后与准星像素级重合；updateTurret 弹道解算起点=炮口；水平距离下限 8m，避免近距俯角时钳制放大视差）。**测距门浅掠让位（2026-09-12 修复，main.js `_updateRanging`）**：准星射线命中敌坦时，地形步进不再"见钻地就截胡"——只有钻进深度 dip 超过弹道弧裕量 hArc(x)=4·hApex·x·(1-x)（hApex=g·D²/8v²，即"连炮弹自己的弧都越不过这道脊"）才把装定距离抢给地形；hull-down 露炮塔场景（瞄线恰好擦脊，弧在脊顶上方 ~0.9m）从此按真距装定、越脊命中，不再 100% 砸目标面前的土。完全遮蔽目标（dip 远超裕量）行为不变——仍然打不到。

### 弹着特效（2026-09-17 土尘主导重做）

- **HE 落地 = 土尘爆**：`shell.js` 地面命中 HE 走 `dirtHit(k=1.8) + effects.heGround`（尘柱土块 + 短促小闪 + 贴地尘幕外铺，全随机角度/速度/半径的冲击波掀土），不再走 `explosion`（火球版只留给坦克命中/殉爆）；AP 落地 `dirtHit(k=1)` 普通土花。`dirtHit` 内：中心爆闪缩短变暗（life 0.14 / α0.45）、火舌减半减亮、**HE 地面冲击波环（_ring）与均匀角速尘环移除**——旧版均匀等速外扩会读成一道"真环"（用户反馈：真实土爆见不到环，只有尘）
- **尘土随机分层（用户定稿：烟团颜色/透明度要有层次不单一）**：effects.js `_jCol/_jA`（明度 ±16%、透明度 ±30% 逐团抖动，返回新数组勿原地改共享配色表）+ destructibles.js `jCol/jA`（同式，rand() 实现），接入全部建筑/倒树/电线杆/废墟持续烟生成点（bigDustAbs / surroundSmoke / 倒塌爆烟 / 命中灰烟 / addPropFire 烟）；DUST_COLORS 四档基色 × 每团独立抖动 → 深浅前后景深层次
- **坦克命中/炮口路径未动**（用户认可现状）：explosion / bigDustBurst / hitSpark / muzzle 原样
- 验证：`scripts/tmp-hefx-probe.js`（HE 落地粒子构成 尘183/火9、冲击环 0、火光像素占比 0.05% vs 坦克命中 0.24%——土尘绝对主导且远弱于坦克命中火光）+ `norm-destroy-test.js`（AP 不掉血 / HE×3 倒塌 / 零报错）；视觉对照截图 `scripts/shot-he-ground.png` / `shot-he-tank.png`（`tmp-hefx.js` 生成）

### 事件反馈

events 数组：`{type:'crew'|'module'|'fire'|'ammo_boom'|'exit'|'kill', label, lvl}` → main.js 接 hitlog/飘字；`tank.pendingEvents`（起火异步杀伤）由 main 每帧抽取。PvE 保护：玩家被殉爆率 ×0.3、被点燃率 ×0.5。

***

## 三.五、车长望远镜（第四次迭代，index.html `#binoculars` + camera.js + main.js）

**定位**：车长独立观察通道——机位在车长塔顶（turretGroup 上方 +1.25m），观察方向随鼠标自由转动，**不联动炮塔**；纯观察（禁开炮/禁机枪），车辆仍可驾驶。

### 触发与互斥

- **Q** 闩锁进入/退出（`input.js consumeBinoToggle`）
- 与瞄准镜互斥：进入时强制关镜；望远镜中按右键 = 收望远镜直接开镜
- 观赏模式（C）下拒绝进入（rig 侧防护）；战斗结束 `_clearBattle` 收起；`rig.attach` 复位
- **Shift** 切换 **7× ↔ 12×** 定档（固定倍率无中间态；`rig.cycleBinoZoom`；空格专职手刹不让位）

### 视野遮罩（SVG，调试多轮定稿）

- **交叠双圆视野**：mask 抠出两圆（cx 350/650、r=280）的**并集**作为开口，圆外近黑 `rgba(2,4,3,0.985)`
- **羽化只沿并集外轮廓走**：左弧+右弧两条外侧大弧拼成闭合路径（两圆交点 (500,264)/(500,736)），同色描边 40 + `feGaussianBlur` 14 —— **中央无任何线条**（教训：不能对两个圆各描整圆，交叉弧线会漏进视野；右弧 sweep 标志错会把弧画进左半边）
- 望远镜层位于 `#hud` DOM **首位（最底层）**：弹药/乘员/小地图/顶栏等原有 UI 全部浮在其上不被遮挡
- 分划/铭文整体 0.8 缩放：中心小十字 + 水平密位刻度（5/10）+ 左筒测距阶梯（2.7m 车高，400/800/1200/1600m）+ 右筒倍率大字（`#bino-mag` 实时 7×/12×）+ 底部提示行

### 相机（camera.js update 望远镜分支）

- 位置 damp 到车长塔顶；朝向 = aimYaw/aimPitch（与炮瞄共用观瞄状态，退出后瞄准无缝接续）
- 手持式微晃：车速驱动、幅度随倍率衰减（12× 时晃感 ≈ 7× 的 0.58 倍）
- FoV = 62/7 ≈ 8.9° / 62/12 ≈ 5.2°；鼠标灵敏度折算 sens = 0.0021×2/binoMag

### 目标识别

点亮敌人的 ▼ 标记+距离（ui.updateMarkers，相机投影）在望远镜中正常显示；测距由分划密位阶梯人工判读（与史实一致，无自动测距）。

***

***

## 三.六、点亮与侦查体系 v3（2026-09-20 第八次迭代·察觉/确认两层对等模型，js/visibility.js 重写）

> 实施规格唯一事实源：`docs/ai-redesign-plan.md`（角色/doctrine/侦查模型/排级/阵位/可靠性/冲突裁决/调参旋钮）。**P1、P2、P3 已完成**：数据层（13 车 aiRole/aiTraits）、两层侦查模型、dwell、扇形视野、个体状态机（POI 搜索+节奏总监+超时表）、车种专属行为、**排级大脑（js/ai/platoon.js：任务分配+替补链、楔形编队槽位 slotK×110m、march/alert/engage/lost 阶段流转、doctrine 接触反应、狙击延迟开火、王牌开火时序、flank 8s 超时替补、火线纪律友军锥检查）**、**怀疑度地图（js/ai/suspicion.js：200m 网格热度、45s 半衰，开火/被击/电台/察觉/履带痕/灌木穿越事件注入，只做搜索建议不反写认知）、阵位三合一评估（遮蔽+射界+撤离，hull-down 加成、切换滞后 1.5 分）、脱困 L1~L3 阶梯（22m 切线绕行 → 60m 朝心大绕行 → 目标拉黑）**。P4（doctrine 调优）待续。

**核心变化**：单一警戒圈 → **察觉（远）/ 确认（近）两层**。机制双方同一公式：`距离 = 基准 × 角色 autoConfirmK × 难度 obsK × tgtK（目标侧） × obsK（观察者侧） × 扇形系数`；差异只在表现层（玩家有标记 UI）。`sightRangeHard` 1100→**1600**。

### 第 1 层：察觉 → 疑似（不按车型，按目标行为）

- 移动中 **1200m** / 开火 **1400m**（既有 onFire 事件）/ 静止 700m / 软遮挡遮蔽 300m
- **静则隐、动则现、打则露**；AI 侧快照带误差（远距察觉 80m / 开火 40~80m 收敛），玩家侧真实位置

### 第 2 层 A：自动确认圈

- 基准：目标静止 500 / 移动 700；角色系数（scout ×1.1 / brawler ×0.9）；AI 难度 obsK（新兵 0.85 / 标准 1.0 / 王牌 1.1）
- **tgtK 目标修正**：开火后 3s 窗口 ×1.5 / 重型车体（hullFront≥100）×1.15 / 低矮车体（turretTop<2.4：四号歼击车、黄鼠狼）×0.85 / 埋伏态（静止≥5s）×0.8 / hull-down ×0.5
- **obsK 观察者修正**：车长伤亡（`spotMult` 死代码启用：伤 0.8/亡 0.5、通讯 0.95/0.85）× 观瞄模块（0.7/0.4），综合下限 0.25
- **扇形视野**：casemate 前向 ±30° 全距、侧后 ×0.5；turreted 目标在炮塔 ±60° 内确认延迟 0.5s、之外 1.2s

### 第 2 层 B：光学确认 dwell（双方对等）

- **AI**：有疑似接触 → 停车指向疑似扇形（中心 aimPos、宽度随 errVec 收敛）持续观测 → 确认；距离上限按角色（sniper 1200 / ambusher·scout 1100 / anchor 1000 / brawler 900），dwell 2~3s；4s 无进展 → 该目标 30s 冷却。苏军 doctrine 不 dwell（直接推进）
- **玩家**：沿用照射机制，上限按本车角色 dwellRange × tgtK（原硬卡 1100——**玩家侧变化点见 §3.12 of 设计文档**）

### AI 行为（js/ai.js 重构；模块 js/ai/{difficulty,roles,doctrine,poi}.js）

- **状态机**：search（POI 链搜索，`js/ai/poi.js` 预生成 51 兴趣点，**已删除 patrol 全图感知**）/ alert（戒备+dwell）/ engage / relocate / evade（撤退链+统一冷却+背水一战）/ recover；**任何状态带超时出口**（holding/peek/短停 stopMaxT/被挡 2 发/engage-hold 12s 全部落地）
- **节奏总监**：无确认接触 45/75/105s → L1 提速搜索 / L2 地图控制点 / L3 节点梳篦（防双蹲僵局）
- **车种专属**（config aiRole+aiTraits）：casemate 伏击纪律（射界 ×0.8 内才开火）/ shoot&scoot（开火后直线倒车+侧移换位）/ **alert 态枢轴摆车体朝向疑似扇面**（2026-09-21 实测修复：原只转炮架不调车身）/ 被绕 panic 甩头（最高优先，清 scoot/dash）；turreted 摆角泛化（虎式 tiltPref 0.7、黑豹 0 严格正面）、movingFire（M4 垂稳行进散布放宽）、fireAndCover（IS-2 开火必退掩）、fleeOnConfirm（黄鼠狼/克伦威尔被击穿即撤，alert 态亦生效）；苏军盲射 3/4 速压制（<800m 疑似扇形）
- **独狼装配**：preferRange = 难度基准 × 角色系数 × 阵营 doctrine 系数（德 ×1.2 / 苏 ×0.6 / 美 ×1.0 / 英 ×1.1）

### 反馈闭环（沿用）

- HUD 暴露警示 CONTACT/SPOTTED（dwell 期间 CONTACT、dwell 完成 SPOTTED = 换位窗口提示）；小地图快照标记；伏击循环反馈不变

验证：`scripts/wp1-smoke.js`（数据层）、`wp2-detect-test.js`（两层距离带）、`wp3-coeff-test*.js`（系数矩阵+端到端不对称）、`wp4-dwell-test*.js`（dwell/埋伏保护/扇形/玩家上限）、`wp5-poi-test.js`、`wp6-ai-test.js`（搜索/节奏/浸泡）、`wp7-ai-test.js`（panic/射界门 0.153rad/fireAndCover/fleeHit）、`wp8-soak-t1t2.js`（T1 挂机 1v5/T2 蹲坑）、`wp8-soak-t6.js`（13 车独狼 sanity）；回归 regression-test / enemy-slots-test（C4 适配 13 车）/ ai-unstick-test / verify-new3 全绿。

### LOS 遮挡高度化（第七次迭代）

原 `_los` 的障碍圆/灌木遮挡圆是纯 2D 判定——坡下灌木会挡住坡上观察者的视线。**现遮挡物注册时携带 `topY`（绝对顶高）**：灌木遮挡圆 = 本圆坡位地面 + 模板 hMax（hedgefield.js place）；巨石/建筑 = 包围盒顶（destructibles.registerGroup）；废墟降级重挂时按 rh 降档。`_los` 在圆内最近接近点取射线高度，高于 topY+0.15m 即**越过不挡**（只减不增遮挡，不引入新空气墙）；无 topY 的旧数据保持原行为。平地互望仍被 2.0~2.8m 灌木正常遮蔽（眼高 ≈ hullHeight+0.5 < 丛顶），坡地/低石后可正常俯视。AI 掩体评分（canSeePoint）同管线自动受益。**注意：树木本就不进 world.obstacles（可碾毁无碰撞），从不挡视线——这是既有设定，不在本次改动范围。**

### 瞄准收敛分档反馈（第七次迭代）

炮口指示器与准星**收敛后误差 ≈1.4px（align-probe 实测，无系统性偏差）**；错位全部是瞬态——炮塔伺服（虎式 0.18rad/s）追不上即时鼠标，开镜 2.4× 放大后视觉上被放大。**炮弹沿炮管飞：未就位时炮口指示器才是真准星，错位期开火会打在指示器处而非十字线**。反馈分档（main `conv` = aimOffset <0.006 就位 / <0.02 接近 / 否则未就位）：未就位时炮口指示器红色脉动 + 开镜分划（#gs-reticle，不含刻度鼓）降透明度至 0.38；接近琥珀色；就位恢复默认。**瞄具俯仰限位修复（2026-09-14）**：原 camera 俯仰写死 ±0.30/0.42 rad，超出火炮俯仰角后弹着点永远够不到准星（炮口指示器持续上/下漂）——现瞄具限位 = 炮架限位 + 固有零位（`rig._aimPitchRange`，零位 = 当前世界仰角 − gunPitch 实时校准，含车体俯仰与炮管 GLB 烘焙偏差如虎式约 −2°）+ 上限预留弹道下坠补偿角（gR/2v²，1600m）；`updateTurret` 的世界仰角 clamp 同口径（否则坡上出现"瞄得到打不到"死区 + aimOffset 卡死）。望远镜/观赏模式不受限。验证：`scripts/gun-marker-test.js`（多俯仰角收敛后对中 ≤2px，含刻度环白/绿截图）。**炮塔方向改闭环（2026-09-14）**：虎式炮架枢轴 GLB 带 ~0.9° 烘焙偏角，开环 turretYaw 收敛后俯仰会把炮口方位带偏（5× 镜下横漂 10+px）——yaw 伺服改为以炮口实际世界方位闭环（yawErr = 期望方位 − atan2(gunDir)），aimOffset 同步改用真方位差；开镜收敛后横/纵偏差 ≤2px（`scripts/scope-align-test.js`）。**缩圈指示器改表盘刻度环**：12 根稀疏径向短刻线指向圆心（SVG，ui.js 生成，0.8px non-scaling-stroke 细线，不遮准星）；第三人称 `#ch-ticks` 与镜内 `#gs-disp` 同款样式（半透明白 → 缩圈完成半透明绿）。第三人称直径 = min(ringSize×1.15, 200px)（ringSize 增益 ×8 放大缩圈动态，main.js，下限 49 → 视觉最小圈 56px），镜内最小圈 58px——**最小圈均 > 1cm 炮口指示器（37.8px）**；炮管到位（locked）改为中心点变绿。验证：`scripts/align-probe.js`（收敛错位实测）+ `scripts/conv-shot.js`（两态截图对照）。

***

## 三.七、车库「野战修理厂」（第八次迭代，js/garage.js 整体重写）

原车库是从前作现代坦克项目移植的现代化工厂车间（黄色安全线 / LED / 警灯 / 桥式天车 / 交通锥），与 1943 库尔斯克背景违和，**整体重写为东线野战修理厂**，全程序化生成（CanvasTexture + 合并盒几何，无外部资源）：

- **建筑**：44×30m 红砖墙裙(1.3m)+木板墙(至 6m) 坡屋顶厂房，檐 6.0m/脊 9.6m 木桁架（每 4.4m 一榀：下弦+双椽+中柱+斜撑）+ 檩条 + 单面屋面板；后墙 5 扇 + 端墙 2 扇木框 3×2 格暖黄自发光窗；-z 屋面 2 条采光带。
- **大门**：-x 端墙 6.8×4.9m 门洞，左扇关、右扇外开 65°；门外夯土 apron + 三面远景面片（晨昏天空/树线剪影/麦田/草垛，MeshBasic 不受光照）；门内上方挂「PANZER-WERKSTATT · Instandsetzung u. Reparatur」木牌，上角斜挂伪装网（alphaTest 防排序）。
- **地面**：夯土（2048 贴图：噪点+干湿斑+大门→展示位履带拖痕+油渍+草屑，油渍处配套 roughnessMap 反光湿感）+ 中央 13×9.5m **木板停车台（台面顶 y=0，与地齐平，坦克直接落板）** + 四角木轮挡。
- **道具（全部时代化）**：木 A 字架龙门吊 ×2 + 链条葫芦吊坦克发动机（微摆）；工作台（台虎钳/挂板工具剪影/马灯=闪烁 PointLight）；德式弹药箱堆（白漆漏印 8.8cm Pzgr.39 / 7.5cm Sprgr.34 / 7.92mm Patr.）+ 20L jerrycan ×5；200L Kraftstoff 油桶 ×4 + 木托盘；备用负重轮 ×3 叠 + 斜靠 + 履带板一排；门内沙袋矮墙 ×2 + 麻袋堆；告示牌（FEUERGEFAHR! Rauchen verboten / VORSICHT Kranbahn freihalten）。
- **灯光**：半球基光 + 搪瓷伞罩吊灯 ×6（吊线+深绿伞罩+发光灯泡+光晕，2 盏带暖 SpotLight 阴影打展示位，全部微摆）+ 天窗冷 PointLight + 门口黄昏冷 SpotLight 斜射 + 体积光锥（自定义 ShaderMaterial）+ 马灯闪烁 + 300 粒暖浮尘。
- **关键渲染技巧**：屋面板/采光带用**朝室内的单面 Plane（FrontSide）**——高机位俯瞰时正面剔除自动"剖开"，不会黑屏（**勿改闭合盒 + BackSide**：闭盒背面从外部永远可见，俯瞰全黑，已踩过）。盒体 UV 按实际尺寸缩放（`scaleBoxUVs`）保证合并几何后木板/砖缝密度一致。PMREM 环境在构造末尾自拍（root 摘入临时 scene、y=-2、隐藏 fxGroup 防光晕糊进反射），show() 时挂 `scene.environment`（intensity 0.3）。
- **悬浮穿帮修复（main.js `_enterHangarWithLoading`）**：菜单背景车用战场 world 创建、停在 kurskHeight(0,0)≈1.33m；车库地坪 y=0——进车库若不收走，加载期间悬浮 1.3m、装完才"掉落"。现 `garage.show()` 后立即 `_parkShowcase()` 收车，加载期间场景只剩车库，新车整备完毕直接落地出现。

验证：`scripts/garage-shot.js`（加载中悬浮检查 + 四角度截图 + 控制台错误），smoke-test / regression-test 全绿。

***

## 四、坦克配置要点（js/config.js）

- **两车模型均为 1:1 米制、`forwardAxis: '+x'`**（车头朝模型 +X；加载时烘焙为 +Z 朝前）。
- **⚠ 节点名陷阱：THREE GLTFLoader 会把节点名中的「.」剥掉**（`turret.001` → `turret001`），config 的 parts 名必须用**加载后实际名**（用 `scripts/m4-names.js` 类似方式核对）。M4 曾因用原始 gltf 名导致炮塔/机枪/诱导轮全部挂载失败。
- **局部坐标约定**：config 中所有 pivot/乘员/模块/排气坐标都是**烘焙后空间**（+z 前/+y 上/+x 右）。从模型世界坐标换算：`(x,y,z)_model → (-z, y, x)_local`。
- 部件节点名来自 `model/*.md`（Tank Model Maker v2.3 标注）；turret 节点含全部炮塔子树（parts.turret 只列 `'turret'`/`'turret.001'` 即可）。
- M4 隐藏件：`obj2`（备用轮）/ `object01`（首上杂物箱）/ `sandbags`（沙袋）——md 标注的变体件。
- **炮塔枢轴实测法**（2026-09-11 M4 修正）：md 标注的「炮塔旋转轴」数值与烘焙后空间不同系，不可直接用。实测法：读 GLB 炮塔子树顶点（含全部子节点），取底层 22% 高度环带，其 XZ 中心即座圈中心（虎式实测 0.085 ≈ 配置 0.11，方法校验通过）。M4 由 z=-0.10 修正为 **z=0.19**（旧值偏后 0.29m，旋转时炮塔绕错误轴心摆动）。
- **履带 UV 滚动轴向**：`trackScrollAxis`（缺省 'y'）。**虎式与 M4 贴图轨道均沿 U（`'x'`，滚 offset.x）**——虎式曾错配为滚 V（offset.y），纹理沿履带横向滑（UV 实测：U 与车长轴相关 0.56、横跨 8.86 格，V 仅横跨带宽 0~1）。**滚动符号：前进时 offset 递增（`+= roll*0.5`）**——递减方向在起步时是"倒车式"滑动（2026-09-12 用户实测纠正，行驶侧拍互相关验证：顶段纹理相对车体向车头滑 ✔）。探针：`scripts/tiger-track-uv-probe.js`（UV-纵向相关性分析）。
- **灌木风摆（2026-09-13 升级为间歇阵风）**：hedge.js `injectWind` 顶点 shader 一直在材质里，但 **`updateHedge(elapsed)` 从未被主循环调用 → uTime 恒 0 冻结**（已修复）。现 main.js `_frame` 顶部 `updateHedge(elapsed, dt)` 全局驱动（菜单背景+战斗都生效）。**阵风状态机**（hedge.js `_wind`）：间歇期 amp=0.16+0.05·sin（微动，树叶不完全静止）→ 倒数 `next` 归零进入阵风（持续 4~6.5s、峰值 0.7~1.05）→ 包络 `smooth(0,0.3)·(1-smooth(0.55,1))` 缓起 30%/维持/缓停 45% → 结束后 `next=10+rand·5`（10~15s 间隔）。每帧仅写一个 uniform，性能零开销（无需近处限开）。验证：`scripts/wind-check.js`（uTime 活性）、`scripts/gust-tree-verify.js`（36s 包络采样 + 树冠/树干像素差分）。
- **树木风摆（2026-09-13 新增，外部 GLB 同样可摆）**：`injectTreeWind(mat, height)`（hedge.js）——maps.js `buildInstancedProps` 对 leaf/pine 的 InstancedMesh 材质 onBeforeCompile 注入；几何已烘焙世界变换，局部 y 即离地高度，权重 `pow(clamp((y-0.15H)/(0.85H),0,1),2)` → **树干下部 15% 不动、树冠摆**；相位用实例世界坐标（`hPos.x·0.31+hPos.z·0.47`），与灌木共用 uTime/uWindAmp uniforms → 同一场阵风树灌齐动。`customProgramCacheKey='windtree|'+H` 防 shader 串缓存。实测阵风峰值期树冠区像素变化 3.5%、树干区 0%。
- 史实参数：虎式 57t/700hp/38km/h/炮塔 0.18rad/s（最慢）/88mm 132 穿；M4 33.6t/500hp/42km/h/炮塔 0.35rad/s（最快）/76mm 104 穿（正面难穿虎式，逼绕侧）。
- **地形模式速度体系（2026-09-17，替代逐点路面判定）**：每张地图一种地形模式（`MAPS[].terrain` + `config.js TERRAIN_RULES`）——paved 城市石板（理论公路极速 ×0.70，转向 ×0.95）/ hard 硬地（越野极速 ×1.00，转向 ×1.00，诺曼底）/ soft 松软土路（×0.90 / ×0.90，库尔斯克）/ mud 泥泞（×0.80 / ×0.75）。越野极速 = 每车 `offroadK`（史实）× 公路极速：虎式 38→软土 18.1/硬地 20.1、虎王 35.5/16、M4A3 42/26、黑豹 46/22、M10 48/26、克伦威尔 52/28、T-34-85 53/28（虎王 38→35.5、T34 55→53 史实修正）。**原地转向史实修正**：黑豹 0.6→0.4（AK7-200 单半径无原位转向）、T-34-85 0.68→0.45（离合-制动只能刹单边）；虎式/虎王（L801 双流）、M4/M10（双流式）、克伦威尔（Merritt-Brown）保持可原位转向。功率衰减基准 = 地形生效极速（`vRatio = speed/(maxSpeed·terrainK)`）。车库 realSpec 极速显示「公路/越野」双值 + 预览含地形模式。实测 `scripts/speed-test.js`（库尔斯克 18.1 / 诺曼底 20.2 km/h，同图路面野地一致 ✓）。**HUD 油门条+自动档位（同日）**：右下角速度条改油门条（`player.throttle`，绿→橙红渐变锚定条全长，颜色即油门深度）；GEAR 显示自动升降挡（前进 1~5 挡按地形生效极速等分，带 ±0.02/0.03 迟滞防抖；倒车 R；静止 N）。回归 `scripts/gear-test.js`（升挡序列 1→5 断言）。
- 穿深衰减：AP 每千米 -20~22%（全口径弹衰减大）；跳弹角 55°；cosFloor 0.5。
- **占位音效**：虎式已接二战音源（开镜炮声 + 新式发动机 idle/drive 双循环，见头部 2026-09-24）；其余车仍共用旧作 T-90 套（t90-eg/t90-fire/t90-gun/auto-inner），换二战音源只改 `sound` 字段路径（可选加 `idle`/`drive`+`seg.driveTail` 启用新式发动机声）。
- BGM：菜单 `bgm/end.mp3`（无缝循环）；战斗曲库洗牌随机轮播——`bgm/start.mp3` + `adevnAs/fight/highWar/kersk` 四首（2026-09-24 增补，`BGM.battle` 数组，一轮播完重洗牌、曲间 10s 静默）；BGM.nations 为空，个性化模式把国别曲并入曲库一起洗牌。

***

## 五、地图（js/maps.js）

- 注册表 `MAPS`：`kursk`（2200×2200，曝光 1.22）/ `normandy`（2000×2000，曝光 1.22）；`buildMap` 按 `world.mapId` 分发 `buildKursk`/`buildNormandy`（Destructibles 的 groundY、world.surfaceY/isOnRoad 按图选高度函数与 roadDist）。`terrain.js` 的 `terrainHeight` 占位公式与 `kurskHeight` 同步（仅 buildMap 前过渡用）。

### 库尔斯克 · 1943（东欧平原）
- 夏季东欧草原：橄榄绿草原地面（makeGroundTexture 绿底+麦斑点缀、乘色 0xb9bf98），天空/雾/光照见下条（第五次迭代已去昏黄）。
- **天空/氛围（第五次迭代改版）**：蓝天白云 skydome **整体移植自前作《钢铁战线2》东欧小镇图**（同 three 0.185.1、同 hex uniform → 观感逐像素一致）：三层 fbm 云——①地平线层云带（水平拉伸 ×3.5→1.0）②中空层积云（主云层，coverage 0.55）③天顶卷云（**3D 噪声 fbm3**，球面连续无方位接缝/无极点拉伸）；旋转矩阵 36.87° 去网格感；uTime 慢速漂移（`world.skyMat` 由 main.js 主循环累加，接线早已继承在位）；穹底 mix 进 fogColor 与雾化地面无缝融合。⚠ ShaderMaterial 输出不经 ACES/sRGB（原样写屏）——调色需知道 hex 会被 ColorManagement 转成 linear。**移植 shader 必须逐行 diff 校验**：曾因 vnoise3 的 `n001` 角抄错一个分量（写成 n011 的角）导致天顶卷云层整片破碎，已修复并验证与原版逐字一致。雾 FogExp2(0xc8d8e4, 0.0015)（**密度不动**保 1100m 剔除衔接，色与 shader fogColor 同源）。光照中性化：Hemi(0xbdd0e4 天空蓝/0x9ba06c 草地, 1.55) + Ambient(0xaab2b8, 0.45) + Sun(0xfff0d5, 3.9)。
- 要素：3 条交叉土路（ribbon 网格 + roadDist 共用：surfaceY 抬高 0.05 / isOnRoad 颠簸 0.65）+ 巨石 ×16 + 散石群 ~30（均可炮毁；**registerGroup 单一碰撞体 `obstacleKind:'rock', obstacleK:0.78`——勿再手动 addObstacle（旧版双注册，摧毁后残留空气墙）；炮弹走精确网格求交（ellipsoid:true 注册时把位移后网格烘焙成世界空间三角形 soup `meshTris` + Möller–Trumbore 双面判定，判定面=可见石面本身——旧"包围盒半轴内切椭球"比随机位移 0.78~1.28× 的真实石面大 0.7~5.3m，2026-09-12 实测废弃）；压扁残骸 squashGroupProp 归零倾角+实测包围盒贴地**）+ 村落 ×5（town_kit 民居院落）+ 树 90（leaf 70/pine 20，实际落位 78；树干炮弹判定圆柱 0.55×s，贴真实树干）。（2026-09-11 起移除干草堆。）
- **灌木系统：已实现（js/hedge.js，2026-09-11 定稿）**——程序化灌木丛（椭球丛链 × 十字叶片卡 InstancedMesh），showcase.html 为调参台。定稿观感：高 2.0~2.8m 连续起伏（相邻鼓包落差 0.5~1m，两端收低）、长向侧摆 0.5m、厚 ~1.5m、四种绿色分层（深橄榄内层/中绿主层/黄绿受光·低占比/灰绿掺混，哑光灰橄榄档）、基部枝条+两肩草丛、三频正弦风摆（`updateHedge(elapsed)` 驱动）。地图集成要点：
  - `buildHedgeTemplate({len, hMin, hMax, wander, seed})` 种子化模板（mulberry32，与地图随机同实现）→ `instantiateHedges(target, tpl, placements, {chunkSize≈120, groundY, mipmaps:false})` 分块合并实例化；
  - **必须分块**（每 chunkSize 网格每变体一个 InstancedMesh + 逐块 computeBoundingSphere）：整图合并会让包围球跨全图、视锥剔除失效（实测比朴素克隆还慢）；
  - **地图必须 `mipmaps:false`**：alphaTest 下远处高层 mip 把 alpha 平均到阈值以下，150m 外整丛凭空消失只剩影子（旧灌木带教训，150m 对照差分 0%→7.3%）；展示页近景才开 mipmaps；
  - 性能契约（scripts/showcase-perf.js / showcase-stress.js / showcase-wind-perf.js 实测）：单条 10m 丛 ≈5-7k 卡 / 2-3 万三角 / 6 draw call；开销大头是卡片 overdraw（正常距离 -10% 帧率量级），阴影 pass 与风摆顶点 shader 零影响；卡片数减半是最大性能杠杆；
  - 叶色须保 G 通道可辨（暗橄榄叶×橄榄草地=像影子）；调试钩子 `window.__showcase`（展示页）。
- **灌木带 中央 26 丛 + 外围 30 丛（js/hedgefield.js，2026-09-11 二次迭代改版；09-12 三次迭代加外围散布）**：中央带**静态布置于 r∈[60,340]**（双方出生点恒跨图中心对峙 → 中心环带即"中间区域"，与出生角无关；**旧版"场局部系摆放+每场旋转"方案已废弃**——旋转后避路/避障/贴地校验全部失效属根因缺陷。hedge.js 的 `groundTrack`/`reground` 机制保留在库中备用）。**分层网格均匀布点**（sqrt 等面积 2 环 × 13 扇区，格内抖动 + 全环兜底），长丛 12/14/16m 混合（8 个固定种子模板），丛间距 ≥20m；**整丛不跨路**（沿长轴 5 点采样 roadDist ≥9.5）、避村落/障碍。软视线遮挡（沿长轴每 ~1.7m 一个重叠圆，r≈1.0m 贴丛体实际半厚——可以小不能大，`{x,z,r,hedge:true}` 构建期直接进 world.sightBlockers，`applyBattle` 退化为仅清特效状态）；**伴生石**：每丛 ~70% 概率旁侧 0.5~2.5m 放一块中小巨石（maps.js 同一炮毁/阻挡注册管线，散石预算已减至 30；外围丛 `outer:true` **不放伴生石**——出生点可能落在旁边，免硬障碍压出生位）。坦克可穿越：扬尘加大（size1 5.4~8m）+ crushWood 碾木声 + leafBurst 小剂量落叶（`{leafScale:0.85, dirt:false}` 小叶薄片、不夹土块）；**开火震落**：`muzzleShake(pos)` 炮口 5m 内有丛 → 沿丛长轴抖落 5~7 团尘埃（玩家 main.js / AI ai.js 开炮点均挂钩）。地图密度 `cardDensity: 0.42`（中央 26 丛 ≈10.5 万卡/42 万三角，6 draw call/丛，视锥外剔除），`mipmaps:false`。**外围散布（09-12，配合出生区 300m 内零散遮蔽需求）**：r∈[420,1000] 环带 30 丛（3 环 × 10 扇区分层网格 + 全环兜底，种子 0x51de40+i*97），10/12/14/16m 混合模板，`cardDensity: 0.36` 控预算；合计 56 丛 ≈20 万卡 / 441 遮挡圆，draw call 516→622 实测帧率无回归。验证：scripts/hedge-test.js（布置统计/LOS 遮挡对照/贴地+避路+伴生石断言/穿越特效计数/开火震落对照/截图）+ smoke-test 无回归。
- 出生环带避障：出生半径 650/750m ±60m（1v1/1vN）→ **带区 [590,810] ±130m** 内无村落/巨石/树木（灌木为软遮挡，不受限）；中央 190m 空旷交战区。
- 出生（main.js `_startBattle`）：1v1 对峙 **1300m** / 1vN **1500m**（2026-09-12 由 900/1100 各 +400m——配合侦查体系，接敌前有机动/埋伏空间），敌群 120m+ 间距扇形展开；**敌车型号逐槽取自 settings.enemyTanks（2026-09-19，'random'/失效值回退阵营池随机）**。
- **坦克排气（拟真模型，main.js `_driveEffects`）**：负荷 = max(油门, 原地转向) + 起步加成；巡航因子 = 速度×(1-油门×0.7) 压低浓度。出团速率 3~17 团/秒随负荷，accumulator 累积（帧率无关均匀脉动，不一团团断续），左右排气口交替、每团随机微差。dark（浓度）= 0.05 + 负荷×0.45 + 起步×0.5 - 巡航×0.25。行驶烟迹控制：exhaustPuff 带 velFade（速度归一化）——速度越快烟团寿命/尺寸/透明度越低（寿命最多 -78%），烟迹不拖远。
- **排气口热浪（2026-09-19，js/heathaze.js，屏幕空间真折射·零管线侵入）**：主渲染直出画布后 `gl.blitFramebuffer` 把多重采样画布解析拷贝到同尺寸 RGBA8 纹理（⚠ 画布 MSAA 下 `copyTexSubImage2D` 非法，必须 blit；格式同为 RGBA8 合法），排气口世界位置画相机朝向公告牌，shader 按升腾噪声对拷贝做 UV 偏移采样重绘该区域——真背景折射，拷贝=最终显示字节故**零色彩管理风险**（天空等原样写屏 ShaderMaterial 不受影响，⚠ 勿改成「场景→RT→后处理 blit」管线：three 渲到 RT 不做 toneMapping/sRGB，会二次编码破坏既有观感）。区域=围绕排气点椭圆 r=(0.30~0.38m)×面积系数（垂直 ×1.2 热羽、中心上移 0.35r、花纹 ~0.44m/s 上飘、双频正弦去周期感），位移幅度 = 强度×0.07m×|w|（与区域屏幕尺寸同缩放，远距自然亚像素）。**功率联动（2026-09-19 二次迭代）**：powerK=min(cfg.engineHp/700,1)——面积 ×(0.25+0.75·powerK)、强度再 ×(0.3+0.7·powerK)，150hp 黄鼠狼≈不可见、700hp 虎/豹/猎豹/虎王满配（engineHp 全 12 车已在实车性能段，物理 hp/t 同源）；cfg.heatZShift 纵向偏移（虎王/猎豹 = -0.4、黑豹 = -0.7：热羽比排气烟点向车尾移，管口伸出更后——仅热浪位移，烟不动；黑豹烟点同时上移 0.2m。⚠ 改各车数据按 cfg key 定位块，勿按行号猜——config 块序≠展车序，曾误把黑豹改动打到 m4a3 上，被 heat-test 双车断言当场揪出）。强度（`tank.heatK`，damp 平滑）= (怠速 0.3 + 油门×0.4 + 原地转向×0.8 加成 + 起步×0.28)×功率系数；击毁/发动机损毁 → 目标 0 缓慢熄火（~4s 淡出）。公告牌深度测试 + 向相机回撤 8cm 防 z-fighting——车体/地形遮挡自动失效；粒子无深度写入，烟团与背景一起被抖动（物理正确）。**无热源零开销**（不拷贝不渲染）；MAX 12 源 = 1v5 满编 6 车×双排气口，>260m / 屏外 1.25NDC 剔除；拷贝 RT 随 drawingBuffer 尺寸自同步（画质/窗口变更免挂钩）；暂停时热浪时钟冻结（`_heatClock` 仅非暂停累积）。车库展示车怠速同样生效（`menuTank`）。验证：`scripts/heat-test.js`（车库/战斗登记、油门热强度上升、击毁熄火衰减、热源区 vs 草地对照区帧差分 ≈2~16×、零报错）+ `scripts/heat-shot.js`（排气区特写 + paused 冻结战场两帧差分热图——差分=纯热浪图案，核对椭圆形状/边界无缝）。

### 诺曼底 · 1944（bocage 树篱田，v2 定稿 2026-09-16）

- **布局数据同源**：全部布局在 **`js/mapdata-normandy.js`**（纯 JS 无 three 依赖：路网/小路/广场/小镇房屋 frontage 生成/田块分区/树篱规则/篱上树/缘带树）——maps.js 建图与 `scripts/norm-plan-v2.mjs` 平面图共用，**改布局只改这一个文件**，改完跑 `node scripts/norm-plan-v2.mjs` 出核对图（需本地服务器）。
- **主题定调**：内陆 bocage 农田，清晨低阳、少雾；树篱切割视线，交战距离 200~600m，伏击循环突出。2000×2000。布局源自用户手绘稿：主公路 ×3（南北大 S 弯 R1 / 东西直路 R2 / 东北弧线 R3，丁字口 (-380,50) 与岔口 (350,30)）；**紧凑小镇以丁字口为西南角**（x -370..-80 / z -280..30，镇区地形压平）；田块邻路随形 + 内部规整；距图缘 60~80m 草场缘带。
- **地形/氛围**：`normandyHeight` 低幅缓丘（起伏加大）+ 浅洼地 ×2（(-620,520)/(560,-560)）+ **镇台地**（附近最高 3.4m，顶平坡缓 r100~280 渐归）；天空/雾/光照沿用 v1 清晨低阳（Ambient 0.52 / Hemi 1.5——背光墙面不死黑）。
- **写实地面贴图（v3）**：全绿无泥土色（用户定稿：都是绿的有植被、加深变暗）；田块多边形 clip 填充（5 档绿色系，明度差 ±8%）+ 植被行纹理（除浅草田外全有）+ 田内杂色斑点（草簇/小石压"动画感"）+ 大块色斑 ×6 + 加密颗粒 46k；篱线柔暗缝。
- **田块（buildParcels）**：分区行列切块（Z1 路西 / Z2 镇北 / Z2c 镇东北 / Z3 东楔形 / Z4 南部），**共享边生成、结构上无重叠**；邻路边 = 路形偏移链（`offChain` 路心偏 14m 平行路形），其余边取直（整齐但非田字格）；cell = { edges: [折线边...], outer }。
- **树篱规则（用户定稿）**：外圈田（临缘带 100m）最长边 55% 概率点缀 1 短段（25~45m）；内圈田每块 ≤2 条逻辑边（70% 覆盖留缺口，共享边去重）；R1 镇南段两侧伴随篱；**篱上穿插树木**（每段 35% 概率 1 棵 leaf，~100 棵）。篱段 → 模板分段（24/34/44/56/64m）走 `HedgeField.buildBocage`（cardDensity 0.095 + 卡片 [0.47,0.82] 放大补偿、**cullFar 400m 距离剔除**）。实测 226 段 / 83.6 万卡 / 3692 遮挡圆；穿越特效/开火震落复用 HedgeField 既有机制。
- **紧凑小镇（70 栋，欧洲小镇组）**：`N2_TOWN_HOUSES` 由 `frontage()` 沿街生成——同组贴缝 0.8m、组间小巷 6~9m 的连续立面（主街 R2 南北双排 + 北横巷/纵巷/西支巷 + 背院低模填充 + mons_shop 地标 + 广场南北排）；房屋全线 EU_SCALE 0.88（09-16 用户实测偏大 20% 定 ×0.8，09-18 复看偏小回调 ×1.1；**纵巷北端夹缝的 le_mans_h2 与 h4 对调**——最深模型 0.88 下外推不收敛，road-clear-check 全量零违规）；**压路校验（validateHouses）**：全量建筑旋转包围盒（四角+中心）对主路/小路中心线距离 ≥ 半宽+0.6m，不满足沿「建筑中心→最近路点」方向逐级外推（≤8 轮；教训：frontage 参照线必须与真实路中心线一致——曾因 R2 参照线偏差 14m 导致南排骑路、L2 折线鼓出和弦 6m 导致纵巷排屋压巷；**回归探针 `scripts/road-clear-check.mjs` 全量零违规**）；**端头件双面可观规则**（四向探针 `scripts/eu-facing-sheet.png` / `eu-facing-x-sheet.png`：全部模型正面=局部+Z、仅 bourges_h1=-Z；fumay/feluy/romedenne/romeree/mons-X 山墙素面只能藏组内，L 形 le_mans_corner 内角素面不放端头）；**镇内硬化**：石板小路 ×3 + 硬化广场（46×36m）；**绿化**：宅旁小灌木（85% + 25% 第二处，buildYardBushes，0.9~1.5m 矮篱模板二次 buildBocage）+ 镇内绿化树 ×16（避路/巷）+ **镇外围绿带**（buildOutskirts 环带灌木+树木衔接田野）；**程序化路灯 ×10**（mergeGeos 铁杆+弯臂+奶白灯头 InstancedMesh，装饰无碰撞）。**eu 资产管线**：`otherModel/EuropeCity/*.glb`（29 件 Sketchfab 法比小镇）→ `scripts/prep-eu-buildings.js` 预处理（**specGloss→metalRough 必转**、单位归一、枢轴归一 y=0 落地/XZ 中心）→ `opt/`；main.js PROPS 按 `EU_FILES` 加载；createKitPlacer 对 `eu_` 前缀键自动拆模板；**可破坏 = PROP_RULES 查不到时 placeKit/destructibles 双处兜底 EU_PROP_RULE（hp 3 / rubbleH 2.0）**——⚠ 曾只在 destructibles 兜底导致 placeKit 静默退化为不可破坏装饰，查可破坏失效先查 placeKit 分支。**全套仅 ~26k 三角**。**镇内后院**（`buildYardLayouts`，用户定制）：屋后三面木围栏小院（55% 房屋，避路网/他宅）+ 柴堆/长椅/配电箱杂物。**eu 建筑击毁效果（A 组建筑管线，`isCollapseType` 含 eu_ 前缀）**：**HE 3 发击毁**（EU_PROP_RULE hp 3）——命中灰化（0.3/0.55 两档变灰非熏黑）+ 包围烟 + 木片砖石碎屑流（面积缩放公式兜底）+ 房屋命中音；终击**倾斜沉降式倒塌**（随机方向、低侧留墙、3~4s 前慢后快、1 秒内浓烟全罩、废墟堆中途升起、12% 残留小明火）；**AP 命中只出烟尘/木屑/音效不扣血**（`scripts/norm-destroy-test.js` 验证：AP hp 不变 / HE×3 倒塌 / 零报错）。⚠ 旧战损五件套（houseModel/【6】+opt/）已被用户移除，v2 不再使用。
- **无巨石**（同 v1）。
- **性能**：手动步进帧耗时 诺曼底 24ms / 库尔斯克 ~20ms（v1 初版 48.7ms 的历史教训：扫描高模必须离线减面、树篱卡片密度与距离剔除是关键）。验证：`scripts/norm-v2-shot.js`（世界参数 + 镇区/俯瞰/篱旁截图）、`scripts/norm-battle-test.js`（AI + 双向换图）、`scripts/norm-perf3.js`（两图帧耗时对照）、`scripts/norm-plan-v2.mjs`（布局核对图）。
- **使用文档**：`docs/europe-city-buildings.md`（29 件模型逐件尺寸/三角量/缩略图/接入示例，缩略图 `scripts/eu-thumbs/`）。

***

## 六、1vN 结构与 AI

- `main.js`：`this.enemies[]` + `this.ais[]` 数组；胜利=敌全灭，失败=玩家毁；**超时比存活乘员比例**（不再比 HP）。
- 结算统计：用时 / 射击 / 命中 / 击穿 / 命中率 / 歼灭敌车 / 击杀乘员 / 模块战果。
- AI（js/ai.js）：低血逻辑改为**重创撤退**（crewAlive≤2 / 起火 / 发动机或炮闩损毁）；受击侦测=乘员数下降；弹种只剩 AP/HE（穿不了就 HE 压制+绕侧 needFlank）；王牌掩体/短停射击/斜对敌摆角全保留。**卡住脱困（2026-09-14）**：所有行驶分支统一走 `_driveWithUnstick`（原只主交战分支有卡住检测，巡逻/戒备/包抄顶石头后永远卡死）——有油门/车速但位移极小持续 1.4s → 倒车 1.5s → 沿"顶住自己的障碍"**切线方向** 22m 绕行点脱困（纯侧向/前向绕行点都会二次顶墙：侧向满舵=原地枢轴平移量不足，前向=往石头里开）；检测窗口 coverState=moving 时 2.5s。验证：`scripts/ai-unstick-test.js`（车头怼进最大巨石 → 倒车 → 切线绕行 25s 内驶离 30m+）。
- AI 难度在游戏设置（新兵/标准/王牌），不再占车库页。

***

## 七、调试与工具

- `scripts/inspect-glb.js` / `inspect-tree.js`：GLB 结构/世界包围盒探查（接新车必用）
- `scripts/smoke-test.js`：全流程冒烟（封面→菜单→车库→战斗→开镜→开炮，截图+控制台错误）
- `scripts/enemy-slots-test.js`：敌方编队编辑器回归（数量步进封顶封底/阵营过滤/失效回退/混编全车型/5 敌指定编成进战斗核对）
- `scripts/garage-shot.js`：车库验证（加载中悬浮检查 + 主视角/大门/侧面/高位四角度截图）
- `scripts/kill-effects-test.js`：击毁/弃车效果验证（殉爆双分支/弃车烟/余烬相/再来一局泄漏检查）
- `scripts/dust-mound-test.js`：弹着尘堆回归（0.5s 延迟生成/口径范围/alphaPow 前慢后快消退/同向漂移/地面+坦克双命中）
- `scripts/track-wind-scorch-test.js`：行驶履带滚动方向（侧拍互相关）+ 熏黑色阶截图；`scripts/wind-check.js`：风摆时钟活性；`scripts/gust-tree-verify.js`：间歇阵风包络采样 + 树木风摆像素差分（树冠动/树干静）
- `scripts/heat-test.js`：排气热浪回归（车库/战斗热源登记、油门热强度上升、击毁熄火衰减、热源区 vs 对照区帧差分、截图）；`scripts/heat-shot.js`：热浪特写 + paused 冻结战场两帧差分热图（`heat.debugBoost` 放大位移便于观察）
- `scripts/tiger-sound-test.cjs`：虎式音效回归（fireAim 开镜炮声选曲 / 新式发动机怠速·油门·极速降量·减速尾段·刹停回怠速全状态机，真实键盘驱动）
- `scripts/panther-sound-test.cjs`：黑豹/猎豹音效回归（pz5a 单文件引擎形 B：油门循环+尾段怠速循环/松油门交叉淡入/舱内衰减叠加/四向开炮声选曲，车库逐车 next 选中进战斗）
- `scripts/fire-sounds-test.cjs`：第二批开火声回归（7 车静态字段 + 猎虎 e2e：双音源数组解码/playFire 随机覆盖/真实开炮/镜内选曲）
- `scripts/engine-sounds-t2jt.cjs`：虎王/猎虎引擎声回归（独立怠速+加速/巡航分段+虎王减速停车音"动→停沿播一次不重触发"全状态流，真实键盘驱动）
- `scripts/damage-test.js` / `regression-test.js`：伤害系统 API 级测试 + 1v3 AI 观察
- `scripts/crew-bail-test.js`：拟真伤害体系回归（驾驶员瘫痪/断带趴窝/修理读条/AI+玩家弃车/固定阵营/AI 修理黄标）
- `scripts/plate-hit-test.js [tiger1|m4a3]`：装甲板图命中回归（板名/法线角/跳弹/炮塔随动/板缝穿透/行走部 flag）
- `scripts/sight-test.js` / `dial-test.js`：瞄具迭代回归（炮口指示器对齐/转盘测距旋转）
- `armor-view.html`（+scripts/armor-shot.js）：装甲板图模型可视化（读 config `armorModel`）；`armor-editor.html`（+armor-editor-test.js）：**装甲&命中模型编辑器**——树/点选/滑块/±微调步进器/增删板与附加盒/乘员模块球全参调整，一键导出 config.js 片段（复制/下载）
- `scripts/bino-test.js`：车长望远镜回归（7×/12× 切换、遮罩开关、禁火、退出恢复）
- `scripts/pen-spall-test.js`：车体倾斜（±12.6°）下侧射后效一致性（穿透板数/乘员/模块事件统计）
- `scripts/ai-unstick-test.js`：炮弹板缝穿过不吸附（不卡光柱）+ AI 顶巨石倒车/切线绕行脱困
- `scripts/m4-test.js` / `m4-track-test.js` / `m4-track-dir-test.js`：M4 炮塔枢轴 90° 观感 / 履带滚动方向连拍 / offset 符号像素级定向（配合 PIL 互相关分析）
- `scripts/rock-test.js`：巨石回归（碰撞体唯一注册、炮弹精确网格求交穿心不漏/角部不空气墙、击毁废墟贴地、干草堆清零、灌木遮挡圆半径上限）
- `scripts/graze-probe.js` / `graze-verify.js`：掠射诊断与修复验证（石头挡弹余量量化 / 贴面切线弹越过+穿心弹挡下 / hull-down 测距门保留敌坦+无散布直射弹着炮塔）
- `scripts/map-shot.js` + `map-pixel-stats.js`：地图视觉回归（无敌补丁 → 四机位截图 + 像素统计：蓝天/白云/昏黄残留/地面均色）
- `scripts/norm-v2-shot.js` / `norm-battle-test.js` / `norm-plan-v2.mjs`：诺曼底 v2 回归（世界参数+多机位截图 / AI 行为+双向换图 / 布局核对图——与 `js/mapdata-normandy.js` 同源）；`scripts/norm-perf3.js`（两图帧耗时对照）
- `scripts/norm-perf.js` / `norm-perf2.js` / `norm-perf3.js`：诺曼底性能剖析（逐项开关 FPS 对照 / 手动步进帧耗时 + 分类三角量 / 两图帧耗时对照）；`scripts/decimate-buildings.js`（建筑 GLB meshopt 离线减面 → houseModel/opt/）；`scripts/tri-count.js`（GLB 三角量速查）
- `scripts/vis-probe.js`：点亮系统几何对照（80 随机点位 canSee vs 复刻 _los 的一致性 + 树丛/开阔点亮率分组）
- `scripts/spotting-test.js`：点亮侦查 v2 回归（分档自动确认/AI 警戒圈/dwell 主动侦查/开火疑似+误差收敛/电台共享/标记与暴露警示 DOM/LOS 高度化）
- `scripts/align-probe.js` / `conv-shot.js`：开镜完全收敛错位实测（≈1.4px）/ 收敛分档两态截图对照
- `scripts/sky-debug.js`：天空调参（shader 版本校验 + 天空垂直采样色带）
- `scripts/perf-profile.js`：性能剖析（toggle 实验：逐项开关天空/阴影/植被投影/植被渲染/像素比，测帧率差；注意无头模式走真实 GPU D3D11，数据可直接参考；勿 stub `applyHit` 返回 undefined——shell.js:150 读 `.type` 会崩）
- `scripts/verify-new3.js` / `prep-new3.js` / `measure-new3.js` / `track-uv-new3.js`：新车回归（marder3m/jpz4l70/is2/ferdinand/jagdpanther 五车装配+装甲板法线入射+限角钳制+HE 参数+近失弹+实战冒烟）/ 入库预处理 / 量测与 UV 探针
- `scripts/split-wheels-ferdjag.js` / `analyze-ferdjag.js` / `measure-ferdjag.js` / `wheel-shots-ferdjag.js`：费迪南/猎豹焊死轮系切割（wheel-split-playbook 第二三例：种子发现+最近锚点归桶）/ 轮系分量分析 / 结构探查 / 轮件隔离渲染截图
- `scripts/split-wheels-jt.js` / `analyze-jt.js` / `measure-jt.js` / `track-uv-jt.js` / `profile-jt.js` / `profile-jt2.js`：猎虎轮系切割（playbook 第四例，内排满盘加 roadMinX 外排门）/ 轮件分量分析 / 全节点包围盒 / 履带 UV 方向 / 装甲轮廓实测
- `scripts/split-wheels-td.js <车型>` / `analyze-td.js <glb> <轮件节点csv> [机枪节点]` / `measure-td.js` / `check-pz4-out.js <glb>` / `verify-td.js <车id>` / `speed-test-<车>.js`：**第 14~24 辆新车统一工具链**（playbook §十三；CFG 表驱动轮系切割+非轮拆分 barrel/roofMg/jerry/mgSplit；轮对中性+渲染复核；游戏内断言+行驶+弹种回归；地形极速实测）
- `scripts/verify-tanksel.js` / `verify-exhaust-alpha.js` / `verify-jet-v*.js` / `verify-m26*.js` / `check-m26-*.js` / `measure-m26*.js` / `split-wheels-m26.js`：车库两级下拉验证 / 排气透明度规则+V 字上喷验证 / M26 接入验证与量测（独立脚本，含 Object_23 双机枪拆分）
- 浏览器钩子：`window.__game` / `window.__audio`
- 语法检查：`node --check --input-type=module < js/xxx.js`
- 注意：puppeteer 无头模式软件渲染 ~20-40 FPS，真机 GPU 远高于此

***

## 八、后续迭代方向

1. 二战音源替换（当前 T-90 套占位；改 config `sound` 路径即可）
2. 更多坦克（tankModel/ 已有 t-34-85 / panther-a / m10 等模型与 md 标注）
3. 生存模式 / 战役模式（菜单占位已在）
4. 弹药架湿式布局差异（M4 水套殉爆率 0.18 vs 虎式 0.32——已在 config 体现为不同 internal 布局，可再加 per-tank 系数）
5. 断履带后原地打转的维修进度表现、乘员语音播报
6. ~~大口径 HE 威力体系~~ **已实施（2026-09-18 A/B/D+velMult → 2026-09-23 方案 C 补齐）**：hePower 威力系数缩放溅射表 + per-gun HE penMult + applyHENearMiss 近失弹 + velMult 覆盖 + heShock 结构震伤/装甲内崩落（hePower≥2 生效，小口径行为不变）全部上线；参数与验收见 `docs/heavy-he-damage-plan.md`、`scripts/heavy-he-test.js`
