// 键位重映射验证（真实输入事件）：
// 右键=开/关镜 · Shift=倍率切换（瞄具 2.5×/5×、望远镜 7×/12×）· Q=车长望远镜 · 空格=刹车 · 中键=同轴机枪
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1680,945', '--use-angle=default'],
    defaultViewport: { width: 1680, height: 945 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(400);
  await page.click('#btn-hunt-mode');
  await sleep(3500);
  await page.evaluate(() => { window.__game.ui.selectedTank = 'tiger1'; });
  await page.click('#screen-hangar [data-action="start"]');
  await page.waitForFunction(() => window.__game.state === 'battle', { timeout: 30000 });
  await sleep(2500);
  const state = () => page.evaluate(() => {
    const g = window.__game;
    return { aiming: g.rig.aiming, binoc: g.rig.binocular, zoomIdx: g.rig.zoomIdx,
      binoMag: g.rig.binoMag, scopeShown: !document.getElementById('gunsight').classList.contains('hidden') };
  });

  // 1) 右键开镜
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await sleep(1200);
  let s = await state();
  console.log('①右键开镜:', JSON.stringify(s), s.aiming && s.scopeShown ? 'OK' : 'FAIL');

  // 2) Shift 瞄具切档 2.5→5→2.5
  await page.keyboard.press('ShiftLeft'); await sleep(700);
  const z1 = (await state()).zoomIdx;
  await page.keyboard.press('ShiftLeft'); await sleep(700);
  const z2 = (await state()).zoomIdx;
  console.log('②Shift切档:', z1, '→', z2, z1 === 1 && z2 === 0 ? 'OK' : 'FAIL');

  // 3) 空格不切档（专职刹车）
  await page.keyboard.press('Space'); await sleep(500);
  const z3 = (await state()).zoomIdx;
  console.log('③空格不切档:', z3, z3 === 0 ? 'OK' : 'FAIL');

  // 4) Q 进望远镜（与瞄准镜互斥：先收镜）→ Shift 切 7×/12× → Q 退出
  await page.keyboard.press('KeyQ'); await sleep(1000);
  s = await state();
  console.log('④Q进望远镜:', JSON.stringify(s), s.binoc && !s.aiming ? 'OK' : 'FAIL');
  await page.keyboard.press('ShiftLeft'); await sleep(600);
  const m1 = (await state()).binoMag;
  await page.keyboard.press('ShiftLeft'); await sleep(600);
  const m2 = (await state()).binoMag;
  console.log('⑤Shift望远镜切档:', m1, '→', m2, m1 === 12 && m2 === 7 ? 'OK' : 'FAIL');
  await page.keyboard.press('KeyQ'); await sleep(800);
  s = await state();
  console.log('⑥Q退出望远镜:', JSON.stringify(s), !s.binoc ? 'OK' : 'FAIL');

  // 5) 空格刹车：W 加速后按空格看减速
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW');
  const v0 = await page.evaluate(() => window.__game.player.speed);
  await page.keyboard.down('Space'); await sleep(1200); await page.keyboard.up('Space');
  const v1 = await page.evaluate(() => window.__game.player.speed);
  console.log('⑦空格刹车:', v0.toFixed(1), '→', v1.toFixed(1), v1 < v0 * 0.6 ? 'OK' : 'FAIL');

  // 6) 中键同轴机枪：弹药应减少
  const mg0 = await page.evaluate(() => window.__game.player.mgAmmo);
  await page.mouse.down({ button: 'middle' }); await sleep(1000); await page.mouse.up({ button: 'middle' });
  const mg1 = await page.evaluate(() => window.__game.player.mgAmmo);
  console.log('⑧中键机枪:', mg0, '→', mg1, mg1 < mg0 ? 'OK' : 'FAIL');

  // 7) 右键关镜/再开（先开再关）
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await sleep(900);
  const sOn = await state();
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await sleep(900);
  const sOff = await state();
  console.log('⑨右键开关镜:', sOn.aiming, '→', sOff.aiming, sOn.aiming && !sOff.aiming ? 'OK' : 'FAIL');

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  await browser.close();
})();
