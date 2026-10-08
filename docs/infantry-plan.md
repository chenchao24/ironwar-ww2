# 地面步兵方案（2026-09-30 存档 · 暂不接入游戏）

**状态**：方案与 Demo 已完成并通过截图验证，用户决定**暂不接入游戏**，存档备续。
恢复接入时按本文「接入清单」执行即可。

## 资产清单（全部为本次产出，已入库）

| 文件 | 说明 |
|---|---|
| `js/infantry2.js` | **正式候选模块**：三阵营程序化士兵（SoldierRig）+ 步兵班（Squad） |
| `js/infantry.js` | 早期积木小人版（方案 A 原型，已被 v2 取代，可删可留） |
| `infantry2-test.html` + `js/infantry2-demo.js` | v2 Demo 页：姿态审查台（15 姿态按钮）+ 三行军班 + 炮击/机枪交互 |
| `infantry-test.html` + `js/infantry-demo.js` | v1 积木小人 Demo 页（废弃参考） |
| `German.html` | 用户手写德军程序化模型原始页（v2 的内核来源，勿删） |
| `scripts/infantry2-shot.js`、`scripts/infantry-close-shot.js` 等 | 截图验证脚本 |

## v2 模块设计要点（js/infantry2.js）

- **模型**：German.html 内核重构。三阵营参数化（德=M35 盔+胸鹰 / 美=M1 半球盔 / 苏=ssh40+乌山卡 60/40）；
  雪地罩衫按配发率（德 50%/苏 30%/美 20%），`SoldierRig(parent, fk, {snow, rand})`
- **骨骼合并**：装饰件按所属骨骼 mergeGeometries，~28 mesh/人；材质/几何体模块级缓存
- **动画**：两骨 IK（四肢+极向）+ 关键帧姿态函数。15 姿态：idle/guard/port_arms/walk/walk_sling/crouch/
  sprint/stand_fire/kneel_fire/prone_fire/prone_alert/throw/death/death_fwd/explode
- **本次动作改进**：步行髋滚+胸对摆+头稳定；walk_sling 背枪摆臂行军（史实行军携行）；
  prone_alert 受惊纯卧倒（背枪/肘撑/侧头观察）；过渡速率分档（受惊快、常规缓）
- **位姿双模式**：单兵模式（home 锚点）/ `externalTransform=true`（Squad 驱动，姿态位移增量叠加）
- **Squad**：路径纵队（弧长+两列交错）、`shellAt()`（爆心最近者 explode、圈内外亡、外圈全班卧倒 4s）、
  `mgHit()`；特效走回调 `fx={onMuzzle,onDust,onThrow}`，不绑定粒子系统

## 已验证（截图存 scripts/shot-inf2-*.png）

- 三阵营辨识度、15 姿态全部正确；班组炮击（3/8 存活卧倒、尸体+脱手步枪留地）
- 性能：27 兵 ~750 draw call（主程，不含阴影通道）/ ~28 万 tri；headless FPS 30~60

## 接入清单（恢复时执行）

1. **布点**（建议先只接阿登）：mapdata-ardennes 加步兵路径（村 1 班 + 主路行军纵队 1~2 班 + 林缘散兵班）；
   Squad 构造传 `groundY: ardennesHeight`（脚底贴地已支持）
2. **杀伤判定**：
   - 机枪：main.js `_fireMGShot` 命中段加士兵胶囊求交 → `squad.mgHit(rig)`
   - HE：shell.js 地面命中/近失弹段加 `squad.shellAt(pos, rKill, rProne)`（近失半径沿用 nearMissR）
   - 碾压：Tank 行进时对近旁士兵 mgHit（crushCheck 同款思路）
3. **特效接线**：fx 回调接到 Effects/粒子系统（雪原主题已有 theme='snow'，中弹扬雪复用）
4. **性能分档（必做）**：<100m 全帧 IK；100~300m IK 降 30Hz；>300m/视锥外跳过动画；
   人数多时再上 InstancedMesh 部件化（~14 draw call 全军）
5. **不做**（已裁决）：步兵不还击、不进点亮系统、无血（倒地+雪雾）
6. **三期候选**：反坦克小组（Panzerfaust/巴祖卡，低命中低伤害打断履带）——另议平衡

## 遗留小项

- 苏/美装具与德军同形（仅换色）：若有追求可做背包差异化
- prone 姿态脚踝略穿雪（低模通病，接入时按 groundY 微调）
- v1（js/infantry.js + infantry-test.html + js/infantry-demo.js）已废弃，清理与否由用户定
