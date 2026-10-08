# -*- coding: utf-8 -*-
"""
2026-09-23 炮弹系统改造（史实化）一次性迁移脚本
- config.js：24 车 AP 穿深/衰减/备弹重标定（30° 口径基准，见 炮弹数据总表.md）
  + 新增每车 shellNameCn / apcrShell / heShellName / heVelocity / loadout 字段
  + SHELL_TYPES 新增 apcr 弹种；buildShellLoadout 支持逐车史实分配
- tank.js：shellPool 读 loadout；APCR 独立弹道；HE 初速逐炮族
- main.js：3 键切 APCR
- ai.js：AI 弹尽/无解时使用 APCR
- ui.js：弹药面板加 APCR 行 + 型号小字中文；悬停提示补 APCR；瞄准镜读数显示具体弹型
- css/style.css：弹药面板双行样式
所有替换均为精确锚点 + 次数断言，失败即整体报错退出（文件不落盘）。
"""
import re, sys, io

ROOT = r'C:\Users\CC\Desktop\ironWar-ww2'

# ───────────────────────── 每车数据（与 炮弹数据总表.md 一致） ─────────────────────────
# vel/pen/drop = AP 初速 / @0m穿深 / 每km衰减；curve = 注释用史实曲线
# apcr = (型号, 初速, pen@0m, drop, 注释) 或 None；he = (型号, 初速)；lo = (ap, apcr, he)；ammo = 新备弹(无则 None)
TANKS = {
 'tiger1':      dict(cn='被帽穿甲弹', vel=773,  pen=119, drop=0.15, curve='史实30° 110@500/99@1000/91@1500/83@2000',
                     apcr=('PzGr.40 APCR', 930, 171, 0.18, '156@500/110@2000'), he=('Sprgr.39', 810), lo=(46,3,43), ammo=None),
 'tiger2':      dict(cn='被帽穿甲弹', vel=1000, pen=203, drop=0.17, curve='史实30° 185@500/165@1000/148@1500/132@2000',
                     apcr=('PzGr.40/43 APCR', 1130, 238, 0.18, '217@500/153@2000'), he=('Sprgr.43', 810), lo=(40,4,42), ammo=86),
 'm4a3':        dict(cn='被帽穿甲弹', vel=792,  pen=105, drop=0.14, curve='史实30° 98@500/90@1000/83@1500/76@2000',
                     apcr=('M93 HVAP', 1036, 178, 0.22, '158@500/99@2000'), he=('M42A1', 820), lo=(35,5,31), ammo=None),
 'panther':     dict(cn='被帽穿甲弹', vel=935,  pen=136, drop=0.17, curve='史实30° 124@500/111@1000/99@1500/89@2000',
                     apcr=('PzGr.40/42 APCR', 1120, 197, 0.23, '174@500/106@2000'), he=('Sprgr.42', 700), lo=(39,3,37), ammo=None),
 'pz4g':        dict(cn='被帽穿甲弹', vel=750,  pen=107, drop=0.19, curve='史实30° 97@500/86@1000/76@1500/67@2000',
                     apcr=('PzGr.40 APCR', 930, 140, 0.29, '120@500/77@1500'), he=('Sprgr.34', 550), lo=(43,4,40), ammo=None),
 'pz4j':        dict(cn='被帽穿甲弹', vel=750,  pen=107, drop=0.19, curve='史实30° 97@500/86@1000/76@1500/67@2000',
                     apcr=('PzGr.40 APCR', 930, 140, 0.29, '120@500/77@1500'), he=('Sprgr.34', 550), lo=(43,4,40), ammo=None),
 'm10':         dict(cn='被帽穿甲弹', vel=792,  pen=105, drop=0.14, curve='史实30° 98@500/90@1000/83@1500/76@2000',
                     apcr=('M93 HVAP', 1036, 178, 0.22, '158@500/99@2000'), he=('M42A1', 820), lo=(28,4,22), ammo=None),
 'm26':         dict(cn='被帽穿甲弹', vel=853,  pen=137, drop=0.11, curve='M82 后期强装药 853m/s；史实30° 129@500/122@1000/114@1500/106@2000',
                     apcr=('M304 HVAP', 1021, 243, 0.18, '221@500/156@2000'), he=('M71', 810), lo=(35,5,30), ammo=None),
 'm18':         dict(cn='被帽穿甲弹', vel=792,  pen=105, drop=0.14, curve='史实30° 98@500/90@1000/83@1500/76@2000',
                     apcr=('M93 HVAP', 1036, 178, 0.22, '158@500/99@2000'), he=('M42A1', 820), lo=(22,4,19), ammo=None),
 'm36':         dict(cn='被帽穿甲弹', vel=853,  pen=137, drop=0.11, curve='M82 后期强装药 853m/s；史实30° 129@500/122@1000/114@1500/106@2000',
                     apcr=('M304 HVAP', 1021, 243, 0.18, '221@500/156@2000'), he=('M71', 810), lo=(25,4,18), ammo=None),
 'cromwell':    dict(cn='被帽穿甲弹', vel=620,  pen=71,  drop=0.15, curve='史实30° 66@500/60@1000/55@1500/50@2000',
                     apcr=None, he=('M48', 625), lo=(30,0,34), ammo=None),
 't34-85':      dict(cn='风帽穿甲弹', vel=792,  pen=112, drop=0.16, curve='史实30° 103@500/94@1000/86@1500/77@2000',
                     apcr=('BR-365P APCR', 1030, 132, 0.33, '110@500/45@2000'), he=('O-365K', 792), lo=(30,4,26), ammo=60),
 'kv1':         dict(cn='钝头穿甲弹', vel=662,  pen=61,  drop=0.17, curve='史实30° 56@500/50@1000/45@1500/40@2000',
                     apcr=('BR-354P APCR', 950, 112, 0.39, '90@500/24@2000'), he=('OF-350', 680), lo=(55,4,52), ammo=111),
 'is1':         dict(cn='风帽穿甲弹', vel=792,  pen=112, drop=0.16, curve='史实30° 103@500/94@1000/86@1500/77@2000',
                     apcr=('BR-365P APCR', 1030, 132, 0.33, '110@500/45@2000'), he=('O-365K', 785), lo=(29,4,26), ammo=None),
 'su100':       dict(cn='风帽穿甲弹', vel=895,  pen=147, drop=0.16, curve='30° 换算 ~135@500/~123@1000/~112@1500/~100@2000',
                     apcr=None, he=('UOF-412', 895), lo=(20,0,13), ammo=None),
 'su152':       dict(cn='穿甲弹',     vel=655,  pen=107, drop=0.14, curve='BR-540；30° 换算 ~100@500/~92@1000/~85@1500/~78@2000',
                     apcr=None, he=('OF-540', 655), lo=(4,0,16), ammo=20),
 'isu152':      dict(cn='穿甲弹',     vel=655,  pen=107, drop=0.14, curve='BR-540；30° 换算 ~100@500/~92@1000/~85@1500/~78@2000',
                     apcr=None, he=('OF-540', 655), lo=(4,0,17), ammo=None),
 'marder3m':    dict(cn='被帽穿甲弹', vel=790,  pen=107, drop=0.20, curve='PaK40 药筒；史实30° 96@500/85@1000/74@1500/64@2000',
                     apcr=('PzGr.40 APCR', 990, 140, 0.29, '120@500/77@1500'), he=('Sprgr.34', 550), lo=(15,3,9), ammo=27),
 'jpz4l70':     dict(cn='被帽穿甲弹', vel=925,  pen=136, drop=0.17, curve='史实30° 124@500/111@1000/99@1500/89@2000',
                     apcr=('PzGr.40/42 APCR', 1120, 197, 0.23, '174@500/106@2000'), he=('Sprgr.42', 700), lo=(30,3,22), ammo=None),
 'is2':         dict(cn='被帽穿甲弹', vel=795,  pen=135, drop=0.15, curve='BR-471B；30° 换算 ~125@500/~115@1000/~105@1500/~95@2000',
                     apcr=None, he=('OF-471', 800), lo=(12,0,16), ammo=None),
 'is2m':        dict(cn='被帽穿甲弹', vel=795,  pen=135, drop=0.15, curve='BR-471B；30° 换算 ~125@500/~115@1000/~105@1500/~95@2000',
                     apcr=None, he=('OF-471', 800), lo=(12,0,16), ammo=None),
 'ferdinand':   dict(cn='被帽穿甲弹', vel=1000, pen=203, drop=0.17, curve='史实30° 185@500/165@1000/148@1500/132@2000',
                     apcr=('PzGr.40/43 APCR', 1130, 238, 0.18, '217@500/153@2000'), he=('Sprgr.43', 810), lo=(26,2,22), ammo=None),
 'jagdpanther': dict(cn='被帽穿甲弹', vel=1000, pen=203, drop=0.17, curve='史实30° 185@500/165@1000/148@1500/132@2000',
                     apcr=('PzGr.40/43 APCR', 1130, 238, 0.18, '217@500/153@2000'), he=('Sprgr.43', 810), lo=(30,3,24), ammo=None),
 'jagdtiger':   dict(cn='被帽穿甲弹', vel=920,  pen=230, drop=0.13, curve='折中估值 215@500/200@1000/185@1500/170@2000（来源冲突）',
                     apcr=None, he=('Sprgr. L/5,0', 750), lo=(20,0,18), ammo=None),
}

def fail(msg):
    print('FAIL:', msg); sys.exit(1)

def sub_exact(text, old, new, cnt, where):
    n = text.count(old)
    if n != cnt: fail(f'{where}: 锚点命中 {n} 次（期望 {cnt}）')
    return text.replace(old, new)

# ───────────────────────── config.js ─────────────────────────
p = f'{ROOT}\\js\\config.js'
src = io.open(p, encoding='utf-8').read()

# SHELL_TYPES 新增 apcr（插在 he 之前）
old = "  he: {\n    key: 'he', name: 'HE', full: '榴弹', keyHint: '2',"
new = """  apcr: {
    key: 'apcr', name: 'APCR', full: '钨芯穿甲弹', keyHint: '3',
    penMult: 1.0,             // 穿深由 cfg.apcrShell.pen 直接给定（次口径弹弹道独立）
    penDropK: 1.0,
    ricochetAngle: 50,        // 钨芯弹更脆，跳弹角比全口径更严格
    cosFloor: 0.5,
    velMult: 1.0,             // 初速由 cfg.apcrShell.velocity 给定
    spallMult: 0.65,          // 无装药纯动能弹芯：后效明显弱于 APHE
    trackBreakK: 1.0,
  },
  he: {
    key: 'he', name: 'HE', full: '榴弹', keyHint: '2',"""
src = sub_exact(src, old, new, 1, 'config SHELL_TYPES.apcr')

# buildShellLoadout 支持逐车 loadout
old = """// 备弹拆分：AP / HE
export const AMMO_SPLIT = { ap: 0.65, he: 0.35 };
export function buildShellLoadout(total) {
  const ap = Math.max(2, Math.round(total * AMMO_SPLIT.ap));
  const he = Math.max(2, total - ap);
  return { ap, he };
}"""
new = """// 备弹拆分：优先读每车 cfg.loadout（史实分配，含 APCR）；缺省退化为 65/35 AP/HE
export const AMMO_SPLIT = { ap: 0.65, he: 0.35 };
export function buildShellLoadout(total, loadout = null) {
  if (loadout) return { ap: loadout.ap ?? 0, apcr: loadout.apcr ?? 0, he: loadout.he ?? 0 };
  const ap = Math.max(2, Math.round(total * AMMO_SPLIT.ap));
  const he = Math.max(2, total - ap);
  return { ap, apcr: 0, he };
}"""
src = sub_exact(src, old, new, 1, 'config buildShellLoadout')

# 逐车火力块重标定
for tid, d in TANKS.items():
    anchor = f"    id: '{tid}',"
    i = src.find(anchor)
    if i < 0: fail(f'{tid}: id 未找到')
    j = src.find("    id: '", i + len(anchor))
    block = src[i:j if j > 0 else len(src)]
    pat = re.compile(
        r"    shellName: '([^']+)',\n"
        r"    shellVelocity: [^\n]*\n"
        r"    shellPen: [^\n]*\n"
        r"    shellPenDrop: [^\n]*\n")
    m = pat.search(block)
    if not m: fail(f'{tid}: 火力块未匹配')
    shell_name = m.group(1)
    a, pc, h = d['lo']
    lines = [
        f"    shellName: '{shell_name}',",
        f"    shellNameCn: '{d['cn']}',",
        f"    shellVelocity: {d['vel']},",
        f"    shellPen: {d['pen']},               // mm RHA @0m（30° 口径基准：{d['curve']}）",
        f"    shellPenDrop: {d['drop']},          // 每千米穿深衰减比例",
    ]
    if d['apcr']:
        an, av, ap_, ad, anote = d['apcr']
        lines.append(f"    apcrShell: {{ name: '{an}', nameCn: '钨芯穿甲弹', velocity: {av}, pen: {ap_}, penDrop: {ad} }},  // 次口径钨芯弹（3 键；{anote}）")
    hn, hv = d['he']
    lines.append(f"    heShellName: '{hn}',")
    lines.append(f"    heVelocity: {hv},             // HE 初速逐炮族（史实 ≈AP 初速；弃用统一 0.72 系数）")
    lines.append(f"    loadout: {{ ap: {a}, apcr: {pc}, he: {h} }},   // 史实弹药分配")
    nb = block[:m.start()] + '\n'.join(lines) + '\n' + block[m.end():]
    if d['ammo'] is not None:
        am = re.search(r"    ammo: \{ shell: (\d+), mg:", nb)
        if not am: fail(f'{tid}: ammo 行未找到')
        if int(am.group(1)) == d['ammo']: fail(f'{tid}: ammo 已是 {d["ammo"]}？')
        nb = nb[:am.start()] + f'    ammo: {{ shell: {d["ammo"]}, mg:' + nb[am.end():]
    src = src[:i] + nb + src[(j if j > 0 else len(src)):]
    print(f'  config: {tid} ok（{shell_name} → pen {d["pen"]}/drop {d["drop"]}）')

io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('config.js written')

# ───────────────────────── tank.js ─────────────────────────
p = f'{ROOT}\\js\\tank.js'
src = io.open(p, encoding='utf-8').read()
src = sub_exact(src,
  'this.shellPool = buildShellLoadout(cfg.shellAmmoMax || 30);',
  'this.shellPool = buildShellLoadout(cfg.shellAmmoMax || 30, cfg.loadout);   // 史实逐车分配（含 APCR）',
  1, 'tank shellPool')
src = sub_exact(src,
  """  shellVelocityOf(type = this.shellType) {
    const hs = this.cfg.heShell;
    if (type === 'he' && hs && hs.velMult) return this.cfg.shellVelocity * hs.velMult;   // 大口径火炮 HE 初速随炮（docs/heavy-he-damage-plan.md）
    return this.cfg.shellVelocity * this.shellDef(type).velMult;
  }""",
  """  shellVelocityOf(type = this.shellType) {
    if (type === 'apcr') return (this.cfg.apcrShell && this.cfg.apcrShell.velocity) || this.cfg.shellVelocity;
    if (type === 'he' && this.cfg.heVelocity) return this.cfg.heVelocity;   // HE 初速逐炮族（史实 ≈AP；弃用统一 0.72）
    const hs = this.cfg.heShell;
    if (type === 'he' && hs && hs.velMult) return this.cfg.shellVelocity * hs.velMult;   // 大口径火炮 HE 初速随炮
    return this.cfg.shellVelocity * this.shellDef(type).velMult;
  }""",
  1, 'tank shellVelocityOf')
src = sub_exact(src,
  """      pen: this.cfg.shellPen * (hs && hs.penMult ? hs.penMult : def.penMult),
      penDrop: this.cfg.shellPenDrop * def.penDropK,""",
  """      pen: this.shellType === 'apcr' && this.cfg.apcrShell ? this.cfg.apcrShell.pen
        : this.cfg.shellPen * (hs && hs.penMult ? hs.penMult : def.penMult),
      penDrop: (this.shellType === 'apcr' && this.cfg.apcrShell ? this.cfg.apcrShell.penDrop
        : this.cfg.shellPenDrop) * def.penDropK,""",
  1, 'tank fire pen')
io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('tank.js written')

# ───────────────────────── main.js ─────────────────────────
p = f'{ROOT}\\js\\main.js'
src = io.open(p, encoding='utf-8').read()
src = sub_exact(src,
  "      if (this.state === 'battle' && code === 'Digit2') this._switchShellByCode('he');",
  "      if (this.state === 'battle' && code === 'Digit2') this._switchShellByCode('he');\n      if (this.state === 'battle' && code === 'Digit3') this._switchShellByCode('apcr');",
  1, 'main Digit3')
src = sub_exact(src,
  '// ── 切换弹种（1/2 键：AP/HE，重置装填） ──',
  '// ── 切换弹种（1/2/3 键：AP/HE/APCR，重置装填） ──',
  1, 'main comment')
io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('main.js written')

# ───────────────────────── ai.js ─────────────────────────
p = f'{ROOT}\\js\\ai.js'
src = io.open(p, encoding='utf-8').read()
src = sub_exact(src,
  "      const alt = ['ap', 'he'].find((k) => t.shellPool[k] > 0);",
  "      const alt = ['ap', 'apcr', 'he'].find((k) => t.shellPool[k] > 0);",
  1, 'ai alt')
src = sub_exact(src,
  """    const apPen = t.cfg.shellPen * (1 - t.cfg.shellPenDrop * dist / 1000);

    let want = 'ap';
    let needFlank = false;
    if (apPen < zone.armor * 1.05) {
      want = 'he'; needFlank = true;   // 正面无解：HE 断腿/伤观瞄压制 + 绕侧
    }""",
  """    const apPen = t.cfg.shellPen * (1 - t.cfg.shellPenDrop * dist / 1000);
    const ac = t.cfg.apcrShell;
    const apcrPen = (ac && t.shellPool.apcr > 0) ? ac.pen * (1 - ac.penDrop * dist / 1000) : 0;

    let want = 'ap';
    let needFlank = false;
    if (apPen < zone.armor * 1.05) {
      if (apcrPen >= zone.armor * 1.05) want = 'apcr';   // AP 无解但钨芯可穿：切 APCR（仅 2~6 发，省着用）
      else { want = 'he'; needFlank = true; }            // 正面无解：HE 断腿/伤观瞄压制 + 绕侧
    }""",
  1, 'ai apcr select')
io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('ai.js written')

# ───────────────────────── ui.js ─────────────────────────
p = f'{ROOT}\\js\\ui.js'
src = io.open(p, encoding='utf-8').read()

src = sub_exact(src,
  """    const mk = (key, label, clickable, max) => {
      const row = document.createElement('div');
      row.className = 'am-row' + (clickable ? '' : ' static');
      row.innerHTML = `<span class="am-k">${label}</span><span class="am-n"></span>`;
      panel.appendChild(row);
      this._ammoItems[key] = { root: row, num: row.querySelector('.am-n'), max };
      this._bindAmmoHover(row, tips[key]);
      if (clickable) row.addEventListener('click', () => this.onShellSelect && this.onShellSelect(key));
      this._setAmmo(key, key === 'mg' ? player.mgAmmo : player.shellPool[key]);
    };
    mk('ap', 'AP', true, player.shellPool.ap);
    mk('he', 'HE', true, player.shellPool.he);
    if (player.cfg.mg) mk('mg', 'MG', false, player.mgAmmoMax);   // 无机枪车（黄鼠狼）不显示 MG 芯片""",
  """    const mk = (key, label, clickable, max, sub) => {
      const row = document.createElement('div');
      row.className = 'am-row' + (clickable ? '' : ' static');
      row.innerHTML = `<div class="am-main"><span class="am-k">${label}</span><span class="am-n"></span></div>`
        + (sub ? `<div class="am-sub">${sub}</div>` : '');
      panel.appendChild(row);
      this._ammoItems[key] = { root: row, num: row.querySelector('.am-n'), max };
      this._bindAmmoHover(row, tips[key]);
      if (clickable) row.addEventListener('click', () => this.onShellSelect && this.onShellSelect(key));
      this._setAmmo(key, key === 'mg' ? player.mgAmmo : player.shellPool[key]);
    };
    const c = player.cfg;
    mk('ap', 'AP', true, player.shellPool.ap, `${c.shellName} · ${c.shellNameCn || '穿甲弹'}`);
    if (c.apcrShell && player.shellPool.apcr > 0) mk('apcr', 'APCR', true, player.shellPool.apcr, `${c.apcrShell.name} · 钨芯穿甲弹`);
    mk('he', 'HE', true, player.shellPool.he, `${c.heShellName || 'HE'} · 高爆榴弹`);
    if (player.cfg.mg) mk('mg', 'MG', false, player.mgAmmoMax);   // 无机枪车（黄鼠狼）不显示 MG 芯片""",
  1, 'ui buildAmmoPanel')

src = sub_exact(src,
  """    const pen = (k) => Math.round(cfg.shellPen * SHELL_TYPES[k].penMult);
    const vel = (k) => Math.round(cfg.shellVelocity * SHELL_TYPES[k].velMult);""",
  """    const pen = (k) => k === 'apcr' && cfg.apcrShell ? cfg.apcrShell.pen : Math.round(cfg.shellPen * SHELL_TYPES[k].penMult);
    const vel = (k) => k === 'apcr' && cfg.apcrShell ? cfg.apcrShell.velocity
      : (k === 'he' && cfg.heVelocity ? cfg.heVelocity : Math.round(cfg.shellVelocity * SHELL_TYPES[k].velMult));""",
  1, 'ui tips pen/vel')

src = sub_exact(src,
  "      he: `<div class=\"tip-title\"><b>HE</b> · 榴弹（高爆）${heP > 1 ? ' · 大口径' : ''}</div>`",
  """      apcr: cfg.apcrShell ? `<div class="tip-title"><b>APCR</b> · ${cfg.apcrShell.name}（钨芯穿甲弹）</div>`
        + `<div class="tip-row"><span>穿深</span><b>${pen('apcr')} mm @0m · 每千米 -${Math.round(cfg.apcrShell.penDrop * 100)}%</b></div>`
        + `<div class="tip-row"><span>弹速</span><b>${vel('apcr')} m/s · 弹道平直</b></div>`
        + `<div class="tip-row"><span>跳弹角</span><b>50° · 比 AP 更易跳弹</b></div>`
        + `<div class="tip-row"><span>后效</span><b>无装药 · 击穿仅靠弹芯与破片，毁伤弱于 AP</b></div>`
        + `<div class="tip-note">钨芯次口径弹：穿深高、弹速快，但数量稀少（仅 ${player.shellPool.apcr} 发）、后效弱、远距衰减快。留给 AP 啃不动的重甲目标。点击或按 3 键切换。</div>` : '',
      he: `<div class="tip-title"><b>HE</b> · ${cfg.heShellName || '榴弹'}（高爆）${heP > 1 ? ' · 大口径' : ''}</div>`""",
  1, 'ui tips apcr')

src = sub_exact(src,
  "    for (const k of ['ap', 'he']) {",
  "    for (const k of ['ap', 'apcr', 'he']) {",
  1, 'ui updateHUD loop')

src = sub_exact(src,
  "      const shellName = def.key === 'ap' && player.cfg.shellName ? player.cfg.shellName : `${def.full} ${def.name}`;",
  """      const shellName = def.key === 'ap' && player.cfg.shellName ? player.cfg.shellName
        : def.key === 'apcr' && player.cfg.apcrShell ? player.cfg.apcrShell.name
        : `${def.full} ${def.name}`;""",
  1, 'ui scope shellName')

io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('ui.js written')

# ───────────────────────── css/style.css ─────────────────────────
p = f'{ROOT}\\css\\style.css'
src = io.open(p, encoding='utf-8').read()
src = sub_exact(src,
  """.am-row { display: flex; align-items: baseline; gap: 10px; padding-left: 9px;
  border-left: 2px solid transparent; cursor: pointer;
  transition: opacity .15s, border-color .15s; }""",
  """.am-row { display: flex; flex-direction: column; gap: 2px; padding-left: 9px;
  border-left: 2px solid transparent; cursor: pointer;
  transition: opacity .15s, border-color .15s; }
.am-main { display: flex; align-items: baseline; gap: 10px; }
.am-sub { font-size: 9px; font-weight: 400; letter-spacing: 1px; line-height: 1.2;
  color: rgba(255,255,255,.26); text-shadow: 0 1px 3px rgba(0,0,0,.85);
  white-space: nowrap; transition: color .15s; }
.am-row.active .am-sub { color: rgba(255,255,255,.6); }
.am-row:not(.static):hover .am-sub { color: rgba(255,255,255,.5); }""",
  1, 'css am-row')
src = sub_exact(src, '.am-k { min-width: 26px;', '.am-k { min-width: 40px;', 1, 'css am-k width')
io.open(p, 'w', encoding='utf-8', newline='').write(src)
print('style.css written')

print('ALL OK')
