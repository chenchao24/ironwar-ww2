// ═══ 输入系统：键盘 + 鼠标 + 滚轮 + 指针锁定 ═══

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.firePressed = false;      // 左键按下（边沿）
    this.mmbHeld = false;          // 中键按住（同轴机枪连发）
    this.rmbPressed = false;       // 右键按下（边沿，开/关瞄准镜）
    this.locked = false;
    this.enabled = false;
    this.onKeyDown = null;         // 按键回调（C 键等）

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this._zoomToggle = true;   // Shift 按下沿 = 望远镜/瞄具倍率切换
      if (e.code === 'KeyQ') this._binoToggle = true;   // Q 按下沿 = 车长望远镜
      if (this.onKeyDown) this.onKeyDown(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.mmbHeld = false; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) { this.requestLock(); return; }   // 未锁定时点击 = 锁定
      if (e.button === 0) this.firePressed = true;
      if (e.button === 1) this.mmbHeld = true;            // 中键按住 = 同轴机枪连发
      if (e.button === 2) this.rmbPressed = true;         // 右键按下沿 = 开/关瞄准镜
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 1) this.mmbHeld = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    if (this.locked) return;
    let p = null;
    try { p = this.canvas.requestPointerLock({ unadjustedMovement: true }); } catch { /* 旧内核同步抛错 */ }
    if (p && p.catch) p.catch(() => {
      let q = null;
      try { q = this.canvas.requestPointerLock(); } catch { return; }
      if (q && q.catch) q.catch(() => {});   // 二次失败静默（失焦/后台标签场景；用户点击画布即可再锁）
    });
  }
  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  key(code) { return this.keys.has(code); }
  // 开镜状态：由 main.js 维护的闩锁（右键按下沿切换）
  get aiming() { return this._aimLatch || false; }
  set aiming(v) { this._aimLatch = v; }
  // Shift 按下沿（左右 Shift 均可）：望远镜/瞄具倍率切换
  consumeZoomToggle() {
    const p = this._zoomToggle;
    this._zoomToggle = false;
    return p;
  }
  // Q 按下沿：车长望远镜切换
  consumeBinoToggle() {
    const p = this._binoToggle;
    this._binoToggle = false;
    return p;
  }
  // 右键按下沿：开/关瞄准镜
  consumeRmb() {
    const p = this.rmbPressed;
    this.rmbPressed = false;
    return p;
  }

  // 每帧读取并清零鼠标增量
  consumeMouse() {
    const d = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel };
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    return d;
  }
  consumeFire() {
    const f = this.firePressed;
    this.firePressed = false;
    return f;
  }
}
