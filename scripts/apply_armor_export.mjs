// 通用：应用装甲编辑器导出（armorModel + internal 整块替换）
// 用法：node scripts/apply_armor_export.mjs <坦克id> <导出txt路径> [可跟多组]
// 导出文件格式：以 armorModel: { 开头的 JS 对象片段（编辑器"导出"按钮产物）
import fs from 'node:fs';

const CONFIG = new URL('../js/config.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ── 解析导出片段为对象 ──
function parseExport(file) {
  let src = fs.readFileSync(file, 'utf-8');
  // 去掉首行注释，包成对象字面量 eval
  src = src.replace(/^\/\/.*$/gm, '');
  const obj = (new Function('return ({' + src + '})'))();
  if (!obj.armorModel) throw new Error(file + ': 缺少 armorModel');
  return obj;
}

// ── 紧凑格式化（对齐 config.js 现有单行风格）──
const arr = (a) => '[' + a.join(', ') + ']';
const plate = (p) => {
  let s = `{ name: '${p.name}', face: '${p.face}', t: ${p.t}, pos: ${arr(p.pos)}, size: ${arr(p.size)}, rot: ${arr(p.rot)}`;
  if (p.mirror) s += ', mirror: true';
  if (p.track) s += ', track: true';
  if (p.weak) s += ', weak: true';
  return s + ' },';
};
const part = (name, pt) => `      ${name}: {
        box: { x0: ${pt.box.x0}, x1: ${pt.box.x1}, y0: ${pt.box.y0}, y1: ${pt.box.y1}, z0: ${pt.box.z0}, z1: ${pt.box.z1} },
        plates: [
${pt.plates.map((p) => '          ' + plate(p)).join('\n')}
        ],
        extras: ${JSON.stringify(pt.extras || [])},
      },`;

function fmtArmor(am) {
  return `    armorModel: {
${part('hull', am.hull)}
${part('turret', am.turret)}
    },`;
}

const sphere = (c) => `{ x: ${c.x}, y: ${c.y}, z: ${c.z}, r: ${c.r} }`;
function fmtInternal(it) {
  const mods = Object.entries(it.modules)
    .map(([k, v]) => `        ${k}: [${v.map(sphere).join(', ')}],`).join('\n');
  return `    internal: {
      crew: [
${it.crew.map((c) => `        { id: '${c.id}', name: '${c.name}', x: ${c.x}, y: ${c.y}, z: ${c.z}, r: ${c.r} },`).join('\n')}
      ],
      modules: {
${mods}
      },
      ringY: ${it.ringY},
      trackX: ${it.trackX}, trackY: ${it.trackY},
    },`;
}

// ── 括号匹配替换 ──
function blockEnd(src, i) {
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') {
      d--;
      if (d === 0) return src[j + 1] === ',' ? j + 2 : j + 1;
    }
  }
  throw new Error('unbalanced braces');
}
function replaceBlock(src, fromIdx, name, newtext) {
  const key = '    ' + name + ': {';
  const i = src.indexOf(key, fromIdx);
  if (i < 0) throw new Error(name + ' not found');
  const j = blockEnd(src, i + key.length - 1);
  return src.slice(0, i) + newtext + src.slice(j);
}

// ── 主流程：成对参数（id, file）──
let src = fs.readFileSync(CONFIG, 'utf-8');
for (let k = 2; k < process.argv.length; k += 2) {
  const [tid, file] = [process.argv[k], process.argv[k + 1]];
  const data = parseExport(file);
  const anchor = `  '${tid}': {`;
  const a = src.indexOf(anchor);
  if (a < 0) throw new Error(tid + ' block not found');
  src = replaceBlock(src, a, 'armorModel', fmtArmor(data.armorModel));
  if (data.internal) src = replaceBlock(src, a, 'internal', fmtInternal(data.internal));
  console.log(`${tid}: armorModel ${data.armorModel.hull.plates.length}+${data.armorModel.turret.plates.length} 板${data.internal ? ' + internal' : ''} 已替换`);
}
fs.writeFileSync(CONFIG, src);
console.log('config.js written');
