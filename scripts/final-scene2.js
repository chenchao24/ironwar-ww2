const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1600,900', '--use-angle=default'],
    defaultViewport: { width: 1600, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Missing')) errors.push(m.text().slice(0, 100)); });
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#btn-hunt-mode');
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#screen-hangar [data-action="start"]');
  await new Promise(r => setTimeout(r, 4000));
  const v = await page.evaluate(() => {
    const g = window.__game, w = g.world;
    // NaN 几何体定位
    const nanGeos = [];
    w.root.traverse(o => {
      if (o.isMesh || o.isInstancedMesh) {
        const p = (o.geometry || {}).attributes && o.geometry.attributes.position;
        if (!p) return;
        for (let i = 0; i < Math.min(p.count, 500); i++) {
          if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i))) {
            nanGeos.push({ type: o.name || o.type, parent: o.parent && o.parent.type, isInst: !!o.isInstancedMesh });
            break;
          }
        }
      }
    });
    const by = {};
    for (const d of w.destructibles.list) by[d.type] = (by[d.type] || 0) + 1;
    return { nanGeos: nanGeos.slice(0, 5), nanCount: nanGeos.length, bush_m: (by.bush_m1||0)+(by.bush_m2||0)+(by.bush_m3||0), rocks: ['rock_s0','rock_s1','rock_s2','rock_s3','rock_s4'].reduce((s,k)=>s+(by[k]||0),0), conif: Object.keys(by).filter(k=>k.startsWith('conif')).reduce((s,k)=>s+by[k],0) };
  });
  console.log('COUNTS:', JSON.stringify(v));
  await page.evaluate(() => {
    const g = window.__game, w = g.world, p = g.player;
    const b = w.sightBlockers[30];
    p.place(b.x - 18, b.z + 12, 0);
    g.rig.aimYaw = Math.atan2(b.x - p.pos.x, b.z - p.pos.z);
    g.rig.aimPitch = -0.02;
    g.rig.dist = 13;
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/shot-scene-final.png' });
  console.log('ERRORS:', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
