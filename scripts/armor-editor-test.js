// armor-editor.html 自查：选中板 → 改值 → overlay 重建 → 导出内容非空 → 截图
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--window-size=1900,1000', '--use-angle=default'],
    defaultViewport: { width: 1900, height: 1000 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 260)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 400)));
  await page.goto('http://localhost:8081/armor-editor.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('window.__editor', { timeout: 30000 });
  await sleep(2500);

  const res = await page.evaluate(async () => {
    const ed = window.__editor;
    const out = {};
    const part = ed.E.armorModel.hull;
    out.hullPlates = part.plates.length;
    // 点选树中第一块板（第一个 l3 节点）
    const nodes = [...document.querySelectorAll('.tnode.l3')];
    nodes[0].click();
    await new Promise(r => setTimeout(r, 100));
    out.selKind = ed.sel && ed.sel.kind;
    // 改值：首板 pos.x +0.1 平移 + rot rx +5°
    const p0 = part.plates[0];
    const [px0, rx0] = [p0.pos[0], p0.rot[0]];
    p0.pos[0] = px0 + 0.1;
    p0.rot[0] = rx0 + 5;
    ed.refresh();
    out.posChanged = p0.pos[0] === px0 + 0.1 && p0.rot[0] === rx0 + 5;
    // 加板
    const addBtns = [...document.querySelectorAll('.addbtn')];
    addBtns[0].click();
    out.hullPlatesAfterAdd = part.plates.length;
    // 隐藏/显示模型开关
    document.getElementById('btnHideModel').click();
    out.modelHidden = document.querySelector('#btnHideModel').textContent.includes('显示');
    document.getElementById('btnHideModel').click();
    // 导出
    document.getElementById('btnExport').click();
    const txt = document.getElementById('exportText').value;
    out.exportLen = txt.length;
    out.exportHasArmor = txt.includes('armorModel') && txt.includes('pos') && txt.includes('internal');
    document.getElementById('btnCloseExp').click();
    return out;
  });
  console.log('EDITOR:', JSON.stringify(res));
  await sleep(600);
  await page.screenshot({ path: 'scripts/shot-armor-editor.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
})();
