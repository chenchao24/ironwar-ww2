// 排气热浪回归：热源登记 / 折射动画像素差分 / 熄火衰减 / 截图
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failed = false;
const assert = (cond, label, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed = true;
};

async function regionDiff(bufA, bufB, cx, cy, size = 80) {
  const imgs = await Promise.all([bufA, bufB].map(b =>
    sharp(b).extract({ left: Math.round(cx - size / 2), top: Math.round(cy - size / 2), width: size, height: size })
      .raw().toBuffer({ resolveWithObject: true })));
  const [{ data: da, info }, { data: db }] = imgs;
  let sum = 0;
  for (let i = 0; i < da.length; i += info.channels) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
  return sum / (info.width * info.height * 3);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--use-angle=default'],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 60000 });
  await sleep(500);
  await page.click('#screen-cover');
  await sleep(500);
  // → 车库（展示车怠速热浪；_parkShowcase → 纹理预热 → _setupMenuShowcase 异步就位）
  await page.click('#btn-hunt-mode');
  await page.waitForFunction(() => window.__game.state === 'hangar' && window.__game.menuTank, { timeout: 30000 });
  await sleep(1500);
  const hangar = await page.evaluate(() => ({
    state: window.__game.state,
    n: window.__game.heat._n,
    draws: window.__game.heat._draws,
    menuHeat: window.__game.menuTank && window.__game.menuTank.heatK,
  }));
  assert(hangar.state === 'hangar' && hangar.n >= 1 && hangar.menuHeat > 0.1, '车库展示车怠速热源登记', JSON.stringify(hangar));
  const draws0 = hangar.draws;
  await sleep(400);
  assert((await page.evaluate(() => window.__game.heat._draws)) > draws0, '热浪叠加 pass 逐帧执行（blit+overlay）');
  await page.screenshot({ path: 'scripts/shot-heat-hangar.png' });

  // 热浪纵向偏移（虎王 -0.4 / 黑豹 -0.7）：公告牌 = 烟点+局部 -z 偏移世界变换后，向相机回撤 8cm —— 解析精确比对
  for (const [tid, want] of [['tiger2', -0.4], ['panther', -0.7]]) {
    await page.evaluate((k) => { window.__game.ui.selectedTank = k; window.__game._setupMenuShowcase(); }, tid);
    await sleep(1500);
    const shift = await page.evaluate((wantShift) => {
      const g = window.__game, t = g.menuTank;
      const V = t.model.position.constructor;
      const raw = new V().fromArray(t.cfg.exhaustLocal[0]);
      t.model.localToWorld(raw);
      const shifted = new V().fromArray(t.cfg.exhaustLocal[0]);
      shifted.z += wantShift;
      t.model.localToWorld(shifted);
      const toCam = g.camera.position.clone().sub(shifted);
      const expected = shifted.clone().lerp(g.camera.position, 0.08 / toCam.length());
      const q = g.heat._quads.find(q => q.visible);
      return q ? { id: t.cfg.id, zShift: t.cfg.heatZShift, err: +q.position.distanceTo(expected).toFixed(4), y: +q.position.y.toFixed(2) } : null;
    }, want);
    assert(shift && shift.zShift === want && shift.err < 0.01, `${tid} 热浪位置后移 ${-want}m（含相机回撤解析比对）`, JSON.stringify(shift));
  }
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; window.__game._setupMenuShowcase(); });
  await sleep(1200);

  // → 战斗
  await page.click('#screen-hangar [data-action="start"]');
  await sleep(3500);
  const battle = await page.evaluate(() => {
    const g = window.__game;
    // 取玩家第一个活跃热源的屏幕位置（活跃公告牌位置=排气口世界坐标）
    const q = g.heat._quads.find(q => q.visible);
    if (!q) return { n: g.heat._n };
    const p = q.position.clone().project(g.camera);
    return {
      n: g.heat._n,
      playerHeat: g.player.heatK,
      enemyHeat: g.enemies[0] ? g.enemies[0].heatK : null,
      sx: (p.x * 0.5 + 0.5) * innerWidth,
      sy: (-p.y * 0.5 + 0.5) * innerHeight,
    };
  });
  assert(battle.n >= 1 && battle.playerHeat > 0.1 && battle.enemyHeat > 0.1, '战斗热源登记（玩家+敌车怠速）', JSON.stringify({ n: battle.n, p: +battle.playerHeat.toFixed(2), e: +battle.enemyHeat.toFixed(2) }));
  assert(battle.sx > 0 && battle.sx < 1280 && battle.sy > 0 && battle.sy < 720, '玩家排气口在屏内', `(${battle.sx | 0},${battle.sy | 0})`);

  // 功率联动：半径 = 随机基础半径 × (0.25+0.75·engineHp/700)，强度 = heatK（已含功率系数 0.3+0.7·powerK）
  const pw = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const q = g.heat._quads.find(q => q.visible);
    if (!q) return null;
    const powerK = Math.min((p.cfg.engineHp || 700) / 700, 1);
    const expR = (0.30 + ((p._heatSeed * 7.31) % 1) * 0.08) * (0.25 + 0.75 * powerK);
    return { hp: p.cfg.engineHp, r: +q.material.uniforms.uRadius.value.toFixed(4), expR: +expR.toFixed(4), s: +q.material.uniforms.uStrength.value.toFixed(4), heatK: +p.heatK.toFixed(4) };
  });
  assert(pw && pw.hp > 0 && Math.abs(pw.r - pw.expR) < 1e-3 && Math.abs(pw.s - pw.heatK) < 1e-4, '热浪面积/强度随 engineHp 联动', JSON.stringify(pw));

  // 折射动画差分：热源区 250ms 两帧像素差 vs 同尺寸静态对照区
  const clip = (x, y) => ({ x: Math.max(0, x - 40), y: Math.max(0, y - 40), width: 80, height: 80 });
  const bx = Math.min(Math.max(battle.sx, 50), 1230), by = Math.min(Math.max(battle.sy, 50), 670);
  const cxA = Math.min(bx + 280, 1180), cyA = Math.min(by + 60, 660);   // 对照区：侧后草地（避开漂移云与热源）
  const s1 = await page.screenshot({ clip: clip(bx, by) });
  const s1c = await page.screenshot({ clip: clip(cxA, cyA) });
  await sleep(250);
  const s2 = await page.screenshot({ clip: clip(bx, by) });
  const s2c = await page.screenshot({ clip: clip(cxA, cyA) });
  const dHeat = await regionDiff(s1, s2, 40, 40, 80);
  const dCtrl = await regionDiff(s1c, s2c, 40, 40, 80);
  console.log(`   热源区帧差 ${dHeat.toFixed(2)} | 对照区帧差 ${dCtrl.toFixed(2)}`);
  assert(dHeat > 0.6 && dHeat > dCtrl * 1.6, '热源区折射动画帧差显著高于静态对照区');

  // 截图：常态 + 放大 3 倍位移（观感核对）
  await page.screenshot({ path: 'scripts/shot-heat-battle.png' });
  await page.evaluate(() => { window.__game.heat.debugBoost = 3; });
  await sleep(300);
  await page.screenshot({ path: 'scripts/shot-heat-battle-boost.png' });
  await page.evaluate(() => { window.__game.heat.debugBoost = 1; });

  // 深油门热强度上升
  await page.keyboard.down('KeyW');
  await sleep(1200);
  const loadHeat = await page.evaluate(() => window.__game.player.heatK);
  await page.keyboard.up('KeyW');
  assert(loadHeat > battle.playerHeat + 0.05, '行驶油门下热强度上升', `${battle.playerHeat.toFixed(2)} → ${loadHeat.toFixed(2)}`);

  // 熄火衰减：击毁玩家 → heatK 衰减至 ~0
  await page.evaluate(() => { window.__game.player.destroy(false); });
  await sleep(4000);
  const dead = await page.evaluate(() => ({
    heatK: window.__game.player.heatK,
    n: window.__game.heat._n,
  }));
  assert(dead.heatK < 0.12 && dead.n === 0, '击毁后热源熄火衰减', JSON.stringify({ heatK: +dead.heatK.toFixed(3), n: dead.n }));

  assert(errors.length === 0, '零控制台错误', errors.slice(0, 3).join(' | '));
  await browser.close();
  if (failed) { console.error('heat-test FAILED'); process.exit(1); }
  console.log('heat-test ALL PASS');
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
