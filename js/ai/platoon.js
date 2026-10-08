// ═══ 排级大脑 PlatoonAI（docs/ai-redesign-plan.md §5）：角色分配 / 阶段流程 / 开火时序 / 编队槽位 ═══
// 仅标准/王牌难度且敌车数 ≥2 时由 main.js 创建（新兵档不建排=独狼）；n=1 退化由 TankAI 自身兜底。
// 排级只下达「指令」（order），个体状态机/超时/脱困仍归 TankAI；watchdog/节奏总监在个体层运行。
//
// 指令类型（ai.order）：
//   { type:'march',  point:{x,z} }            行军槽位（楔形编队，§5.2-1）
//   { type:'hold' }                           戒备原地（德伏击扇面/美英压制车）
//   { type:'charge' }                         戒备推进（苏冲锋/美英侦查单元）
//   { type:'anchor' }                         交战锚点：正面吸引（个体层 tilt/短停）
//   { type:'flank', point, since }            侧翼包抄点（到位自动转 'auto'；8s 未到位超时转 'auto'）
//   { type:'sniper', holdFire }               狙击/伏击：王牌延迟开火（等锚点吸引）
//   { type:'auto' }                           个体自主（默认）

import { roleProfile } from './roles.js';
import { doctrineOf } from './doctrine.js';



export class PlatoonAI {
  constructor(ais, player, visibility) {
    // 地图矩形边界（普罗霍罗夫卡 1500×2000 → x±690 / z±940；方形图 = size）
    const w0 = ais[0] && ais[0].tank && ais[0].tank.world;
    this.boundX = ((w0 && w0.mapSizeX) || 2200) / 2 - 60;
    this.boundZ = ((w0 && w0.mapSizeZ) || (w0 && w0.mapSize) || 2200) / 2 - 60;
    this.ais = ais;
    this.player = player;
    this.visibility = visibility;
    this.diff = ais[0].diff;
    this.isAce = !!this.diff.shortStop;      // 王牌档标记（短停射击独占特性）
    this.doctrine = doctrineOf(ais[0].tank.cfg.nation);
    this.clock = 0;
    this.phase = 'march';
    this.phaseT = 0;
    this.lastAnchorFire = -99;

    // ── 推进轴线（出生质心 → 地图中心并延伸敌半区；军队知道前线方向，不给精确坐标） ──
    const n = ais.length;
    const cx = ais.reduce((s, a) => s + a.tank.pos.x, 0) / n;
    const cz = ais.reduce((s, a) => s + a.tank.pos.z, 0) / n;
    const l = Math.hypot(cx, cz) || 1;
    this.axis = { x: -cx / l, z: -cz / l };
    this.spawnC = { x: cx, z: cz };
    this.lineDist = 0;                       // 行进线沿轴推进里程（驱动编队前进）
    this.lineSpeed = 4.5;                    // m/s，照顾重坦持续闭队（成员 0.8 油门跟随）

    // ── 成员与任务分配（§5.1 + 任务替补链：搜索/前出是任务分配非角色绑定） ──
    this.members = ais.map((ai, i) => {
      const prof = roleProfile(ai.tank.cfg);
      return { ai, tank: ai.tank, role: prof.role, slotK: i - (n - 1) / 2, task: null };
    });
    const free = () => this.members.filter(m => !m.task && m.tank && !m.tank.destroyed);
    const take = (roles, task) => {
      const m = free().find(m => roles.includes(m.role)) || null;
      if (m) m.task = task;
      return m;
    };
    take(['scout'], 'probe');                                  // 侦查前出
    take(['anchor'], 'anchor') || take(['brawler'], 'anchor'); // 锚点（无重坦则中坦顶）
    take(['brawler'], 'flanker') || take(['scout'], 'flanker');// 猎杀组（无则侦查客串）
    for (const m of free()) m.task = (m.role === 'sniper' || m.role === 'ambusher') ? 'sniper' : 'anchor';
    // 首帧指令由首个 update() 下发（个体层 order=null 时回退个体 POI 搜索，安全）
  }

  // ── 槽位几何（§7.1：楔形、间距 ≥80m）：横向按 slotK 等距展开（110m 间隔），纵向按任务提前/靠后 ──
  _slotFor(m) {
    const lead = { probe: 120, flanker: 60, anchor: 0, sniper: -80 }[m.task] ?? 0;
    const lat = m.slotK * 110;   // 全员按槽位序号等距横向展开（任意组合不撞线）
    const fwd = this.lineDist + lead;
    const px = this.spawnC.x + this.axis.x * fwd + (-this.axis.z) * lat;
    const pz = this.spawnC.z + this.axis.z * fwd + (this.axis.x) * lat;
    return {
      x: Math.max(-this.boundX, Math.min(this.boundX, px)),
      z: Math.max(-this.boundZ, Math.min(this.boundZ, pz)),
    };
  }

  // ── 包抄点（§5.2-3）：玩家位置 + 轴偏转 80° × 350m，取离本车较近一侧 ──
  _flankPoint(m) {
    const BX = this.boundX, BZ = this.boundZ;
    const p = this.player;
    for (const side of (m.slotK >= 0 ? [1, -1] : [-1, 1])) {
      const a = Math.atan2(this.axis.x, this.axis.z) + side * 80 * Math.PI / 180;
      const x = p.pos.x + Math.sin(a) * 350, z = p.pos.z + Math.cos(a) * 350;
      if (Math.abs(x) <= this.boundX && Math.abs(z) <= this.boundZ) return { x, z };
    }
    return { x: p.pos.x + this.axis.x * 300, z: p.pos.z + this.axis.z * 300 };
  }

  _setPhase(p) {
    if (this.phase !== p) { this.phase = p; this.phaseT = 0; }
  }

  // ── 每帧（main.js 先于个体 ai.update 调用） ──
  update(dt) {
    this.clock += dt;
    this.phaseT += dt;
    const alive = this.members.filter(m => !m.tank.destroyed);
    if (!alive.length || this.player.destroyed) return;

    // 排级接触聚合（直接查 visibility，无帧延迟）
    let anySpotted = false, anySuspected = false, anyLost = false;
    for (const m of alive) {
      const ci = this.visibility.contactInfo(m.tank, this.player);
      if (ci.spotted) anySpotted = true;
      else if (ci.suspected) anySuspected = true;
      else if (ci.lost) anyLost = true;
    }

    // ── 阶段流转（§5.2） ──
    if (anySpotted) this._setPhase('engage');
    else if (anySuspected) this._setPhase('alert');
    else if (anyLost) this._setPhase('lost');
    else this._setPhase('march');

    if (this.phase === 'march') {
      // 行军：行进线前移 + 槽位指令
      this.lineDist = Math.min(this.lineDist + this.lineSpeed * dt, 1500);
      for (const m of alive) {
        m.ai.order = { type: 'march', point: this._slotFor(m) };
      }
    } else if (this.phase === 'alert') {
      // 戒备反应按 doctrine（§2 接触反应列）
      const react = this.doctrine.contactReaction;
      for (const m of alive) {
        if (react === 'charge') m.ai.order = { type: 'charge' };                    // 苏：全队转向提速
        else if (react === 'ambush') m.ai.order = { type: 'hold' };                 // 德：就地伏击扇面
        else m.ai.order = m.task === 'probe' ? { type: 'charge' } : { type: 'hold' }; // 美/英：侦查单元试探，其余原地
      }
    } else if (this.phase === 'engage') {
      for (const m of alive) {
        const o = m.ai.order;
        // flank 到位/超时（§5.4 协同替补：8s 未到位转自主）
        if (o && o.type === 'flank') {
          const arrived = Math.hypot(o.point.x - m.tank.pos.x, o.point.z - m.tank.pos.z) < 25;
          if (arrived || this.clock - o.since > 8) { m.ai.order = { type: 'auto' }; continue; }
          continue;   // flank 指令保持
        }
        if (m.task === 'sniper') {
          // 王牌延迟开火（§4.1）：等锚点吸引 4s；被打（_justHit）立即解除
          const holdFire = this.isAce && this.phaseT < 4 && !m.ai._justHit;
          m.ai.order = { type: 'sniper', holdFire };
        } else if (m.task === 'flanker') {
          m.ai.order = { type: 'flank', point: this._flankPoint(m), since: this.clock };
        } else if (m.task === 'anchor') {
          m.ai.order = { type: 'anchor' };
        } else {
          m.ai.order = { type: 'auto' };
        }
      }
    } else if (this.phase === 'lost') {
      // 失联：锚点留守，猎杀组继续按个体失联逻辑（包抄最后位置），侦查搜索——清指令交还个体
      for (const m of alive) m.ai.order = { type: 'auto' };
    }
  }

  // ── 开火时序（§5.3，王牌）：锚点开火后 2s 内猎杀组不开火（保持压力连续） ──
  fireStaggerOk(ai) {
    if (!this.isAce) return true;
    if (ai.order && ai.order.type === 'flank' && this.clock - this.lastAnchorFire < 2) return false;
    return true;
  }
  notifyFire(ai) {
    if (ai.order && ai.order.type === 'anchor') this.lastAnchorFire = this.clock;
  }
}
