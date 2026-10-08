# 钢铁战线3 · 铁甲猎手（IronWar WW2）

**线上版**：https://ironwar-ww2.pages.dev （Cloudflare Pages，main 分支内容）

Three.js + WebAudio 的 3D 二战坦克对战网页游戏。无血条·乘员+模块制伤害模型，
拟真弹道（高斯散布/抛物线），两层点亮侦查，分层 AI（排级大脑+怀疑度地图），可破坏场景。

## 运行

```
node server.js   # → http://localhost:8081
```

纯静态 ES Module，无构建工具；`index.html` 通过 importmap 引用 `node_modules/three`（随库提交，开箱即用）。

## 内容

- 24 辆史实坦克（德/美/苏/英），弹种 AP/APCR/HE 史实化（跳弹概率曲线+口径碾压）
- 地图：库尔斯克 1943 / 诺曼底 1944 / 阿登森林 1944（雪林·大雾·飘雪·冬季白洗涂装）
- 玩法：猎杀模式 1v1~1v5，车库编队编辑器，AI 三档难度

## 目录

| 目录 | 说明 |
|---|---|
| js/ | 游戏主代码（main/tank/shell/ai/effects/maps/…） |
| model/opt/ | 坦克模型（压缩版；原包 model/ 不入库） |
| docs/ | 设计文档（地图/AI/炮弹规范/性能方案等） |
| scripts/ | 一次性分析/截图/校验脚本 |
| tankModel/*.md | 模型部件标注文档 |

## 开发入口

- `PROJECT.md`：项目主文档（状态/结构/迭代记录）
- `docs/perf-plan.md`：性能优化方案与实测
- 备份 `_backup_*/`、截图 `scripts/shot-*.png` 不入库（见 .gitignore）
