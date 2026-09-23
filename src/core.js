// ============================================================
// core.js — 名前空間・数学ユーティリティ・入力（キーボード/ゲームパッド）
// ============================================================
window.KB = window.KB || {};
(function (KB) {
  'use strict';

  KB.FPS = 60;
  KB.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  KB.lerp = (a, b, t) => a + (b - a) * t;
  KB.rand = (a, b) => a + Math.random() * (b - a);
  KB.randi = (a, b) => Math.floor(KB.rand(a, b + 1));
  KB.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  KB.sign = (v) => (v < 0 ? -1 : 1);
  KB.deg = (d) => (d * Math.PI) / 180;
  KB.approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
  KB.smooth = (t) => t * t * (3 - 2 * t);
  KB.easeOut = (t) => 1 - (1 - t) * (1 - t);
  // a〜b の区間での進み具合 0..1
  KB.win = (f, a, b) => (b <= a ? (f >= a ? 1 : 0) : KB.clamp((f - a) / (b - a), 0, 1));
  // 角度の補間（最短経路）
  KB.lerpAngle = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  KB.PLAYER_COLORS = ['#ff3b3b', '#3b8bff', '#2fd16a', '#ffc21a'];
  KB.PLAYER_COLORS_HEX = [0xff3b3b, 0x3b8bff, 0x2fd16a, 0xffc21a];

  // ふっとばし計算（大乱闘系の式をベースに調整）
  KB.calcKB = (percent, dmg, weight, bkb, kbg) => {
    const a = (percent / 10 + (percent * dmg) / 20) * (200 / (weight + 100)) * 1.4 + 18;
    return a * (kbg / 100) + bkb;
  };
  KB.KB_SPEED = 0.003;   // ふっとばし値 → 初速（単位/フレーム）
  KB.KB_DECAY = 0.0051;  // ふっとばし速度の減衰

  // 設定（localStorage に保存）
  KB.settings = {
    master: 0.8, music: 0.5, sfx: 0.8, quality: 'high', tapJump: true, shake: true,
  };
  try {
    const s = JSON.parse(localStorage.getItem('kigabura-settings') || 'null');
    if (s) Object.assign(KB.settings, s);
  } catch (e) { /* 保存領域が使えない環境でも動かす */ }
  KB.saveSettings = () => {
    try { localStorage.setItem('kigabura-settings', JSON.stringify(KB.settings)); } catch (e) { /* noop */ }
  };

  // ---------------------------------------------------------------
  // 入力
  // ---------------------------------------------------------------
  const KEYMAPS = {
    kb1: {
      left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
      jump: ['Space'], attack: ['KeyJ'], special: ['KeyK'], shield: ['KeyL', 'ShiftLeft'],
      smash: ['KeyU'], grab: ['KeyI'], start: [], tapUp: ['KeyW'],
    },
    kb2: {
      left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
      jump: ['Numpad0', 'ControlRight'], attack: ['Numpad1', 'Period'], special: ['Numpad2', 'Slash'],
      shield: ['Numpad3', 'ShiftRight'], smash: ['Numpad4', 'Semicolon'], grab: ['Numpad5', 'Quote'],
      start: [], tapUp: ['ArrowUp'],
    },
  };
  KB.KEYMAPS = KEYMAPS;

  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash', 'Quote', 'Tab']);

  KB.Input = {
    keys: new Set(),
    pressedThisFrame: new Set(),
    init() {
      window.addEventListener('keydown', (e) => {
        if (PREVENT.has(e.code)) e.preventDefault();
        if (e.repeat) return;
        this.keys.add(e.code);
        this.pressedThisFrame.add(e.code);
        if (KB.Audio) KB.Audio.unlock();
      });
      window.addEventListener('keyup', (e) => this.keys.delete(e.code));
      window.addEventListener('blur', () => this.keys.clear());
      window.addEventListener('pointerdown', () => KB.Audio && KB.Audio.unlock());
    },
    any(codes) {
      for (const c of codes) if (this.keys.has(c)) return true;
      return false;
    },
    // メニュー用：このフレームに押されたか
    hit(code) { return this.pressedThisFrame.has(code); },
    endFrame() { this.pressedThisFrame.clear(); },
    pads() {
      if (!navigator.getGamepads) return [];
      return Array.from(navigator.getGamepads());
    },
    padConnected(i) {
      const p = this.pads()[i];
      return !!(p && p.connected);
    },
  };

  const BTN = ['jump', 'attack', 'special', 'shield', 'smash', 'grab', 'start'];
  KB.BTN = BTN;

  // 1フレーム分の入力状態（人間・CPU 共通のインターフェース）
  class Controller {
    constructor() {
      this.x = 0; this.y = 0;          // スティック（上が +）
      this.held = {}; this.pressed = {}; this.released = {};
      this.prev = {};
      this.prevX = 0; this.prevY = 0;
      this.tapX = 99; this.tapY = 99;  // スティックを弾いてからのフレーム数
      this.upTap = false;              // 上入力ジャンプのトリガー
      this.cdir = null;                // Cスティック方向（スマッシュ用）
      this.frame = 0;
      this.lastPress = {};             // ボタンごとの最後に押したフレーム
      for (const b of BTN) { this.held[b] = false; this.pressed[b] = false; this.released[b] = false; this.prev[b] = false; this.lastPress[b] = -999; }
    }
    // raw: {x,y, btn:{...}, tapUp:bool, cx, cy}
    feed(raw) {
      this.frame++;
      this.x = raw.x; this.y = raw.y;
      for (const b of BTN) {
        const h = !!raw.btn[b];
        this.pressed[b] = h && !this.prev[b];
        this.released[b] = !h && this.prev[b];
        this.held[b] = h;
        this.prev[b] = h;
        if (this.pressed[b]) this.lastPress[b] = this.frame;
      }
      // スティックのはじき入力
      if (Math.abs(this.x) >= 0.75 && Math.abs(this.prevX) < 0.35) this.tapX = 0; else this.tapX++;
      if (Math.abs(this.y) >= 0.7 && Math.abs(this.prevY) < 0.35) this.tapY = 0; else this.tapY++;
      this.upTap = !!raw.tapUp || (this.y >= 0.7 && this.prevY < 0.35 && raw.stickTapJump);
      this.prevX = this.x; this.prevY = this.y;
      // Cスティック
      this.cdir = null;
      if (raw.cx !== undefined) {
        const m = Math.max(Math.abs(raw.cx), Math.abs(raw.cy));
        const pm = this._cm || 0;
        if (m > 0.6 && pm <= 0.6) {
          this.cdir = Math.abs(raw.cx) > Math.abs(raw.cy) ? (raw.cx > 0 ? 'right' : 'left') : (raw.cy > 0 ? 'up' : 'down');
        }
        this._cm = m;
      }
    }
    since(b) { return this.frame - this.lastPress[b]; }
    reset() {
      this.x = this.y = 0;
      for (const b of BTN) { this.held[b] = this.pressed[b] = this.released[b] = this.prev[b] = false; }
    }
  }
  KB.Controller = Controller;

  // 人間プレイヤー：device = 'kb1' | 'kb2' | 'pad0'..'pad3'
  class HumanInput {
    constructor(device) {
      this.device = device;
      this.ctrl = new Controller();
      this.prevUpKey = false;
    }
    poll() {
      const raw = { x: 0, y: 0, btn: {}, tapUp: false };
      const I = KB.Input;
      if (this.device.startsWith('kb')) {
        const m = KEYMAPS[this.device];
        raw.x = (I.any(m.right) ? 1 : 0) - (I.any(m.left) ? 1 : 0);
        raw.y = (I.any(m.up) ? 1 : 0) - (I.any(m.down) ? 1 : 0);
        for (const b of BTN) raw.btn[b] = I.any(m[b]);
        const upk = I.any(m.tapUp);
        raw.tapUp = KB.settings.tapJump && upk && !this.prevUpKey;
        this.prevUpKey = upk;
      } else {
        const idx = parseInt(this.device.slice(3), 10);
        const p = I.pads()[idx];
        this.ctrl.analog = true;
        if (p && p.connected) {
          const dz = (v) => (Math.abs(v) < 0.22 ? 0 : v);
          let x = dz(p.axes[0] || 0), y = -dz(p.axes[1] || 0);
          const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
          if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = 1; if (b(13)) y = -1;
          raw.x = x; raw.y = y;
          raw.btn.attack = b(0);
          raw.btn.special = b(1);
          raw.btn.jump = b(2) || b(3);
          raw.btn.shield = b(5) || b(6) || b(7);
          raw.btn.grab = b(4);
          raw.btn.smash = false;
          raw.btn.start = b(9);
          raw.cx = dz(p.axes[2] || 0); raw.cy = -dz(p.axes[3] || 0);
          raw.stickTapJump = KB.settings.tapJump;
        }
      }
      this.ctrl.feed(raw);
      return this.ctrl;
    }
  }
  KB.HumanInput = HumanInput;

  KB.deviceLabel = (d) => ({
    kb1: 'キーボード1', kb2: 'キーボード2', pad0: 'パッド1', pad1: 'パッド2', pad2: 'パッド3', pad3: 'パッド4', cpu: 'CPU', none: 'なし',
  }[d] || d);
})(window.KB);
