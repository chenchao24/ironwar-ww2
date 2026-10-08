// 装甲板图命中回归（多车）：板面求交 / 板法线角度 / 跳弹 / 炮塔随动 / 板缝穿透 / 行走部 flag
// 用法：node scripts/plate-hit-test.js [tiger1|m4a3|ferdinand|jagdpanther|jagdtiger]
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const tankId = process.argv[2] || 'tiger1';

// 每车测试用例（车库选车；值取自 config armorModel）
const CASES = {
  tiger1: {
    front: { center: [0, 1.515, 2.94], rot: [-9, 0, 0], expect: '首上', armor: 100, angle: 9 },
    ricDir: 65,
    mantlet: { pos: [0, 2.39, 1.57], expect: '炮盾', armor: 120 },
    gap: { start: [3, 2.0, 2.0], dir: [-1, 0, 0] },
    track: { start: [3, 0.705, 0], dir: [-1, 0, 0], expect: '行走部' },
  },
  m4a3: {
    // frontAim：首上 47° 板的垂直入射线来自高空，会先擦车顶前缘（模型几何如此）——瞄准点下移避开
    front: { center: [0, 1.45, 2.45], aim: [0, 1.10, 2.62], rot: [-47, 0, 0], expect: '首上(大倾角)', armor: 63.5, angle: 47 },
    ricDir: 65,
    mantlet: { pos: [0, 2.375, 1.43], expect: '炮盾', armor: 89 },
    gap: { start: [3, 2.0, 2.2], dir: [-1, 0, 0] },
    track: { start: [3, 0.685, 0], dir: [-1, 0, 0], expect: '行走部' },
  },
  ferdinand: {
    // 2026-09-19 编辑器调参版：战斗室后置，200 正面墙 z0.09 rot −19（aim x=0.8 避开炮盾 0.84m 宽）
    front: { center: [0.8, 2.32, 0.09], aim: [0.8, 2.32, 0.09], rot: [-19, 0, 0], expect: '战斗室正面', armor: 200, angle: 0 },
    ricDir: 75,   // 75°入射（对 19° 斜正面）且从炮盾左侧 1.1m 外通过
    yaw: 0.3,     // 炮盾距枢轴 0.65m、距 200 墙仅 0.56m：yaw 0 时 2m 回溯段被 200 墙抢先，用 0.3rad
    mantlet: { pos: [0, 2.31, 0.65], expect: '炮盾', armor: 100 },
    gap: { start: [3, 3.2, -1.0], dir: [-1, 0, 0] },   // 战斗室顶上方无板区 → null
    track: { start: [3, 0.45, 0], dir: [-1, 0, 0], expect: '行走部' },
  },
  jagdpanther: {
    // 2026-09-19 编辑器调参版：斜正面 55.5°（z2.3）、炮盾嵌于斜正面（z2.0）
    front: { center: [0.8, 1.72, 2.3], aim: [0.8, 1.72, 2.3], rot: [-55.5, 0, 0], expect: '战斗室斜正面', armor: 80, angle: 0 },
    ricCenter: [1.1, 1.72, 2.3],   // 跳弹例偏 x=1.1：center 0.8 时射线擦炮盾（|x|0.42<0.575）
    ricDir: 65,
    yaw: 0.3,
    mantlet: { pos: [0, 2, 2], expect: '炮盾', armor: 100 },
    gap: { start: [3, 2.75, 0.3], dir: [-1, 0, 0] },   // 车顶上方无板区 → null
    track: { start: [3, 0.45, 0], dir: [-1, 0, 0], expect: '行走部' },
  },
  jagdtiger: {
    // 2026-09-20 编辑器调参版：战斗室正面 250 rot−12（z1.22）、炮盾 rot−11 z1.86 距墙 ~0.64m
    front: { center: [0.9, 2.3, 1.22], aim: [0.9, 2.3, 1.22], rot: [-12, 0, 0], expect: '战斗室正面', armor: 250, angle: 0 },
    ricCenter: [0.9, 2.3, 1.22],   // x0.9 避开炮盾（半宽 0.75）：65° 射线于炮盾面外通过
    ricDir: 65,
    yaw: 0.3,     // 炮盾距 250 墙仅 ~0.64m——同费迪南，yaw 0 时 2m 回溯段被墙抢先
    mantlet: { pos: [0, 2.16, 1.86], expect: '炮盾', armor: 150 },
    gap: { start: [3, 2.9, 0.3], dir: [-1, 0, 0] },    // 车顶上方无板区 → null
    track: { start: [3, 0.5, 0], dir: [-1, 0, 0], expect: '行走部' },
  },
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate((id) => { window.__game.ui.selectedTank = id; }, tankId);
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(4500);
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(1500);

  const res = await page.evaluate(async (C) => {
    const THREE = await import('./node_modules/three/build/three.module.js');
    const g = window.__game, p = g.player;
    const out = { tank: p.cfg.id };
    const D2R = Math.PI / 180;
    const headingQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.heading);
    const shoot = (lp, ld) => {
      const wp = p.root.localToWorld(new THREE.Vector3(...lp));
      const wd = new THREE.Vector3(...ld).applyQuaternion(headingQ).normalize();
      return { hit: p.resolveHitZone(wp, wd), wp, wd };
    };

    // ① 正面主装甲板垂直命中（法线由 rot 计算；aim 可覆盖瞄准点）
    const n1 = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...C.front.rot.map(v => v * D2R)));
    const start1 = new THREE.Vector3(...(C.front.aim || C.front.center)).addScaledVector(n1, 4);
    const { hit: h1 } = shoot([start1.x, start1.y, start1.z], [-n1.x, -n1.y, -n1.z]);
    out.frontPerp = h1 && { plate: h1.plateName, armor: h1.armor, angle: +h1.impactAngleDeg.toFixed(1), isTurret: h1.isTurret };

    // ② 同板大角度命中 → 跳弹（方向绕 y 偏 ricDir 度，起点取延长线过板中心；ricCenter 可覆盖）
    const d2 = new THREE.Vector3(Math.sin(C.ricDir * D2R), 0, -Math.cos(C.ricDir * D2R));
    const c2 = new THREE.Vector3(...(C.ricCenter || C.front.center));
    const s2 = c2.clone().addScaledVector(d2, -6);
    const { hit: h2, wp: wp2, wd: wd2 } = shoot([s2.x, s2.y, s2.z], [d2.x, d2.y, d2.z]);
    out.frontRic = h2 && { plate: h2.plateName, angle: +h2.impactAngleDeg.toFixed(1) };
    const r2 = h2 && p.applyHit(h2, 500, 'ap', wp2, wd2, 130);
    out.ricochet = r2 && r2.type;

    // ③ 炮塔随动：炮塔转 yaw（默认 1.2rad）后打炮盾
    p.turretGroup.rotation.y = C.yaw || 1.2;
    const yaw = C.yaw || 1.2, pivot = p.turretGroup.position;
    const rel = new THREE.Vector3(...C.mantlet.pos).sub(pivot);
    const hullPt = new THREE.Vector3(
      rel.x * Math.cos(yaw) + rel.z * Math.sin(yaw), rel.y, -rel.x * Math.sin(yaw) + rel.z * Math.cos(yaw)).add(pivot);
    const nH = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const startL = hullPt.clone().addScaledVector(nH, 4);
    const { hit: h3 } = shoot([startL.x, startL.y, startL.z], [-nH.x, -nH.y, -nH.z]);
    out.turretYawed = h3 && { plate: h3.plateName, armor: h3.armor, isTurret: h3.isTurret, angle: +h3.impactAngleDeg.toFixed(1) };
    p.turretGroup.rotation.y = 0;

    // ④ 板缝穿透 → null
    const { hit: h4 } = shoot(C.gap.start, C.gap.dir);
    out.gapPass = h4 === null;
    // ⑤ 行走部 → track flag
    const { hit: h5 } = shoot(C.track.start, C.track.dir);
    out.trackHit = h5 && { plate: h5.plateName, track: h5.track };
    return out;
  }, CASES[tankId]);
  console.log('PLATE:', JSON.stringify(res, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
