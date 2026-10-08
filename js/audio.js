// ═══ 程序化音效系统（WebAudio，无外部音频资源） ═══
import { BGM } from './config.js';

// 持续接触类物件音：碾栅栏/碾物品/碾废墟/撞房屋（动作持续期间反复触发 → 整遍播完才允许下一遍）
const PROP_SUSTAINED = new Set(['crushWood', 'crushObj', 'crushRubble', 'ramHouse']);

// 新式发动机音量档（cfg.sound.idle/drive 体系，2026-09-24）：加速过程 100% / 极速后 80% / 静止怠速
const ENGINE_VOL = 1.0, ENGINE_VOL_TOP = 0.8, ENGINE_IDLE_VOL = 0.55;
const ENGINE_TL_IDLE = 0.7;   // 时间线形（虎式）怠速音量系数：恒定音量模型下怠速段单独压低
// 连续声模型（2026-09-24 用户定稿）：行驶声常驻——给油 100%（极速 80%）；松油门仍在动 → 行驶循环
// 不中断，音量按速度在 ENGINE_COAST_MIN~(MIN+SPAN) 间滑移（最小 50%，无无声空档）；静止 → 怠速
const ENGINE_COAST_MIN = 0.5, ENGINE_COAST_SPAN = 0.3, ENGINE_COAST_MIN_SP = 0.8;
// 淡入淡出：第一脚油门淡入 τ；开镜（舱内视角）发动机/行驶声 ×0.7，敞开式炮塔车（cfg.openTop）豁免
const ENGINE_ATTAIN_K = 0.7, ENGINE_DRIVE_IN = 0.35, ENGINE_IDLE_TAU = 0.45;
const ENGINE_NOIDLE_STILL = 0.35;   // 无独立怠速源（美/苏单文件形）：静止=巡航循环低速代怠速

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.engineNodes = null;
    this.started = false;
    this.settings = { master: 0.8, sfx: 0.9, ambient: 0.6, bgmOn: true, bgmVol: 50, bgmMode: 'normal' };
    this.ext = null;          // 外部音效缓冲 { engine, mg, fire, fireAim, seg, _key }
    this.extEngine = null;    // 外部引擎运行节点 { loopSrc, loopG, startSrc }
    this._xloops = [];        // 无缝循环链（新式引擎怠速/巡航）：双拷贝交叉淡化消循环接缝
    this.extMGLoops = new Map(); // 机枪循环节点 Map：key('coax'|'hull') → { src, g }
    this.sfxExt = null;       // 通用被击中音效 { behit:[], behitOut:[], hitMis, exo:[], exoNear }
    this.listenerPos = { x: 0, y: 0, z: 0 };   // 听者（玩家坦克）位置：命中类音效距离衰减用
    this.propSfx = null;      // 物件音效（可破坏场景物）：{ collapseLg, collapseSm, houseHit, treeTopple, treeCreak, treeShot, crushObj, ramHouse, crushWood, crushRubble }
    this._propLast = {};      // 事件类物件音去重：同名音 120ms 内不重复触发（压毁+碰撞同帧双触发）
    this._propBusy = {};      // 持续接触类物件音：整遍播放完才允许下一遍（不重叠）
    // ── BGM 状态 ──
    this.bgmEl = null;        // 当前 Audio 元素
    this.bgmList = [];        // 战斗播放列表（已洗牌）
    this.bgmIdx = 0;
    this.bgmTimer = null;     // 循环间隔定时器
    this.bgmGen = 0;          // 代际令牌：换曲/停止后让旧的 onended 失效
  }

  // 必须在用户手势后调用
  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.connect(this.master);
    this.applySettings(this.settings);
    this.started = true;
    this._startWind();
    this.loadCommonSounds();
    this.loadPropSounds();
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    if (!this.started) return;
    this.master.gain.value = this.settings.master;
    this.sfxGain.gain.value = this.settings.sfx;
    this.ambientGain.gain.value = this.settings.ambient;
    this._applyBgmVolume();
  }

  // ═══════════ 背景音乐（HTMLAudio 元素，音量 = 主音量 × BGM 音量） ═══════════

  _applyBgmVolume() {
    if (!this.bgmEl) return;
    const on = this.settings.bgmOn !== false;
    const vol = on ? (this.settings.master || 0) * ((this.settings.bgmVol ?? 50) / 100) : 0;
    this.bgmEl.volume = Math.min(1, Math.max(0, vol));
  }

  // 停止当前曲目（清理定时器 + 代际令牌使旧 onended 失效）
  stopBGM() {
    this.bgmGen++;
    clearTimeout(this.bgmTimer);
    this.bgmTimer = null;
    if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl.onended = null; this.bgmEl = null; }
  }

  _playBgmTrack(url, { loop = false, onEnded = null } = {}) {
    this.bgmGen++;
    clearTimeout(this.bgmTimer);
    if (this.bgmEl) { this.bgmEl.pause(); this.bgmEl.onended = null; }
    const el = new Audio(url);
    const gen = this.bgmGen;
    this.bgmEl = el;
    this._applyBgmVolume();
    el.loop = loop;
    if (onEnded) el.onended = () => { if (gen === this.bgmGen) onEnded(); };
    el.play().catch(() => {});   // 自动播放被拒时静默（后续手势后由再次切曲恢复）
    return el;
  }

  // 菜单 BGM（封面/菜单/车库/结算）：无缝循环
  startMenuBGM() {
    if (!this.started) return;
    this.bgmList = []; this.bgmIdx = 0;
    this._playBgmTrack(BGM.menu, { loop: true });
  }

  // 战斗 BGM：曲库洗牌随机轮播（BGM.battle 数组）；个性化模式 = 国别曲并入曲库
  startBattleBGM(tankCfg) {
    if (!this.started) return;
    const personal = this.settings.bgmMode === 'personal';
    const nationTracks = (personal && tankCfg && BGM.nations[tankCfg.nation]) || [];
    this.bgmList = this._shuffle([...nationTracks, ...BGM.battle]);
    this.bgmIdx = 0;
    this._playBattleNext();
  }

  _playBattleNext() {
    if (this.bgmIdx >= this.bgmList.length) {   // 一轮播完 → 重新洗牌
      this.bgmList = this._shuffle(this.bgmList);
      this.bgmIdx = 0;
    }
    const url = this.bgmList[this.bgmIdx++];
    this._playBgmTrack(url, {
      onEnded: () => {   // 每遍之间静默间隔
        this.bgmTimer = setTimeout(() => {
          if (this.bgmEl) this._playBattleNext();
        }, BGM.gap * 1000);
      },
    });
  }

  pauseBGM() { if (this.bgmEl) this.bgmEl.pause(); }
  resumeBGM() { if (this.bgmEl) this.bgmEl.play().catch(() => {}); }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── 外部音效加载 ──
  async loadExtSounds(cfg) {
    if (!cfg.sound) { this.ext = null; return; }
    if (this.ext && this.ext._key === cfg.id) return;
    try {
      // fire 支持字符串或数组（数组 = 每发随机选一，如猎虎 128mm 双音源）
      const fireUrls = Array.isArray(cfg.sound.fire) ? cfg.sound.fire : [cfg.sound.fire];
      const [engine, mg, fireAim, idle, drive, cruise, decel, ...fireBufs] = await Promise.all([
        this._decodeMp3(cfg.sound.engine),
        this._decodeMp3(cfg.sound.mg),
        this._decodeMp3(cfg.sound.fireAim),
        this._decodeMp3(cfg.sound.idle),
        this._decodeMp3(cfg.sound.drive),
        this._decodeMp3(cfg.sound.cruise),
        this._decodeMp3(cfg.sound.decel),
        ...fireUrls.map((u) => this._decodeMp3(u)),
      ]);
      const fire = fireUrls.length > 1 ? fireBufs : fireBufs[0];
      this.ext = {
        _key: cfg.id,
        engine, mg, fire, fireAim,
        idle, drive,             // 新式发动机双循环（idle+drive 都在才启用，见 startEngine）
        cruise,                  // 独立巡航循环文件（缺省用 drive 文件切段，见 startEngine）
        decel,                   // 减速停车专用音（动→停沿播末尾 seg.decelTail 秒一次）
        openTop: !!cfg.openTop,  // 敞开式炮塔：开镜不做舱内发动机衰减
        cruiseVol: cfg.sound.cruiseVol || 1,   // 行驶/巡航段音量乘子（虎王 0.8：巡航声压 20%）
        seg: cfg.sound.seg || { engineStart: 0.24, mgFire: 0.20 },
      };
    } catch (e) {
      console.warn('外部音效加载失败，回退程序化音效', e);
      this.ext = null;
    }
  }

  async _decodeMp3(url) {
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return await this.ctx.decodeAudioData(arr);
  }

  usingExt() { return !!this.ext; }

  // ── 通用被击中音效加载（所有坦克共用） ──
  async loadCommonSounds() {
    if (this.sfxExt) return;
    try {
      const [b1, b2, bo1, bo2, mis, e1, e2, e3, near] = await Promise.all([
        this._decodeMp3('sound/behit1.mp3'),
        this._decodeMp3('sound/behit2.mp3'),
        this._decodeMp3('sound/behitOut1.mp3'),
        this._decodeMp3('sound/behitOut2.mp3'),
        this._decodeMp3('sound/beHitMis.mp3'),
        this._decodeMp3('sound/exo-1.mp3'),
        this._decodeMp3('sound/exo-2.mp3'),
        this._decodeMp3('sound/exo-3.mp3'),
        this._decodeMp3('sound/exo-near.mp3'),
      ]);
      this.sfxExt = {
        behit: [b1, b2].filter(Boolean),
        behitOut: [bo1, bo2].filter(Boolean),
        hitMis: mis,
        exo: [e1, e2, e3].filter(Boolean),
        exoNear: near,
      };
    } catch (e) {
      console.warn('通用音效加载失败', e);
    }
  }

  _playBuffer(buf, vol = 1) {
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
  }

  // ── 物件音效（sound/props/，可破坏场景物专用） ──
  async loadPropSounds() {
    if (this.propSfx) return;
    try {
      const [collapseLg, collapseSm, houseHit, treeTopple, treeCreak, treeShot, crushObj, ramHouse, crushWood, crushRubble] = await Promise.all([
        this._decodeMp3('sound/props/house_collapse_large.mp3'),
        this._decodeMp3('sound/props/house_collapse_small.mp3'),
        this._decodeMp3('sound/props/house_hit.mp3'),
        this._decodeMp3('sound/props/tree_topple.mp3'),
        this._decodeMp3('sound/props/tree_creak.mp3'),
        this._decodeMp3('sound/props/tree_shot_fall.mp3'),
        this._decodeMp3('sound/props/crush_object.mp3'),
        this._decodeMp3('sound/props/ram_house.mp3'),
        this._decodeMp3('sound/props/crush_wood.mp3'),
        this._decodeMp3('sound/props/crush_rubble.mp3'),
      ]);
      this.propSfx = { collapseLg, collapseSm, houseHit, treeTopple, treeCreak, treeShot, crushObj, ramHouse, crushWood, crushRubble };
      // 各物件音源电平对齐：原始文件录制电平不一（treeTopple 满刻度 0dB / 其余 -7~-11dB 峰值），
      // 按实测 volumedetect 结果归一到相近响度（-12dB ≈ ×0.25）
      this._propGain = { treeTopple: 0.25 };
    } catch (e) {
      console.warn('物件音效加载失败（相关场景将无专属音效）', e);
    }
  }

  // 持续接触类物件音（碾栅栏/碾物品/碾废墟/撞房屋——动作持续期间反复触发）：
  // 整遍播完才允许下一遍，不重叠；动作停止后最后一遍自然收尾。事件类（房屋中弹/倒塌/倒树）不受此限。
  // pos 可选（AI 坦克自产声必须传车体位置）：≤100m 全量，线性衰减，500m 归零——距离外不可听见直接不播
  playProp(name, vol = 1, pos = null) {
    if (!this.started || !this.propSfx || !this.propSfx[name]) return false;
    const at = this._propAtten(pos);
    if (at <= 0.02) return false;
    const buf = this.propSfx[name];
    const now = performance.now();
    if (PROP_SUSTAINED.has(name)) {
      if (now < (this._propBusy[name] || 0)) return false;   // 上一遍未播完：跳过（不重叠）
      this._propBusy[name] = now + buf.duration * 1000;
    } else {
      if (now - (this._propLast[name] || 0) < 120) return false;   // 事件类：仅防同帧重复
      this._propLast[name] = now;
    }
    this._playBuffer(buf, Math.min(1.2, Math.max(0, vol)) * at * (this._propGain ? (this._propGain[name] || 1) : 1));
    return true;
  }

  // 物件音距离衰减：≤100m 全量 → 500m 线性归零（AI 撞房/碾压/压木等自产声；命中/跳弹类走 _hitAtten 豁免曲线）
  _propAtten(pos) {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listenerPos.x, pos.z - this.listenerPos.z);
    if (d <= 100) return 1;
    return Math.max(0, 1 - (d - 100) / 400);
  }

  _noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── 环境风声（持续） ──
  _startWind() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(4); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.06;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.035;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.ambientGain);
    src.start(); lfo.start();
  }

  // ── 发动机（柴油轰鸣，随转速变化） ──
  startEngine() {
    if (!this.started || this.engineNodes || this.extEngine) return;
    // 换档实验形（虎式 tiger-eg2/egAll2，seg.gear）：三梯度加速段按车速带循环切换、段间衔接音、
    // 巡航循环 [cruiseStart, 文件尾]、独立怠速文件；音量恒定（仅开镜 ×0.7），停车衔接怠速
    if (this.ext && this.ext.drive && this.ext.seg.gear) {
      const ctx = this.ctx;
      const idleBuf = this.ext.idle || this.ext.drive;
      const idleG = ctx.createGain(); idleG.gain.value = 0;
      idleG.connect(this.sfxGain);
      const idleChain = this._startXLoop(idleG, idleBuf, this.ext.seg.idleStart || 0,
        this.ext.seg.idleEnd != null ? this.ext.seg.idleEnd : idleBuf.duration);
      const driveG = ctx.createGain(); driveG.gain.value = 0;
      driveG.connect(this.sfxGain);
      this.extEngine = {
        newStyle: true, gear: true,
        idleG, idleChain, driveG, driveChain: null,   // 档位循环链首次踩油门时建立
        accelG: null, accelChainSrc: null, accelUntil: 0, _accelVol: 0, _lastT: 0,
        gears: this.ext.seg.gears, cruiseStart: this.ext.seg.cruiseStart, curDrive: -1,
        decelDone: false, _wasActive: false, attK: 1, lastVol: ENGINE_VOL,
      };
      return;
    }
    // 新式双循环（两种形制，行驶声常驻的连续声模型）：
    // A 双文件（虎式）：cfg.sound.idle 怠速循环 + drive 油门循环（末尾 driveTail=减速段不进循环）
    // B 单文件（黑豹/猎豹 pz5a）：仅 drive，末尾 seg.driveIdle 秒=怠速段——该段切段循环当怠速
    if (this.ext && this.ext.drive) {
      const ctx = this.ctx;
      const idleFromFile = !this.ext.idle && !!this.ext.seg.driveIdle;
      const idleLen = idleFromFile ? Math.min(this.ext.seg.driveIdle, this.ext.drive.duration * 0.4) : 0;
      // 怠速源：独立 idle 文件（形 A）/ drive 文件尾段（形 B）/ 无（美/苏单文件形——静止走巡航循环低速回退）
      const idleBuf = this.ext.idle || (idleFromFile ? this.ext.drive : null);
      const idleStart = idleFromFile ? Math.max(0, idleBuf.duration - idleLen) : Math.max(0, this.ext.seg.idleStart || 0);
      let idleG = null, idleChain = null;
      if (idleBuf) {
        idleG = ctx.createGain(); idleG.gain.value = 0;
        idleG.connect(this.sfxGain);
        let idleEnd = idleBuf.duration;   // 怠速段=文件末尾 idleLen 秒，与 idleStart（duration-idleLen）构成完整区间；勿重复减 idleLen（区间零长会导致每帧重启音源）
        if (!idleFromFile && this.ext.seg.idleEnd != null) idleEnd = Math.min(this.ext.seg.idleEnd, idleBuf.duration);   // 时间线形：怠速段可只取文件中段
        idleChain = this._startXLoop(idleG, idleBuf, idleStart, idleEnd);
      }
      // 油门行驶循环：单段（虎式 [0, 末尾减速段前]）或加速/巡航分段——加速段一次性播放（踩油门沿触发，
      // 播完无缝交巡航链），其后=巡航段无缝循环；cruise 独立文件（虎王 start-egUp）优先于 drive 切段
      const accelSeg = this.ext.seg.driveAccel || 0;
      const hasCruiseFile = !!this.ext.cruise;
      const cruiseBuf = hasCruiseFile ? this.ext.cruise : this.ext.drive;
      const driveStart = hasCruiseFile ? Math.max(0, this.ext.seg.cruiseStart || 0)
        : (this.ext.seg.driveCruiseStart != null ? this.ext.seg.driveCruiseStart
          : (accelSeg > 0.5 ? accelSeg : 0));
      const cruiseEnd = hasCruiseFile ? Math.min(this.ext.seg.cruiseEnd || cruiseBuf.duration, cruiseBuf.duration)
        : (this.ext.seg.driveCruiseEnd
          || (this.ext.seg.driveDecelStart != null ? this.ext.seg.driveDecelStart
            : (idleFromFile ? this.ext.drive.duration - idleLen
              : (this.ext.seg.driveTail ? this.ext.drive.duration - this.ext.seg.driveTail : this.ext.drive.duration))));
      const driveG = ctx.createGain(); driveG.gain.value = 0;
      driveG.connect(this.sfxGain);
      const driveChain = this._startXLoop(driveG, cruiseBuf, driveStart, cruiseEnd);
      let accelG = null;
      if (accelSeg > 0.5 && cruiseEnd - accelSeg > 1) {
        accelG = ctx.createGain(); accelG.gain.value = 0;
        accelG.connect(this.sfxGain);
      }
      this.extEngine = {
        newStyle: true,
        timeline: !!this.ext.seg.timeline,   // 时间线形（虎式单文件）：音量恒定，状态由录音段落表达
        idleG, driveG, accelG,
        idleChain, driveChain,           // 无缝循环链（常驻，总线增益门控）
        _accelVol: 0, _lastT: 0,
        accelChainSrc: null, accelSeg: (accelG ? accelSeg : 0),
        idleRange: idleBuf ? [idleStart, (idleChain ? idleChain.end : idleBuf.duration)] : null, driveRange: [driveStart, cruiseEnd],
        decelSrc: null, decelDone: false, _prevMoving: false, _wasActive: false, attK: 1, lastVol: ENGINE_VOL,
      };
      return;
    }
    // 外部音效：启动段一次 + 行驶段循环
    if (this.ext && this.ext.engine) {
      const ctx = this.ctx;
      const seg = this.ext.seg.engineStart;
      const startSrc = ctx.createBufferSource();
      startSrc.buffer = this.ext.engine;
      const startG = ctx.createGain(); startG.gain.value = 0.7;
      startSrc.connect(startG); startG.connect(this.sfxGain);
      startSrc.start(0, 0, seg);
      const loopSrc = ctx.createBufferSource();
      loopSrc.buffer = this.ext.engine;
      loopSrc.loop = true;
      loopSrc.loopStart = seg;
      loopSrc.loopEnd = this.ext.seg.engineLoopEnd || this.ext.engine.duration;
      const loopG = ctx.createGain(); loopG.gain.value = 0;
      loopSrc.connect(loopG); loopG.connect(this.sfxGain);
      loopSrc.start();
      this.extEngine = { loopSrc, loopG, startSrc };
      return;
    }
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 38;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 19;
    const noise = ctx.createBufferSource(); noise.buffer = this._noiseBuffer(2); noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 240; nf.Q.value = 1.2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    const g = ctx.createGain(); g.gain.value = 0;
    const ng = ctx.createGain(); ng.gain.value = 0.35;
    o1.connect(lp); o2.connect(lp); lp.connect(g);
    noise.connect(nf); nf.connect(ng); ng.connect(g);
    g.connect(this.sfxGain);
    o1.start(); o2.start(); noise.start();
    this.engineNodes = { o1, o2, nf, g };
  }

  setEngine(rpm01, load01, st = null) {
    if (this.extEngine) {
      if (this.extEngine.newStyle) {
        if (this.extEngine.gear) {
          if (st) this._updateEngineGear(st);       // 换档形：档位随车速带切换
        } else if (this.extEngine.timeline) {
          if (st) this._updateEngineTimeline(st);   // 时间线形：段落表达状态，音量恒定
        } else if (st) {
          this._updateEngineDrive(st);              // 新式双循环：由 main 每帧喂状态
        }
        return;
      }
      const t = this.ctx.currentTime;
      const vol = 0.15 + rpm01 * 0.55 + load01 * 0.15;
      this.extEngine.loopG.gain.setTargetAtTime(vol, t, 0.15);
      return;
    }
    if (!this.engineNodes) return;
    const { o1, o2, nf, g } = this.engineNodes;
    const t = this.ctx.currentTime;
    o1.frequency.setTargetAtTime(38 + rpm01 * 62, t, 0.08);
    o2.frequency.setTargetAtTime(19 + rpm01 * 30, t, 0.08);
    nf.frequency.setTargetAtTime(240 + rpm01 * 700, t, 0.1);
    g.gain.setTargetAtTime(0.05 + rpm01 * 0.16 + load01 * 0.05, t, 0.12);
  }

  // 新式发动机状态机（main 每帧喂 { active, atTop, spRatio, sp, aiming }）：
  // 连续声模型：active=有动力输入 → 加速段（踩油门沿触发一次性播放，未到极速）/ 巡航段（其后无缝循环）
  // 音量 100%（极速 80%）；松油门仍在动 → 巡航段继续，音量按速度 50%~80% 滑移；静止 → 怠速。
  // aiming=开镜舱内 ×0.7（敞开炮塔车豁免）。
  _updateEngineDrive({ active, atTop, spRatio, sp, aiming }) {
    const e = this.extEngine;
    if (!e || !e.newStyle) return;
    this._tickXLoops();               // 循环链接缝调度（双拷贝交叉淡化）
    const t = this.ctx.currentTime;
    e.attK = (aiming && !(this.ext && this.ext.openTop)) ? ENGINE_ATTAIN_K : 1;
    const pressEdge = active && !e._wasActive;
    if (active) {
      e.lastVol = (atTop ? ENGINE_VOL_TOP : ENGINE_VOL) * e.attK * (this.ext.cruiseVol || 1);
      this._stopDecelSeg();           // 再踩油门断减速停车音
      e.decelDone = false;
      if (pressEdge && e.accelG !== null && !atTop) this._startAccelOneShot();   // 踩油门沿：加速段播一遍
      const oneShot = !!(e.accelG !== null && e.accelChainSrc && !atTop && t < e.accelUntil);
      if (e.accelG !== null) {
        if (oneShot) {
          // 加速段一次性播放：accelG 逐帧直写（JS 侧平滑，不依赖自动化时间线）；
          // 末 0.4s 线性让位巡航链（两段内容相接，交叉过渡无截断），巡航链此期间先压 0
          const remain = e.accelUntil - t;
          this._writeAccelVol(e, t, remain < 0.4 ? e.lastVol * (remain / 0.4) : e.lastVol, 0.06);
          e.driveG.gain.setTargetAtTime(remain < 0.4 ? e.lastVol : 0, t, remain < 0.4 ? 0.3 : 0.2);
        } else {
          this._killAccelOneShot(e);
          this._writeAccelVol(e, t, 0, 0.1);
          e.driveG.gain.setTargetAtTime(e.lastVol, t, ENGINE_DRIVE_IN);
        }
      } else {
        e.driveG.gain.setTargetAtTime(e.lastVol, t, ENGINE_DRIVE_IN);
      }
      if (e.idleG) e.idleG.gain.setTargetAtTime(0, t, 0.2);
    } else if (sp > ENGINE_COAST_MIN_SP) {
      // 滑行：巡航段继续（加速段收），音量随速度滑移 50%→80%（衔接近无缝：滑行下限 ≈ 怠速档）
      e.lastVol = (ENGINE_COAST_MIN + ENGINE_COAST_SPAN * Math.min(Math.max(spRatio || 0, 0), 1)) * e.attK * (this.ext.cruiseVol || 1);
      this._killAccelOneShot(e);
      if (e.accelG !== null) this._writeAccelVol(e, t, 0, 0.2);
      e.driveG.gain.setTargetAtTime(e.lastVol, t, 0.3);
      if (e.idleG) e.idleG.gain.setTargetAtTime(0, t, 0.25);
    } else {
      // 静止：有怠速源 → 交还怠速；无（美/苏单文件形）→ 巡航循环低速代怠速
      // 带减速段的车（虎王/猎虎/美苏）在"动→停"沿播减速段一次收尾
      this._killAccelOneShot(e);
      if (e.accelG !== null) this._writeAccelVol(e, t, 0, 0.25);
      const hasDec = (this.ext.decel && this.ext.seg.decelTail) || this.ext.seg.driveDecelStart != null;
      if (hasDec && !e.decelDone && e._prevMoving) { this._playDecelSeg(); e.decelDone = true; }
      if (e.idleG) {
        e.driveG.gain.setTargetAtTime(0, t, 0.3);
        e.idleG.gain.setTargetAtTime(ENGINE_IDLE_VOL * e.attK, t, ENGINE_IDLE_TAU);
      } else {
        e.driveG.gain.setTargetAtTime(ENGINE_NOIDLE_STILL * e.attK, t, 0.4);
      }
    }
    e._prevMoving = active || sp > ENGINE_COAST_MIN_SP;
    e._wasActive = active;
  }

  // ── 时间线形发动机（虎式单文件录音，seg.timeline=true）：音量恒定，行驶状态由录音段落表达——
  // 踩油门：加速段 [0, driveAccel] 一次性 → 交巡航循环 [driveCruiseStart, driveCruiseEnd]；
  // 松油门沿：减速段 [driveDecelStart, driveDecelEnd] 起播，播完自 idleStart 无缝续入怠速循环
  // （同一录音源内 loopStart 切换，见 _startDecelIdle）；再踩油门打断减速段重新加速。
  // 唯一音量系数：开镜舱内 ×0.7（敞炮塔车豁免）。
  _updateEngineTimeline({ active, atTop, aiming }) {
    const e = this.extEngine;
    if (!e || !e.newStyle) return;
    this._tickXLoops();               // 循环链接缝调度（双拷贝交叉淡化）
    const t = this.ctx.currentTime;
    const vol = ENGINE_VOL * ((aiming && !(this.ext && this.ext.openTop)) ? ENGINE_ATTAIN_K : 1);
    if (active) {
      this._stopDecelSeg();           // 再踩油门断减速→怠速源
      e.decelDone = false;
      if (!e._wasActive && e.accelG !== null && !atTop) this._startAccelOneShot();   // 踩油门沿：加速段播一遍
      const oneShot = !!(e.accelG !== null && e.accelChainSrc && !atTop && t < e.accelUntil);
      if (e.accelG !== null) {
        if (oneShot) {
          // 加速段一次性播放：末 0.4s 线性让位巡航链（两段内容相接，交叉过渡无截断）
          const remain = e.accelUntil - t;
          this._writeAccelVol(e, t, remain < 0.4 ? vol * (remain / 0.4) : vol, 0.06);
          e.driveG.gain.setTargetAtTime(remain < 0.4 ? vol : 0, t, remain < 0.4 ? 0.3 : 0.2);
        } else {
          this._killAccelOneShot(e);
          this._writeAccelVol(e, t, 0, 0.1);
          e.driveG.gain.setTargetAtTime(vol, t, ENGINE_DRIVE_IN);
        }
      } else {
        e.driveG.gain.setTargetAtTime(vol, t, ENGINE_DRIVE_IN);
      }
      if (e.idleG) e.idleG.gain.setTargetAtTime(0, t, 0.2);
    } else {
      this._killAccelOneShot(e);
      if (e.accelG !== null) this._writeAccelVol(e, t, 0, 0.15);
      e.driveG.gain.setTargetAtTime(0, t, 0.25);
      if (e._wasActive && this.ext.seg.driveDecelStart != null && !e.decelDone) { this._startDecelIdle(vol); e.decelDone = true; }
      if (e.decelSrc) {
        // 减速→怠速源接管中（减速段播完自动循环怠速段），恒定音量，无需逐帧写
      } else if (e.idleG) {
        e.idleG.gain.setTargetAtTime(vol * ENGINE_TL_IDLE, t, 0.3);   // 尚未行驶过（开战静止）：常驻怠速链（怠速段压 70%）
      } else {
        e.driveG.gain.setTargetAtTime(vol, t, 0.4);
      }
    }
    e._wasActive = active;
  }

  // 时间线形减速→怠速：减速段 [driveDecelStart, driveDecelEnd] 一次性播放，结束沿接怠速循环
  // [idleStart, idleEnd]（两段调度衔接，源内不 loop——减速段与怠速段之间的录音杂音区不进播放）；
  // 段间 0.12s 交叉淡化防爆音；再踩油门由 _stopDecelSeg 同时打断两段
  _startDecelIdle(vol) {
    const e = this.extEngine;
    if (!e || !this.ext || !this.ext.drive) return;
    const s0 = this.ext.seg.driveDecelStart;
    const s1 = this.ext.seg.driveDecelEnd != null ? this.ext.seg.driveDecelEnd : this.ext.seg.idleStart;
    const i0 = this.ext.seg.idleStart || 0;
    const i1 = this.ext.seg.idleEnd != null ? Math.min(this.ext.seg.idleEnd, this.ext.drive.duration)
      : (this.ext.idle ? this.ext.idle.duration : this.ext.drive.duration);
    if (s0 == null || !(s1 > s0) || !(i1 > i0)) return;
    const ctx = this.ctx, t = ctx.currentTime, decLen = s1 - s0, XF = 0.12;
    const src = ctx.createBufferSource();
    src.buffer = this.ext.drive;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(vol, t + decLen - XF);
    g.gain.linearRampToValueAtTime(0, t + decLen);
    src.connect(g); g.connect(this.sfxGain);
    src.start(t, s0, decLen);
    const isrc = ctx.createBufferSource();
    isrc.buffer = this.ext.idle || this.ext.drive;
    isrc.loop = true;
    isrc.loopStart = i0;
    isrc.loopEnd = i1;
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(0, t + decLen - XF);
    ig.gain.linearRampToValueAtTime(vol * ENGINE_TL_IDLE, t + decLen);   // 怠速段压 70%（减速段保持全量）
    isrc.connect(ig); ig.connect(this.sfxGain);
    isrc.start(t + decLen, i0);
    e.decelSrc = src; e.decelG = g;
    e.decelIdleSrc = isrc; e.decelIdleG = ig;
  }

  // ── 换档形发动机（虎式实验 tiger-eg2/egAll2，seg.gear）：音量恒定（开镜 ×0.7），档位模拟——
  // 踩油门 → 按车速带落入档位，循环对应梯度加速段（三段逐段强 = 录音自带，模拟 1/2/3 档）；
  // 相邻档切换（升/降档）播段间衔接音（换档哐当声），播完尾接新档循环；跨档/进出巡航直接切；
  // 达极速（≥95%）→ 巡航循环 [cruiseStart, 文件尾]；松油门滑行保持当前档；停车（<0.8m/s）衔接怠速文件。
  _updateEngineGear({ active, atTop, spRatio, sp, aiming }) {
    const e = this.extEngine;
    if (!e || !e.gear) return;
    this._tickXLoops();               // 循环链接缝调度（双拷贝交叉淡化）
    const t = this.ctx.currentTime;
    const vol = ENGINE_VOL * ((aiming && !(this.ext && this.ext.openTop)) ? ENGINE_ATTAIN_K : 1);
    const NG = e.gears.length;
    if (active) {
      let tgt;
      if (atTop || spRatio >= 0.95) tgt = NG;   // 巡航 = 第 NG 档位（紧接最后加速段）
      else tgt = Math.max(0, Math.min(NG - 1, Math.floor((spRatio || 0) / (0.95 / NG))));
      if (tgt !== e.curDrive) {
        // 相邻档切换 → 播段间衔接音（换档声），衔接音尾部定时接新档循环；其余直接切
        let shiftLen = 0;
        if (e.curDrive >= 0 && Math.abs(tgt - e.curDrive) === 1 && tgt < NG) {
          const gSeg = e.gears[Math.min(tgt, e.curDrive)];
          if (gSeg && gSeg.shiftEnd != null && gSeg.shiftEnd > gSeg.end) {
            this._startShiftOneShot(gSeg.end, gSeg.shiftEnd);
            shiftLen = gSeg.shiftEnd - gSeg.end;
          }
        }
        this._setGearChain(tgt, t + shiftLen);
        e.curDrive = tgt;
      }
      e.driveG.gain.setTargetAtTime(vol, t, 0.2);
      if (e.idleG) e.idleG.gain.setTargetAtTime(0, t, 0.2);
    } else if (sp > 0.8) {
      // 滑行：保持当前档位循环（不降档），音量恒定
      e.driveG.gain.setTargetAtTime(vol, t, 0.3);
      if (e.idleG) e.idleG.gain.setTargetAtTime(0, t, 0.25);
    } else {
      // 停车：衔接怠速文件循环（怠速音量 ×0.7，与时间线形一致）
      e.curDrive = -1;
      e.driveG.gain.setTargetAtTime(0, t, 0.35);
      if (e.idleG) e.idleG.gain.setTargetAtTime(vol * ENGINE_TL_IDLE, t, 0.4);
    }
    e._wasActive = active;
  }

  // 切换档位循环链：tgt ≥ 档位数 = 巡航 [cruiseStart, 文件尾]；否则循环对应梯度段 [start, end]。
  // when>0 = 定时起播（衔接音尾部无缝进新档）；旧链立即停（衔接音填充空隙）
  _setGearChain(tgt, when) {
    const e = this.extEngine;
    const buf = this.ext.drive;
    let s0, s1;
    if (tgt >= e.gears.length) { s0 = e.cruiseStart; s1 = buf.duration; }
    else { s0 = e.gears[tgt].start; s1 = e.gears[tgt].end; }
    if (e.driveChain) this._stopXLoop(e.driveChain);
    e.driveChain = this._startXLoop(e.driveG, buf, s0, s1, when);
  }

  // 换档衔接音一次性播放（段间录音素材）：短起音防爆音，尾部 0.05s 收给新档循环
  _startShiftOneShot(from, to) {
    const e = this.extEngine;
    const ctx = this.ctx, t = ctx.currentTime, len = to - from;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ENGINE_VOL, t + 0.05);
    g.gain.setValueAtTime(ENGINE_VOL, t + len - 0.05);
    g.gain.linearRampToValueAtTime(0, t + len);
    const src = ctx.createBufferSource();
    src.buffer = this.ext.drive;
    src.connect(g); g.connect(this.sfxGain);
    src.start(t, from, len);
    src.onended = () => { try { g.disconnect(); } catch (err) {} };
    e.accelG = g; e.accelChainSrc = src; e.accelUntil = t + len;   // 复用字段：killEngine/stopEngine 统一清理
  }

  // 加速段一次性播放：踩油门沿从段首播到段尾（不循环——循环会在长加速中反复跳回段首造成截断感），
  // 播完由 onended 交还巡航链（内容相接）；末尾 0.2s 与巡航链交叉淡化
  _startAccelOneShot() {
    const e = this.extEngine;
    if (!e || !this.ext.drive || !e.accelSeg) return;
    this._killAccelOneShot(e);
    // accelG 每次重建（直写平滑不走自动化时间线，重建只是换干净节点），旧节点延迟摘除
    const ctx = this.ctx;
    const oldG = e.accelG;
    if (oldG) setTimeout(() => { try { oldG.disconnect(); } catch (err) {} }, 300);
    const g = ctx.createGain(); g.gain.value = 0; g.connect(this.sfxGain);
    e.accelG = g;
    e._accelVol = 0; e._lastT = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.ext.drive;
    src.connect(g);
    src.start(0, 0, e.accelSeg);
    e.accelChainSrc = src;
    e.accelUntil = ctx.currentTime + e.accelSeg;
  }

  // accelG 逐帧直写平滑（指数趋近 target，τ 秒常数；绕开自动化时间线冻结问题）
  _writeAccelVol(e, t, target, tau) {
    if (!Number.isFinite(e._accelVol)) e._accelVol = 0;
    const dt = Math.max(0.001, Math.min(0.1, t - (e._lastT || t)));
    e._lastT = t;
    e._accelVol = target + (e._accelVol - target) * Math.exp(-dt / tau);
    if (Number.isFinite(e._accelVol)) e.accelG.gain.value = e._accelVol;
  }

  _killAccelOneShot(e) {
    if (!e) return;
    if (e.accelChainSrc) { try { e.accelChainSrc.stop(); } catch (err) {} e.accelChainSrc = null; }
    e.accelUntil = 0;
  }

  // ── 无缝循环链：双拷贝交叉淡化。旧源到循环尾前 XF 秒调度下一份拷贝（从段首起），
  // 在接缝两侧等功率交叉淡化——消除硬跳回的波形断点（循环截断感）
  _startXLoop(out, buf, start, end, when = 0) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 1; g.connect(out);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start(when, start);
    // when=0 → 立即起播；when>0 → 定时起播（换档衔接音尾部接新档循环），endTime 同步后移
    const t0 = when > 0 ? when : ctx.currentTime;
    const L = { buf, start, end, out, cur: { src, g, endTime: t0 + (end - start) } };
    this._xloops.push(L);
    return L;
  }

  _tickXLoops() {
    const ctx = this.ctx;
    const XF = 0.15;
    for (const L of this._xloops) {
      if (L.dead) continue;
      const c = L.cur;
      if (ctx.currentTime < c.endTime - XF) continue;
      const late = ctx.currentTime >= c.endTime;   // 暂停等错过接缝：立即从段首续（允许一次轻微接点）
      const seam = late ? ctx.currentTime + 0.02 : c.endTime;
      if (late) { try { c.src.stop(); } catch (e) {} try { c.g.disconnect(); } catch (e) {} }
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(late ? 1 : 0, Math.max(0, seam - XF / 2));
      g2.gain.linearRampToValueAtTime(1, seam + XF / 2);
      const s2 = ctx.createBufferSource();
      s2.buffer = L.buf;
      s2.connect(g2); g2.connect(L.out);
      s2.start(seam, L.start);
      if (!late) {
        c.g.gain.setValueAtTime(1, Math.max(0, seam - XF / 2));
        c.g.gain.linearRampToValueAtTime(0, seam + XF / 2);
        const oldSrc = c.src, oldG = c.g;
        setTimeout(() => { try { oldSrc.stop(); } catch (e) {} try { oldG.disconnect(); } catch (e) {} }, Math.max(0, (seam + XF) * 1000 - performance.now()) + 120);
      }
      L.cur = { src: s2, g: g2, endTime: seam + (L.end - L.start) };
    }
  }

  _stopXLoop(L) {
    if (!L) return;
    L.dead = true;
    if (L.cur) { try { L.cur.src.stop(); } catch (e) {} try { L.cur.g.disconnect(); } catch (e) {} }
    this._xloops = this._xloops.filter((x) => x !== L);
  }

  // 减速停车音（cfg.sound.decel）：动→停沿播末尾 decelTail 秒一次，音量随时间衰减
  _playDecelSeg() {
    const e = this.extEngine;
    if (!e || !this.ext) return;
    const ctx = this.ctx, t = ctx.currentTime;
    let buf, off, len;
    if (this.ext.decel && this.ext.seg.decelTail) {
      // 独立减速文件（虎王/猎虎 egDown）：末 decelTail 秒
      buf = this.ext.decel;
      len = Math.min(this.ext.seg.decelTail, buf.duration);
      off = buf.duration - len;
    } else if (this.ext.seg.driveDecelStart != null) {
      // 同文件减速段（美/苏单文件形）：[driveDecelStart, driveDecelEnd||文件尾]
      buf = this.ext.drive;
      off = this.ext.seg.driveDecelStart;
      len = Math.min((this.ext.seg.driveDecelEnd != null ? this.ext.seg.driveDecelEnd : buf.duration) - off, buf.duration - off);
    } else return;
    if (len <= 0.05) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const vol = Math.max(0.15, e.lastVol || 0.5);
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g); g.connect(this.sfxGain);
    src.start(t, off, len);
    src.onended = () => { if (e.decelSrc === src) e.decelSrc = null; };
    e.decelSrc = src; e.decelG = g;
  }

  _stopDecelSeg() {
    const e = this.extEngine;
    if (!e) return;
    if (e.decelSrc) { try { e.decelSrc.stop(); } catch (err) {} e.decelSrc = null; }
    if (e.decelIdleSrc) { try { e.decelIdleSrc.stop(); } catch (err) {} e.decelIdleSrc = null; }
  }

  // 击毁/发动机熄火：全部引擎声淡出（destroyed 后 main 不再喂状态，此处兜底静音）
  killEngine() {
    if (this.extEngine) {
      const t = this.ctx.currentTime;
      if (this.extEngine.idleG) this.extEngine.idleG.gain.setTargetAtTime(0, t, 0.6);
      this.extEngine.driveG.gain.setTargetAtTime(0, t, 0.6);
      if (this.extEngine.accelG) this.extEngine.accelG.gain.value = 0;
      if (this.extEngine.accelChainSrc) { try { this.extEngine.accelChainSrc.stop(); } catch (err) {} this.extEngine.accelChainSrc = null; }
      this._stopXLoop(this.extEngine.idleChain);
      this._stopXLoop(this.extEngine.driveChain);
      this._stopDecelSeg();
      return;
    }
    if (this.engineNodes) this.engineNodes.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }

  stopEngine() {
    if (this.extEngine) {
      if (this.extEngine.newStyle) {
        const e = this.extEngine;
        const t = this.ctx.currentTime;
        if (e.idleG) e.idleG.gain.setTargetAtTime(0, t, 0.25);
        e.driveG.gain.setTargetAtTime(0, t, 0.25);
        if (e.accelG) e.accelG.gain.setTargetAtTime(0, t, 0.25);
        // 熄火收尾：减速文件末段（虎王/猎虎 egDown）优先，否则行驶音尾段（减速段/怠速段）自然播一遍
        if (this.ext && this.ext.drive) {
          const useDec = this.ext.decel && this.ext.seg.decelTail;
          const sdBuf = useDec ? this.ext.decel : this.ext.drive;
          const sdTail = useDec ? this.ext.seg.decelTail : (this.ext.seg.driveIdle || this.ext.seg.driveTail || 3.5);
          const off = Math.max(0, sdBuf.duration - sdTail);
          const src = this.ctx.createBufferSource();
          src.buffer = sdBuf;
          const g = this.ctx.createGain(); g.gain.value = 0.7;
          src.connect(g); g.connect(this.sfxGain);
          src.start(t, off);
        }
        this._stopDecelSeg();
        if (e.accelChainSrc) { try { e.accelChainSrc.stop(); } catch (err) {} }
        this._stopXLoop(e.idleChain);
        this._stopXLoop(e.driveChain);
        this.extEngine = null;
        return;
      }
      const { loopSrc, loopG, startSrc } = this.extEngine;
      loopG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      setTimeout(() => { try { loopSrc.stop(); } catch (e) {} }, 800);
      try { startSrc.stop(); } catch (e) {}
      this.extEngine = null;
      // 引擎消失段（engineLoopEnd ~ end）
      if (this.ext && this.ext.engine) {
        const ctx = this.ctx;
        const fadeStart = this.ext.seg.engineLoopEnd;
        if (fadeStart && this.ext.engine.duration > fadeStart) {
          const fadeSrc = ctx.createBufferSource();
          fadeSrc.buffer = this.ext.engine;
          const fadeG = ctx.createGain(); fadeG.gain.value = 0.7;
          fadeSrc.connect(fadeG); fadeG.connect(this.sfxGain);
          fadeSrc.start(0, fadeStart);
        }
      }
      return;
    }
    if (!this.engineNodes) return;
    const { o1, o2, g } = this.engineNodes;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 800);
    this.engineNodes = null;
  }

  // ── 主炮射击（近距离自身开火） ──
  playFire(power = 1, aiming = false) {
    if (!this.started) return;
    if (this.ext) {
      let buf = (aiming && this.ext.fireAim) ? this.ext.fireAim : this.ext.fire;
      if (Array.isArray(buf)) buf = buf.length ? buf[(Math.random() * buf.length) | 0] : null;   // 多音源每发随机
      if (buf) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = power;
        src.connect(g); g.connect(this.sfxGain);
        src.start();
        return;
      }
    }
    const ctx = this.ctx, t = ctx.currentTime;
    // 低频炮口冲击
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(60, t); sub.frequency.exponentialRampToValueAtTime(24, t + 0.35);
    const subG = ctx.createGain(); subG.gain.setValueAtTime(1.5 * power, t);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    sub.connect(subG); subG.connect(this.sfxGain); sub.start(t); sub.stop(t + 0.55);
    // 爆音噪声
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.6);
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass';
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(1.1 * power, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    n.connect(bp); bp.connect(ng); ng.connect(this.sfxGain); n.start(t);
    // 金属尾音
    const ring = ctx.createOscillator(); ring.type = 'triangle'; ring.frequency.value = 840;
    const rg = ctx.createGain(); rg.gain.setValueAtTime(0.06 * power, t);
    rg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    ring.connect(rg); rg.connect(this.sfxGain); ring.start(t + 0.05); ring.stop(t + 1);
  }

  // ── 机枪单发（AI 扫射用）：外部音效播 mg 单发脉冲段；无外部音效回退程序化脉冲 ──
  playMGShot(vol = 1) {
    if (!this.started) return;
    if (this.ext && this.ext.mg) {
      const segStart = this.ext.seg.mgLoopStart || 0;
      const segEnd = this.ext.seg.mgLoopEnd || this.ext.seg.mgFire || 0.20;
      const src = this.ctx.createBufferSource();
      src.buffer = this.ext.mg;
      const g = this.ctx.createGain(); g.gain.value = 0.5 * vol;
      src.connect(g); g.connect(this.sfxGain);
      src.start(0, segStart, Math.max(0.05, segEnd - segStart));
      return;
    }
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.08);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.22 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp); bp.connect(g); g.connect(this.sfxGain); n.start(t);
  }

  // ── 机枪循环（外部音效：循环 mgLoopStart~mgLoopEnd 段；key 区分同轴/前机枪双枪并发） ──
  startMGLoop(key = 'coax') {
    if (!this.started || this.extMGLoops.has(key)) return;
    if (!this.ext || !this.ext.mg) return;
    const ctx = this.ctx;
    const loopStart = this.ext.seg.mgLoopStart || 0;
    const loopEnd = this.ext.seg.mgLoopEnd || this.ext.seg.mgFire || 0.20;
    const src = ctx.createBufferSource();
    src.buffer = this.ext.mg;
    src.loop = true;
    src.loopStart = loopStart;
    src.loopEnd = loopEnd;
    const g = ctx.createGain(); g.gain.value = 0.8;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
    this.extMGLoops.set(key, { src, g });
  }

  // ── 停机枪循环（同轴枪停时播回响段 mgLoopEnd ~ end 收尾） ──
  stopMGLoop(key = 'coax') {
    const lp = this.extMGLoops.get(key);
    if (!lp) return;
    this.extMGLoops.delete(key);
    lp.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => { try { lp.src.stop(); } catch (e) {} }, 120);
    if (key === 'coax' && this.ext && this.ext.mg) {
      const ctx = this.ctx;
      const echoStart = this.ext.seg.mgLoopEnd || this.ext.seg.mgFire || 0.20;
      if (this.ext.mg.duration > echoStart) {
        const echoSrc = ctx.createBufferSource();
        echoSrc.buffer = this.ext.mg;
        const echoG = ctx.createGain(); echoG.gain.value = 0.6;
        echoSrc.connect(echoG); echoG.connect(this.sfxGain);
        echoSrc.start(0, echoStart);
      }
    }
  }

  // ── 远方炮声（敌方开火，随距离衰减在调用方控制） ──
  playDistantFire(vol = 0.4) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    n.connect(lp); lp.connect(g); g.connect(this.sfxGain); n.start(t);
  }

  // ── 爆炸（规模 0.5~3） ──
  playExplosion(scale = 1, dist01 = 0) {
    if (!this.started) return;
    // 外部音效：附近爆炸/击毁/殉爆
    if (this.sfxExt) {
      const vol = Math.max(0.2, 1 - dist01 * 0.8);
      let buf = null;
      if (scale <= 0.5 && this.sfxExt.exoNear) {
        buf = this.sfxExt.exoNear;
      } else if (scale >= 2.0 && this.sfxExt.exo.length >= 3) {
        buf = this.sfxExt.exo[2];   // exo-3 适合殉爆
      } else if (this.sfxExt.exo.length) {
        buf = this.sfxExt.exo[Math.floor(Math.random() * this.sfxExt.exo.length)];
      }
      if (buf) { this._playBuffer(buf, vol); return; }
    }
    const ctx = this.ctx, t = ctx.currentTime;
    const vol = scale * (1 - dist01 * 0.8);
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(90, t); sub.frequency.exponentialRampToValueAtTime(18, t + 0.8 * scale);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(1.6 * vol, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.1 * scale);
    sub.connect(sg); sg.connect(this.sfxGain); sub.start(t); sub.stop(t + 1.2 * scale);
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(1.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400 - dist01 * 1800, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.2 * scale);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(1.2 * vol, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 1.4 * scale);
    n.connect(lp); lp.connect(ng); ng.connect(this.sfxGain); n.start(t);
    // 碎片噼啪
    for (let i = 0; i < 4; i++) {
      const d = 0.15 + Math.random() * 0.8;
      const c = ctx.createBufferSource(); c.buffer = this._noiseBuffer(0.05);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.12 * vol * Math.random(), t + d);
      cg.gain.exponentialRampToValueAtTime(0.001, t + d + 0.08);
      c.connect(hp); hp.connect(cg); cg.connect(this.sfxGain); c.start(t + d);
    }
  }

  // ── 跳弹（金属擦响） ──
  playRicochet() {
    if (!this.started) return;
    if (this.sfxExt && this.sfxExt.hitMis) { this._playBuffer(this.sfxExt.hitMis, 0.8); return; }
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f0 = 2400 + Math.random() * 800;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.6);
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(hp); hp.connect(ng); ng.connect(this.sfxGain); n.start(t);
  }

  // ── 距离衰减（命中/碰撞类）：120m 内全量，之后线性衰减，1120m 触底 0.08 ──
  setListenerPos(v) { if (!v) return; this.listenerPos.x = v.x; this.listenerPos.y = v.y; this.listenerPos.z = v.z; }
  _hitAtten(d) {
    if (d == null || !Number.isFinite(d)) return 1;
    if (d <= 120) return 1;
    return Math.max(0.08, 1 - (d - 120) / 1000);
  }

  // ── 命中装甲（未击穿的闷响 / 击穿的撕裂声）；dist=命中点到听者距离（米），按距离衰减 ──
  playHitArmor(penetrated, dist = null) {
    if (!this.started) return;
    const at = this._hitAtten(dist);
    if (this.sfxExt) {
      const arr = penetrated ? this.sfxExt.behit : this.sfxExt.behitOut;
      if (arr.length) { this._playBuffer(arr[Math.floor(Math.random() * arr.length)], 0.8 * at); return; }
    }
    const ctx = this.ctx, t = ctx.currentTime;
    if (penetrated) {
      const n = ctx.createBufferSource(); n.buffer = this._noiseBuffer(0.5);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * at, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      n.connect(bp); bp.connect(g); g.connect(this.sfxGain); n.start(t);
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.3 * at, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(og); og.connect(this.sfxGain); o.start(t); o.stop(t + 0.4);
    } else {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 320;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.4 * at, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.3);
    }
  }

  // ── 装填完成提示 ──
  playReloaded() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t);
    g.gain.setValueAtTime(0.08, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.15);
  }

  playUIClick() {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.1);
  }

  // ── 起火循环 ──
  startFire() {
    // 程序化着火音（LFO 脉冲噪声）已移除——待替换为配音文件；startFire/stopFire 接口保留
  }
  stopFire() {
    if (!this.fireNodes) return;
    const { n, lfo, g } = this.fireNodes;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => { try { n.stop(); lfo.stop(); } catch (e) {} }, 1000);
    this.fireNodes = null;
  }

  // ── 烟雾弹音效 ──
  async loadSmokeSounds() {
    if (this.smokeSfx) return;
    try {
      const [launch, expand] = await Promise.all([
        this._decodeMp3('sound/smoke-sant.mp3'),
        this._decodeMp3('sound/smoke-pok.mp3'),
      ]);
      this.smokeSfx = { launch, expand };
    } catch (e) {
      console.warn('烟雾音效加载失败', e);
    }
  }

  playSmokeLaunch() {
    if (!this.started || !this.smokeSfx || !this.smokeSfx.launch) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.smokeSfx.launch;
    const g = ctx.createGain(); g.gain.value = 0.7;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
    // 1.5s 后播放展开音
    setTimeout(() => this.playSmokeExpand(), 1500);
  }

  playSmokeExpand() {
    if (!this.started || !this.smokeSfx || !this.smokeSfx.expand) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.smokeSfx.expand;
    const g = ctx.createGain(); g.gain.value = 0.6;
    src.connect(g); g.connect(this.sfxGain);
    src.start();
  }
}

export const audio = new AudioManager();
if (typeof window !== 'undefined') window.__audio = audio;   // 调试/自动化验证钩子
