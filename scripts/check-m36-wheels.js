// M36 切出轮复核：隔离渲染各轮 + 整车侧面 + bbox 对中性
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function mulVec(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }
function worldMat(nd) {
  const p = nd.listParents().filter(p => p.propertyType === 'Node');
  const m = nd.getMatrix();
  if (!p.length) return m;
  const pm = worldMat(p[0]);
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c*4+r] += pm[k*4+r]*m[c*4+k];
  return o;
}
(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read('model/m36_gmc.glb');
  console.log('── 轮 bbox ──');
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() || !/^wheel/.test(node.getName())) continue;
    const wm = worldMat(node);
    let xs=[1e9,-1e9], ys=[1e9,-1e9], zs=[1e9,-1e9];
    for (const prim of node.getMesh().listPrimitives()) {
      const arr = prim.getAttribute('POSITION').getArray();
      for (let i = 0; i < arr.length; i += 3) {
        const w = mulVec(wm, [arr[i], arr[i+1], arr[i+2]]);
        xs=[Math.min(xs[0],w[0]),Math.max(xs[1],w[0])];
        ys=[Math.min(ys[0],w[1]),Math.max(ys[1],w[1])];
        zs=[Math.min(zs[0],w[2]),Math.max(zs[1],w[2])];
      }
    }
    console.log(`  ${node.getName().padEnd(9)} x[${xs[0].toFixed(2)},${xs[1].toFixed(2)}] y[${ys[0].toFixed(2)},${ys[1].toFixed(2)}] z[${zs[0].toFixed(2)},${zs[1].toFixed(2)}] 中心(z=${((zs[0]+zs[1])/2).toFixed(3)},y=${((ys[0]+ys[1])/2).toFixed(3)}) r=(z${((zs[1]-zs[0])/2).toFixed(3)}/y${((ys[1]-ys[0])/2).toFixed(3)})`);
  }
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message.slice(0, 300)));
  const jobs = [
    ['wheelR1,wheelL1', 'shot-m36-w1', [[2.8, 0.6, -1.84], [1.05, 0.29, -1.84]]],
    ['wheelR3,wheelL3', 'shot-m36-w3', [[2.8, 0.6, -0.40], [1.05, 0.29, -0.40]]],
    ['wheelR6,wheelL6', 'shot-m36-w6', [[2.8, 0.6, 1.89], [1.05, 0.29, 1.89]]],
    ['wheelRS,wheelRI', 'shot-m36-wSI', [[3.5, 1.0, -0.1], [1.05, 0.6, -0.1]]],
    ['', 'shot-m36-outside', [[6.5, 1.3, 0], [0, 1.0, 0]]],
    ['', 'shot-m36-outfull', [[6, 3.5, 6.5], [0, 1.0, 0]]],
  ];
  for (const [only, out, [pos, tgt]] of jobs) {
    await page.goto('http://localhost:8081/glbview.html?glb=' + encodeURIComponent('model/m36_gmc.glb') + (only ? '&only=' + only : ''), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__ready || window.__fail', { timeout: 60000 });
    if (await page.evaluate(() => window.__fail)) { console.log(out, 'LOAD FAILED'); continue; }
    await sleep(400);
    await page.evaluate(([p, t]) => window.__view(...p, ...t), [pos, tgt]);
    await sleep(250);
    await page.screenshot({ path: `scripts/${out}.png` });
    console.log(out, 'ok');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
