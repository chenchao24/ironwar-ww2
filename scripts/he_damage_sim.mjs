// 大口径 HE 毁伤蒙特卡洛验证（2026-09-23）：从 tank.js 抽出真实 applyHESplash 跑仿真
// 用法：node scripts/he_damage_sim.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1') + '/..';
const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf-8');
const tmp = path.join(ROOT, '_cfg_sim.mjs');
fs.writeFileSync(tmp, cfgSrc);
const { TANKS, DAMAGE_RULES } = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

// 抽函数体
const tankSrc = fs.readFileSync(path.join(ROOT, 'js/tank.js'), 'utf-8');
const start = tankSrc.indexOf('applyHESplash(hit, shell = null) {');
const bodyStart = tankSrc.indexOf('{', start) + 1;
const endMark = "return { type: 'splash', events, killed: this.destroyed };";
const end = tankSrc.indexOf(endMark, bodyStart) + endMark.length;
if (start < 0 || end < endMark.length) throw new Error('applyHESplash 抽取失败');
const body = tankSrc.slice(bodyStart, end);
const fn = new Function('hit', 'shell', 'DAMAGE_RULES', body + '\nreturn { events, killed: this.destroyed };');

// 构造目标存根（乘员位置用真实配置）
function makeTarget(tid) {
  const cfg = TANKS[tid];
  return {
    destroyed: false,
    isPlayer: false,
    cfg,
    mods: { tracks: 0 },
    crew: cfg.internal.crew.map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, state: 0 })),
    damageModule(mod, dmg, events) { events.push({ type: 'module', mod }); },
    _checkCrewDeath() {},
  };
}

const N = 20000;
function sim(atkTid, defTid, armor, isTurret, lp) {
  const P = TANKS[atkTid].heShell.power || 1;
  let kills = 0, wounds = 0, crewKillHits = 0, moduleHits = 0, trackHits = 0, opHits = 0, nothing = 0;
  for (let i = 0; i < N; i++) {
    const t = makeTarget(defTid);
    const hit = { armor, isTurret, zone: isTurret ? 'turretFront' : 'hullFront', localPoint: { x: lp[0], y: lp[1], z: lp[2] }, track: false };
    const r = fn.call(t, hit, { hePower: P }, DAMAGE_RULES);
    const ev = r.events;
    const ck = ev.filter((e) => e.type === 'crew' && e.lvl === 2).length;
    const cw = ev.filter((e) => e.type === 'crew' && e.lvl === 1).length;
    kills += ck; wounds += cw;
    if (ck > 0) crewKillHits++;
    if (ev.some((e) => e.mod === 'optics' || e.mod === 'breech' || e.mod === 'engine' || e.mod === 'turretDrive')) moduleHits++;
    if (ev.some((e) => e.mod === 'tracks')) trackHits++;
    if (ev.some((e) => e.label === '超压毁伤')) opHits++;
    if (ev.length === 0) nothing++;
  }
  const pc = (x) => (x / N * 100).toFixed(1) + '%';
  console.log(`${TANKS[atkTid].name} HE→${TANKS[defTid].name}${isTurret ? '炮塔正面' : '车体正面'}: `
    + `超压 ${pc(opHits)} | 有乘员阵亡 ${pc(crewKillHits)} | 平均每发 死${(kills / N).toFixed(2)}/伤${(wounds / N).toFixed(2)} `
    + `| 坏模块 ${pc(moduleHits)} | 断带 ${pc(trackHits)} | 无事发生 ${pc(nothing)}`);
}

console.log(`── 大口径 HE 直击毁伤仿真（${N} 发/组）──`);
// 虎式车体正面命中点 (0,1.5,2.94)：驾驶员/通讯员在 1m 内
sim('isu152', 'tiger1', 100, false, [0, 1.5, 2.94]);
sim('is2', 'tiger1', 100, false, [0, 1.5, 2.94]);
// 虎式炮塔正面 (0,2.39,1.57)：炮手/车长/装填手在附近
sim('isu152', 'tiger1', 110, true, [0, 2.39, 1.57]);
sim('is2', 'tiger1', 110, true, [0, 2.39, 1.57]);
// 四号车体正面 (0,1.21,2)：驾驶员/通讯员在附近
sim('isu152', 'pz4g', 80, false, [0, 1.21, 2]);
sim('is2', 'pz4g', 80, false, [0, 1.21, 2]);
// 虎王首上（超重甲档）
sim('isu152', 'tiger2', 150, false, [0, 1.4, 2.5]);
// 对照：88mm HE（P=1，应全走旧路径）
sim('tiger1', 'pz4g', 80, false, [0, 1.21, 2]);
