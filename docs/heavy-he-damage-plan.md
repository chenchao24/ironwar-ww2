# 大口径 HE 威力体系 — 设计定稿（A/B/D+velMult 已实施）

> **状态**：2026-09-23 **方案 C 已实施**（`DAMAGE_RULES.heShock`：hePower≥2 未击穿追加 ①内崩落（概率 0.12×(P−1)+0.002×板mm 封顶 0.65，命中点 2m 内 1~2 名乘员 35% 击毙否则击伤）②结构伤（方向机/发动机各掷 0.2×(P−1)、命中部位对应项 ×1.5，伤害 20~40）③薄甲震伤波及 1→2 人、半径 +0.3×(P−1)；P=1 行为不变）。验证 `scripts/heavy-he-test.js`（122 未击穿虎式 ×300：崩落 31%/结构伤 54%；88mm 对照 ×100 零事件）。**已实施**：A（hePower 缩放溅射表）+ B（per-gun HE penMult）+ C + D（applyHENearMiss 近失弹）+ velMult 覆盖。**未实施**：E 的相机震动部分。ISU-152 接入时按 A 表加 `heShell: { power: 3.5, penMult: 0.24, nearMissR: 6, velMult: ~1.09 }` 即可（C 判定自动生效）。
> **定稿日期**：2026-09-18（用户与 AI 讨论定稿）
> **关联**：`PROJECT.md` 三（伤害系统）、`js/config.js` SHELL_TYPES / DAMAGE_RULES、`js/tank.js` applyHit / applyHESplash / spallDamage、`js/shell.js` 地面命中分支

---

## 一、现状瓶颈（为什么要做）

1. **HE 是全局一张表**：`SHELL_TYPES.he`（config.js ~1020）所有坦克共用——88mm HE 与 152mm HE 溅射完全相同（断带 55% / 观瞄 50% / 薄甲震伤 40%），大口径威力无从体现。
2. **HE 穿深公式锁死**：`penMult: 0.10` → 152mm 仅 ~15mm 穿深，连 M4 的 20mm 顶甲都穿不了，`spallDamage` 的 `heBurst 2.0m` 爆轰球（车内杀伤上限最高的路径）永远进不了车内。
3. **近失弹零伤害**：HE 落地只出特效+音效（shell.js 地面命中分支），车边 3m 爆炸对坦克无任何影响。
4. 史实上 122/152 HE 未击穿也致命：崩落装甲内层伤乘员、震坏座圈/方向机、焊缝震裂——现行模型无对应机制。

## 二、方案 A-E（落地顺序：A+B+D → C → E）

### A. 每门炮一个 `hePower` 威力系数（核心，其余派生）

射击时解析威力参数到 shell 对象（同 `tank.js:832` 现有 pen 解析方式：`cfg` 带每炮 HE 参数，fire 时写入 shell）。`applyHESplash` 从全局表改为按威力缩放。

| 火炮 | hePower | 薄甲震伤上限 | 断带 | 近失弹半径 |
|---|---|---|---|---|
| 75/76mm（M4、黑豹等） | 0.6 | 30mm / 40% | 55% | 无 |
| 88mm（虎式/虎王） | 1.0 | 30mm / 40% | 55% | 2m（轻） |
| 122mm D-25T（IS-2） | 2.2 | 60mm / 55% | 75% | 4m |
| 152mm ML-20（ISU-152） | 3.5 | 90mm / 70% | 90% | 6m |

- 现有坦克数值不变（75/76/88 = 现行表），只给新火炮加档。
- **初速也要随炮覆盖（velMult）**：现行 `SHELL_TYPES.he.velMult 0.72` 是 HE 弹种全局值（config.js:1025），对 122/152 不适用——史实上这两门炮 HE 与 AP 初速几乎相同：D-25T OF-471 ≈800 m/s（AP BR-471B ≈795，velMult≈1.0）、ML-20 OF-530 ≈655 m/s（AP BR-540 ≈600，**HE 反而更快**，velMult≈1.09）。照搬 0.72 会让 IS-2 的 HE 弹道弧虚高、手感失真。瞄准链（`shellVelocityOf` tank.js:794 → 仰角解算/炮口指示器/测距门 hArc）全部读该值，改 velMult 即全自动生效。
- 实现要点：`DAMAGE_RULES.heSplash` 保留为 power=1 基准；每炮 `cfg.heShell = { power, penMult, nearMissR, velMult }` 覆盖（velMult 缺省回落 0.72 保持现有车辆不变）；shell 对象携带 `hePower`，`applyHit` 需能把 shell 参数传进 `applyHESplash`（现签名只有 shellType，扩参或挂到 hit 对象）。

### B. 大口径 HE 提升穿深 → "爆轰球进车内"成为杀招

`penMult` 随炮：88 保持 0.10，**122 → 0.16（~21mm），152 → 0.24（~36mm）**。

- 效果：152 HE 能真实掀开 M4/克伦威尔/T-34 的顶甲、发动机盖、薄侧甲——击穿后现有 `spallDamage` HE 分支自动接管（爆轰球心前方 0.9m、半径 2.0m、乘员 85% 阵亡、模块 [45,90] 伤害），可按威力扩至 2.6m（power ≥3 时 `heBurst ×1.3`）。
- **不写任何新伤害逻辑**，现成系统直接涌现"ISU-152 一炮入魂"。史实上 152 杀薄顶甲本来如此。
- 对重甲正面（虎式首上 100mm+）依旧打不穿 → 走 C/D 的震伤/近失，不会变成万能弹。

### C. 未击穿不白打：结构震伤 + 装甲内崩落（power ≥2 才生效）

`applyHESplash`（tank.js:1091）追加三条大口径判定：

- **震伤链**：除最近乘员外，半径内再掷 1~2 名乘员（受伤/阵亡），概率随 power；
- **结构伤**：方向机 / 发动机按概率吃 20~40 点（座圈受震、支架变形）；power=3.5 时几乎必伤一项；
- **内崩落**：按命中板装甲厚度与威力差掷概率（armorModel 板名/厚度可得），触发复用 `tryCrew` 给 1~2 名乘员崩落伤——"没打穿也死人"的史实机制。

### D. 近失弹溅射

shell.js 地面命中分支（HE 调 `dirtHit+heGround` 处）追加：爆点对半径内坦克调新函数 `tank.applyHENearMiss(pos, power)`——距离衰减的断带 / 观瞄 / 乘员震伤（敞顶/薄甲车加重）。半径按 A 表；88 2m 内轻效，152 6m 内有感。

### E. 演出配套（特效框架已支持，近乎白送）

- `dirtHit` 的 k 参数接 hePower：152 → k≈2.6（土柱/尘幕大一大圈；k 已按 √k 缩放尺寸，直接乘）；
- `heGround` 尘幕 scale 随威力；`ps.flash` 强度、爆炸音量、相机震动随 power；
- 2026-09-17 弹着特效重做（土尘主导/无环/分层尘）是基底，直接复用。

## 三、实施清单（届时照此执行）

1. config.js：`SHELL_TYPES` 加 per-gun HE 变体或 `cfg.heShell`（power/penMult/nearMissR/**velMult**）；`DAMAGE_RULES.heSplash` 加 power 缩放公式与近失弹规则常量。
2. tank.js：fire 解析威力参数入 shell（~832 附近）；`applyHit`/`applyHESplash` 传参改造 + C 的三条判定（~40 行）；新增 `applyHENearMiss`（~30 行）。
3. shell.js：地面命中 HE 分支加近失弹扫描（~10 行）。
4. effects：dirtHit/heGround/音效/震动接 hePower。
5. 新坦克本体照常走 armorModel + md 标注管线（model/ + scripts/measure-new-tanks.js），**威力体系是纯弹药层，不动装甲/乘员/模块结构**。

## 四、验收要点（届时建 scripts/heavy-he-test.js）

- ISU-152 HE 打 M4 顶甲 → 击穿 + 爆轰球车内结算（乘员大量伤亡/模块毁伤），打虎式正面 → 未击穿但结构震伤/内崩落可触发；
- IS-2 HE 未击穿虎式 → 断带率/观瞄伤明显高于 88 HE（对照断言）；
- 近失弹：152 落点 3m 处虎式 → 有震伤/断带事件；75mm HE 落地 → 无（现状不变）；
- 既有回归不动：plate-hit-test / crew-bail-test / spotting-test 全绿（75/76/88 行为应与改前一致）。
