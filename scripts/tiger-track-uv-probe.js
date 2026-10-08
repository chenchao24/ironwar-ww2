// 虎式履带 UV 布局分析：顶点纵向坐标(沿车长)与 U/V 的相关性 → 纹理轨道轴
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 200)));
  await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'cover', { timeout: 90000 });
  await page.click('#screen-cover');
  await sleep(500);
  await page.click('#btn-hunt-mode');
  await sleep(6000);
  const out = await page.evaluate(() => {
    const g = window.__game;
    const t = g.menuTank || g.player;
    const names = t.cfg.parts.track;
    const res = [];
    t.model.traverse(o => {
      if (!o.isMesh || !names.some(n => o.name === n || (o.parent && o.parent.name === n))) return;
      const geo = o.geometry;
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      if (!uv) { res.push({ mesh: o.name, uv: null }); return; }
      // 纵向轴 = 模型局部 z（烘焙后 +Z 朝前）；计算 z 与 u、v 的线性相关系数
      let sz = 0, su = 0, sv = 0, szz = 0, suu = 0, svv = 0, szu = 0, szv = 0, suv = 0;
      const n = pos.count;
      let mz = 0, mu = 0, mv = 0;
      for (let i = 0; i < n; i++) { mz += pos.getZ(i); mu += uv.getX(i); mv += uv.getY(i); }
      mz /= n; mu /= n; mv /= n;
      for (let i = 0; i < n; i++) {
        const z = pos.getZ(i) - mz, u = uv.getX(i) - mu, v = uv.getY(i) - mv;
        szz += z * z; suu += u * u; svv += v * v; szu += z * u; szv += z * v; suv += u * v;
      }
      const corr = (a, b, c) => c / Math.sqrt(a * b + 1e-12);
      // 横向 x 与 u/v 相关性（排除"横向滑"是正确轴的误判）
      let mx = 0; for (let i = 0; i < n; i++) mx += pos.getX(i); mx /= n;
      let sxx = 0, sxu = 0, sxv = 0;
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i) - mx, u = uv.getX(i) - mu, v = uv.getY(i) - mv;
        sxx += x * x; sxu += x * u; sxv += x * v;
      }
      res.push({
        mesh: o.name, verts: n,
        'corr(z,u)': +corr(szz, suu, szu).toFixed(3),
        'corr(z,v)': +corr(szz, svv, szv).toFixed(3),
        'corr(x,u)': +corr(sxx, suu, sxu).toFixed(3),
        'corr(x,v)': +corr(sxx, svv, sxv).toFixed(3),
        uRange: [Math.min(...Array.from({ length: Math.min(n, 4000) }, (_, i) => uv.getX(i))).toFixed(2),
                 Math.max(...Array.from({ length: Math.min(n, 4000) }, (_, i) => uv.getX(i))).toFixed(2)],
        vRange: [Math.min(...Array.from({ length: Math.min(n, 4000) }, (_, i) => uv.getY(i))).toFixed(2),
                 Math.max(...Array.from({ length: Math.min(n, 4000) }, (_, i) => uv.getY(i))).toFixed(2)],
      });
    });
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
