// 实测 only=wheelRS 时每个可见网格的世界包围盒
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent('model/tiger2.glb') + '&only=wheelRS', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__ready || window.__fail', { timeout: 60000 });
  const info = await page.evaluate(() => {
    const out = [];
    window.__scene.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      // 祖先不可见时实际也不可见
      let p = o, vis = true;
      while (p) { if (p.visible === false) { vis = false; break; } p = p.parent; }
      if (!vis) return;
      const b = new window.__THREE.Box3().setFromObject(o);
      out.push({ name: o.name, min: b.min.toArray().map(v => +v.toFixed(2)), max: b.max.toArray().map(v => +v.toFixed(2)) });
    });
    return out;
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
