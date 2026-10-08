// ═══ UI：屏幕切换 / HUD / 缩圈准星 / 狙击镜 / 小地图 / 敌标 / 乘员·模块状态 ═══
import * as THREE from 'three';
import { Minimap } from './minimap.js';
import { getTankDisplay } from './tank-display.js';
import { SHELL_TYPES, CAMERA, TERRAIN_RULES, TANKS, GAME } from './config.js';
import { MAPS } from './maps.js';
import { RETICLES } from './reticles.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

// 国旗资源（cfg.nation → flags/ 目录）
const FLAG_BY_NATION = { de: 'flags/de.png', us: 'flags/us.png', ru: 'flags/ru.png', uk: 'flags/gb.png' };

// 阵营划分（与 main.js _startBattle 同口径）
const FACTION = { de: 'axis', us: 'allies', uk: 'allies', ru: 'allies' };

// 乘员/模块显示名与图标
const CREW_META = [
  ['commander', '车长'], ['gunner', '炮手'], ['loader', '装填'], ['driver', '驾驶'], ['radio', '通讯'],
];
const MODULE_META = [
  ['engine', '发动机'], ['breech', '炮闩'], ['turretDrive', '方向机'],
  ['optics', '观瞄'], ['ammoRacks', '弹药架'], ['fuel', '油箱'],
];

export class UI {
  constructor() {
    this.screens = {
      cover: $('screen-cover'), menu: $('screen-menu'), hangar: $('screen-hangar'),
      hud: $('hud'), result: $('screen-result'), pause: $('screen-pause'),
    };
    this.hpLabel = $('hp-label');
    this.speedVal = $('speed-val'); this.speedFill = $('speed-fill'); this.gear = $('gear-val');
    this.crosshair = $('crosshair');
    this.aimInfo = $('aim-info');
    this.aimRange = $('aim-range'); this.aimTarget = $('aim-target');
    this.aimProgress = $('aim-progress');
    // 缩圈刻度环：12 根径向短刻线（表盘式，指向圆心），颜色由 CSS 按 .aimed 切换（第三人称 + 镜内同款）
    const tickHTML = (() => {
      let s = '';
      for (let i = 0; i < 12; i++) {
        const a = i * 30 * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
        s += `<line x1="${(50 + c * 36.5).toFixed(2)}" y1="${(50 + sn * 36.5).toFixed(2)}" x2="${(50 + c * 48).toFixed(2)}" y2="${(50 + sn * 48).toFixed(2)}"/>`;
      }
      return s;
    })();
    const chTicks = $('ch-ticks');
    if (chTicks) chTicks.innerHTML = tickHTML;
    const gsDispTicks = $('gs-disp-ticks');
    if (gsDispTicks) gsDispTicks.innerHTML = tickHTML;
    // 装填指示：镜内圆环（刻度环左侧）+ 第三人称底部横条
    this.rrRoot = $('reload-ring');
    this.rrFill = document.querySelector('#reload-ring .rr-fill');
    this.rrText = $('rr-sec');
    this.btBarFill = document.querySelector('#reload-bar-bottom i');
    this.btBarLabel = $('rl-bottom-label');
    this._rrTxt = ''; this._btTxt = '';
    // 炮口指示器（第三人称，炮管实际指向）
    this.gunMarkerEl = $('gun-marker');
    // 车姿显示器（战雷式：炮塔朝上、车体按炮塔-车体相对角旋转；受击 hull-local 短暂标记）
    this.attRoot = $('attitude');
    if (this.attRoot) this._buildAttitude();
    this.hitMarkerEl = $('hit-marker');
    this.penMarkerEl = $('pen-marker');
    this.vignette = $('damage-vignette');
    this.dmgIndicator = $('damage-indicator');
    this.enemiesLeft = $('enemies-left');
    this.timeCounter = $('time-counter');
    this.timeLeft = $('time-left');
    this._timeKey = '';
    this.battleMsg = $('battle-message');
    this.statusTags = $('status-tags');
    this.crewPanel = $('crew-panel');
    this.modChips = $('mod-chips');
    this._chipKey = '';
    this._crewKey = '';
    this.gunsight = $('gunsight');
    this.gsShell = $('gs-shell'); this.gsReload = $('gs-reload'); this.gsZoom = $('gs-zoom');
    this.gsRange = $('gs-range'); this.gsTarget = $('gs-target');
    this.gsDisp = $('gs-disp');
    this.gsFlash = $('gs-flash');
    this.markersLayer = $('markers');
    this.markers = new Map();
    this.csTicks = $('csTicks');
    this.compassDeg = $('compassDeg');
    this.hitlogEl = $('hitlog');
    // 机库/切车载入浮标
    this.hangarLoading = $('hangar-loading');
    this.hangarLoadingText = $('hangar-loading-text');
    this.hangarLoadingBar = document.querySelector('#hangar-loading .hl-bar');
    this.hangarLoadingFill = $('hangar-loading-fill');
    this.minimap = null;
    this._cam = null;
    this._scoped = false;
    this.settings = this._loadSettings();
    this.buildReticle('de2');
    this._buildCompassTicks();
    this.selectedTank = 'tiger1';

    // 弹药面板
    this._ammoItems = {};

    // 机库敌方编队编辑器：数量步进（1 ~ GAME.maxEnemies）+ 逐槽选车型（列表由 TANKS 动态生成，新车自动出现）
    $('fh-enemy-minus').addEventListener('click', () => this._stepEnemyCount(-1));
    $('fh-enemy-plus').addEventListener('click', () => this._stepEnemyCount(1));
    this._rebuildEnemySlots();
    // 固定阵营开关（默认开）：敌人只从敌对阵营抽取
    const facBtn = $('fh-faction-lock');
    if (facBtn) {
      facBtn.classList.toggle('active', this.settings.factionLock !== false);
      facBtn.textContent = this.settings.factionLock !== false ? '同盟 ↔ 轴心' : '混编（同阵营可出现）';
      facBtn.addEventListener('click', () => {
        this.settings.factionLock = this.settings.factionLock === false;
        facBtn.classList.toggle('active', this.settings.factionLock !== false);
        facBtn.textContent = this.settings.factionLock !== false ? '同盟 ↔ 轴心' : '混编（同阵营可出现）';
        this._refreshEnemySlotOptions();
        this.saveSettings();
        this._refreshPreview();
      });
    }
    // 地图选择（下拉列表）：战斗开始时按 settings.mapId 重建世界
    const mapSel = $('fh-map-select');
    if (mapSel) {
      mapSel.value = this.settings.mapId || 'kursk';
      if (!mapSel.value) { mapSel.value = 'kursk'; this.settings.mapId = 'kursk'; }   // 存档 mapId 不在列表中（如已注释的图）→ 回退
      mapSel.addEventListener('change', () => {
        this.settings.mapId = mapSel.value;
        this.saveSettings();
        this._refreshPreview();
      });
    }
    // AI 难度（机库页直选，与主菜单「游戏设置」同一 settings.difficulty）
    document.querySelectorAll('#fh-diff-row .fh-diff-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.diff === (this.settings.difficulty || 'standard'));
      btn.addEventListener('click', () => {
        document.querySelectorAll('#fh-diff-row .fh-diff-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.difficulty = btn.dataset.diff;
        this.saveSettings();
      });
    });
  }

  get aiDifficulty() { return this.settings.difficulty || 'standard'; }

  initMinimap(world) {
    this.minimap = new Minimap($('minimap'), world);
    this.minimap.prerender();
  }

  // ─────────── 设置 ───────────
  _loadSettings() {
    const def = { master: 80, sfx: 90, ambient: 60, quality: 'high', bgmOn: true, bgmVol: 50,
      bgmMode: 'normal', difficulty: 'standard', enemyCount: 1, factionLock: true, mapId: 'kursk' };
    let s;
    try {
      s = { ...def, ...JSON.parse(localStorage.getItem('ironwar3_settings') || '{}') };
    } catch (e) { s = { ...def }; }
    // 敌方编队槽位：'random' 或 TANKS 键，长度即敌方数量；旧存档无此字段时按 enemyCount 补全
    if (!Array.isArray(s.enemyTanks) || !s.enemyTanks.length)
      s.enemyTanks = Array(Math.min(Math.max(s.enemyCount || 1, 1), GAME.maxEnemies)).fill('random');
    s.enemyTanks.length = Math.min(s.enemyTanks.length, GAME.maxEnemies);
    s.enemyCount = s.enemyTanks.length;
    return s;
  }
  saveSettings() { localStorage.setItem('ironwar3_settings', JSON.stringify(this.settings)); }

  // ─────────── 机库敌方编队编辑器 ───────────
  _enemySlots() { return this.settings.enemyTanks; }

  _stepEnemyCount(d) {
    const slots = this._enemySlots();
    const n = Math.min(Math.max(slots.length + d, 1), GAME.maxEnemies);
    if (n === slots.length) return;
    slots.length = n;
    for (let i = 0; i < n; i++) if (!slots[i]) slots[i] = 'random';
    this.settings.enemyCount = n;   // 与槽位数保持一致（兼容字段）
    this.saveSettings();
    this._rebuildEnemySlots();
    this._refreshPreview();
  }

  _rebuildEnemySlots() {
    const list = $('fh-enemy-list');
    const cnt = $('fh-enemy-count');
    const slots = this._enemySlots();
    if (cnt) cnt.textContent = `${slots.length} 辆`;
    if (!list) return;
    list.innerHTML = '';
    slots.forEach((key, i) => {
      const row = document.createElement('div');
      row.className = 'fh-enemy-slot';
      const no = document.createElement('span');
      no.className = 'fh-es-no';
      no.textContent = `敌车 ${i + 1}`;
      const sel = document.createElement('select');
      sel.className = 'fh-es-select';
      sel.addEventListener('change', () => {
        slots[i] = sel.value;
        this.saveSettings();
        this._refreshPreview();
      });
      row.append(no, sel);
      list.append(row);
    });
    this._refreshEnemySlotOptions();
  }

  // 槽位下拉选项：固定阵营开启时只列敌对阵营车型（玩家换车/切阵营后重刷）；失效选择回退「随机」
  _refreshEnemySlotOptions() {
    const list = $('fh-enemy-list');
    if (!list) return;
    const slots = this._enemySlots();
    const lock = this.settings.factionLock !== false;
    const playerFac = FACTION[(TANKS[this.selectedTank] || {}).nation];
    const keys = Object.keys(TANKS).filter((k) =>
      !lock || !playerFac || (FACTION[TANKS[k].nation] && FACTION[TANKS[k].nation] !== playerFac));
    let changed = false;
    list.querySelectorAll('.fh-es-select').forEach((sel, i) => {
      let v = slots[i] || 'random';
      if (v !== 'random' && !keys.includes(v)) { v = 'random'; slots[i] = v; changed = true; }
      sel.innerHTML = '<option value="random">随机</option>' +
        keys.map((k) => `<option value="${k}">${TANKS[k].name}</option>`).join('');
      sel.value = v;
    });
    if (changed) this.saveSettings();
  }

  show(name) {
    for (const k in this.screens) this.screens[k].classList.toggle('active', k === name);
    if (name === 'hud') this.screens.hud.classList.add('active');
  }

  bind(handlers) {
    $('screen-cover').addEventListener('click', () => handlers.onCoverClick());
    $('btn-hunt-mode').addEventListener('click', () => handlers.onHuntMode());
    // 游戏设置弹窗
    $('btn-settings-game').addEventListener('click', () => { this._syncGameUI(); $('modal-game').classList.add('active'); });
    $('btn-game-close').addEventListener('click', () => {
      $('modal-game').classList.remove('active');
      this._readGameUI();
      this.saveSettings();
      handlers.onSettingsChanged(this.settings);
    });
    // 声音设置弹窗
    $('btn-settings-audio').addEventListener('click', () => { this._syncAudioUI(); $('modal-audio').classList.add('active'); });
    $('btn-audio-close').addEventListener('click', () => {
      $('modal-audio').classList.remove('active');
      this._readAudioUI();
      this.saveSettings();
      handlers.onSettingsChanged(this.settings);
    });
    // 机库页交互（翻页/开始/返回）
    document.querySelectorAll('#screen-hangar [data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const a = btn.dataset.action;
        if (a === 'prev') { handlers.onHangarPrev && handlers.onHangarPrev(); }
        else if (a === 'next') { handlers.onHangarNext && handlers.onHangarNext(); }
        else if (a === 'start') { handlers.onStartBattle && handlers.onStartBattle(); }
        else if (a === 'back') { handlers.onBackMenu && handlers.onBackMenu(); }
      });
    });
    $('btn-result-menu').addEventListener('click', () => handlers.onResultMenu());
    $('btn-result-retry').addEventListener('click', () => handlers.onRetry());
    $('btn-pause-resume').addEventListener('click', () => handlers.onPauseResume && handlers.onPauseResume());
    $('btn-pause-menu').addEventListener('click', () => handlers.onPauseMenu && handlers.onPauseMenu());

    // 机库坦克下拉选择器（阵营/国家 → 坦克 两级；车库车辆增多后的直选入口）
    this._tankSelHandlers = handlers;
    this._initTankSelector();
  }

  // 两级下拉：国家列表按 TANKS 顺序去重生成；坦克列表随国家过滤
  _initTankSelector() {
    const selN = $('fh-sel-nation'), selT = $('fh-sel-tank');
    if (!selN || !selT) return;
    const NATIONS = { de: '德国', us: '美国', uk: '英国', ru: '苏联' };
    const order = [];
    for (const id in TANKS) {
      const n = TANKS[id].nation;
      if (!order.includes(n)) order.push(n);
    }
    selN.innerHTML = order.map(n => `<option value="${n}">${NATIONS[n] || n}</option>`).join('');
    const fillTanks = (nation) => {
      const ids = Object.keys(TANKS).filter(id => TANKS[id].nation === nation);
      selT.innerHTML = ids.map(id => `<option value="${id}">${TANKS[id].name}</option>`).join('');
      return ids;
    };
    selN.addEventListener('change', () => {
      const ids = fillTanks(selN.value);
      // 国家切换后选该国第一辆（若当前车不在该国）
      if (!ids.includes(this.selectedTank) && ids.length && this._tankSelHandlers && this._tankSelHandlers.onHangarSelect) {
        this._tankSelHandlers.onHangarSelect(ids[0]);
      } else {
        selT.value = this.selectedTank;
      }
    });
    selT.addEventListener('change', () => {
      if (this._tankSelHandlers && this._tankSelHandlers.onHangarSelect) this._tankSelHandlers.onHangarSelect(selT.value);
    });
    this._fillTankSelect = fillTanks;
    // 初始同步
    const curNation = (TANKS[this.selectedTank] || {}).nation || order[0];
    selN.value = curNation;
    fillTanks(curNation);
    selT.value = this.selectedTank;
  }

  // 外部切车（翻页/代码调用）时同步下拉显示
  _syncTankSelector() {
    const selN = $('fh-sel-nation'), selT = $('fh-sel-tank');
    if (!selN || !selT || !this._fillTankSelect) return;
    const nation = (TANKS[this.selectedTank] || {}).nation;
    if (selN.value !== nation) {
      selN.value = nation;
      this._fillTankSelect(nation);
    }
    selT.value = this.selectedTank;
  }

  // 机库页信息面板刷新
  refreshHangar(tankId, cfg) {
    this.selectedTank = tankId;
    const d = getTankDisplay(tankId);
    const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
    set('fh-pager-name', cfg.name);
    const flag = $('fh-ac-flag');
    if (flag) {
      const src = FLAG_BY_NATION[cfg.nation] || '';
      if (flag.getAttribute('src') !== src) flag.setAttribute('src', src);
      flag.style.display = src ? '' : 'none';
      flag.alt = d ? d.nation : cfg.name;
    }
    if (d) {
      set('fh-ac-name', cfg.name);
      set('fh-ac-sub', `${d.subtitle} · ${d.nation}`);
      set('fh-ac-history', d.history || '');
      this._refreshSpecRows(d, cfg);
      this._refreshGameBars(d);
    }
    this._refreshEnemySlotOptions();   // 玩家换车可能改变阵营过滤
    this._refreshPreview();
    this._syncTankSelector();
  }

  // 性能参数行（6 行实车参数 + 瞄具 + 稳定仪）
  _refreshSpecRows(d, cfg) {
    const box = $('fh-real-spec');
    if (!box) return;
    if (!this._specRows) {
      box.innerHTML = '';
      this._specRows = [];
      for (let i = 0; i < 8; i++) {
        const row = document.createElement('div');
        row.className = 'fh-spec-row';
        const sk = document.createElement('span'); sk.className = 'fh-sk';
        const sv = document.createElement('span'); sv.className = 'fh-sv';
        row.append(sk, sv);
        box.appendChild(row);
        this._specRows.push(row);
      }
    }
    const rows = d.realSpec || [];
    for (let i = 0; i < 6; i++) {
      const row = this._specRows[i];
      if (i < rows.length) {
        row.style.display = '';
        if (row.children[0].textContent !== rows[i][0]) row.children[0].textContent = rows[i][0];
        if (row.children[1].textContent !== rows[i][1]) row.children[1].textContent = rows[i][1];
      } else row.style.display = 'none';
    }
    const fixed = [
      ['瞄具', d.sight || '直视瞄准镜'],
      ['稳定仪', cfg.gyroStab ? '垂向陀螺稳定' : '无'],
    ];
    for (let i = 0; i < 2; i++) {
      const row = this._specRows[6 + i];
      row.style.display = '';
      if (row.children[0].textContent !== fixed[i][0]) row.children[0].textContent = fixed[i][0];
      if (row.children[1].textContent !== fixed[i][1]) row.children[1].textContent = fixed[i][1];
    }
  }

  // 游戏属性条
  _refreshGameBars(d) {
    const box = $('fh-game-bars');
    if (!box || !d.gameBars) return;
    if (!this._barRows) {
      box.innerHTML = '';
      this._barRows = [];
      for (let i = 0; i < d.gameBars.length; i++) {
        const row = document.createElement('div');
        row.className = 'fh-bar-row';
        const label = document.createElement('span'); label.className = 'fh-bar-label';
        const track = document.createElement('div'); track.className = 'fh-bar-track';
        const fill = document.createElement('div'); fill.className = 'fh-bar-fill';
        track.appendChild(fill);
        row.append(label, track);
        box.appendChild(row);
        this._barRows.push({ label, fill });
      }
    }
    d.gameBars.forEach(([k, v], i) => {
      const bar = this._barRows[i];
      if (!bar) return;
      if (bar.label.textContent !== k) bar.label.textContent = k;
      const pct = `${(v / 5) * 100}%`;
      if (bar.fill.style.width !== pct) bar.fill.style.width = pct;
    });
  }

  // 机库右下预览文案（只留模式/地图，其余信息给下方编队面板让位）
  _refreshPreview() {
    const preview = $('fh-preview-text');
    if (!preview) return;
    const n = this._enemySlots().length;
    const mapId = this.settings.mapId || 'kursk';
    const mapDef = MAPS[mapId] || MAPS.kursk;
    const terrLabel = TERRAIN_RULES[mapDef.terrain] ? TERRAIN_RULES[mapDef.terrain].label : '';
    const mapName = mapDef.name + (terrLabel ? ' · ' + terrLabel : '');
    const html = `<div class="fh-pv-row"><span>模式</span><b>猎杀模式 1v${n}</b></div>
      <div class="fh-pv-row"><span>地图</span><b>${mapName}</b></div>`;
    if (html !== this._lastPreviewHtml) { this._lastPreviewHtml = html; preview.innerHTML = html; }
  }

  // ── 游戏设置弹窗 ──
  _syncGameUI() {
    $('set-difficulty').value = this.settings.difficulty || 'standard';
    $('set-quality').value = this.settings.quality;
    $('set-bgm-mode').value = this.settings.bgmMode || 'normal';
  }
  _readGameUI() {
    this.settings.difficulty = $('set-difficulty').value;
    this.settings.quality = $('set-quality').value;
    this.settings.bgmMode = $('set-bgm-mode').value;
  }
  // ── 声音设置弹窗 ──
  _syncAudioUI() {
    $('set-master').value = this.settings.master; $('val-master').textContent = this.settings.master;
    $('set-sfx').value = this.settings.sfx; $('val-sfx').textContent = this.settings.sfx;
    $('set-ambient').value = this.settings.ambient; $('val-ambient').textContent = this.settings.ambient;
    const tog = $('set-bgm-toggle');
    tog.classList.toggle('on', this.settings.bgmOn !== false);
    tog.textContent = this.settings.bgmOn !== false ? '开' : '关';
    tog.onclick = () => {
      this.settings.bgmOn = this.settings.bgmOn === false;
      tog.classList.toggle('on', this.settings.bgmOn);
      tog.textContent = this.settings.bgmOn ? '开' : '关';
    };
    $('set-bgm').value = this.settings.bgmVol ?? 50; $('val-bgm').textContent = this.settings.bgmVol ?? 50;
    for (const k of ['master', 'sfx', 'ambient', 'bgm']) {
      $(`set-${k}`).oninput = (e) => { $(`val-${k}`).textContent = e.target.value; };
    }
  }
  _readAudioUI() {
    this.settings.master = +$('set-master').value;
    this.settings.sfx = +$('set-sfx').value;
    this.settings.ambient = +$('set-ambient').value;
    this.settings.bgmVol = +$('set-bgm').value;
  }

  setLoadProgress(f) { $('load-fill').style.width = `${Math.round(f * 100)}%`; }
  loadDone() { $('loading-overlay').classList.add('done'); }

  // ─────────── 狙击镜分划（史实瞄具：de2=TZF9 / us2=M82 / su2=TSh-16） ───────────
  buildReticle(style) {
    const key = RETICLES[style] ? style : 'de2';
    if (key === this._reticleKey) return;
    this._reticleKey = key;
    const grp = $('gs-reticle');
    if (!grp) return;
    grp.setAttribute('class', `gs-ret gs-ret-${key}`);
    grp.innerHTML = RETICLES[key]();
    // 视场适配：de2 系刻度鼓 meet + 1.25 放大（圆形视野缩到略大于屏高——比 slice 满屏小、又不缩到全圆）；
    // 静态分划 meet 完整显示圆形视野
    $('gs-svg').setAttribute('preserveAspectRatio', 'xMidYMid meet');
    $('gs-fit').setAttribute('transform', key.startsWith('de2') ? 'translate(500 500) scale(1.25) translate(-500 -500)' : '');
  }

  // ─────────── 罗盘刻度带（静态生成一次） ───────────
  _buildCompassTicks() {
    const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const PX = 2;
    const frag = document.createDocumentFragment();
    for (let d = -180; d <= 540; d += 15) {
      const dd = ((d % 360) + 360) % 360;
      const x = (d + 180) * PX;
      const major = d % 45 === 0;
      const tick = document.createElement('div');
      tick.className = 'cs-tick' + (major ? ' major' : '');
      tick.style.left = `${x}px`;
      frag.appendChild(tick);
      if (major || d % 30 === 0) {
        const lb = document.createElement('div');
        lb.className = 'cs-label' + (major ? '' : ' num');
        lb.style.left = `${x}px`;
        lb.textContent = major ? NAMES[dd] : String(dd).padStart(3, '0');
        frag.appendChild(lb);
      }
    }
    this.csTicks.appendChild(frag);
  }

  setScope(on) {
    if (this._scoped === on) return;
    this._scoped = on;
    this.gunsight.classList.toggle('hidden', !on);
    this.crosshair.style.display = on ? 'none' : '';
    // 开镜时隐藏第三人称的底部装填横条（镜内由 #reload-ring 圆环承担装填指示）
    const bt = document.getElementById('reload-wrap-bottom');
    if (bt) bt.style.display = on ? 'none' : '';
  }

  // 车长望远镜（Q）：双圆视图覆盖层；与瞄准镜互斥（main 保证）
  setBinoc(on) {
    if (this._binoc === on) return;
    this._binoc = on;
    const b = $('binoculars');
    if (b) b.classList.toggle('hidden', !on);
    // 望远镜中隐藏准星/炮口指示圈（纯观察，不开炮）
    this.crosshair.style.display = on ? 'none' : (this._scoped ? 'none' : '');
    if (on && this.gunMarkerEl) this.gunMarkerEl.style.display = 'none';
    const bt = document.getElementById('reload-wrap-bottom');
    if (bt && on) bt.style.display = 'none';
    else if (bt && !on && !this._scoped) bt.style.display = '';
  }
  setBinoMag(m) {
    const el = $('bino-mag');
    if (el) el.textContent = `${m}×`;
  }

  // ─────────── 弹药面板（极简：字母+数字；AP/HE 点击切弹，MG 共用弹链） ───────────
  buildAmmoPanel(player) {
    const panel = document.getElementById('ammo-panel');
    if (!panel) return;
    panel.innerHTML = '';
    if (this._ammoTip) this._ammoTip.style.display = 'none';
    this._ammoItems = {};
    const tips = this._ammoTips(player);
    const mk = (key, label, clickable, max, sub) => {
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
    if (player.cfg.mg) mk('mg', 'MG', false, player.mgAmmoMax);   // 无机枪车（黄鼠狼）不显示 MG 芯片
  }

  // 弹种详细介绍（悬停提示）
  _ammoTips(player) {
    const cfg = player.cfg;
    const pen = (k) => k === 'apcr' && cfg.apcrShell ? cfg.apcrShell.pen : Math.round(cfg.shellPen * SHELL_TYPES[k].penMult);
    const vel = (k) => k === 'apcr' && cfg.apcrShell ? cfg.apcrShell.velocity
      : (k === 'he' && cfg.heVelocity ? cfg.heVelocity : Math.round(cfg.shellVelocity * SHELL_TYPES[k].velMult));
    const drop = Math.round(cfg.shellPenDrop * 100);
    const heP = (cfg.heShell && cfg.heShell.power) || 1;
    const thin = Math.round(30 + (heP - 1) * 27);
    return {
      ap: `<div class="tip-title"><b>AP</b> · ${cfg.shellName}</div>`
        + `<div class="tip-row"><span>穿深</span><b>${pen('ap')} mm @0m · 每千米 -${drop}%</b></div>`
        + `<div class="tip-row"><span>弹速</span><b>${vel('ap')} m/s</b></div>`
        + `<div class="tip-row"><span>后效</span><b>带装药 · 击穿后破片锥+爆轰杀伤乘员</b></div>`
        + `<div class="tip-row"><span>跳弹角</span><b>55° · 大入射角易跳弹</b></div>`
        + `<div class="tip-note">被帽穿甲弹：主力反装甲弹种。击穿后弹芯+破片+装药爆轰毁伤车内乘员与模块，命中弹药架可殉爆。优先打车体侧面与炮塔。点击或按 1 键切换。</div>`,
      apcr: cfg.apcrShell ? `<div class="tip-title"><b>APCR</b> · ${cfg.apcrShell.name}（钨芯穿甲弹）</div>`
        + `<div class="tip-row"><span>穿深</span><b>${pen('apcr')} mm @0m · 每千米 -${Math.round(cfg.apcrShell.penDrop * 100)}%</b></div>`
        + `<div class="tip-row"><span>弹速</span><b>${vel('apcr')} m/s · 弹道平直</b></div>`
        + `<div class="tip-row"><span>跳弹角</span><b>50° · 比 AP 更易跳弹</b></div>`
        + `<div class="tip-row"><span>后效</span><b>无装药 · 击穿仅靠弹芯与破片，毁伤弱于 AP</b></div>`
        + `<div class="tip-note">钨芯次口径弹：穿深高、弹速快，但数量稀少（仅 ${player.shellPool.apcr} 发）、后效弱、远距衰减快。留给 AP 啃不动的重甲目标。点击或按 3 键切换。</div>` : '',
      he: `<div class="tip-title"><b>HE</b> · ${cfg.heShellName || '榴弹'}（高爆）${heP > 1 ? ' · 大口径' : ''}</div>`
        + `<div class="tip-row"><span>穿深</span><b>${pen('he')} mm · 永不跳弹</b></div>`
        + `<div class="tip-row"><span>弹速</span><b>${vel('he')} m/s</b></div>`
        + `<div class="tip-row"><span>外部毁伤</span><b>断履带 · 伤观瞄 · 损炮闩</b></div>`
        + `<div class="tip-row"><span>薄甲</span><b>≤${thin}mm 面可震伤舱内乘员</b></div>`
        + (heP > 1
          ? `<div class="tip-row"><span>大口径爆轰</span><b>威力 ×${heP.toFixed(1)} · 近失弹 ${cfg.heShell.nearMissR || 0}m 内震伤/断带</b></div>`
          : '')
        + `<div class="tip-note">爆破榴弹：穿不透主装甲，但爆轰能打断履带、打坏观瞄与炮闩，也能拆除建筑掩体。${heP > 1 ? '大口径重榴可掀开薄顶甲直入车内爆轰，落地近失弹也有杀伤。' : '对付轻甲面与断腿压制首选。'}点击或按 2 键切换。</div>`,
      mg: cfg.mg ? `<div class="tip-title"><b>MG</b> · ${cfg.mgCaliber}mm 车载机枪</div>`
        + `<div class="tip-row"><span>操作</span><b>右键 同轴/车顶机枪 · F 前机枪</b></div>`
        + `<div class="tip-row"><span>射程</span><b>≤ ${cfg.mg.range} m · 骚扰压制</b></div>`
        + `<div class="tip-row"><span>观瞄毁伤</span><b>100m 0.5% · 200m 0.3% · 300m 0.2% /发</b></div>`
        + `<div class="tip-note">机枪无法穿透主装甲，只用于骚扰与软压制，极低概率打坏敌方观瞄。前机枪自动瞄准射界（±${Math.round(THREE.MathUtils.radToDeg(cfg.hullMgArc || 0.26))}°）内目标，射界内无目标时沿枪管直射。</div>`
        : `<div class="tip-title"><b>无车载机枪</b></div><div class="tip-note">本车未装机枪，仅靠主炮作战。</div>`,
    };
  }

  // 悬停提示
  _bindAmmoHover(el, html) {
    el.addEventListener('mouseenter', () => {
      if (!html) return;
      if (!this._ammoTip) {
        this._ammoTip = document.createElement('div');
        this._ammoTip.id = 'ammo-tip';
        this.screens.hud.appendChild(this._ammoTip);
      }
      this._ammoTip.innerHTML = html;
      this._ammoTip.style.display = 'block';
      const r = el.getBoundingClientRect();
      const w = this._ammoTip.offsetWidth, h = this._ammoTip.offsetHeight;
      let left = r.right + 10;
      if (left + w > window.innerWidth - 8) left = r.left - w - 10;
      this._ammoTip.style.left = `${Math.max(8, left)}px`;
      this._ammoTip.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - h - 8))}px`;
    });
    el.addEventListener('mouseleave', () => {
      if (this._ammoTip) this._ammoTip.style.display = 'none';
    });
  }

  // ─────────── HUD 每帧 ───────────
  updateHUD(player, enemiesLeft, info) {
    if (this.hpLabel) this.hpLabel.textContent = player.cfg.name;
    // 弹药面板
    for (const k of ['ap', 'apcr', 'he']) {
      const it = this._ammoItems[k];
      if (!it) continue;
      this._setAmmo(k, player.shellPool[k]);
      it.root.classList.toggle('active', player.shellType === k);
    }
    this._setAmmo('mg', player.mgAmmo);
    const kmh = Math.abs(player.speed * 3.6);
    this.speedVal.textContent = Math.round(kmh);
    // 油门条（绿→橙红渐变，颜色锚定条全长=当前油门档位感）
    const thr = Math.abs(player.throttle || 0);
    if (this.speedFill) this.speedFill.style.width = `${Math.min(thr * 100, 100)}%`;
    // ── 自动档位（按地形生效极速分 5 前进挡，带迟滞防抖） ──
    const terr = TERRAIN_RULES[(player.world && player.world.map && player.world.map.terrain) || 'hard'] || TERRAIN_RULES.hard;
    const maxEff = player.cfg.maxSpeed * (terr.base === 'road' ? terr.speedK : (player.cfg.offroadK || 1) * terr.speedK);
    const r = Math.min(1.2, Math.abs(player.speed) / (maxEff || 1));
    const NG = 5;
    if (player.speed > 0.5) {
      const g = Math.min(NG, Math.floor(r * NG) + 1);
      if (this._gear == null || this._gear === 'N' || this._gear === 'R') this._gear = 1;
      if (typeof this._gear === 'number') {
        if (g > this._gear && r > (g - 1) / NG + 0.02) this._gear = g;          // 升挡
        else if (g < this._gear && r < (g - 1) / NG - 0.03) this._gear = g;     // 降挡
      }
      this.gear.textContent = String(this._gear);
    } else if (player.speed < -0.5) {
      this._gear = 'R';
      this.gear.textContent = 'R';
    } else {
      this._gear = 'N';
      this.gear.textContent = 'N';
    }
    this.enemiesLeft.textContent = enemiesLeft;

    // 战斗时限倒计时
    if (this.timeLeft && info.timeLeft != null) {
      const tl = Math.max(0, Math.ceil(info.timeLeft));
      const txt = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
      const low = tl <= 60;
      if (txt !== this._timeKey) { this._timeKey = txt; this.timeLeft.textContent = txt; }
      this.timeCounter.classList.toggle('low', low);
    }

    // 罗盘
    const deg = ((THREE.MathUtils.radToDeg(-player.heading) % 360) + 360) % 360;
    this.csTicks.style.transform = `translateX(${170 - (deg + 180) * 2}px)`;
    this.compassDeg.textContent = `${String(Math.round(deg) % 360).padStart(3, '0')}°`;

    // 起火标签
    let tags = '';
    if (player.burning > 0) tags += '<span class="status-tag fire">起火！FIRE</span>';
    if (tags !== this._tagsKey) { this._tagsKey = tags; this.statusTags.innerHTML = tags; }

    // ── 乘员状态面板（绿=完好 黄=受伤 灰=阵亡） ──
    this._updateCrew(player);

    // ── 模块状态条：损毁模块常显 + 断履带计时 + 起火 ──
    const m = player.mods || {};
    const chips = [];
    for (const [key, name] of MODULE_META) {
      const st = player.moduleState(key);
      if (st === 1) chips.push(`<span class="mod-chip warn">${name}受损</span>`);
      else if (st === 0) chips.push(`<span class="mod-chip dead">${name}损毁</span>`);
    }
    if (m.tracks > 0) chips.push(`<span class="mod-chip track">断履带 ${Math.ceil(m.tracks)}s</span>`);
    if (player.burning > 0) chips.push('<span class="mod-chip fire">起火</span>');
    const chipKey = chips.join('|');
    if (chipKey !== this._chipKey) { this._chipKey = chipKey; this.modChips.innerHTML = chips.join(''); }

    // ── 装填指示：镜内圆环（进度弧）+ 第三人称底部横条 ──
    const reloadFrac = info.reloadFrac;
    const rdy = reloadFrac >= 1;
    this.rrFill.style.strokeDashoffset = `${100.53 * (1 - Math.min(1, reloadFrac))}`;
    this.rrRoot.classList.toggle('ready', rdy);
    const rTxt = rdy ? 'OK' : Math.max(0, player.reload).toFixed(1);
    if (rTxt !== this._rrTxt) { this._rrTxt = rTxt; this.rrText.textContent = rTxt; }
    this.btBarFill.style.width = `${Math.round(reloadFrac * 100)}%`;
    this.btBarFill.parentElement.classList.toggle('ready', rdy);
    this.btBarLabel.classList.toggle('ready', rdy);
    const bTxt = rdy ? '主炮就绪' : `装填 ${Math.max(0, player.reload).toFixed(1)}s`;
    if (bTxt !== this._btTxt) { this._btTxt = bTxt; this.btBarLabel.textContent = bTxt; }

    // 缩圈准星（表盘刻度环：比炮口指示器（0.7·ringSize）略大一圈，视觉直径上限 200px）
    const ringPx = Math.min(Math.round(info.ringSize * 1.15), 200);
    this.crosshair.style.width = `${ringPx}px`;
    this.crosshair.style.height = `${ringPx}px`;
    this.crosshair.classList.toggle('aimed', info.aimed);
    this.aimProgress.style.top = 'calc(100% + 8px)';
    this.aimInfo.style.top = 'calc(100% + 26px)';
    this.aimProgress.textContent = info.aimed ? '已瞄准' : `缩圈 ${Math.round(info.aimFrac * 100)}%`;
    this.aimProgress.classList.toggle('aimed', info.aimed);
    this.aimRange.textContent = info.range != null ? `${Math.round(info.range)} m` : '-- m';
    this.aimTarget.textContent = info.targetName || '';

    // 狙击镜读数
    this.setScope(info.scoped);
    if (info.scoped) {
      const def = player.shellDef();
      const shellName = def.key === 'ap' && player.cfg.shellName ? player.cfg.shellName
        : def.key === 'apcr' && player.cfg.apcrShell ? player.cfg.apcrShell.name
        : `${def.full} ${def.name}`;
      this.gsShell.textContent = `${shellName} ×${player.shellPool[def.key]}`;
      const rdy2 = reloadFrac >= 1;
      this.gsReload.textContent = rdy2 ? '就绪' : `装填 ${(player.reload).toFixed(1)}s`;
      this.gsReload.classList.toggle('ready', rdy2);
      this.gsZoom.textContent = info.zoomText;
      this.gsRange.textContent = info.range != null ? `${Math.round(info.range)} m` : '-- m';
      this.gsTarget.textContent = info.targetName || '';
      const d = Math.max(info.gsDispSize || 0, 58);   // 最小圈直径 58px（> 1cm 炮口指示器）
      this.gsDisp.style.width = `${d}px`;
      this.gsDisp.style.height = `${d}px`;
      this.gsDisp.classList.toggle('aimed', info.aimed);   // 缩圈完成 → 刻度环变绿
    }

    // 瞄准镜测距刻度盘（TZF 旋转分划）：测距 → 刻度盘旋转到对应距离位
    // 旋转映射跟随右侧外圈火炮标尺：0..40 ×100m 分布在 0°~120° → 每 100m=3°
    const nowT = performance.now();
    const dialDt = Math.min(0.1, (nowT - (this._dialLastT || nowT)) / 1000) || 0.016;
    this._dialLastT = nowT;
    if (this._dialAngle === undefined) this._dialAngle = 0;
    if (info.scoped && info.dialRange != null) {
      const dialTarget = -THREE.MathUtils.clamp(info.dialRange, 0, 4000) * 0.03;   // 外圈火炮标尺：每 100m=3°
      this._dialAngle = THREE.MathUtils.damp(this._dialAngle, dialTarget, 5, dialDt);
      const dial = document.getElementById('gs-dial');
      if (dial) dial.setAttribute('transform', `rotate(${this._dialAngle.toFixed(2)} 500 500)`);
    }   // dialRange=null（敌人不在炮口圆内）→ 冻结在当前角度

    // 炮口指示器（固定 1cm 圆——只标识炮口当前弹着点，不随缩圈缩放；实线=开镜 / 虚线=第三人称）
    const gm = info.gunMarker;
    if (gm && gm.show) {
      this.gunMarkerEl.style.display = 'block';
      this.gunMarkerEl.style.left = `${gm.x}px`;
      this.gunMarkerEl.style.top = `${gm.y}px`;
      this.gunMarkerEl.classList.toggle('tp', !info.scoped);
    } else this.gunMarkerEl.style.display = 'none';
    // 收敛分档：未就位=红色脉动（炮弹沿炮管飞，此刻它才是真准星）；接近=琥珀；就位=默认白
    this.gunMarkerEl.classList.toggle('unconv', info.conv === 2);
    this.gunMarkerEl.classList.toggle('near', info.conv === 1);
    // 瞄准线被地形遮断（准星在敌车上但炮道擦地）= 琥珀警示：弹着将落在碰地点，距离读数同步转琥珀
    this.gunMarkerEl.classList.toggle('blk', !!info.blocked && info.conv !== 2);
    this.aimRange.classList.toggle('blk', !!info.blocked);
    if (info.scoped) this.gsRange.classList.toggle('blk', !!info.blocked);
    // 开镜未就位时弱化分划中心（防止误把十字线当弹着点；刻度鼓保持原样供测距）
    if (!this.gsReticle) this.gsReticle = document.getElementById('gs-reticle');
    if (this.gsReticle) this.gsReticle.classList.toggle('unconv', !!info.scoped && info.conv === 2);
    this.crosshair.classList.toggle('locked', !!info.locked);
  }

  // ─────────────── 车姿显示器（#attitude，右下油门区左侧） ───────────────
  // 战雷式：**炮塔/炮管固定朝上作参考**，**车体轮廓按 +turretYaw 旋转**体现车体姿态——
  // 炮塔往左转（turretYaw<0）→ 车体轮廓往屏左摆（与小地图手性一致：正 turretYaw=炮塔指向车体右侧）。
  // 仪表圈：外环 r74 + 刻度 + 内侧装饰边框圈 r62；红色炮线沿炮管轴线到内圈（瞄准星指示线）；
  //   观测视野扇形（透明深蓝，同小地图 27.5° 半角，随视线相对炮线旋转，全车型）。
  // 歼击车（cfg.casemate）：±arc 射界弧刻线（固定，车体艏部须落在其间、卡缘提亮）。
  // 受击标记按车体局部坐标放色点（穿深红/溅射橙/弹跳灰），随车体轮廓旋转，2.6s 淡出，最多 8 个。
  _buildAttitude() {
    const cx = 80, cy = 80;
    this._attScale = 9.5;   // px / m（车体 6.3×3.6m → 60×34px，含履带）
    let ticks = '';
    for (let i = 0; i < 12; i++) {
      const a = i * 30 * Math.PI / 180, sn = Math.sin(a), cs = Math.cos(a);
      ticks += `<line x1="${(cx + sn * 66).toFixed(1)}" y1="${(cy - cs * 66).toFixed(1)}" x2="${(cx + sn * 74).toFixed(1)}" y2="${(cy - cs * 74).toFixed(1)}"/>`;
    }
    this.attRoot.innerHTML = `
      <svg viewBox="0 0 160 160" width="160" height="160">
        <circle id="att-ring" cx="${cx}" cy="${cy}" r="74"/>
        <g id="att-tick">${ticks}</g>
        <circle id="att-inner" cx="${cx}" cy="${cy}" r="62"/>
        <path id="att-sector" d="" style="display:none"/>
        <g id="att-hull">
          <rect class="att-track" x="${(cx - 17.1).toFixed(1)}" y="${(cy - 27.5).toFixed(1)}" width="6.8" height="55" rx="2"/>
          <rect class="att-track" x="${(cx + 10.3).toFixed(1)}" y="${(cy - 27.5).toFixed(1)}" width="6.8" height="55" rx="2"/>
          <rect id="att-hull-body" x="${(cx - 15.2).toFixed(1)}" y="${(cy - 28.5).toFixed(1)}" width="30.4" height="57" rx="3"/>
          <polygon id="att-bow" points="${cx},${(cy - 33.4).toFixed(1)} ${(cx - 8)},${(cy - 25.5).toFixed(1)} ${(cx + 8)},${(cy - 25.5).toFixed(1)}"/>
          <g id="att-hits"></g>
        </g>
        <g id="att-arc"></g>
        <line id="att-gunline" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 61}"/>
        <g id="att-turret">
          <rect class="att-gun" x="${cx - 1.8}" y="${cy - 26}" width="3.6" height="26" rx="1.6"/>
          <rect class="att-gun" x="${cx - 3}" y="${cy - 28.5}" width="6" height="4.6" rx="1"/>
          <circle id="att-turret-body" cx="${cx}" cy="${cy}" r="9.5"/>
        </g>
        <text id="att-name" x="${cx}" y="146">--</text>
      </svg>`;
    this.attHull = document.getElementById('att-hull');
    this.attTurret = document.getElementById('att-turret');
    this.attHits = document.getElementById('att-hits');
    this.attArcG = document.getElementById('att-arc');
    this.attSector = document.getElementById('att-sector');
    this.attName = document.getElementById('att-name');
    this._attArcDeg = null;
    this._attName = '';
    this._attSectorKey = '';
  }

  // 歼击车火炮水平射界 ±arc 刻线（车体系固定：炮管须始终落在其间）
  _setAttitudeArc(p) {
    const want = p.cfg.casemate ? Math.round(p.cfg.casemate.arc) : 0;
    if (this._attArcDeg === want) return;
    this._attArcDeg = want;
    if (!want) { this.attArcG.innerHTML = ''; return; }
    const cx = 80, cy = 80, r0 = 38, r1 = 46;
    let s = '';
    for (const sgn of [-1, 1]) {
      const a = sgn * want * Math.PI / 180;
      s += `<line x1="${(cx + Math.sin(a) * r0).toFixed(1)}" y1="${(cy - Math.cos(a) * r0).toFixed(1)}" x2="${(cx + Math.sin(a) * r1).toFixed(1)}" y2="${(cy - Math.cos(a) * r1).toFixed(1)}"/>`;
    }
    this.attArcG.innerHTML = s;
  }

  updateAttitude(p, viewYaw = null) {
    if (!this.attHull || !p) return;
    // 英文车名
    const nm = p.cfg.nameEn || p.cfg.name || '';
    if (nm !== this._attName) { this._attName = nm; this.attName.textContent = nm; }
    this._setAttitudeArc(p);
    // 车体轮廓旋转（正 turretYaw = 炮塔指向车体右侧 → 车体轮廓同侧摆动）
    const deg = p.turretYaw * 180 / Math.PI;
    this.attHull.setAttribute('transform', `rotate(${deg.toFixed(1)} 80 80)`);
    // 车体艏部顶到射界弧缘 → 刻线提亮
    const cm = p.cfg.casemate;
    this.attArcG.classList.toggle('clamp', !!cm && Math.abs(p.turretYaw) >= cm.arc * Math.PI / 180 - 0.004);
    // 观测视野扇形（透明深蓝，同小地图 27.5° 半角）：视线相对炮线的方位（镜像手性），全车型
    if (viewYaw !== null) {
      const rel = (p.heading + p.turretYaw - viewYaw) * 180 / Math.PI;
      const key = rel.toFixed(1);
      if (key !== this._attSectorKey) {
        this._attSectorKey = key;
        const r = 61, cx = 80, cy = 80, h = 27.5 * Math.PI / 180;
        const x1 = cx + r * Math.sin(-h), y1 = cy - r * Math.cos(-h);
        const x2 = cx + r * Math.sin(h), y2 = cy - r * Math.cos(h);
        this.attSector.setAttribute('d', `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`);
        this.attSector.setAttribute('transform', `rotate(${rel.toFixed(1)} 80 80)`);
      }
      this.attSector.style.display = '';
    } else {
      this.attSector.style.display = 'none';
    }
  }

  // 受击标记（hull-local 坐标，车体固定朝上：+x 车体右侧=屏右，+z 车头=屏上）
  // kind = pen 穿深红 / splash 溅射橙 / bounce·ricochet 弹跳灰
  addAttitudeHit(lx, lz, kind = 'pen') {
    if (!this.attHits) return;
    const S = this._attScale;
    const col = kind === 'pen' ? '#ff5a3c' : (kind === 'splash' ? '#ffb14a' : '#9fb4c8');
    const x = THREE.MathUtils.clamp(lx, -2.2, 2.2) * S;
    const y = -THREE.MathUtils.clamp(lz, -3.3, 3.3) * S;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('cx', (80 + x).toFixed(1));
    el.setAttribute('cy', (80 + y).toFixed(1));
    el.setAttribute('r', '3.6');
    el.setAttribute('fill', col);
    el.setAttribute('class', 'att-hit');
    this.attHits.appendChild(el);
    while (this.attHits.children.length > 8) this.attHits.firstChild.remove();
    setTimeout(() => el.remove(), 2700);
  }

  // 乘员面板：5 乘员小图标（完好/受伤/阵亡三态；内容不变不重排）
  _updateCrew(player) {
    let key = '';
    for (const c of player.crew) key += c.state;
    if (key !== this._crewKey || !this._crewRows) {
      this._crewKey = key;
      if (!this._crewRows) {
        this.crewPanel.innerHTML = '';
        this._crewRows = [];
        for (const [id, name] of CREW_META) {
          const el = document.createElement('span');
          el.className = 'crew-pip';
          el.innerHTML = `<i></i>${name}`;
          this.crewPanel.appendChild(el);
          this._crewRows.push([id, el]);
        }
      }
      for (const [id, el] of this._crewRows) {
        const st = player.crewState(id);
        el.className = 'crew-pip ' + (st === 2 ? 'dead' : st === 1 ? 'wounded' : 'ok');
      }
    }
  }

  _setAmmo(key, cur) {
    const it = this._ammoItems && this._ammoItems[key];
    if (!it) return;
    const txt = String(Math.max(0, Math.ceil(cur)));
    if (txt !== it._txt) { it._txt = txt; it.num.textContent = txt; }
    it.root.classList.toggle('low', cur > 0 && it.max > 0 && cur / it.max < 0.2);
    it.root.classList.toggle('empty', cur <= 0);
  }

  // 镜内开炮白闪
  scopeFlash() {
    this.gsFlash.classList.remove('show');
    void this.gsFlash.offsetWidth;
    this.gsFlash.classList.add('show');
  }

  // ─────────── 敌标（屏幕投影：确认=距离+▼红；疑似=◆橙「疑似目标」快照位；失联=?灰） ───────────
  updateMarkers(enemies, player, camera) {
    this._cam = camera;
    const w = window.innerWidth, h = window.innerHeight;
    for (const e of enemies) {
      let mk = this.markers.get(e);
      if (e.destroyed) { if (mk) { mk.remove(); this.markers.delete(e); } continue; }
      const spotted = e.spotted === true;
      const suspected = e.suspected === true;
      const lost = e.lostContact === true;
      if (!spotted && !lost && !suspected) {
        if (mk) mk.style.display = 'none';
        continue;
      }
      // 疑似/失联钉在最后已知位置（快照，不跟踪）；确认才实时
      const srcPos = spotted ? e.root.position : (e.lastKnownPos || e.root.position);
      if (!mk) {
        mk = document.createElement('div');
        mk.className = 'enemy-marker';
        mk.innerHTML = `<span class="em-dist"></span><span class="em-icon">▼</span><span class="em-tag"></span>`;
        mk._dist = mk.querySelector('.em-dist');
        mk._icon = mk.querySelector('.em-icon');
        mk._tag = mk.querySelector('.em-tag');
        this.markersLayer.appendChild(mk);
        this.markers.set(e, mk);
      }
      mk.classList.toggle('lost', !spotted && !suspected && lost);
      mk.classList.toggle('suspected', !spotted && suspected);
      // AI 修理状态：黄色 + REPAIR 字样
      mk.classList.toggle('repairing', !!(e.repairing && spotted));
      // 文案每帧更新（含屏外：摆回屏内时无残留旧文案）
      if (spotted) {
        mk._tag.textContent = '';
        if (e.repairing) {
          mk._dist.textContent = `${Math.round(e.pos.distanceTo(player.pos))}m`;
          mk._icon.textContent = 'REPAIR';
        } else {
          mk._dist.textContent = `${Math.round(e.pos.distanceTo(player.pos))}m`;
          mk._icon.textContent = '▼';
        }
      } else if (suspected) {
        // 疑似目标：无精确距离，标注方位来源
        mk._dist.textContent = '';
        mk._icon.textContent = '◆';
        mk._tag.textContent = '疑似目标';
      } else {
        mk._dist.textContent = '';
        mk._icon.textContent = '?';
        mk._tag.textContent = '';
      }
      _v.copy(srcPos);
      _v.y += 3.4;
      _v.project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { mk.style.display = 'none'; continue; }
      mk.style.display = '';
      mk.style.left = `${(_v.x * 0.5 + 0.5) * w}px`;
      mk.style.top = `${(-_v.y * 0.5 + 0.5) * h}px`;
    }
  }

  // ─────────── 暴露警示（被敌疑似=琥珀 CONTACT / 确认锁定=红 SPOTTED） ───────────
  updateExposure(level) {
    const el = this.exposureEl || (this.exposureEl = document.getElementById('exposure-warn'));
    if (!el) return;
    el.classList.toggle('show', level > 0);
    el.classList.toggle('mild', level === 1);
    if (level === 2 && this._expoLv !== 2) {
      el.innerHTML = '已被发现 · 立即转移 <span class="en-label">SPOTTED</span>';
    } else if (level === 1 && this._expoLv !== 1) {
      el.innerHTML = '疑似暴露 · 注意隐蔽 <span class="en-label">CONTACT</span>';
    }
    this._expoLv = level;
  }
  clearMarkers() {
    for (const mk of this.markers.values()) mk.remove();
    this.markers.clear();
  }

  // ─────────── 消耗品 HUD ───────────
  updateConsumables(player) {
    const r = document.getElementById('cons-repair');
    const e = document.getElementById('cons-ext');
    if (r) {
      r.classList.toggle('used', !player.consumables || player.consumables.repair <= 0);
      const nm = r.querySelector('.cons-name');
      if (nm) nm.textContent = `维修×${player.consumables ? Math.max(0, player.consumables.repair) : 0}`;
    }
    if (e) e.classList.toggle('used', !player.consumables || player.consumables.ext <= 0);
  }

  // ─────────── 修理读条（第三人称底部；修理中显示） ───────────
  updateRepair(repairing) {
    const wrap = document.getElementById('repair-wrap');
    if (!wrap) return;
    if (!repairing) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const frac = Math.min(1, repairing.t / repairing.dur);
    document.getElementById('repair-fill').style.width = `${Math.round(frac * 100)}%`;
    document.getElementById('repair-label').textContent =
      `修理中 ${Math.max(0, repairing.dur - repairing.t).toFixed(1)}s（${repairing.items.map(i => i.label).join('、')}）`;
  }

  // ─────────── 机库/切车载入浮标 ───────────
  showHangarLoading(on, text, progress) {
    if (!this.hangarLoading) return;
    if (text && this.hangarLoadingText.textContent !== text) this.hangarLoadingText.textContent = text;
    this.hangarLoading.classList.toggle('show', on);
    if (this.hangarLoadingBar) {
      const showBar = on && progress != null;
      this.hangarLoadingBar.style.display = showBar ? '' : 'none';
      if (showBar) this.hangarLoadingFill.style.width = `${Math.round(progress * 100)}%`;
    }
  }

  // ─────────── 反馈 ───────────
  hitMarker(kill) {
    this.hitMarkerEl.classList.remove('show');
    void this.hitMarkerEl.offsetWidth;
    this.hitMarkerEl.style.color = kill ? '#ff2a10' : '#ff5030';
    this.hitMarkerEl.classList.add('show');
  }
  penMarker(text) {
    this.penMarkerEl.textContent = text;
    this.penMarkerEl.classList.remove('show');
    void this.penMarkerEl.offsetWidth;
    this.penMarkerEl.classList.add('show');
  }

  // 命中记录（右下）：good=我方战果 / bad=我方受创
  hitLog(text, cls = '') {
    const div = document.createElement('div');
    div.className = `hitlog-item ${cls}`;
    div.textContent = text;
    this.hitlogEl.prepend(div);
    while (this.hitlogEl.children.length > 5) this.hitlogEl.lastChild.remove();
    setTimeout(() => div.classList.add('fadeout'), 2400);
    setTimeout(() => div.remove(), 3000);
  }

  // 命中点飘字（世界坐标 → 屏幕投影）
  floatDamage(worldPos, text, cls = '') {
    if (!this._cam) return;
    _v.copy(worldPos).project(this._cam);
    if (_v.z > 1) return;
    const div = document.createElement('div');
    div.className = `dmg-num ${cls}`;
    div.textContent = text;
    div.style.left = `${(_v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() * 36 - 18)}px`;
    div.style.top = `${(-_v.y * 0.5 + 0.5) * window.innerHeight - 8}px`;
    this.screens.hud.appendChild(div);
    setTimeout(() => div.remove(), 950);
  }

  damageFlash(strength = 0.85) {
    this.vignette.style.transition = 'none';
    this.vignette.style.opacity = strength;
    requestAnimationFrame(() => {
      this.vignette.style.transition = 'opacity 0.8s';
      this.vignette.style.opacity = 0;
    });
  }

  damageFrom(angleRad) {
    const arc = document.createElement('div');
    arc.className = 'dmg-arc show';
    arc.style.transform = `rotate(${angleRad}rad) translateY(-118px)`;
    this.dmgIndicator.appendChild(arc);
    setTimeout(() => arc.remove(), 1300);
  }

  message(text) {
    this.battleMsg.textContent = text;
    this.battleMsg.classList.remove('show');
    void this.battleMsg.offsetWidth;
    this.battleMsg.classList.add('show');
  }

  result(victory, detailHTML) {
    const t = $('result-title');
    t.textContent = victory === null ? '平 局' : victory ? '胜 利' : '战 毁';
    t.classList.toggle('defeat', victory === false);
    t.classList.toggle('draw', victory === null);
    $('result-detail').innerHTML = detailHTML;
    this.show('result');
  }
}
