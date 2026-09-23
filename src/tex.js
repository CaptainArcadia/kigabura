// ============================================================
// tex.js — Canvas で生成するテクスチャ群（キャラ・ステージ・パーティクル）
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;
  const cache = new Map();
  const cachedSet = new Set();

  function make(key, w, h, draw, o = {}) {
    if (key && cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = o.linear ? T.NoColorSpace : T.SRGBColorSpace;
    t.anisotropy = 4;
    if (o.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    if (o.wrapS) t.wrapS = T.RepeatWrapping;
    t.needsUpdate = true;
    if (key) { cache.set(key, t); cachedSet.add(t); }
    return t;
  }
  // キャッシュ外のテクスチャ（clone など）だけ解放する
  function disposeMaterial(m) {
    for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap']) {
      const t = m[k];
      if (t && !cachedSet.has(t)) t.dispose();
    }
    m.dispose();
  }

  // 疑似乱数（再現性のため）
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }
  function speckle(g, w, h, n, alpha, seed = 7, dark = true) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const v = dark ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  }
  const TEX = {};
  KB.tex = TEX;
  TEX.make = make;
  TEX.disposeMaterial = disposeMaterial;
  TEX.rng = rng;

  // ---------------- パーティクル ----------------
  TEX.glow = () => make('glow', 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.7)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  TEX.star = () => make('star', 128, 128, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? c * 0.98 : c * 0.12;
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  });
  TEX.smoke = () => make('smoke', 128, 128, (g, w) => {
    const r = rng(11);
    for (let i = 0; i < 14; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.4, y = w / 2 + (r() - 0.5) * w * 0.4, rad = w * (0.18 + r() * 0.2);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
  });
  TEX.ring = () => make('ring', 128, 128, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c, c, c * 0.55, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  TEX.streak = () => make('streak', 128, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w * 0.75, 2); g.lineTo(w, h / 2); g.lineTo(w * 0.75, h - 2); g.closePath(); g.fill();
  });
  TEX.flake = () => make('flake', 64, 64, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  });
  TEX.shard = () => make('shard', 64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(180,230,255,.7)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w, h * 0.45); g.lineTo(w / 2, h); g.lineTo(0, h * 0.45); g.closePath(); g.fill();
  });

  // ---------------- 汎用 ----------------
  TEX.wood = (tint = '#9a6a3f', key = 'wood') => make(key + tint, 512, 512, (g, w, h) => {
    const r = rng(3);
    const plank = h / 8;
    for (let i = 0; i < 8; i++) {
      const c = new T.Color(tint).offsetHSL(0, 0, (r() - 0.5) * 0.08);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(0, i * plank, w, plank);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(40,20,5,${0.05 + r() * 0.12})`; g.lineWidth = 1 + r() * 2;
        g.beginPath();
        const y0 = i * plank + r() * plank;
        g.moveTo(0, y0);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y0 + Math.sin(x * 0.02 + k) * 3 * r());
        g.stroke();
      }
      g.fillStyle = 'rgba(20,10,0,.55)'; g.fillRect(0, i * plank, w, 3);
      const off = r() * w;
      g.fillRect(off, i * plank, 3, plank);
    }
  }, { repeat: [1, 1] });

  TEX.stone = (key = 'stone', base = '#8d8a86') => make(key, 512, 512, (g, w, h) => {
    const r = rng(5);
    g.fillStyle = '#4a4744'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rh = 34 + r() * 40;
      let x = -r() * 40;
      while (x < w) {
        const rw = 50 + r() * 70;
        const c = new T.Color(base).offsetHSL(0, 0, (r() - 0.5) * 0.14);
        g.fillStyle = '#' + c.getHexString();
        const pad = 3, rr = 10;
        g.beginPath();
        g.roundRect(x + pad, y + pad, rw - pad * 2, rh - pad * 2, rr);
        g.fill();
        const gr = g.createLinearGradient(0, y, 0, y + rh);
        gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.2)');
        g.fillStyle = gr; g.fill();
        x += rw;
      }
      y += rh;
    }
    speckle(g, w, h, 5000, 0.25, 9);
  }, { repeat: [1, 1] });

  TEX.tiles = (color = '#3b4a5a', key = 'tiles') => make(key + color, 256, 256, (g, w, h) => {
    const base = new T.Color(color);
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const gr = g.createLinearGradient(x, 0, x + w / n, 0);
      gr.addColorStop(0, '#' + base.clone().offsetHSL(0, 0, -0.12).getHexString());
      gr.addColorStop(0.5, '#' + base.clone().offsetHSL(0, 0, 0.1).getHexString());
      gr.addColorStop(1, '#' + base.clone().offsetHSL(0, 0, -0.12).getHexString());
      g.fillStyle = gr; g.fillRect(x, 0, w / n, h);
    }
    for (let j = 0; j < 4; j++) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, (j / 4) * h, w, 3); }
  }, { repeat: [1, 1] });

  TEX.stripes = (a, b, n = 8, key) => make(key || 'stripes' + a + b + n, 256, 64, (g, w, h) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i / n) * w, 0, w / n + 1, h); }
  });

  // 暖簾（のれん）：文字入り
  TEX.noren = (bg, fg, text) => make('noren' + bg + text, 512, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 1; i < 4; i++) g.fillRect((i / 4) * w - 2, 0, 4, h);
    g.fillStyle = fg;
    g.font = `900 ${Math.floor(h * 0.5)}px "Dela Gothic One", "M PLUS Rounded 1c", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h * 0.55);
  });

  // 提灯
  TEX.lantern = (bg = '#e8352b', text = '祭') => make('lantern' + bg + text, 256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, bg); gr.addColorStop(0.5, '#fff1c9'); gr.addColorStop(1, bg);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.35; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const y = (i / 12) * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#1a0a05';
    g.font = `900 ${h * 0.42}px "Dela Gothic One", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < 2; k++) g.fillText(text, (k + 0.25) * w / 2, h * 0.52);
  });

  TEX.shoji = () => make('shoji', 256, 256, (g, w, h) => {
    g.fillStyle = '#ffe9b8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5a3a1a'; g.lineWidth = 6;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo((i / 4) * w, 0); g.lineTo((i / 4) * w, h); g.stroke(); }
    for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(0, (i / 6) * h); g.lineTo(w, (i / 6) * h); g.stroke(); }
  });

  TEX.ice = () => make('ice', 512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#dff6ff'); gr.addColorStop(1, '#8fd3f0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(21);
    g.strokeStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 0.5 + r() * 2;
      g.beginPath();
      let x = r() * w, y = r() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); }
      g.stroke();
    }
    speckle(g, w, h, 1500, 0.4, 22, false);
  }, { repeat: [1, 1] });

  TEX.snow = () => make('snow', 256, 256, (g, w, h) => {
    g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(150,180,220,${r() * 0.25})`; g.beginPath(); g.arc(r() * w, r() * h, r() * 3, 0, 7); g.fill(); }
  }, { repeat: [1, 1] });

  TEX.pavement = () => make('pave', 512, 512, (g, w, h) => {
    g.fillStyle = '#6c6660'; g.fillRect(0, 0, w, h);
    const r = rng(41);
    const s = 64;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const c = new T.Color('#8b857c').offsetHSL(0, 0, (r() - 0.5) * 0.1);
      g.fillStyle = '#' + c.getHexString(); g.fillRect(x + 2, y + 2, s - 4, s - 4);
    }
    speckle(g, w, h, 4000, 0.2, 42);
  }, { repeat: [1, 1] });

  // ---------------- キャラクター ----------------
  // 等距円筒図法の球テクスチャ：x=0 が -X（正面から見て左）、x=W/4 が正面、x=W/2 が +X
  // ATARU：緑と黒のツートン覆面
  TEX.ataruMask = (pal) => make('ataruMask' + pal.a + pal.b, 1024, 512, (g, W, H) => {
    const A = pal.a, B = pal.b, F = W / 4;
    g.fillStyle = A; g.fillRect(0, 0, F, H); g.fillRect(F * 3, 0, F, H);
    g.fillStyle = B; g.fillRect(F, 0, F * 2, H);
    // 黒側の緑スウッシュ
    g.strokeStyle = A; g.lineCap = 'round';
    g.lineWidth = 64;
    g.beginPath(); g.moveTo(F + 150, 220); g.bezierCurveTo(F + 260, 120, F + 420, 170, F + 470, 330); g.stroke();
    g.lineWidth = 40;
    g.beginPath(); g.moveTo(F + 120, 330); g.bezierCurveTo(F + 200, 380, F + 330, 400, F + 420, 380); g.stroke();
    // 緑側のあごの黒ライン
    g.fillStyle = B;
    for (let i = 0; i < 3; i++) {
      g.save(); g.translate(F - 150 + i * 44, 355 + i * 8); g.rotate(0.35);
      g.beginPath(); g.roundRect(-14, -30, 28, 60, 8); g.fill(); g.restore();
    }
    g.beginPath(); g.roundRect(F + 40, 350, 100, 28, 12); g.fill();
    // 口元のカバー
    g.fillStyle = '#d8d8dc';
    g.beginPath(); g.roundRect(F - 46, 402, 92, 36, 14); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(F - 46, 418, 92, 3);
    // リベット（中央の縫い目）
    g.fillStyle = B; g.fillRect(F - 5, 0, 10, 400); g.fillRect(F * 3 - 5, 0, 10, H);
    for (let i = 0; i < 7; i++) {
      const y = 70 + i * 48;
      const gr = g.createRadialGradient(F - 22, y - 3, 1, F - 22, y, 10);
      gr.addColorStop(0, '#b8f0a0'); gr.addColorStop(1, '#2f7a24');
      g.fillStyle = gr; g.beginPath(); g.arc(F - 22, y, 9, 0, 7); g.fill();
    }
    // 目の穴＋目
    const eye = (cx, cy, flip) => {
      g.fillStyle = '#111';
      g.beginPath(); g.roundRect(cx - 52, cy - 36, 104, 72, 24); g.fill();
      g.fillStyle = '#f0c9a3';
      g.beginPath(); g.roundRect(cx - 42, cy - 26, 84, 54, 18); g.fill();
      // 白目（上側が怒り眉で切れる）
      g.save();
      g.beginPath();
      g.moveTo(cx - 34, cy - 6 + (flip ? -8 : 8)); g.lineTo(cx + 34, cy - 6 + (flip ? 8 : -8));
      g.lineTo(cx + 34, cy + 22); g.lineTo(cx - 34, cy + 22); g.closePath(); g.clip();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx, cy + 6, 34, 20, 0, 0, 7); g.fill();
      const ig = g.createRadialGradient(cx + (flip ? -6 : 6), cy + 4, 2, cx + (flip ? -6 : 6), cy + 6, 16);
      ig.addColorStop(0, '#9fd8ff'); ig.addColorStop(0.6, '#2f7fd6'); ig.addColorStop(1, '#123a70');
      g.fillStyle = ig; g.beginPath(); g.arc(cx + (flip ? -6 : 6), cy + 6, 15, 0, 7); g.fill();
      g.fillStyle = '#081322'; g.beginPath(); g.arc(cx + (flip ? -6 : 6), cy + 6, 7, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + (flip ? -10 : 2), cy, 4, 0, 7); g.fill();
      g.restore();
      g.strokeStyle = '#111'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx - 36, cy - 6 + (flip ? -8 : 8)); g.lineTo(cx + 36, cy - 6 + (flip ? 8 : -8)); g.stroke();
    };
    eye(F - 62, 262, false);
    eye(F + 62, 262, true);
    speckle(g, W, H, 3000, 0.12, 12);
  });

  // FURA：顔
  TEX.furaFace = (pal) => make('furaFace' + pal.skin, 1024, 512, (g, W, H) => {
    const F = W / 4;
    g.fillStyle = pal.skin; g.fillRect(0, 0, W, H);
    // ほっぺ
    for (const s of [-1, 1]) {
      const x = F + s * 118, y = 318;
      const gr = g.createRadialGradient(x, y, 2, x, y, 40);
      gr.addColorStop(0, 'rgba(255,110,140,.8)'); gr.addColorStop(1, 'rgba(255,110,140,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 42, 30, 0, 0, 7); g.fill();
    }
    // 目
    for (const s of [-1, 1]) {
      const x = F + s * 72, y = 262;
      const gr = g.createLinearGradient(0, y - 44, 0, y + 44);
      gr.addColorStop(0, '#0d1414'); gr.addColorStop(0.6, '#203c35'); gr.addColorStop(1, '#3f7a63');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 34, 44, 0, 0, 7); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(x - 10, y - 16, 12, 14, 0, 0, 7); g.fill();
      g.beginPath(); g.arc(x + 12, y + 16, 6, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(x + 14, y - 22, 3, 0, 7); g.fill();
    }
    // 口（ω型に開いた口）
    const mx = F, my = 330;
    g.fillStyle = '#7a1420';
    g.beginPath();
    g.moveTo(mx - 34, my - 6);
    g.quadraticCurveTo(mx - 17, my + 4, mx, my - 6);
    g.quadraticCurveTo(mx + 17, my + 4, mx + 34, my - 6);
    g.quadraticCurveTo(mx + 30, my + 40, mx, my + 42);
    g.quadraticCurveTo(mx - 30, my + 40, mx - 34, my - 6);
    g.fill();
    g.fillStyle = '#ff7f93'; g.beginPath(); g.ellipse(mx, my + 28, 18, 11, 0, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(mx - 26, my - 4); g.lineTo(mx - 20, my + 8); g.lineTo(mx - 15, my - 2); g.fill();
    g.beginPath(); g.moveTo(mx + 26, my - 4); g.lineTo(mx + 20, my + 8); g.lineTo(mx + 15, my - 2); g.fill();
  });

  TEX.furaDress = (pal) => make('furaDress' + pal.dress, 512, 256, (g, W, H) => {
    g.fillStyle = pal.dress; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 2500, 0.35, 51, false);
    // 白いギザギザの裾
    g.fillStyle = '#f6f8ff';
    g.fillRect(0, H * 0.78, W, H * 0.22);
    g.fillStyle = pal.dress;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const x0 = (i / n) * W;
      g.beginPath(); g.moveTo(x0, H * 0.77); g.lineTo(x0 + W / n / 2, H * 0.93); g.lineTo(x0 + W / n, H * 0.77); g.fill();
    }
    speckle(g, W, H * 0.2, 400, 0.2, 52);
  });

  // MG：毛並み（キジトラ）
  TEX.mgFur = (pal) => make('mgFur' + pal.fur, 1024, 512, (g, W, H) => {
    const F = W / 4;
    g.fillStyle = pal.fur; g.fillRect(0, 0, W, H);
    const r = rng(61);
    for (let i = 0; i < 9000; i++) {
      const l = r() > 0.5 ? 255 : 0;
      g.strokeStyle = `rgba(${l},${l},${l},${0.06 + r() * 0.08})`;
      g.lineWidth = 1;
      const x = r() * W, y = r() * H;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + 5 + r() * 6); g.stroke();
    }
    // おでこの縞
    g.strokeStyle = pal.stripe; g.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      g.lineWidth = 16 - Math.abs(i) * 2;
      g.beginPath(); g.moveTo(F + i * 26, 30); g.quadraticCurveTo(F + i * 34, 90, F + i * 22, 150 - Math.abs(i) * 18); g.stroke();
    }
    // 頬と後頭部・背中の縞
    for (const cx of [F - 190, F + 190, F * 3]) {
      for (let k = 0; k < 5; k++) {
        g.lineWidth = 14;
        g.beginPath(); g.moveTo(cx - 60, 110 + k * 55); g.quadraticCurveTo(cx, 95 + k * 55, cx + 60, 110 + k * 55); g.stroke();
      }
    }
    // 白い胸とマズル
    const gr = g.createRadialGradient(F, 470, 20, F, 430, 250);
    gr.addColorStop(0, pal.belly); gr.addColorStop(0.7, pal.belly); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(F, 440, 190, 230, 0, 0, 7); g.fill();
  });

  // MG：法被（はっぴ）
  TEX.happi = (pal) => make('happi' + pal.coat, 1024, 256, (g, W, H) => {
    g.fillStyle = pal.coat; g.fillRect(0, 0, W, H);
    speckle(g, W, H, 6000, 0.12, 71);
    const sakura = (x, y, s) => {
      g.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        g.beginPath(); g.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.45, s * 0.32, a, 0, 7); g.fill();
      }
      g.fillStyle = pal.coat; g.beginPath(); g.arc(x, y, s * 0.18, 0, 7); g.fill();
    };
    const r = rng(72);
    for (let i = 0; i < 9; i++) sakura(60 + i * 110 + r() * 30, 50 + r() * 70, 18 + r() * 6);
    // 市松模様
    const top = H * 0.72, rows = 2, cols = 32, cs = W / cols, rh = (H - top) / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      g.fillStyle = (i + j) % 2 ? '#f5f2ea' : pal.coat;
      g.fillRect(i * cs, top + j * rh, cs + 1, rh + 1);
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, top - 4, W, 4);
  });

  TEX.dots = (bg, fg, key) => make(key || 'dots' + bg + fg, 256, 64, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = fg;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) {
      g.beginPath(); g.arc(x * 16 + (y % 2) * 8 + 4, 10 + y * 20, 4.5, 0, 7); g.fill();
    }
  });

  TEX.rope = (a = '#d42a2a', b = '#f6f1ea') => make('rope' + a + b, 256, 64, (g, W, H) => {
    g.fillStyle = b; g.fillRect(0, 0, W, H);
    g.fillStyle = a;
    for (let i = -2; i < 12; i++) {
      g.beginPath();
      g.moveTo(i * 26, 0); g.lineTo(i * 26 + 13, 0); g.lineTo(i * 26 + 13 + 30, H); g.lineTo(i * 26 + 30, H); g.fill();
    }
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,.15)'); gr.addColorStop(1, 'rgba(0,0,0,.25)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }, { wrapS: true });

  TEX.tail = (pal) => make('tail' + pal.fur, 256, 64, (g, W, H) => {
    g.fillStyle = pal.fur; g.fillRect(0, 0, W, H);
    g.fillStyle = pal.stripe;
    for (let i = 0; i < 6; i++) g.fillRect(i * 44 + 10, 0, 18, H);
  });

  // SIKO：胴体（高さ方向に紅白ボーダー）
  TEX.sikoBody = (pal) => make('sikoBody' + pal.a + pal.b, 64, 1024, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, pal.a); gr.addColorStop(1, pal.a);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // v=0 が底、v=1 が頂上（キャンバスは上下反転）
    const band0 = 0.2, band1 = 0.62, n = 9;
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0) {
        const v1 = band1 - (i / n) * (band1 - band0), v0 = band1 - ((i + 1) / n) * (band1 - band0);
        g.fillStyle = pal.b;
        g.fillRect(0, (1 - v1) * H, W, (v1 - v0) * H);
      }
    }
  });
  TEX.sikoArm = (pal) => make('sikoArm' + pal.a + pal.b, 64, 256, (g, W, H) => {
    g.fillStyle = pal.a; g.fillRect(0, 0, W, H);
    g.fillStyle = pal.b;
    for (let i = 0; i < 3; i++) g.fillRect(0, 20 + i * 44, W, 22);
  });

  // ステージ選択用のサムネイル背景（CSS）
  TEX.dataURL = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c.toDataURL();
  };
})(window.KB);
