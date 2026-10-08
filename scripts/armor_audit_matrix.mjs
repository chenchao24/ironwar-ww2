// 装甲审计 + 对射击穿矩阵（2026-09-23）
// 1) 口径审计：对比 armor 汇总字段 vs 板图推导的平射等效，找出"预计算等效/双重计倾角"的车
// 2) 对射矩阵：每车主炮 AP（含 APCR 行）在 500/1000/1500m 对每车正面（首上/战斗室正面）与炮塔正面的击穿判定
// 输出：对射校验_20260923.md
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1') + '/..';
const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf-8');
fs.writeFileSync(path.join(ROOT, '_cfg_audit.mjs'), cfgSrc);
import { pathToFileURL } from 'node:url';
const { TANKS, SHELL_TYPES } = await import(pathToFileURL(path.join(ROOT, '_cfg_audit.mjs')).href);
fs.unlinkSync(path.join(ROOT, '_cfg_audit.mjs'));

const D2R = Math.PI / 180;
// 板法线：rot [rx,ry,rz] 度，板初始法线 +z；按 Rx→Ry→Rz 顺序旋转
function plateNormal(rot) {
  const [rx, ry, rz] = (rot || [0, 0, 0]).map((v) => v * D2R);
  // Rx
  let [x, y, z] = [0, -Math.sin(rx) * 1, Math.cos(rx)];
  // 实际 Rx(0,0,1) = (0, -sin(rx), cos(rx))
  // Ry
  const x2 = x * Math.cos(ry) + z * Math.sin(ry);
  const z2 = -x * Math.sin(ry) + z * Math.cos(ry);
  x = x2; z = z2;
  // Rz
  const x3 = x * Math.cos(rz) - y * Math.sin(rz);
  const y3 = x * Math.sin(rz) + y * Math.cos(rz);
  return [x3, y3, z];
}
// 平射（水平入射，来自正前方）等效 = t / |nz|，受 cosFloor 限制
const COSFLOOR = (SHELL_TYPES.ap && SHELL_TYPES.ap.cosFloor) || 0.2;
function effFlat(p) {
  const n = plateNormal(p.rot);
  const nz = Math.abs(n[2]);
  return p.t / Math.max(nz, COSFLOOR);
}

const ids = Object.keys(TANKS);
const penAt = (pen, drop, d) => pen * (1 - drop * d / 1000);

// ── 审计：每车正面代表板 ──
const audit = [];
for (const id of ids) {
  const t = TANKS[id];
  const hullPlates = (t.armorModel && t.armorModel.hull.plates) || [];
  const front = hullPlates.filter((p) => p.face === 'front');
  // 代表板：首上系（含 首上/首上竖直/战斗室正面 中面积最大者）
  const main = front.filter((p) => /首上|战斗室正面/.test(p.name))
    .sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])[0] || front[0];
  if (!main) { audit.push({ id, note: '无 front 板！' }); continue; }
  const plateEff = effFlat(main);
  const sum = t.armor.hullFront;
  let kind;
  if (Math.abs(sum - main.t) / main.t < 0.06) kind = '原始厚度 ✅';
  else if (Math.abs(sum - plateEff) / plateEff < 0.06) kind = '⚠️ 存的是等效值（口径不一致）';
  else kind = '⚠️ 与代表板不符（可能取了别的板）';
  audit.push({
    id, name: t.name, sum, plate: main.name, plateT: main.t, rot: main.rot,
    plateEff: Math.round(plateEff), kind,
  });
}

// ── 对射矩阵：对 正面（首上系最大板等效）与 炮塔正面（炮盾）──
function targetFronts(t) {
  const hullPlates = (t.armorModel && t.armorModel.hull.plates) || [];
  const turPlates = (t.armorModel && t.armorModel.turret.plates) || [];
  const hullF = hullPlates.filter((p) => p.face === 'front' && /首上|战斗室正面/.test(p.name))
    .sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])[0]
    || hullPlates.find((p) => p.face === 'front');
  const turF = turPlates.filter((p) => p.face === 'front')
    .sort((a, b) => b.size[0] * b.size[1] - a.size[0] * a.size[1])[0];
  return { hull: hullF ? effFlat(hullF) : null, turret: turF ? effFlat(turF) : null };
}

const RANGES = [500, 1000, 1500];
const matrix = [];
for (const atk of ids) {
  const a = TANKS[atk];
  const guns = [{ tag: 'AP', pen: a.shellPen, drop: a.shellPenDrop }];
  if (a.apcrShell) guns.push({ tag: 'APCR', pen: a.apcrShell.pen, drop: a.apcrShell.penDrop });
  for (const dfn of ids) {
    if (dfn === atk) continue;
    const d = TANKS[dfn];
    const f = targetFronts(d);
    for (const g of guns) {
      const row = { atk, dfn, gun: g.tag };
      for (const r of RANGES) {
        const p = penAt(g.pen, g.drop, r);
        const h = f.hull == null ? '·' : (p >= f.hull ? '穿' : 'X');
        const tt = f.turret == null ? '·' : (p >= f.turret ? '穿' : 'X');
        row['r' + r] = h + '/' + tt;   // 车体首上 / 炮塔正面
      }
      matrix.push(row);
    }
  }
}

// ── 输出 markdown ──
let md = `# 装甲口径审计 + 对射击穿矩阵（2026-09-23 生成）

口径约定：穿深 = 30° 口径 mm RHA；等效 = 板厚 / cos(板倾角)（平射正面入射，cosFloor=${COSFLOOR}）。
矩阵格：车体首上系 / 炮塔正面，"穿"=该距离可击穿，"X"=不能，"·"=无此板。

## 一、装甲口径审计（汇总字段 vs 板图推导）

| 车 | armor.hullFront | 代表板 | 板厚 | 倾角rot | 板图等效@平射 | 口径判定 |
|---|---|---|---|---|---|---|
`;
for (const a of audit) {
  if (a.note) { md += `| ${a.id} | — | ${a.note} | | | | |\n`; continue; }
  md += `| ${a.id} ${a.name} | ${a.sum} | ${a.plate} | ${a.plateT} | ${JSON.stringify(a.rot)} | ${a.plateEff} | ${a.kind} |\n`;
}

md += `\n## 二、对射击穿矩阵（AP；车体/炮塔）\n\n`;
md += `| 攻击方 \\ 目标 |` + ids.map((i) => ' ' + i).join(' |') + ' |\n';
md += '|' + '---|'.repeat(ids.length + 1) + '\n';
for (const atk of ids) {
  const cells = ids.map((dfn) => {
    if (dfn === atk) return ' —';
    const m = matrix.find((r) => r.atk === atk && r.dfn === dfn && r.gun === 'AP');
    return ` ${m.r500}<br>${m.r1000}<br>${m.r1500}`;
  });
  md += `| **${atk}** |${cells.join(' |')} |\n`;
}
md += `\n（每格三行 = 500 / 1000 / 1500m；APCR 明细见下）\n\n## 三、APCR 对重甲正面（穿=可穿车体首上系）\n\n`;
md += `| 攻击方 | 目标 | 500m | 1000m | 1500m |\n|---|---|---|---|---|\n`;
for (const r of matrix) {
  if (r.gun !== 'APCR') continue;
  const apRow = matrix.find((x) => x.atk === r.atk && x.dfn === r.dfn && x.gun === 'AP');
  // 只列 AP 打不穿但 APCR 打得穿的（APCR 存在的意义）
  const gain = RANGES.some((R, i) => {
    const k = 'r' + R;
    return apRow[k][0] === 'X' && r[k][0] === '穿';
  });
  if (gain) md += `| ${r.atk} | ${r.dfn} | ${r.r500} | ${r.r1000} | ${r.r1500} |\n`;
}

fs.writeFileSync(path.join(ROOT, '对射校验_20260923.md'), md);
console.log('written 对射校验_20260923.md');
console.log('\n── 审计异常 ──');
for (const a of audit) {
  if (a.note || (a.kind && !a.kind.startsWith('原始厚度'))) {
    console.log(`${a.id}: 汇总=${a.sum} 板厚=${a.plateT} 板等效=${a.plateEff} ${a.kind || a.note}`);
  }
}
