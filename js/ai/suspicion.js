// ═══ 怀疑度地图（docs/ai-redesign-plan.md §5.5）：排级共享的「搜索建议层」 ═══
// 200m 网格热度图 + 时间衰减（半衰期 45s）。
// 分层铁律：本图只做搜索/包抄/dwell 目标的**建议**；单体认知等级仍由 visibility/contactInfo 唯一裁决，
// 不向 visibility 反写——避免两套真相。
export class SuspicionMap {
  constructor() {
    this.cell = 200;           // 格距 m
    this.heat = new Map();     // "ix,iz" → { x, z, heat, lastT }
    this.now = 0;
  }
  _cellOf(x, z) { return [Math.round(x / this.cell), Math.round(z / this.cell)]; }

  update(dt) {
    this.now += dt;
    for (const [k, c] of this.heat) {
      c.heat *= Math.pow(0.5, dt / 45);          // 半衰期 45s
      if (c.heat < 0.05) this.heat.delete(k);
    }
  }

  add(x, z, amount = 1) {
    const [ix, iz] = this._cellOf(x, z);
    const k = ix + ',' + iz;
    let c = this.heat.get(k);
    if (!c) { c = { x: ix * this.cell, z: iz * this.cell, heat: 0, lastT: this.now }; this.heat.set(k, c); }
    c.heat = Math.min(c.heat + amount, 4);       // 单格上限 4（连发不无限叠）
    c.lastT = this.now;
  }

  // 最热格（无热点返回 null）
  hottest() {
    let best = null;
    for (const c of this.heat.values()) if (!best || c.heat > best.heat) best = c;
    return best;
  }

  // 半径内累计热度
  heatNear(x, z, r) {
    let s = 0;
    for (const c of this.heat.values()) if (Math.hypot(c.x - x, c.z - z) <= r) s += c.heat;
    return s;
  }

  dispose() { this.heat.clear(); this.now = 0; }
}
