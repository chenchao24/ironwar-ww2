// ═══ 野战修理厂车库（选车场景）：1943 东线二战风格，全程序化生成 ═══
// 夯土地面（车辙/油渍/草屑）+ 木板停车台（台面与地齐平，坦克直接落在木板上）
// 砖墙裙 + 木板墙 + 木柱木桁架坡屋顶 + 半开大门（门外战地远景）+ 木 A 字架链条葫芦吊发动机
// 道具全部时代化：8.8cm Pzgr 弹药箱 / 德式 jerrycan / Kraftstoff 油桶 / 备用负重轮 / 履带板 / 沙袋 / 马灯
// 所有网格与贴图均由代码生成（CanvasTexture / 合并几何体），无外部资源。
// 用法：main.js 进入机库时 show()（隐藏战场 world），退出时 hide() 还原。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── 确定性随机（贴图每次生成一致，刷新后油渍/锈迹位置不跳变） ──
function rng(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const FONT = '"Arial","Microsoft YaHei",sans-serif';

// ───────────────────────── 程序化贴图 ─────────────────────────

// 噪点画布（木纹/砖/土质颗粒通用）
function makeNoiseCanvas(size, low, high, seed) {
  const rand = rng(seed);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = low + rand() * (high - low);
    d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// 夯土地面：黄土基 + 噪点 + 大门→展示位的履带拖痕 + 油渍 + 干草屑 + 碎石
// 同时产出配套 roughnessMap（油渍处更光滑 → 吊灯下有反光湿感）
function makeDirtFloorTextures(W0, H0) {
  const W = 2048, H = Math.round(2048 * H0 / W0);   // 按实际长宽比
  const rand = rng(19430705);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#6d5c44'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 30;
    d[i] += n * 1.05; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  // 大块干湿色斑
  for (let i = 0; i < 60; i++) {
    const x = rand() * W, y = rand() * H, r = 90 + rand() * 320;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.55;
    gr.addColorStop(0, dark ? 'rgba(46,38,26,0.13)' : 'rgba(150,134,102,0.10)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const px = x => (x + W0 / 2) / W0 * W, pz = z => (z + H0 / 2) / H0 * H;
  // 履带拖痕：从大门（-x）弯进展示位的两道车辙（左右履带各一条，双层：深色压痕+边缘浮土）
  for (const side of [-1, 1]) {
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass === 0 ? 'rgba(38,30,20,0.34)' : 'rgba(120,106,80,0.16)';
      g.lineWidth = pass === 0 ? 26 : 34;
      g.beginPath();
      g.moveTo(px(-W0 / 2 - 1), pz(side * 1.3));
      g.bezierCurveTo(px(-12), pz(side * 1.5), px(-6), pz(side * 1.15), px(2.2), pz(side * 1.15));
      g.stroke();
      // 辙内履带齿印（短横线）
      g.strokeStyle = 'rgba(30,24,16,0.20)'; g.lineWidth = 2.5;
      for (let t = 0; t <= 1; t += 0.008) {
        const bx = -W0 / 2 - 1 + (2.2 + W0 / 2 + 1) * t;
        const bz = side * (1.3 + 0.25 * Math.sin(t * Math.PI * 0.9));
        const sx = px(bx), sz = pz(bz);
        g.beginPath(); g.moveTo(sx - 9, sz); g.lineTo(sx + 9, sz); g.stroke();
      }
    }
  }
  // 油渍（记录位置供粗糙度图复用；木板台范围避开——木板在下层函数单独铺）
  const stains = [];
  for (let i = 0; i < 14; i++) {
    let x = rand() * W, y = rand() * H;
    if (Math.abs(x - W / 2) / W < 0.2 && Math.abs(y - H / 2) / H < 0.24) { x = (x + W * 0.4) % W; }
    stains.push({ x, y, r: 22 + rand() * 80, a: 0.30 + rand() * 0.3 });
  }
  for (const s of stains) {
    const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    gr.addColorStop(0, `rgba(20,16,10,${s.a})`);
    gr.addColorStop(0.55, `rgba(28,22,14,${s.a * 0.55})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
  }
  // 干草屑/碎石点
  for (let i = 0; i < 700; i++) {
    const x = rand() * W, y = rand() * H;
    g.fillStyle = rand() < 0.5 ? `rgba(168,150,92,${0.10 + rand() * 0.22})` : `rgba(52,46,36,${0.14 + rand() * 0.2})`;
    g.fillRect(x, y, 1.5 + rand() * 3, 1 + rand() * 2);
  }
  // 粗糙度图（油渍更亮）
  const rw = 1024, rh = Math.round(1024 * H0 / W0);
  const rc = document.createElement('canvas'); rc.width = rw; rc.height = rh;
  const rg = rc.getContext('2d');
  rg.fillStyle = 'rgb(226,222,214)'; rg.fillRect(0, 0, rw, rh);
  for (const s of stains) {
    const sx = s.x / W * rw, sy = s.y / H * rh, sr = s.r / W * rw;
    const gr = rg.createRadialGradient(sx, sy, 0, sx, sy, sr);
    gr.addColorStop(0, 'rgba(88,88,88,0.9)');
    gr.addColorStop(0.7, 'rgba(150,150,150,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    rg.fillStyle = gr; rg.beginPath(); rg.arc(sx, sy, sr, 0, 7); rg.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const roughnessMap = new THREE.CanvasTexture(rc); roughnessMap.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(makeNoiseCanvas(256, 100, 170, 777));
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping; bumpMap.repeat.set(12, 8);
  return { map, roughnessMap, bumpMap };
}

// 木板（横向宽板 + 板缝 + 磨损 + 钉孔）：木板台/墙面/大门/工作台通用，色调由材质 color 调
function makePlankTexture(seed, base, horizontal = true) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const rows = 7, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const tone = (rand() - 0.5) * 34;
    g.fillStyle = `rgba(${tone > 0 ? 255 : 0},${tone > 0 ? 240 : 10},${tone > 0 ? 210 : 4},${Math.abs(tone) / 255})`;
    g.fillRect(0, y, S, rh);
    // 木纹
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = `rgba(52,36,20,${0.08 + rand() * 0.12})`;
      g.lineWidth = 1 + rand() * 1.4;
      const yy = y + rand() * rh;
      g.beginPath(); g.moveTo(0, yy);
      g.bezierCurveTo(S * 0.3, yy + (rand() - 0.5) * 7, S * 0.6, yy + (rand() - 0.5) * 7, S, yy + (rand() - 0.5) * 5);
      g.stroke();
    }
    // 板缝
    g.fillStyle = 'rgba(22,14,8,0.75)'; g.fillRect(0, y + rh - 2.5, S, 2.5);
    // 钉孔
    for (const nx of [30 + rand() * 20, S - 50 + rand() * 20]) {
      g.fillStyle = 'rgba(30,26,22,0.8)'; g.beginPath(); g.arc(nx, y + rh / 2, 3, 0, 7); g.fill();
    }
  }
  // 污渍
  for (let i = 0; i < 10; i++) {
    const x = rand() * S, y = rand() * S, r = 24 + rand() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(40,30,18,${0.05 + rand() * 0.09})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (!horizontal) t.rotation = Math.PI / 2;
  return t;
}

// 红砖墙裙：砖列 + 灰缝 + 风化斑 + 下缘泥溅
function makeBrickTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(60660);
  g.fillStyle = '#8a6a54'; g.fillRect(0, 0, S, S);
  const bw = 64, bh = 26;
  for (let row = 0; row * bh < S; row++) {
    const off = (row % 2) * bw / 2;
    for (let x = -bw; x < S + bw; x += bw) {
      const tone = (rand() - 0.5) * 36;
      g.fillStyle = `rgb(${138 + tone | 0},${96 + tone * 0.7 | 0},${72 + tone * 0.55 | 0})`;
      g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
      if (rand() < 0.18) {   // 风化泛白
        g.fillStyle = 'rgba(210,200,180,0.10)';
        g.fillRect(x + off + 2 + rand() * 20, row * bh + 4, 14 + rand() * 24, 6);
      }
    }
  }
  // 灰缝
  g.strokeStyle = 'rgba(120,112,100,0.5)'; g.lineWidth = 2;
  for (let y = 0; y <= S; y += bh) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  // 下缘泥溅 + 青苔
  let gr = g.createLinearGradient(0, S * 0.72, 0, S);
  gr.addColorStop(0, 'rgba(30,26,18,0)'); gr.addColorStop(1, 'rgba(30,26,18,0.45)');
  g.fillStyle = gr; g.fillRect(0, S * 0.72, S, S * 0.28);
  for (let i = 0; i < 20; i++) {
    g.fillStyle = `rgba(84,96,52,${0.05 + rand() * 0.12})`;
    g.beginPath(); g.ellipse(rand() * S, S - rand() * 60, 6 + rand() * 20, 3 + rand() * 8, 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 弹药箱（长条木箱）：竖板条 + 绳把 + 史实弹种模板字
function makeAmmoCrateTexture(stencil, sub) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(stencil.length * 91 + 7);
  g.fillStyle = '#7a6440'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < 5; r++) {
    const y = r * 102.4;
    g.fillStyle = `rgb(${112 + rand() * 22 | 0},${88 + rand() * 18 | 0},${56 + rand() * 14 | 0})`;
    g.fillRect(0, y, S, 102.4);
    for (let i = 0; i < 10; i++) {
      g.strokeStyle = `rgba(56,40,22,${0.08 + rand() * 0.12})`; g.lineWidth = 1 + rand() * 1.5;
      const yy = y + rand() * 102.4;
      g.beginPath(); g.moveTo(0, yy); g.lineTo(S, yy + (rand() - 0.5) * 10); g.stroke();
    }
    g.fillStyle = 'rgba(30,20,10,0.6)'; g.fillRect(0, y + 102.4 - 3, S, 3);
  }
  // 边框
  g.strokeStyle = 'rgba(40,28,14,0.8)'; g.lineWidth = 10; g.strokeRect(5, 5, S - 10, S - 10);
  // 模板字（白漆漏印感：略透明 + 微锯齿）
  g.save(); g.globalAlpha = 0.82; g.fillStyle = '#e4dcc4'; g.textAlign = 'center';
  g.font = `bold 62px ${FONT}`;
  g.fillText(stencil, S / 2, S / 2 - 8);
  g.font = `bold 30px ${FONT}`; g.globalAlpha = 0.62;
  g.fillText(sub, S / 2, S / 2 + 44);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 德式 20L 油桶（jerrycan）：标志性 X 凹筋 + 模板字
function makeJerrycanTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(1937);
  g.fillStyle = '#4a4f38'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 18;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  // X 凹筋（暗/亮对）
  g.lineWidth = 13;
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.beginPath(); g.moveTo(28, 28); g.lineTo(S - 28, S - 28); g.moveTo(S - 28, 28); g.lineTo(28, S - 28); g.stroke();
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,240,0.10)';
  g.beginPath(); g.moveTo(24, 24); g.lineTo(S - 32, S - 32); g.moveTo(S - 24, 24); g.lineTo(32, S - 32); g.stroke();
  // 磨痕
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(140,140,110,${0.05 + rand() * 0.1})`;
    g.beginPath(); g.ellipse(rand() * S, rand() * S, 4 + rand() * 12, 2 + rand() * 5, rand(), 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(228,220,196,0.75)'; g.font = `bold 21px ${FONT}`; g.textAlign = 'center';
  g.fillText('Kraftstoff', S / 2, 40);
  g.font = `bold 17px ${FONT}`; g.fillText('20L', S / 2, S - 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 200L 油桶：滚箍 + 锈斑 + Kraftstoff 模板字
function makeDrumTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  const rand = rng(5150);
  g.fillStyle = '#5a5c40'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 20;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  for (const y of [170, 342]) {
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y, S, 5);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 5, S, 7);
  }
  for (let i = 0; i < 26; i++) {
    const x = rand() * S, y = rand() * S, r = 4 + rand() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(112,64,28,${0.22 + rand() * 0.4})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(230,222,198,0.8)'; g.textAlign = 'center';
  g.font = `bold 52px ${FONT}`;
  g.fillText('KRAFTSTOFF', S / 2, 140);
  g.font = `bold 40px ${FONT}`; g.fillText('200L', S / 2, 450);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 木框小方格窗（3×2 格，暖黄毛玻璃透光）
function makeWindowTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(3141);
  // 玻璃：暖黄渐变（西晒暖光）
  for (let py = 0; py < 2; py++) for (let pz = 0; pz < 3; pz++) {
    const x0 = 12 + pz * 78, y0 = 12 + py * 118;
    const bright = 0.75 + rand() * 0.25;
    const gr = g.createLinearGradient(x0, y0, x0 + 66, y0 + 106);
    gr.addColorStop(0, `rgba(${214 * bright | 0},${196 * bright | 0},${150 * bright | 0},1)`);
    gr.addColorStop(1, `rgba(${176 * bright | 0},${158 * bright | 0},${116 * bright | 0},1)`);
    g.fillStyle = gr; g.fillRect(x0, y0, 66, 106);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,250,230,${rand() * 0.09})`;
      g.fillRect(x0 + rand() * 66, y0 + rand() * 106, 2 + rand() * 3, 1.5);
    }
  }
  // 木框
  g.fillStyle = '#3c2e1c';
  g.fillRect(0, 0, W, 12); g.fillRect(0, H - 12, W, 12);
  g.fillRect(0, 0, 12, H); g.fillRect(W - 12, 0, 12, H);
  g.fillRect(84, 0, 10, H); g.fillRect(162, 0, 10, H);
  g.fillRect(0, 118, W, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 大门木标牌：PANZER-WERKSTATT
function makeSignTexture() {
  const W = 1024, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(1943);
  g.fillStyle = '#4c3a22'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(30,20,10,${0.1 + rand() * 0.12})`; g.lineWidth = 1 + rand() * 2;
    const y = rand() * H;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (rand() - 0.5) * 12); g.stroke();
  }
  g.strokeStyle = 'rgba(226,216,188,0.75)'; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28);
  g.fillStyle = '#ece2c8'; g.font = `bold 96px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('PANZER-WERKSTATT', W / 2, H / 2 - 20);
  g.fillStyle = 'rgba(236,226,200,0.72)'; g.font = `bold 34px ${FONT}`;
  g.fillText('· Instandsetzung u. Reparatur ·', W / 2, H - 44);
  // 钉帽
  g.fillStyle = 'rgba(40,36,30,0.9)';
  for (const [x, y] of [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]]) {
    g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 战时告示木牌（白漆模板字）
function makeNoticeTexture(title, sub) {
  const W = 256, H = 320;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(title.length * 31 + 7);
  g.fillStyle = '#3e3826'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(220,210,180,0.6)'; g.lineWidth = 4; g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = '#e2d6b8'; g.font = `bold 34px ${FONT}`; g.textAlign = 'center';
  const words = title.split(' ');
  words.forEach((wd, i) => g.fillText(wd, W / 2, 62 + i * 44));
  g.fillStyle = 'rgba(226,216,188,0.75)'; g.font = `bold 20px ${FONT}`;
  sub.split('\n').forEach((ln, i) => g.fillText(ln, W / 2, 90 + words.length * 44 + i * 32));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 门外远景：天空 + 田野 + 树线剪影 + 远处草垛（透过半开大门看到的战地）
function makeOutdoorsTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = rng(777001);
  // 天空（晨昏暖调）
  let gr = g.createLinearGradient(0, 0, 0, H * 0.62);
  gr.addColorStop(0, '#a8bdd0'); gr.addColorStop(0.6, '#cfd2c2'); gr.addColorStop(1, '#e8dfc0');
  g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.62);
  // 太阳晕
  gr = g.createRadialGradient(W * 0.68, H * 0.3, 0, W * 0.68, H * 0.3, 150);
  gr.addColorStop(0, 'rgba(255,240,200,0.85)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.62);
  // 云带
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(240,240,230,${0.10 + rand() * 0.12})`;
    g.beginPath(); g.ellipse(rand() * W, H * (0.08 + rand() * 0.3), 80 + rand() * 160, 10 + rand() * 20, 0, 0, 7); g.fill();
  }
  // 树线剪影
  g.fillStyle = '#3d4530';
  g.beginPath(); g.moveTo(0, H * 0.62);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.62 - 6 - rand() * 26);
  g.lineTo(W, H * 0.62); g.closePath(); g.fill();
  // 田野（金色麦田 + 绿带）
  gr = g.createLinearGradient(0, H * 0.62, 0, H);
  gr.addColorStop(0, '#9a9058'); gr.addColorStop(0.5, '#b0a060'); gr.addColorStop(1, '#8a7848');
  g.fillStyle = gr; g.fillRect(0, H * 0.62, W, H * 0.38);
  for (let i = 0; i < 24; i++) {
    g.strokeStyle = `rgba(90,80,44,${0.10 + rand() * 0.16})`; g.lineWidth = 2 + rand() * 3;
    const y = H * (0.66 + rand() * 0.3);
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (rand() - 0.5) * 20); g.stroke();
  }
  // 草垛剪影
  for (const [hx, hw] of [[W * 0.24, 60], [W * 0.82, 44]]) {
    g.fillStyle = '#6a5c34';
    g.beginPath(); g.moveTo(hx - hw, H * 0.62 + 26); g.quadraticCurveTo(hx, H * 0.62 - hw * 0.7, hx + hw, H * 0.62 + 26); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 伪装网（半透明 alpha：网眼 + 橄榄/棕布条块）
function makeCamoNetTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(4490);
  g.clearRect(0, 0, S, S);
  // 网眼格
  g.strokeStyle = 'rgba(52,54,38,0.55)'; g.lineWidth = 2;
  for (let i = -S; i < S * 2; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.beginPath(); g.moveTo(i + S, 0); g.lineTo(i, S); g.stroke();
  }
  // 布条块（不规则色块）
  const cols = ['rgba(74,80,48,0.85)', 'rgba(96,88,56,0.85)', 'rgba(58,64,40,0.8)', 'rgba(120,104,64,0.7)'];
  for (let i = 0; i < 60; i++) {
    g.fillStyle = cols[(rand() * cols.length) | 0];
    const x = rand() * S, y = rand() * S;
    g.beginPath();
    g.ellipse(x, y, 8 + rand() * 22, 3 + rand() * 6, rand() * Math.PI, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 粒子软点 / 灯光光晕
function makeDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,244,220,1)'); gr.addColorStop(0.18, 'rgba(255,236,196,0.55)');
  gr.addColorStop(0.45, 'rgba(255,226,170,0.16)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ───────────────────────── 场景本体 ─────────────────────────

// 盒体 UV 按实际尺寸缩放（合并几何后各面贴图密度一致，木板/砖缝不会忽大忽小）
function scaleBoxUVs(geo, w, h, d, s) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x,-x,+y,-y,+z,-z
  for (let f = 0; f < 6; f++) {
    const [du, dv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * du * s, uv.getY(i) * dv * s);
    }
  }
  return geo;
}

export class Garage {
  constructor(scene, renderer, quality = 'high') {
    this.scene = scene;
    this.renderer = renderer;
    this.visible = false;
    this._t = 0;
    this._shadowSize = quality === 'low' ? 1024 : 2048;
    this._dustCount = quality === 'low' ? 160 : 300;

    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this._fxGroup = new THREE.Group();      // 光晕/体积光/浮尘：拍 PMREM 环境时隐藏
    this.root.add(this._fxGroup);

    this._swayLamps = [];                    // 微摆吊灯
    this._lampAnchors = [];                  // 灯光晕随动 anchor（与 _swayLamps 一一对应）
    this._sway = null;                       // 吊挂发动机摆组
    this._lanternLight = null;
    this._lanternHalo = null;

    // ── 共享贴图/材质 ──
    this._glowTex = makeGlowTexture();
    this._dotTex = makeDotTexture();
    const dirt = makeDirtFloorTextures(44, 30);
    const plankPad = makePlankTexture(31, '#8a6c46', true);
    const plankWall = makePlankTexture(11, '#7d6242', false);
    const plankDark = makePlankTexture(23, '#5a442c', true);
    const plankDoor = makePlankTexture(47, '#6d5334', false);
    const brick = makeBrickTexture();

    this.M = {
      dirt: new THREE.MeshStandardMaterial({ map: dirt.map, roughnessMap: dirt.roughnessMap, bumpMap: dirt.bumpMap, bumpScale: 0.5, roughness: 1, metalness: 0 }),
      pad: new THREE.MeshStandardMaterial({ map: plankPad, roughness: 0.82, metalness: 0 }),
      wall: new THREE.MeshStandardMaterial({ map: plankWall, roughness: 0.9, metalness: 0, color: 0xbfb094 }),
      brick: new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95, metalness: 0 }),
      // 屋面（单面 Plane 朝室内，见 _buildRoof）
      roof: new THREE.MeshStandardMaterial({ map: plankDark, roughness: 0.95, metalness: 0, color: 0x9a8d7c }),
      beam: new THREE.MeshStandardMaterial({ color: 0x4b3823, roughness: 0.9, metalness: 0 }),
      woodMid: new THREE.MeshStandardMaterial({ color: 0x6d5233, roughness: 0.85, metalness: 0 }),
      door: new THREE.MeshStandardMaterial({ map: plankDoor, roughness: 0.9, metalness: 0 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x3c4044, roughness: 0.5, metalness: 0.65 }),
      ironDark: new THREE.MeshStandardMaterial({ color: 0x2b2c2a, roughness: 0.6, metalness: 0.55 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x35322c, roughness: 0.62, metalness: 0.5 }),
      rust: new THREE.MeshStandardMaterial({ color: 0x4c423a, roughness: 0.7, metalness: 0.45 }),
      enamel: new THREE.MeshStandardMaterial({ color: 0x24402a, roughness: 0.42, metalness: 0.3, side: THREE.DoubleSide }),
      bulb: new THREE.MeshBasicMaterial({ color: 0xffe6b0 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x6a675f, roughness: 0.95, metalness: 0 }),
      sack: new THREE.MeshStandardMaterial({ color: 0x8a7a54, roughness: 1, metalness: 0 }),
      sandbag: new THREE.MeshStandardMaterial({ color: 0x7a6b48, roughness: 1, metalness: 0 }),
      toolDark: new THREE.MeshStandardMaterial({ color: 0x2e2c28, roughness: 0.55, metalness: 0.6 }),
    };

    this._buildFloor();
    this._buildWalls();
    this._buildRoof();
    this._buildDoor();
    this._buildGantry();
    this._buildProps();
    this._buildLights();
    this._buildAtmosphere();
    this._buildEnv();
  }

  // ── 盒列表 → 合并网格（降 draw call） ──
  _merged(list, mat, cast = true, receive = true, parent = this.root) {
    if (!list.length) return null;
    const geos = list.map(p => {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      if (p.s) scaleBoxUVs(g, p.w, p.h, p.d, p.s);
      const m = new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0, 'YXZ'));
      m.setPosition(p.x, p.y, p.z);
      g.applyMatrix4(m);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    return mesh;
  }

  // ── 地面：夯土 + 木板停车台（台面顶 y=0，坦克直接落在木板上） ──
  _buildFloor() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 30), this.M.dirt);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    this.root.add(floor);
    // 大门外夯土 apron（透过门洞看到的门前地）
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(9, 11), this.M.dirt);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(-26.2, -0.004, 0);
    this.root.add(apron);
    // 木板台：13×9.5m，顶面与地齐平（盒心 y=-0.045）
    const pad = this._merged([
      { w: 13, h: 0.09, d: 9.5, x: 0, y: -0.045, z: 0, s: 1 / 2.6 },
    ], this.M.pad, false, true);
    pad.castShadow = false;
    // 展示位四角木轮挡（沿用旧版坐标）
    this._merged([
      { w: 0.5, h: 0.18, d: 0.24, x: 1.62, y: 0.09, z: 3.15, ry: 0.1, rz: 0.42 },
      { w: 0.5, h: 0.18, d: 0.24, x: -1.62, y: 0.09, z: 3.15, ry: -0.08, rz: -0.42 },
      { w: 0.5, h: 0.18, d: 0.24, x: 1.62, y: 0.09, z: -3.15, ry: -0.06, rz: 0.42 },
      { w: 0.5, h: 0.18, d: 0.24, x: -1.62, y: 0.09, z: -3.15, ry: 0.12, rz: -0.42 },
    ], this.M.woodMid, true, true);
  }

  // ── 墙体：红砖墙裙(1.3m) + 木板墙(至 6.0m) + 方木柱 + 后墙木窗 ──
  _buildWalls() {
    const S_B = 1 / 2.4, S_P = 1 / 3.2;
    // 砖裙（-x 端墙留 6.8m 门洞：z∈[-3.4,3.4] 断开）
    this._merged([
      { w: 44, h: 1.3, d: 0.24, x: 0, y: 0.65, z: -15, s: S_B },
      { w: 44, h: 1.3, d: 0.24, x: 0, y: 0.65, z: 15, s: S_B },
      { w: 0.24, h: 1.3, d: 30, x: 22, y: 0.65, z: 0, s: S_B },
      { w: 0.24, h: 1.3, d: 11.6, x: -22, y: 0.65, z: -9.2, s: S_B },
      { w: 0.24, h: 1.3, d: 11.6, x: -22, y: 0.65, z: 9.2, s: S_B },
    ], this.M.brick, false, true);
    // 木板墙（门洞上方门楣 y4.9→6.0）
    this._merged([
      { w: 44, h: 4.7, d: 0.24, x: 0, y: 3.65, z: -15, s: S_P },
      { w: 44, h: 4.7, d: 0.24, x: 0, y: 3.65, z: 15, s: S_P },
      { w: 0.24, h: 4.7, d: 30, x: 22, y: 3.65, z: 0, s: S_P },
      { w: 0.24, h: 4.7, d: 11.6, x: -22, y: 3.65, z: -9.2, s: S_P },
      { w: 0.24, h: 4.7, d: 11.6, x: -22, y: 3.65, z: 9.2, s: S_P },
      { w: 0.24, h: 1.1, d: 6.8, x: -22, y: 5.45, z: 0, s: S_P },
    ], this.M.wall, false, true);
    // 方木柱（每 ~5.5m）+ 石柱础 + 墙顶木垫梁
    const posts = [], stones = [];
    for (const z of [-15, 15]) {
      for (let x = -22; x <= 22.01; x += 5.5) {
        posts.push({ w: 0.26, h: 6.0, d: 0.26, x, y: 3.0, z: z - Math.sign(z) * 0.02 });
        stones.push({ w: 0.42, h: 0.22, d: 0.42, x, y: 0.11, z });
      }
    }
    for (const x of [-22, 22]) {
      for (let z = -15; z <= 15.01; z += 5) {
        if (x < 0 && Math.abs(z) < 4.4) continue;  // 让开门洞
        posts.push({ w: 0.26, h: 6.0, d: 0.26, x: x - Math.sign(x) * 0.02, y: 3.0, z });
        stones.push({ w: 0.42, h: 0.22, d: 0.42, x, y: 0.11, z });
      }
    }
    posts.push(
      { w: 44.4, h: 0.18, d: 0.3, x: 0, y: 6.05, z: -15 },
      { w: 44.4, h: 0.18, d: 0.3, x: 0, y: 6.05, z: 15 },
      { w: 0.3, h: 0.18, d: 30.4, x: 22, y: 6.05, z: 0 },
      { w: 0.3, h: 0.18, d: 30.4, x: -22, y: 6.05, z: 0 },
    );
    this._merged(posts, this.M.beam, true, true);
    this._merged(stones, this.M.stone, false, true);
    // 后墙(-z) 5 扇木窗 + 端墙(+x) 2 扇：暖黄自发光毛玻璃 + 木框
    const winTex = makeWindowTexture();
    const winMat = new THREE.MeshStandardMaterial({
      map: winTex, emissive: 0xffc174, emissiveMap: winTex, emissiveIntensity: 0.85,
      roughness: 0.6, metalness: 0,
    });
    const frames = [];
    const addWindow = (x, y, z, ry) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.2), winMat);
      p.position.set(x, y, z); p.rotation.y = ry;
      this.root.add(p);
      // 框（沿墙面向内微凸）
      const fx = Math.abs(ry) > 0.1 ? 0 : 1;   // 墙面朝向：0=±z 墙，1=±x 墙
      const push = 0.05;
      const off = (dx, dz) => ({ dx, dz });
      const n = { x: Math.sin(ry), z: Math.cos(ry) };   // 室内侧法向
      const mk = (w, h, ox, oy) => frames.push({
        w: fx ? 0.06 : w, h, d: fx ? w : 0.06,
        x: x + n.x * push + (fx ? 0 : ox), y: y + oy, z: z + n.z * push + (fx ? ox : 0),
      });
      mk(1.31, 0.09, 0, 0.645); mk(1.31, 0.09, 0, -0.645);
      mk(0.09, 1.38, -0.62, 0); mk(0.09, 1.38, 0.62, 0);
    };
    for (const wx of [-14, -7, 0, 7, 14]) addWindow(wx, 4.2, -14.87, 0);
    addWindow(21.87, 4.6, -5, -Math.PI / 2);
    addWindow(21.87, 4.6, 5, -Math.PI / 2);
    this._merged(frames, this.M.beam, false, true);
  }

  // ── 屋顶：木桁架(每4.4m一榀) + 檩条 + 屋面板 + 采光带 ──
  _buildRoof() {
    const A = Math.atan2(3.6, 15);            // 屋面坡角（檐6.0 → 脊9.6，半跨15）
    const L = Math.hypot(15, 3.6);            // 椽长
    const beams = [];
    for (let i = 0; i < 10; i++) {
      const x = -19.8 + i * 4.4;
      beams.push({ w: 0.2, h: 0.26, d: 30, x, y: 6.02, z: 0 });                       // 下弦
      beams.push({ w: 0.16, h: 0.2, d: L, x, y: 7.8, z: -7.5, rx: -A });              // 椽(-z)
      beams.push({ w: 0.16, h: 0.2, d: L, x, y: 7.8, z: 7.5, rx: A });                // 椽(+z)
      beams.push({ w: 0.16, h: 3.55, d: 0.16, x, y: 7.78, z: 0 });                    // 中柱
      beams.push({ w: 0.12, h: 0.12, d: 5.31, x, y: 7.0, z: -2.5, rx: -0.345 });      // 斜撑
      beams.push({ w: 0.12, h: 0.12, d: 5.31, x, y: 7.0, z: 2.5, rx: 0.345 });
    }
    for (const [pz, py] of [[-10, 6.96], [-5, 8.16], [5, 8.16], [10, 6.96]]) {
      beams.push({ w: 44.2, h: 0.12, d: 0.12, x: 0, y: py, z: pz });                  // 檩条
    }
    beams.push({ w: 44.3, h: 0.2, d: 0.16, x: 0, y: 9.55, z: 0 });                    // 脊檩
    this._merged(beams, this.M.beam, true, false);
    // 屋面板：单面 Plane 朝室内（FrontSide）——高机位俯瞰时正面剔除自动"剖开"，不会黑屏
    const roofPlane = (cx, cy, cz, rx) => {
      const g = new THREE.PlaneGeometry(44.6, L + 0.5);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 44.6 / 3, uv.getY(i) * (L + 0.5) / 3);
      const m = new THREE.Mesh(g, this.M.roof);
      m.position.set(cx, cy, cz);
      m.rotation.x = rx;
      m.receiveShadow = false;
      this.root.add(m);
    };
    roofPlane(0, 7.85, 7.62, Math.PI / 2 + A);    // +z 坡（法线朝室内下后方）
    roofPlane(0, 7.85, -7.62, Math.PI / 2 - A);   // -z 坡
    // -z 侧屋面采光带 ×2（暗亮面片，晨光感；同样朝室内单面）
    const skyMat = new THREE.MeshStandardMaterial({
      color: 0x3a4248, emissive: 0xcfdce8, emissiveIntensity: 0.5,
      roughness: 0.35, metalness: 0.1,
    });
    for (const sx of [-9, 9]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.15), skyMat);
      p.position.set(sx, 7.84, -6.9);
      p.rotation.x = Math.PI / 2 - A;
      this.root.add(p);
    }
    // 采光带冷光补一盏（在 _buildLights 统一建光源，这里只摆面片）
  }

  // ── 大门（-x 端墙）：左扇关、右扇外开 65° + 门外远景 + 标牌 + 伪装网 ──
  _buildDoor() {
    // 门扇盒：(厚x, 高y, 宽z)，UV 按门面缩放
    const leafGeo = (s) => {
      const parts = [
        { w: 0.08, h: 4.85, d: 3.35, x: 0, y: 2.425, z: 0, s },
        { w: 0.06, h: 0.28, d: 3.2, x: 0.07, y: 1.2, z: 0 },       // 内面横撑
        { w: 0.06, h: 0.28, d: 3.2, x: 0.07, y: 3.7, z: 0 },
        { w: 0.06, h: 0.24, d: 3.4, x: 0.07, y: 2.45, z: 0, rx: 0.72 }, // 斜撑
      ];
      const geos = parts.map(p => {
        const g = new THREE.BoxGeometry(p.w, p.h, p.d);
        if (p.s) scaleBoxUVs(g, p.w, p.h, p.d, p.s);
        const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.rx || 0, 0, 0));
        m.setPosition(p.x, p.y, p.z);
        g.applyMatrix4(m);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      return merged;
    };
    // 左扇：关闭（z -3.375..-0.025）
    const left = new THREE.Mesh(leafGeo(1 / 2.4), this.M.door);
    left.position.set(-22, 0, -1.7);
    left.castShadow = true; left.receiveShadow = true;
    this.root.add(left);
    // 右扇：铰链在 z=3.375，向外(-x)开 65°
    const hinge = new THREE.Group();
    hinge.position.set(-22, 0, 3.375);
    hinge.rotation.y = 1.134;
    const right = new THREE.Mesh(leafGeo(1 / 2.4), this.M.door);
    right.position.set(0, 0, -1.675);
    right.castShadow = true; right.receiveShadow = true;
    hinge.add(right);
    this.root.add(hinge);
    // 门外远景：主面 + 两侧斜面（填充透过门洞的视野）
    const outTex = makeOutdoorsTexture();
    const outMat = new THREE.MeshBasicMaterial({ map: outTex, fog: false });
    const mk = (w, h, x, y, z, ry) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), outMat);
      p.position.set(x, y, z); p.rotation.y = ry;
      this.root.add(p);
    };
    mk(13, 7, -26.8, 2.9, 0, Math.PI / 2);
    mk(8, 7, -24.6, 2.9, -6.2, Math.PI / 2 + 0.55);
    mk(8, 7, -24.6, 2.9, 6.2, Math.PI / 2 - 0.55);
    // 门内上方 PANZER-WERKSTATT 木牌
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.85),
      new THREE.MeshStandardMaterial({ map: makeSignTexture(), roughness: 0.85 }));
    sign.position.set(-21.85, 5.35, 0);
    sign.rotation.y = Math.PI / 2;
    this.root.add(sign);
    // 门口上角斜挂伪装网（alphaTest 防排序问题）
    const camoTex = makeCamoNetTexture();
    const camoMat = new THREE.MeshStandardMaterial({
      map: camoTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, metalness: 0,
    });
    const mkNet = (w, h, x, y, z, rx, ry, rz) => {
      const n = new THREE.Mesh(new THREE.PlaneGeometry(w, h), camoMat);
      n.position.set(x, y, z);
      n.rotation.set(rx, ry, rz, 'YXZ');
      n.castShadow = true;
      this.root.add(n);
    };
    mkNet(2.8, 1.9, -20.6, 4.5, -3.4, -0.45, 0.35, 0.1);
    mkNet(2.2, 1.5, -20.9, 4.75, 3.2, -0.5, -0.3, -0.08);
    mkNet(2.6, 1.7, 11.3, 1.02, -13.6, -Math.PI / 2 + 0.18, 0.25, 0);   // 搭在弹药箱堆上
  }

  // ── 木 A 字架龙门吊 ×2 + 链条葫芦吊坦克发动机（微摆） ──
  _buildGantry() {
    const legs = [];
    const ang = Math.atan2(5.5, 4.4);          // 腿倾角（腿从 z±4.4 起到顶点 y5.5）
    const legL = Math.hypot(5.5, 4.4);
    for (const x of [-5, 5]) {
      legs.push({ w: 0.17, h: 0.2, d: legL, x, y: 2.75, z: 2.2, rx: ang });
      legs.push({ w: 0.17, h: 0.2, d: legL, x, y: 2.75, z: -2.2, rx: -ang });
      legs.push({ w: 0.12, h: 0.14, d: 4.4, x, y: 2.55, z: 0 });              // 侧向横撑
      legs.push({ w: 0.3, h: 0.5, d: 0.3, x, y: 0.25, z: 4.4 });              // 木墩脚
      legs.push({ w: 0.3, h: 0.5, d: 0.3, x, y: 0.25, z: -4.4 });
    }
    legs.push({ w: 10.6, h: 0.22, d: 0.18, x: 0, y: 5.5, z: 0 });             // 顶点横梁
    this._merged(legs, this.M.beam, true, true);
    // 葫芦 + 链条 + 发动机（整体挂 this._sway 绕吊点微摆）
    const sway = new THREE.Group();
    sway.position.set(4.6, 5.42, 0);
    const hoist = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.22), this.M.ironDark);
    hoist.position.y = -0.13; hoist.castShadow = true;
    sway.add(hoist);
    // 链条（微斜到发动机吊点 z+0.4）
    const chainL = Math.hypot(2.95, 0.4);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, chainL, 6), this.M.ironDark);
    chain.position.set(0, -0.26 - chainL / 2, 0.2);
    chain.rotation.x = Math.atan2(0.4, 2.95);
    sway.add(chain);
    // 坦克发动机：铁色缸体 + 缸盖小圆柱 + 吊耳
    const eng = new THREE.Group();
    eng.position.set(0, -3.67, 0.4);
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.6), this.M.iron);
    block.castShadow = true; block.receiveShadow = true;
    eng.add(block);
    const heads = [];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) {
      heads.push({ w: 0.13, h: 0.12, d: 0.13, x: -0.26 + i * 0.26, y: 0.41, z: -0.15 + r * 0.3 });
    }
    heads.push({ w: 0.1, h: 0.16, d: 0.07, x: 0, y: 0.48, z: 0 });   // 吊耳
    this._merged(heads, this.M.ironDark, true, false, eng);
    sway.add(eng);
    this.root.add(sway);
    this._sway = sway;
  }

  // ── 道具：工作台/弹药箱/油桶/备用轮/履带板/沙袋/麻袋/告示 ──
  _buildProps() {
    // — 工作台（-z 墙左）：木桌 + 台虎钳 + 挂板工具剪影 + 马灯 —
    this._merged([
      { w: 2.6, h: 0.09, d: 0.95, x: -10, y: 0.92, z: -13.9, s: 1 / 2.4 },
      { w: 2.4, h: 0.06, d: 0.8, x: -10, y: 0.3, z: -13.9, s: 1 / 2.4 },
    ], this.M.woodMid, true, true);
    this._merged([
      { w: 0.12, h: 0.9, d: 0.12, x: -11.15, y: 0.45, z: -13.53 },
      { w: 0.12, h: 0.9, d: 0.12, x: -8.85, y: 0.45, z: -13.53 },
      { w: 0.12, h: 0.9, d: 0.12, x: -11.15, y: 0.45, z: -14.27 },
      { w: 0.12, h: 0.9, d: 0.12, x: -8.85, y: 0.45, z: -14.27 },
    ], this.M.beam, true, true);
    this._merged([   // 台虎钳 + 台上零件
      { w: 0.34, h: 0.07, d: 0.26, x: -10.8, y: 1.0, z: -13.75 },
      { w: 0.28, h: 0.17, d: 0.2, x: -10.8, y: 1.12, z: -13.75 },
      { w: 0.35, h: 0.2, d: 0.25, x: -9.3, y: 1.07, z: -13.9 },
      { w: 0.22, h: 0.14, d: 0.18, x: -9.7, y: 1.04, z: -14.1, ry: 0.5 },
    ], this.M.ironDark, true, true);
    // 挂板 + 工具剪影
    this._merged([{ w: 2.3, h: 1.2, d: 0.05, x: -10, y: 2.0, z: -14.85, s: 1 / 2.4 }],
      this.M.woodMid, false, true);
    this._merged([
      { w: 0.05, h: 0.42, d: 0.03, x: -10.8, y: 2.0, z: -14.8 },
      { w: 0.17, h: 0.07, d: 0.04, x: -10.8, y: 2.22, z: -14.8 },   // 锤
      { w: 0.05, h: 0.36, d: 0.02, x: -10.3, y: 1.95, z: -14.8, rz: 0.1 },  // 扳手
      { w: 0.5, h: 0.13, d: 0.02, x: -9.7, y: 2.1, z: -14.8 },      // 锯条
      { w: 0.06, h: 0.3, d: 0.03, x: -9.2, y: 1.9, z: -14.8, rz: -0.12 },
      { w: 0.04, h: 0.5, d: 0.02, x: -11.3, y: 1.95, z: -14.8, rz: 0.06 },
    ], this.M.toolDark, false, false);
    // 马灯（工作台角，暖光带闪烁）
    this._merged([
      { w: 0.15, h: 0.06, d: 0.15, x: -8.95, y: 0.995, z: -14.0 },
      { w: 0.04, h: 0.24, d: 0.04, x: -8.95, y: 1.13, z: -14.0 },
      { w: 0.12, h: 0.05, d: 0.12, x: -8.95, y: 1.27, z: -14.0 },
    ], this.M.ironDark, true, false);
    const lampGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.065, 0.12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffc27a }));
    lampGlass.position.set(-8.95, 1.17, -14.0);
    this.root.add(lampGlass);
    this._lanternHalo = this._halo(-8.95, 1.2, -13.9, 0.85, 0xffb46a, 0.5);

    // — 弹药箱堆（-z 墙右）：三种 stencil，两层堆码 + 一只斜放 —
    const crateSpecs = [
      ['8.8cm Pzgr.39', 'Pzgr.Patr. 39 · 8.8 cm Kw.K.36'],
      ['7.5cm Sprgr.34', 'Sprgr.Patr. 34 · 7.5 cm Kw.K.40'],
      ['7.92mm Patr.', 's.S. Patronen · 1500 Stk.'],
    ];
    const crateMats = crateSpecs.map(([a, b]) => new THREE.MeshStandardMaterial({
      map: makeAmmoCrateTexture(a, b), roughness: 0.85, metalness: 0,
    }));
    const crateAt = (x, y, z, mi, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.37, 0.48), crateMats[mi]);
      m.position.set(x, y, z); m.rotation.y = ry;
      m.castShadow = true; m.receiveShadow = true;
      this.root.add(m);
    };
    crateAt(9.2, 0.185, -13.9, 0); crateAt(10.2, 0.185, -13.9, 1); crateAt(11.2, 0.185, -13.9, 2);
    crateAt(9.7, 0.555, -13.9, 2); crateAt(10.7, 0.555, -13.9, 0);
    crateAt(12.4, 0.185, -13.5, 1, 0.4);
    // 德式 20L 油桶 ×5（一只躺倒）
    const jcMat = new THREE.MeshStandardMaterial({ map: makeJerrycanTexture(), roughness: 0.55, metalness: 0.35 });
    const jcAt = (x, z, ry, lying = false) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.47, 0.16), jcMat);
      body.castShadow = true; body.receiveShadow = true;
      g.add(body);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.035), this.M.ironDark);
      handle.position.y = 0.26; g.add(handle);
      g.position.set(x, lying ? 0.08 : 0.235, z);
      g.rotation.y = ry;
      if (lying) g.rotation.x = Math.PI / 2;
      this.root.add(g);
    };
    jcAt(7.6, -13.6, 0.2); jcAt(8.05, -13.65, -0.15); jcAt(8.5, -13.55, 0.35);
    jcAt(7.85, -13.1, 1.2); jcAt(8.6, -13.05, 0.5, true);

    // — +x 墙：备用负重轮 ×3 叠 + 一只斜靠 + 履带板一排 —
    const wheelMat = this.M.rust;
    const wheelAt = (x, y, z, rz) => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.1, 12, 26), wheelMat);
      tire.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 12), this.M.ironDark);
      g.add(tire); g.add(hub);
      g.position.set(x, y, z);
      if (rz) { g.rotation.z = rz; }
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.root.add(g);
    };
    wheelAt(20.9, 0.11, -6.5, 0); wheelAt(20.9, 0.33, -6.5, 0); wheelAt(20.9, 0.55, -6.5, 0);
    wheelAt(21.45, 0.42, -5.2, -1.05);   // 斜靠墙
    const links = [];
    for (let i = 0; i < 8; i++) {
      links.push({ w: 0.24, h: 0.55, d: 0.09, x: 21.55, y: 0.32, z: -2.2 + i * 0.62, rz: -0.3, ry: (i % 3) * 0.06 });
    }
    this._merged(links, this.M.steel, true, true);

    // — +z 墙：200L 油桶 ×4（一只躺倒）+ 木托盘 + 麻袋堆 —
    const drumSide = new THREE.MeshStandardMaterial({ map: makeDrumTexture(), roughness: 0.5, metalness: 0.4 });
    const drumCap = new THREE.MeshStandardMaterial({ color: 0x4a4c38, roughness: 0.55, metalness: 0.4 });
    const drumAt = (x, y, z, lying = false, ry = 0) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20), [drumSide, drumCap, drumCap]);
      m.position.set(x, y, z);
      if (lying) { m.rotation.z = Math.PI / 2; m.rotation.y = ry; }
      m.castShadow = true; m.receiveShadow = true;
      this.root.add(m);
    };
    this._merged([  // 托盘
      { w: 1.25, h: 0.03, d: 0.16, x: 16.9, y: 0.115, z: 12.85 },
      { w: 1.25, h: 0.03, d: 0.16, x: 16.9, y: 0.115, z: 13.3 },
      { w: 1.25, h: 0.03, d: 0.16, x: 16.9, y: 0.115, z: 13.75 },
      { w: 0.14, h: 0.08, d: 1.1, x: 16.35, y: 0.05, z: 13.3 },
      { w: 0.14, h: 0.08, d: 1.1, x: 16.9, y: 0.05, z: 13.3 },
      { w: 0.14, h: 0.08, d: 1.1, x: 17.45, y: 0.05, z: 13.3 },
    ], this.M.woodMid, true, true);
    drumAt(16.55, 0.59, 13.1); drumAt(17.25, 0.59, 13.45); drumAt(16.9, 1.5, 13.28);
    drumAt(15.3, 0.3, 13.6, true, 0.3);
    // 麻袋堆
    const sacks = [];
    const sackAt = (x, y, z, ry) => sacks.push({ x, y, z, ry });
    sackAt(-8.4, 0.16, 13.6, 0.3); sackAt(-7.8, 0.16, 13.8, -0.4); sackAt(-8.1, 0.16, 13.2, 1.1);
    sackAt(-8.2, 0.45, 13.55, 0.8); sackAt(-7.9, 0.45, 13.25, -0.9);
    {
      const geos = sacks.map(s => {
        const g = new THREE.SphereGeometry(0.5, 10, 8);
        g.scale(1.05, 0.55, 0.78);
        const m = new THREE.Matrix4().makeRotationY(s.ry);
        m.setPosition(s.x, s.y, s.z);
        g.applyMatrix4(m);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, this.M.sack);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    // 门内侧沙袋矮墙 ×2（交错码放）
    {
      const bags = [];
      for (const zc of [-4.6, 4.6]) {
        const rows = [[4, 0.085], [4, 0.255], [3, 0.425]];
        for (const [n, y] of rows) {
          for (let i = 0; i < n; i++) {
            bags.push({
              x: -19.4 + ((i + (y > 0.2 ? 0.5 : 0)) % 2) * 0.06,
              y, z: zc - (n - 1) * 0.155 + i * 0.31,
              ry: (i * 0.7 + zc) % 0.5 - 0.25,
            });
          }
        }
      }
      const geos = bags.map(b => {
        const g = new THREE.SphereGeometry(0.5, 9, 7);
        g.scale(0.84, 0.34, 0.6);
        const m = new THREE.Matrix4().makeRotationY(b.ry);
        m.setPosition(b.x, b.y, b.z);
        g.applyMatrix4(m);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, this.M.sandbag);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh);
    }
    // 战时告示牌
    const noticeAt = (title, sub, x, y, z, ry) => {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.69),
        new THREE.MeshStandardMaterial({ map: makeNoticeTexture(title, sub), roughness: 0.9 }));
      p.position.set(x, y, z); p.rotation.y = ry;
      this.root.add(p);
    };
    noticeAt('FEUERGEFAHR!', 'Rauchen\nverboten', 15.2, 1.9, 14.86, Math.PI);
    noticeAt('VORSICHT', 'Kranbahn\nfreihalten', 5.2, 2.0, -14.86, 0);
  }

  // ── 灯光：半球基光 + 吊灯×7(3盏暖主光带阴影，车头方向追加1盏照亮前脸) + 天窗冷光 + 门口冷光 + 马灯 ──
  _buildLights() {
    this.root.add(new THREE.HemisphereLight(0xffe2b8, 0x3a2f22, 0.58));
    // 天窗冷光（-z 屋面采光带方向）
    const sky = new THREE.PointLight(0xcfe0f0, 22, 20, 2);
    sky.position.set(-4, 7.0, -5.5);
    this.root.add(sky);
    // 搪瓷伞罩吊灯 ×7：位置 / 是否带 SpotLight / 摆动相位
    const lampDefs = [
      { x: 0, z: -2.2, y: 5.1, spot: true, ph: 0.0 },    // 展示位主光
      { x: 0, z: 2.2, y: 5.1, spot: true, ph: 2.1 },     // 展示位主光
      { x: 0, z: 7.6, y: 5.1, spot: true, ph: 0.9, tx: 0, ty: 1.2, tz: 2.4 }, // 车头(+z)补光：瞄准前脸
      { x: -6, z: -5.5, y: 5.4, spot: false, ph: 4.2 },
      { x: 6, z: -5.5, y: 5.4, spot: false, ph: 1.3 },
      { x: -6, z: 5.5, y: 5.4, spot: false, ph: 3.4 },
      { x: 6, z: 5.5, y: 5.4, spot: false, ph: 5.1 },
    ];
    for (const d of lampDefs) this._pendant(d.x, d.z, d.y, d.spot, d.ph, d);
    // 中央补光
    const fill = new THREE.PointLight(0xffd2a0, 36, 17, 2);
    fill.position.set(0, 4.4, 0);
    this.root.add(fill);
    // 工作台马灯（暖光小范围，带闪烁）
    this._lanternLight = new THREE.PointLight(0xffb46a, 9, 7, 2);
    this._lanternLight.position.set(-8.95, 1.35, -13.85);
    this.root.add(this._lanternLight);
    // 门口冷色斜射光（黄昏天光灌入）
    const doorSpot = new THREE.SpotLight(0xdfe6ea, 700, 32, 0.5, 0.9, 2);
    doorSpot.position.set(-25.5, 4.6, 1.2);
    doorSpot.target.position.set(-8, 0.3, -0.4);
    this.root.add(doorSpot); this.root.add(doorSpot.target);
    // 体积光锥（门口 → 夯土地面）
    const A2 = new THREE.Vector3(-21.8, 4.3, 0.3);                 // 锥顶（门楣处）
    const dir = new THREE.Vector3(11.8, -4.1, -0.3).normalize();  // 指向室内
    const H = 11;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, H, 24, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(0x9db8d8) }, uOp: { value: 0.14 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv=uv; vN=normalize(normalMatrix*normal);
            vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz);
            gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uOp;
          varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){
            float rim=abs(dot(normalize(vN),normalize(vV)));
            float a=uOp*pow(vUv.y,1.6)*(0.2+0.8*rim);
            gl_FragColor=vec4(uColor,a); }`,
      }));
    cone.position.copy(A2).addScaledVector(dir, H / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    this._fxGroup.add(cone);
  }

  // 单盏搪瓷伞罩吊灯：吊线 + 深绿伞罩 + 发光灯泡 + 光晕（+ 可选 SpotLight，def 可给自定义目标 tx/ty/tz）
  _pendant(x, z, shadeY, withSpot, ph, def = {}) {
    const topY = 6 + 3.6 * (15 - Math.abs(z)) / 15 - 0.08;   // 吊点贴屋面下缘
    const cordLen = topY - shadeY;
    const g = new THREE.Group();
    g.position.set(x, topY, z);
    g.userData.ph = ph;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cordLen, 6), this.M.ironDark);
    cord.position.y = -cordLen / 2;
    g.add(cord);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.32, 0.24, 18, 1, true), this.M.enamel);
    shade.position.y = -cordLen - 0.1;
    shade.castShadow = true;
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), this.M.bulb);
    bulb.position.y = -cordLen - 0.26;
    g.add(bulb);
    // 光晕挂 fxGroup 但跟随吊灯：用同坐标系空组挂接
    const anchor = new THREE.Group();
    anchor.position.set(x, topY, z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color: 0xffd9a0, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(1.15);
    halo.position.y = -cordLen - 0.28;
    anchor.add(halo);
    this._fxGroup.add(anchor);
    this._lampAnchors.push(anchor);
    if (withSpot) {
      const sp = new THREE.SpotLight(0xffd9a8, 420, 22, 0.62, 0.55, 2);
      sp.position.set(0, -cordLen - 0.26, 0);
      sp.castShadow = true;
      sp.shadow.mapSize.setScalar(this._shadowSize);
      sp.shadow.bias = -0.0005;
      sp.shadow.camera.near = 1; sp.shadow.camera.far = 18;
      if (def.tx !== undefined) sp.target.position.set(def.tx, def.ty, def.tz);
      else sp.target.position.set(x === 0 && z < 0 ? 0.5 : -0.5, 0, z < 0 ? -0.3 : 0.3);
      g.add(sp);
      this.root.add(sp.target);
    }
    this.root.add(g);
    this._swayLamps.push(g);
  }

  _halo(x, y, z, scale, color, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTex, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(scale);
    s.position.set(x, y, z);
    this._fxGroup.add(s);
    return s;
  }

  // ── 浮尘（暖色微粒缓慢漂移） ──
  _buildAtmosphere() {
    const N = this._dustCount;
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const rand = rng(881213);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rand() - 0.5) * 20;
      pos[i * 3 + 1] = 0.2 + rand() * 5.4;
      pos[i * 3 + 2] = (rand() - 0.5) * 14;
      vel[i * 3] = (rand() - 0.5) * 0.12;
      vel[i * 3 + 1] = 0.02 + rand() * 0.06;
      vel[i * 3 + 2] = (rand() - 0.5) * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.05, map: this._dotTex, color: 0xffe0b0, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this._dust = new THREE.Points(geo, mat);
    this._dustVel = vel;
    this._fxGroup.add(this._dust);
  }

  // ── PMREM 环境（吊灯/窗/灯泡自发光参与反射；隐藏 fxGroup 防光晕糊进环境） ──
  _buildEnv() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const tmp = new THREE.Scene();
    this.scene.remove(this.root);
    tmp.add(this.root);
    const vis = this.root.visible; this.root.visible = true;
    const fx = this._fxGroup.visible; this._fxGroup.visible = false;
    this.root.position.y = -2;
    this._envRT = pmrem.fromScene(tmp, 0.05, 1, 60);
    this.root.position.y = 0;
    this._fxGroup.visible = fx;
    this.root.visible = vis;
    tmp.remove(this.root);
    this.scene.add(this.root);
    pmrem.dispose();
  }

  // ───────────────────────── 对外接口 ─────────────────────────
  show() {
    this._prevEnv = this.scene.environment ?? null;
    this._prevEnvI = this.scene.environmentIntensity ?? 1;
    this.root.visible = true;
    this.visible = true;
    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = 0.3;
  }

  hide() {
    this.root.visible = false;
    this.visible = false;
    this.scene.environment = this._prevEnv ?? null;
    this.scene.environmentIntensity = this._prevEnvI ?? 1;
  }

  update(dt) {
    if (!this.visible) return;
    this._t += dt;
    const t = this._t;
    // 吊灯微摆（光晕 anchor 同步）
    for (let i = 0; i < this._swayLamps.length; i++) {
      const l = this._swayLamps[i];
      l.rotation.z = 0.016 * Math.sin(t * 0.62 + l.userData.ph);
      l.rotation.x = 0.011 * Math.sin(t * 0.53 + l.userData.ph * 1.7);
      const anchor = this._lampAnchors[i];
      if (anchor) { anchor.rotation.copy(l.rotation); anchor.position.copy(l.position); }
    }
    // 吊挂发动机微摆
    if (this._sway) {
      this._sway.rotation.z = 0.02 * Math.sin(t * 0.5 + 0.4);
      this._sway.rotation.x = 0.013 * Math.sin(t * 0.42);
    }
    // 马灯闪烁
    if (this._lanternLight) {
      const f = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(t * 11 + Math.sin(t * 23) * 2));
      this._lanternLight.intensity = 9 * f;
      if (this._lanternHalo) this._lanternHalo.material.opacity = 0.5 * f;
    }
    // 浮尘漂移
    if (this._dust) {
      const pos = this._dust.geometry.attributes.position;
      const v = this._dustVel;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i) + v[i * 3] * dt;
        let y = pos.getY(i) + v[i * 3 + 1] * dt;
        let z = pos.getZ(i) + v[i * 3 + 2] * dt;
        if (y > 6) y = 0.2;
        if (x > 10) x = -10; else if (x < -10) x = 10;
        if (z > 7) z = -7; else if (z < -7) z = 7;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    const mats = new Set();
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m));
      }
    });
    mats.forEach(m => {
      for (const k of ['map', 'roughnessMap', 'bumpMap', 'emissiveMap', 'alphaMap']) {
        if (m[k]) m[k].dispose();
      }
      m.dispose();
    });
    this._glowTex.dispose();
    this._dotTex.dispose();
    if (this._envRT) this._envRT.dispose();
    this.scene.remove(this.root);
  }
}
