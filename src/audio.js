// ============================================================
// audio.js — WebAudio による効果音と BGM（すべてその場で合成）
// ============================================================
(function (KB) {
  'use strict';

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const midi = (name) => {
    const m = /^([A-G]#?)(-?\d)$/.exec(name);
    return m ? NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12 : 60;
  };
  const freq = (n) => 440 * Math.pow(2, ((typeof n === 'string' ? midi(n) : n) - 69) / 12);
  // "A5 - B5 . G5" のような8分音符列を [{i, note, len}] に変換
  const parseSeq = (str) => {
    const toks = str.trim().split(/\s+/);
    const out = [];
    toks.forEach((t, i) => {
      if (t === '-') { if (out.length && out[out.length - 1].open) out[out.length - 1].len++; return; }
      if (out.length) out[out.length - 1].open = false;
      if (t === '.') return;
      out.push({ i, note: t, len: 1, open: true });
    });
    return out;
  };

  const A = {
    ctx: null, started: false, pendingMusic: null, current: null, timer: null,

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = (this.ctx = new AC());
        this.master = ctx.createGain();
        this.comp = ctx.createDynamicsCompressor();
        this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 5;
        this.comp.attack.value = 0.003; this.comp.release.value = 0.15;
        this.comp.connect(this.master); this.master.connect(ctx.destination);
        this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.comp);
        this.musicBus = ctx.createGain(); this.musicBus.connect(this.comp);
        // 残響（簡易インパルス応答）
        this.verb = ctx.createConvolver();
        const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
          const d = ir.getChannelData(c);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
        }
        this.verb.buffer = ir;
        this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0.28;
        this.verbSend.connect(this.verb); this.verb.connect(this.comp);
        // ノイズ
        const nlen = ctx.sampleRate * 2;
        this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
        const nd = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
        this.applyVolumes();
        this.started = true;
        if (this.pendingMusic) { const p = this.pendingMusic; this.pendingMusic = null; this.playMusic(p); }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    applyVolumes() {
      if (!this.ctx) return;
      const s = KB.settings;
      this.master.gain.value = s.master;
      this.sfxBus.gain.value = s.sfx;
      this.musicBus.gain.value = s.music * 0.55;
    },

    // ---------- 基本部品 ----------
    osc(type, f0, f1, dur, vol, o = {}) {
      const ctx = this.ctx, t = o.at !== undefined ? o.at : ctx.currentTime;
      const os = ctx.createOscillator();
      os.type = type;
      os.frequency.setValueAtTime(Math.max(1, f0), t);
      if (f1 && f1 !== f0) os.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + (o.glide || dur));
      if (o.detune) os.detune.value = o.detune;
      const g = ctx.createGain();
      const at = o.attack || 0.004;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + at);
      if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, vol), t + at + o.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = os;
      if (o.filter) {
        const f = ctx.createBiquadFilter();
        f.type = o.filter; f.frequency.value = o.ff || 1000; f.Q.value = o.q || 0.7;
        if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t + dur);
        os.connect(f); node = f;
      }
      node.connect(g);
      g.connect(o.dest || this.sfxBus);
      if (o.verb) g.connect(this.verbSend);
      os.start(t); os.stop(t + dur + 0.05);
      return os;
    },
    noise(dur, vol, o = {}) {
      const ctx = this.ctx, t = o.at !== undefined ? o.at : ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = o.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.setValueAtTime(o.f0 || 1000, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
      f.Q.value = o.q || 0.8;
      const g = ctx.createGain();
      const at = o.attack || 0.003;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(o.dest || this.sfxBus);
      if (o.verb) g.connect(this.verbSend);
      src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.05);
    },

    // ---------- 効果音 ----------
    play(name, p = 1) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const r = 0.94 + Math.random() * 0.12; // ピッチゆらぎ
      const n = this.ctx.currentTime;
      switch (name) {
        case 'hit': {
          // p: 0..1 強さ
          const v = 0.35 + p * 0.55;
          this.osc('sine', 190 * r, 42, 0.18 + p * 0.25, v);
          this.noise(0.07 + p * 0.12, v * 0.9, { f0: 2400 - p * 900, q: 0.6 });
          this.noise(0.05, v * 0.6, { type: 'highpass', f0: 5000 });
          if (p > 0.55) {
            this.osc('sine', 90, 28, 0.6, v * 0.9);
            this.noise(0.45, v * 0.5, { type: 'lowpass', f0: 1800, f1: 120, verb: true });
            this.osc('square', 1600 * r, 700, 0.12, 0.08, { filter: 'bandpass', ff: 2200 });
          }
          break;
        }
        case 'hitFire':
          this.play('hit', p);
          this.noise(0.35, 0.3, { f0: 900, f1: 300, q: 0.5 });
          break;
        case 'hitIce':
          this.play('hit', p * 0.8);
          for (let i = 0; i < 4; i++) this.osc('sine', 2200 + Math.random() * 2400, 0, 0.25, 0.06, { at: n + i * 0.03 });
          break;
        case 'hitHoly':
          this.play('hit', p);
          this.osc('triangle', 1320, 0, 0.5, 0.12, { verb: true });
          this.osc('triangle', 1980, 0, 0.5, 0.08, { verb: true });
          break;
        case 'swing':
          this.noise(0.12 + p * 0.1, 0.12 + p * 0.12, { f0: 500 * r, f1: 2600, q: 1.4, attack: 0.03 });
          break;
        case 'jump':
          this.osc('triangle', 280 * r, 560, 0.12, 0.13);
          this.noise(0.06, 0.08, { type: 'lowpass', f0: 800 });
          break;
        case 'djump':
          this.osc('triangle', 420 * r, 900, 0.14, 0.13);
          this.noise(0.1, 0.06, { f0: 1500, f1: 3000 });
          break;
        case 'land':
          this.noise(0.08, 0.14 * p, { type: 'lowpass', f0: 500 });
          this.osc('sine', 110, 50, 0.08, 0.14 * p);
          break;
        case 'dash':
          this.noise(0.1, 0.09, { f0: 700, f1: 300 });
          break;
        case 'shieldHit':
          this.osc('triangle', 900 * r, 700, 0.12, 0.18);
          this.osc('sine', 1800 * r, 1500, 0.1, 0.08);
          break;
        case 'shieldOn':
          this.osc('sine', 320, 480, 0.08, 0.06);
          break;
        case 'shieldBreak':
          this.noise(0.5, 0.35, { type: 'highpass', f0: 2500, verb: true });
          for (let i = 0; i < 6; i++) this.osc('square', 1400 - i * 170, 0, 0.12, 0.07, { at: n + i * 0.06, filter: 'bandpass', ff: 1800 });
          break;
        case 'grab':
          this.noise(0.08, 0.2, { type: 'lowpass', f0: 900 });
          this.osc('sine', 240, 120, 0.08, 0.15);
          break;
        case 'throw':
          this.noise(0.2, 0.2, { f0: 400, f1: 2400, q: 1.2, attack: 0.04 });
          break;
        case 'ko': {
          this.noise(1.4, 0.7, { type: 'lowpass', f0: 4000, f1: 150, verb: true });
          this.osc('sine', 95, 26, 1.2, 0.8);
          this.osc('sawtooth', 2400, 1200, 0.9, 0.06, { filter: 'bandpass', ff: 2500, verb: true });
          this.osc('sine', 1900, 1760, 1.1, 0.12, { verb: true, at: n + 0.05 });
          break;
        }
        case 'star':
          [1568, 2093, 2637, 3136].forEach((f, i) => this.osc('sine', f, 0, 0.35, 0.12, { at: n + i * 0.07, verb: true }));
          break;
        case 'shoot':
          this.osc('square', 880 * r, 240, 0.14, 0.09, { filter: 'lowpass', ff: 2500 });
          this.noise(0.1, 0.12, { f0: 1500 });
          break;
        case 'cannon':
          this.osc('sine', 160, 50, 0.3, 0.45);
          this.noise(0.3, 0.35, { type: 'lowpass', f0: 1500, f1: 200 });
          break;
        case 'ice':
          for (let i = 0; i < 5; i++) this.osc('sine', 1800 + Math.random() * 2800, 0, 0.3, 0.05, { at: n + i * 0.025, verb: true });
          this.noise(0.15, 0.1, { type: 'highpass', f0: 5000 });
          break;
        case 'freeze':
          this.noise(0.5, 0.25, { type: 'highpass', f0: 3000, f1: 8000 });
          for (let i = 0; i < 8; i++) this.osc('sine', 2500 + Math.random() * 3000, 0, 0.4, 0.05, { at: n + i * 0.03, verb: true });
          break;
        case 'shatter':
          this.noise(0.35, 0.3, { type: 'highpass', f0: 3500, verb: true });
          for (let i = 0; i < 6; i++) this.osc('triangle', 3000 + Math.random() * 2000, 0, 0.15, 0.05, { at: n + Math.random() * 0.1 });
          break;
        case 'fire':
          this.noise(0.3, 0.25, { f0: 700, f1: 250, q: 0.5 });
          break;
        case 'explode':
          this.noise(0.6, 0.55, { type: 'lowpass', f0: 2500, f1: 120, verb: true });
          this.osc('sine', 120, 35, 0.5, 0.6);
          break;
        case 'steam':
          this.noise(0.5, 0.2, { type: 'highpass', f0: 2500, f1: 5000, attack: 0.03 });
          break;
        case 'stomp':
          this.osc('sine', 120, 30, 0.5, 0.85);
          this.noise(0.4, 0.45, { type: 'lowpass', f0: 1200, f1: 100 });
          break;
        case 'counter':
          this.osc('triangle', 1500, 0, 0.8, 0.2, { verb: true });
          this.osc('sine', 2250, 0, 0.8, 0.12, { verb: true });
          this.noise(0.1, 0.3, { type: 'highpass', f0: 4000 });
          break;
        case 'charge':
          this.osc('sine', 600 + p * 900, 0, 0.06, 0.035);
          break;
        case 'ledge':
          this.noise(0.06, 0.14, { type: 'lowpass', f0: 1200 });
          break;
        case 'tech':
          this.osc('square', 1200, 1800, 0.06, 0.06, { filter: 'lowpass', ff: 3000 });
          break;
        case 'firework': {
          const d = 0.15 + Math.random() * 0.2;
          this.noise(0.9, 0.12 * p, { type: 'lowpass', f0: 400, f1: 80, at: n + d, verb: true });
          for (let i = 0; i < 10; i++) this.noise(0.03, 0.03 * p, { type: 'highpass', f0: 3000, at: n + d + 0.25 + Math.random() * 0.6 });
          break;
        }
        case 'select':
          this.osc('square', 880, 0, 0.07, 0.07, { filter: 'lowpass', ff: 3000 });
          this.osc('square', 1320, 0, 0.1, 0.07, { filter: 'lowpass', ff: 3000, at: n + 0.06 });
          break;
        case 'cursor':
          this.osc('triangle', 1200, 0, 0.05, 0.07);
          break;
        case 'back':
          this.osc('square', 660, 440, 0.12, 0.06, { filter: 'lowpass', ff: 2200 });
          break;
        case 'count':
          this.osc('square', 660, 0, 0.2, 0.12, { filter: 'lowpass', ff: 3000 });
          break;
        case 'go':
          [880, 1109, 1320].forEach((f) => this.osc('square', f, 0, 0.7, 0.07, { filter: 'lowpass', ff: 4000, verb: true }));
          this.noise(0.5, 0.2, { f0: 1500, f1: 5000, verb: true });
          break;
        case 'gameset':
          [523, 659, 784, 1047].forEach((f, i) => this.osc('square', f, 0, 0.9, 0.07, { at: n + i * 0.05, filter: 'lowpass', ff: 3000, verb: true }));
          this.noise(1.0, 0.3, { type: 'lowpass', f0: 3000, f1: 200, verb: true });
          break;
        case 'respawn':
          [660, 880, 1320].forEach((f, i) => this.osc('sine', f, 0, 0.3, 0.07, { at: n + i * 0.06, verb: true }));
          break;
        case 'crowd':
          this.noise(1.6, 0.12, { f0: 900, q: 0.4, attack: 0.3, verb: true });
          break;
      }
    },

    // ---------- 楽器（BGM用） ----------
    taiko(t, v) {
      this.osc('sine', 120, 45, 0.45, 0.75 * v, { at: t, glide: 0.2, dest: this.musicBus });
      this.noise(0.12, 0.3 * v, { type: 'lowpass', f0: 400, at: t, dest: this.musicBus });
    },
    shime(t, v) {
      this.osc('triangle', 520, 330, 0.08, 0.3 * v, { at: t, dest: this.musicBus });
      this.noise(0.05, 0.18 * v, { f0: 3200, q: 1.2, at: t, dest: this.musicBus });
    },
    kane(t, v) {
      this.osc('square', 1180, 0, 0.12, 0.05 * v, { at: t, filter: 'bandpass', ff: 2600, q: 2, dest: this.musicBus });
      this.osc('square', 1766, 0, 0.1, 0.035 * v, { at: t, filter: 'bandpass', ff: 3200, q: 2, dest: this.musicBus });
    },
    kick(t, v) {
      this.osc('sine', 150, 42, 0.3, 0.8 * v, { at: t, glide: 0.12, dest: this.musicBus });
    },
    snare(t, v) {
      this.noise(0.16, 0.35 * v, { f0: 1900, q: 0.6, at: t, dest: this.musicBus });
      this.osc('triangle', 220, 160, 0.09, 0.25 * v, { at: t, dest: this.musicBus });
    },
    hat(t, v) {
      this.noise(0.035, 0.12 * v, { type: 'highpass', f0: 7500, at: t, dest: this.musicBus });
    },
    fue(t, f, dur, v) {
      const ctx = this.ctx;
      const os = ctx.createOscillator(); os.type = 'triangle';
      const os2 = ctx.createOscillator(); os2.type = 'sine';
      os.frequency.setValueAtTime(f * 0.985, t); os.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      os2.frequency.setValueAtTime(f * 2, t);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
      const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.3, dur * 0.6));
      lfo.connect(lg); lg.connect(os.frequency);
      const g = ctx.createGain(), g2 = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.03);
      g.gain.setValueAtTime(0.14 * v, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      g2.gain.value = 0.18;
      os.connect(g); os2.connect(g2); g2.connect(g);
      g.connect(this.musicBus); g.connect(this.verbSend);
      [os, os2, lfo].forEach((o) => { o.start(t); o.stop(t + dur + 0.12); });
    },
    pluck(t, f, v, dec = 0.35) {
      this.osc('sawtooth', f, 0, dec, 0.09 * v, { at: t, filter: 'lowpass', ff: 3200, ff1: 350, dest: this.musicBus });
    },
    bell(t, f, dur, v) {
      this.osc('sine', f, 0, dur, 0.12 * v, { at: t, dest: this.musicBus, verb: true });
      this.osc('sine', f * 2.76, 0, dur * 0.5, 0.03 * v, { at: t, dest: this.musicBus });
      this.osc('sine', f * 5.4, 0, dur * 0.25, 0.015 * v, { at: t, dest: this.musicBus });
    },
    bass(t, f, dur, v) {
      this.osc('triangle', f, 0, dur, 0.28 * v, { at: t, hold: dur * 0.5, dest: this.musicBus });
      this.osc('sawtooth', f, 0, dur * 0.7, 0.05 * v, { at: t, filter: 'lowpass', ff: 600, dest: this.musicBus });
    },
    pad(t, fs, dur, v) {
      fs.forEach((f) => {
        this.osc('sawtooth', f, 0, dur, 0.022 * v, { at: t, attack: dur * 0.3, hold: dur * 0.4, filter: 'lowpass', ff: 1100, dest: this.musicBus, verb: true, detune: -7 });
        this.osc('sawtooth', f, 0, dur, 0.022 * v, { at: t, attack: dur * 0.3, hold: dur * 0.4, filter: 'lowpass', ff: 1100, dest: this.musicBus, detune: 7 });
      });
    },
    lead(t, f, dur, v) {
      this.osc('square', f, 0, dur, 0.06 * v, { at: t, hold: dur * 0.6, filter: 'lowpass', ff: 2600, dest: this.musicBus, verb: true });
      this.osc('square', f, 0, dur, 0.03 * v, { at: t, hold: dur * 0.6, filter: 'lowpass', ff: 2600, dest: this.musicBus, detune: 12 });
    },

    // ---------- BGM シーケンサ ----------
    playMusic(name) {
      if (!this.ctx) { this.pendingMusic = name; return; }
      if (this.current && this.current.name === name) return;
      this.stopMusic();
      const tr = TRACKS[name];
      if (!tr) return;
      this.current = { name, tr, step: 0, next: this.ctx.currentTime + 0.12 };
      this.timer = setInterval(() => this.tick(), 25);
    },
    stopMusic() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null; this.current = null;
    },
    tick() {
      const c = this.current;
      if (!c || !this.ctx) return;
      const spb = 60 / c.tr.bpm / 4;
      while (c.next < this.ctx.currentTime + 0.14) {
        if (!c.tr.loop && c.step >= c.tr.len) { this.stopMusic(); return; }
        c.tr.play(this, c.step % c.tr.len, c.next, spb);
        c.step++;
        c.next += spb;
      }
    },
  };
  KB.Audio = A;

  // ------------------------------------------------------------
  // 曲データ
  // ------------------------------------------------------------
  const pat = (s) => s.replace(/\s/g, '').split('').map((ch) => (ch === 'x' ? 1 : ch === 'o' ? 0.55 : 0));
  const melodyTrack = (seq) => {
    const m = parseSeq(seq);
    const map = new Map();
    m.forEach((e) => map.set(e.i, e));
    return map;
  };

  // 祭囃子風（ヨナ抜き・D）
  const MAT_MEL = melodyTrack(
    'A5 - B5 A5 G5 - E5 G5  A5 - - - . . G5 A5  B5 - D6 B5 A5 G5 E5 G5  A5 - - - - - . . ' +
    'D6 - B5 D6 E6 - D6 B5  A5 - G5 A5 B5 - A5 G5  E5 - G5 E5 D5 - E5 G5  D5 - - - - - . .'
  );
  const MAT_BASS = ['D2', 'D2', 'G2', 'A2', 'B2', 'G2', 'E2', 'D2'];
  const MAT_ARP = [
    ['D4', 'A4', 'D5'], ['D4', 'A4', 'D5'], ['G3', 'D4', 'G4'], ['A3', 'E4', 'A4'],
    ['B3', 'E4', 'A4'], ['G3', 'D4', 'G4'], ['E4', 'G4', 'B4'], ['D4', 'A4', 'D5'],
  ];
  const P_TAIKO = pat('x.....x.x..ox...');
  const P_SHIME = pat('..x...x...x.x.xo');
  const P_KANE = pat('x..x..x.x..x..x.');

  const TRACKS = {
    matsuri: {
      bpm: 146, len: 128, loop: true,
      play(a, s, t, spb) {
        const bar = Math.floor(s / 16), st = s % 16;
        if (P_TAIKO[st]) a.taiko(t, P_TAIKO[st]);
        if (P_SHIME[st]) a.shime(t, P_SHIME[st] * 0.8);
        if (P_KANE[st]) a.kane(t, P_KANE[st] * (st === 0 ? 1 : 0.7));
        if (st === 0 || st === 10) a.bass(t, freq(MAT_BASS[bar]), spb * 5, 0.9);
        if (st % 4 === 2) { const ar = MAT_ARP[bar]; a.pluck(t, freq(ar[(st / 4 | 0) % 3]), 0.8); }
        if (s % 2 === 0) {
          const e = MAT_MEL.get(s / 2);
          if (e) a.fue(t, freq(e.note), e.len * spb * 2, 1);
        }
      },
    },
    ice: {
      bpm: 122, len: 128, loop: true,
      play(a, s, t, spb) {
        const bar = Math.floor(s / 16), st = s % 16;
        const chords = [['A3', 'C4', 'E4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['F3', 'A3', 'C4'], ['C4', 'E4', 'G4'], ['C4', 'E4', 'G4'], ['G3', 'B3', 'D4'], ['G3', 'B3', 'D4']];
        const roots = ['A2', 'A2', 'F2', 'F2', 'C3', 'C3', 'G2', 'G2'];
        const ch = chords[bar];
        if (st === 0 && bar % 2 === 0) a.pad(t, ch.map(freq), spb * 32, 1);
        if (st === 0 || st === 6 || st === 10) a.kick(t, st === 0 ? 0.9 : 0.6);
        if (st === 4 || st === 12) a.snare(t, 0.5);
        if (st % 2 === 0) a.hat(t, st % 4 === 2 ? 0.9 : 0.5);
        if (st % 4 === 0 || st === 14) a.bass(t, freq(roots[bar]), spb * 3, 0.8);
        const arp = [0, 1, 2, 1];
        if (st % 2 === 1) a.bell(t, freq(ch[arp[(st >> 1) % 4]]) * 2, 0.6, 0.45);
        if (s % 2 === 0) {
          const e = ICE_MEL.get(s / 2);
          if (e) a.bell(t, freq(e.note), e.len * spb * 2 + 0.4, 1.3);
        }
      },
    },
    final: {
      bpm: 156, len: 128, loop: true,
      play(a, s, t, spb) {
        const bar = Math.floor(s / 16), st = s % 16;
        const roots = ['E2', 'E2', 'C2', 'D2', 'E2', 'E2', 'C2', 'B1'];
        if (st === 0 || st === 3 || st === 8 || st === 11) a.kick(t, 0.9);
        if (st === 4 || st === 12) a.snare(t, 0.8);
        if (st % 2 === 0) a.hat(t, 0.7);
        if (st % 2 === 0) a.bass(t, freq(roots[bar]) * (st % 8 === 6 ? 2 : 1), spb * 1.6, 0.9);
        if (s % 2 === 0) {
          const e = FIN_MEL.get(s / 2);
          if (e) a.lead(t, freq(e.note), e.len * spb * 2, 1);
        }
      },
    },
    menu: {
      bpm: 112, len: 64, loop: true,
      play(a, s, t, spb) {
        const bar = Math.floor(s / 16), st = s % 16;
        const ch = [['C4', 'E4', 'G4', 'D5'], ['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4'], ['G3', 'B3', 'D4', 'A4']][bar];
        const roots = ['C3', 'A2', 'F2', 'G2'];
        if (st === 0) a.pad(t, ch.slice(0, 3).map(freq), spb * 16, 0.8);
        if (st === 0 || st === 8) a.bass(t, freq(roots[bar]), spb * 6, 0.7);
        if (st === 0 || st === 10) a.kick(t, 0.5);
        if (st === 4 || st === 12) a.hat(t, 1);
        const seq = [0, 2, 1, 3, 2, 1, 3, 2];
        if (st % 2 === 0) a.pluck(t, freq(ch[seq[st >> 1]]) * 2, 0.6, 0.4);
      },
    },
    victory: {
      bpm: 132, len: 40, loop: false,
      play(a, s, t, spb) {
        const notes = { 0: 'C5', 2: 'E5', 4: 'G5', 6: 'C6', 12: 'A5', 14: 'B5', 16: 'C6' };
        if (notes[s]) a.lead(t, freq(notes[s]), s === 16 ? spb * 20 : spb * 2, 1.2);
        if (s === 16) { a.pad(t, ['C4', 'E4', 'G4', 'C5'].map(freq), spb * 22, 1.2); a.kick(t, 1); }
        if (s === 0 || s === 4 || s === 8 || s === 12) a.snare(t, 0.5);
      },
    },
  };
  const ICE_MEL = melodyTrack(
    'E5 - - D5 C5 - A4 -  C5 - D5 - E5 - - -  F5 - E5 - C5 - A4 -  C5 - - - - - - - ' +
    'G5 - E5 - C5 - E5 -  G5 - A5 - G5 - E5 -  D5 - E5 - G5 - D5 -  B4 - - - D5 - - -'
  );
  const FIN_MEL = melodyTrack(
    'E5 - G5 - A5 - B5 -  D6 - B5 - A5 - G5 A5  G5 - E5 - . . E5 G5  F#5 - - - - - . .  ' +
    'E5 - G5 - A5 - B5 -  D6 - E6 - D6 - B5 -  C6 - B5 - A5 - G5 -  F#5 - G5 - F#5 - D5 -'
  );
})(window.KB);
