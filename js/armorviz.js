// ═══ 装甲板图模型渲染（armorModel v2：自由四边形板） — armor-view.html / armor-editor.html 共用 ═══
// 板：{ name, face, t, pos:[x,y,z]（中心）, size:[w,h], rot:[rx,ry,rz]（度，Euler XYZ）,
//       weak?, track?, mirror?（mirror=true 时渲染/判定取 ±x 镜像两份） }
// 盒：{ box:{x0,x1,y0,y1,z0,z1}（参照线框/宽相判定）, plates:[...], extras:[附加盒] }
import * as THREE from 'three';

/* ── 文字标签 sprite ── */
export function makeLabel(text, color = '#fff', size = 40) {
  const pad = 8;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  g.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  cv.width = w; cv.height = size + pad * 2;
  const g2 = cv.getContext('2d');
  g2.fillStyle = 'rgba(8,12,16,0.72)'; g2.fillRect(0, 0, w, cv.height);
  g2.font = `bold ${size}px "Microsoft YaHei", sans-serif`;
  g2.fillStyle = color; g2.textBaseline = 'middle'; g2.textAlign = 'center';
  g2.fillText(text, w / 2, cv.height / 2 + 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(cv.width * 0.004, cv.height * 0.004, 1);
  sp.renderOrder = 99;
  return sp;
}

/* 厚度 → 颜色：≤25 蓝 / ≤40 绿 / ≤70 黄 / ≤90 橙 / >90 红 */
export function plateColor(t) {
  if (t <= 25) return 0x6a8ac8;
  if (t <= 40) return 0x52b06a;
  if (t <= 70) return 0xc8b052;
  if (t <= 90) return 0xe08a40;
  return 0xe05252;
}
export const WEAK_EDGE = 0xff4dff, SEL_EDGE = 0x00e5ff;
export const MOD_COLORS = { engine: 0xff8040, fuel: 0xffc040, ammoRacks: 0xff4040, breech: 0x40c8ff, turretDrive: 0x40ffc0, optics: 0xc080ff };
export const MOD_NAMES = { engine: '发动机', fuel: '油箱', ammoRacks: '弹药架', breech: '炮闩', turretDrive: '方向机', optics: '观瞄' };
export const FACE_NAMES = { front: '正面', rear: '尾部', side: '侧面', top: '顶部', misc: '杂项' };

/* ── 单块板（含镜像） ── */
function buildPlate(p, ref, opts) {
  const g = new THREE.Group();
  const isSel = opts.sel && opts.sel.obj === p;
  const col = plateColor(p.t);
  const variants = [{ mx: 1 }];
  if (p.mirror) variants.push({ mx: -1 });
  for (const { mx } of variants) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1]),
      new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: isSel ? 0.62 : 0.42, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(p.pos[0] * mx, p.pos[1], p.pos[2]);
    // 镜像：绕 x 镜像翻转 → ry/rz 取反，rx 保持
    m.rotation.set(
      (p.rot ? p.rot[0] : 0) * Math.PI / 180,
      (p.rot ? p.rot[1] * mx : 0) * Math.PI / 180,
      (p.rot ? (p.rot[2] || 0) * mx : 0) * Math.PI / 180);
    if (opts.onPick) { m.userData.ref = ref; opts.pickables.push(m); }
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),
      new THREE.LineBasicMaterial({ color: isSel ? SEL_EDGE : (p.weak ? WEAK_EDGE : col), transparent: true, opacity: 1 }));
    e.position.copy(m.position); e.rotation.copy(m.rotation);
    g.add(e);
  }
  if (opts.showLabels !== false) {
    const rotTxt = p.rot && (p.rot[0] || p.rot[1] || p.rot[2])
      ? ' @' + p.rot.map(v => +v.toFixed(1)).join('/') + '°' : '';
    const sp = makeLabel(`${p.name} ${p.t}${rotTxt}`, p.weak ? '#ff8aff' : '#fff', 34);
    sp.position.set(p.pos[0], p.pos[1], p.pos[2]);
    // 标签略抬出板面法线，避免 z-fight 遮挡
    const n = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(
      (p.rot?.[0] || 0) * Math.PI / 180, (p.rot?.[1] || 0) * Math.PI / 180, (p.rot?.[2] || 0) * Math.PI / 180));
    sp.position.addScaledVector(n, 0.12);
    g.add(sp);
  }
  return g;
}

/* ── 判定盒（线框参照） + 附加盒 ── */
function buildBoxFrame(box, ref, opts) {
  const g = new THREE.Group();
  const isSel = opts.sel && opts.sel.obj === box;
  const eg = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0)),
    new THREE.LineBasicMaterial({ color: isSel ? SEL_EDGE : 0x8a94a0, transparent: true, opacity: isSel ? 0.9 : 0.35 }));
  eg.position.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
  if (opts.onPick) { eg.userData.ref = ref; opts.pickables.push(eg); }
  g.add(eg);
  return g;
}
function buildExtra(ex, ref, opts) {
  const g = new THREE.Group();
  const b = ex.box;
  const isSel = opts.sel && opts.sel.obj === ex;
  const col = plateColor(ex.t);
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0),
    new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: isSel ? 0.65 : 0.45, depthWrite: false }));
  m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  if (opts.onPick) { m.userData.ref = ref; opts.pickables.push(m); }
  g.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: isSel ? SEL_EDGE : WEAK_EDGE, transparent: true, opacity: 0.9 }));
  e.position.copy(m.position);
  g.add(e);
  if (opts.showLabels !== false) {
    const sp = makeLabel(`${ex.name} ${ex.t}`, '#ff8aff', 34);
    sp.position.set(m.position.x, b.y1 + 0.14, m.position.z);
    g.add(sp);
  }
  return g;
}

/* ── 乘员/模块球 ── */
function buildSphere(s, color, label, ref, opts) {
  const g = new THREE.Group();
  const isSel = opts.sel && opts.sel.obj === s;
  const m = new THREE.Mesh(new THREE.SphereGeometry(s.r, 14, 10),
    new THREE.MeshLambertMaterial({ color, transparent: true, opacity: isSel ? 0.65 : 0.45, depthWrite: false }));
  m.position.set(s.x, s.y, s.z);
  if (opts.onPick) { m.userData.ref = ref; opts.pickables.push(m); }
  g.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(s.r, 12, 8)),
    new THREE.LineBasicMaterial({ color: isSel ? SEL_EDGE : color }));
  e.position.copy(m.position);
  g.add(e);
  if (opts.showLabels !== false) {
    const sp = makeLabel(label, '#ffd894', 34);
    sp.position.set(s.x, s.y + s.r + 0.14, s.z);
    g.add(sp);
  }
  return g;
}

/**
 * 整套叠加层：armorModel（hull/turret 盒+板+附加盒） + internal（乘员/模块球）
 * opts: { sel, showLabels, onPick }；返回 { group, pickables }
 */
export function buildArmorOverlay(armorModel, internal, opts = {}) {
  const group = new THREE.Group();
  const pickables = [];
  const o = { ...opts, pickables };
  for (const partKey of ['hull', 'turret']) {
    const part = armorModel[partKey];
    const partLabel = partKey === 'hull' ? '车体判定盒' : '炮塔判定盒';
    group.add(buildBoxFrame(part.box, { kind: 'box', obj: part.box, label: partLabel, partKey }, o));
    (part.plates || []).forEach((p, pi) =>
      group.add(buildPlate(p, { kind: 'plate', obj: p, label: `${partLabel}·${FACE_NAMES[p.face] || '板'}`, partKey, index: pi }, o)));
    (part.extras || []).forEach((ex, ei) =>
      group.add(buildExtra(ex, { kind: 'extra', obj: ex, label: `${partLabel}·附加盒`, partKey, index: ei }, o)));
  }
  (internal.crew || []).forEach((c, i) =>
    group.add(buildSphere(c, 0xf0f0f0, c.name, { kind: 'crew', obj: c, label: `乘员·${c.name}`, index: i }, o)));
  for (const key in (internal.modules || {})) {
    internal.modules[key].forEach((s, i) =>
      group.add(buildSphere(s, MOD_COLORS[key] || 0xaaaaaa, MOD_NAMES[key] || key, { kind: 'module', obj: s, label: `模块·${MOD_NAMES[key] || key}`, modKey: key, index: i }, o)));
  }
  return { group, pickables };
}
