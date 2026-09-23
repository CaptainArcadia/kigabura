// ============================================================
// hud.js — 試合中の画面表示（ダメージ%・タイマー・名札・画面外表示）
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;
  const $ = (s) => document.querySelector(s);

  const PCT_STOPS = [[0, [255, 255, 255]], [35, [255, 240, 150]], [70, [255, 190, 60]], [110, [255, 110, 40]], [150, [240, 40, 30]], [220, [150, 10, 10]]];
  function pctColor(p) {
    for (let i = 1; i < PCT_STOPS.length; i++) {
      if (p <= PCT_STOPS[i][0]) {
        const [a, ca] = PCT_STOPS[i - 1], [b, cb] = PCT_STOPS[i];
        const t = (p - a) / (b - a);
        return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(',')})`;
      }
    }
    return 'rgb(150,10,10)';
  }

  class HUD {
    constructor(game) {
      this.game = game;
      this.root = $('#hud');
      this.root.classList.remove('hidden');
      this.cards = $('#cards'); this.cards.innerHTML = '';
      this.tags = $('#tags'); this.tags.innerHTML = '';
      this.bubbles = $('#bubbles'); this.bubbles.innerHTML = '';
      this.timer = $('#timer');
      this.msgEl = $('#centermsg');
      this.flashEl = $('#flash');
      $('#stagename span').textContent = KB.STAGES[game.cfg.stage].name;
      this.items = game.fighters.map((f) => this.makeItem(f));
      this.flashA = 0;
      this.v = new T.Vector3();
      this.lastPct = new Map();
    }
    makeItem(f) {
      const col = KB.PLAYER_COLORS[f.slot];
      const card = document.createElement('div');
      card.className = 'card';
      card.style.setProperty('--pc', col);
      const img = KB.portrait(f.def.id, f.cfg.variant || 0, 'head');
      card.innerHTML = `<div class="badge">${f.label}</div><div class="portrait"><img src="${img}" alt=""></div>
        <div class="nm">${f.def.name}<small>${f.def.title}</small></div>
        <div class="pct"><span>0</span><small>%</small></div><div class="stocks"></div><div class="score"></div>`;
      this.cards.appendChild(card);
      const tag = document.createElement('div');
      tag.className = 'tag'; tag.style.setProperty('--pc', col); tag.textContent = f.label;
      this.tags.appendChild(tag);
      const bub = document.createElement('div');
      bub.className = 'bubble'; bub.style.setProperty('--pc', col); bub.style.display = 'none';
      bub.innerHTML = `<img src="${img}" alt=""><b></b>`;
      this.bubbles.appendChild(bub);
      return { f, card, pct: card.querySelector('.pct'), pctN: card.querySelector('.pct span'), stocks: card.querySelector('.stocks'), score: card.querySelector('.score'), tag, bub, bubTxt: bub.querySelector('b'), lastStocks: -1, lastScore: null, lastPct: -1 };
    }
    bump(f) {
      const it = this.items.find((i) => i.f === f);
      if (!it) return;
      it.pct.classList.remove('shake');
      void it.pct.offsetWidth;
      it.pct.classList.add('shake');
    }
    msg(text, cls = 'show') {
      const el = this.msgEl;
      el.className = '';
      el.textContent = text;
      void el.offsetWidth;
      el.className = cls + (text === 'GO!' ? ' go' : '');
    }
    clearMsg() { this.msgEl.className = ''; this.msgEl.textContent = ''; }
    flash(a) { this.flashA = Math.max(this.flashA, a); }

    update() {
      const g = this.game, cam = g.camera;
      const W = window.innerWidth, H = window.innerHeight;
      const timeMode = g.cfg.mode === 'time' && !g.sudden;
      for (const it of this.items) {
        const f = it.f;
        const p = Math.floor(f.damage);
        if (p !== it.lastPct) {
          it.pctN.textContent = p;
          it.pct.style.color = pctColor(p);
          it.lastPct = p;
        }
        it.card.classList.toggle('out', f.eliminated);
        if (timeMode) {
          it.stocks.style.display = 'none';
          if (it.lastScore !== f.score) {
            it.score.style.display = '';
            it.score.textContent = f.score > 0 ? '+' + f.score : f.score < 0 ? String(f.score) : '±0';
            it.score.className = 'score ' + (f.score > 0 ? 'pos' : f.score < 0 ? 'neg' : '');
            it.lastScore = f.score;
          }
        } else {
          it.score.style.display = 'none';
          it.stocks.style.display = '';
          if (it.lastStocks !== f.stocks) {
            it.stocks.innerHTML = f.stocks > 6 ? `<i></i><b style="font-size:12px;margin-left:3px">×${f.stocks}</b>` : '<i></i>'.repeat(Math.max(0, f.stocks));
            it.lastStocks = f.stocks;
          }
        }
        // 名札と画面外表示
        const vis = f.state !== 'dead' && !f.eliminated;
        if (!vis) { it.tag.style.display = 'none'; it.bub.style.display = 'none'; continue; }
        this.v.set(f.x, f.y + f.h + 0.45, 0).project(cam);
        const sx = (this.v.x * 0.5 + 0.5) * W, sy = (-this.v.y * 0.5 + 0.5) * H;
        this.v.set(f.x, f.y + f.dims.cy, 0).project(cam);
        const cx = (this.v.x * 0.5 + 0.5) * W, cy = (-this.v.y * 0.5 + 0.5) * H;
        const m = 20;
        const off = cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10;
        if (off) {
          it.tag.style.display = 'none';
          it.bub.style.display = '';
          it.bub.style.left = KB.clamp(cx, 45, W - 45) + 'px';
          it.bub.style.top = KB.clamp(cy, 45 + m, H - 150) + 'px';
          it.bubTxt.textContent = Math.floor(f.damage) + '%';
        } else {
          it.bub.style.display = 'none';
          it.tag.style.display = '';
          it.tag.style.left = sx + 'px';
          it.tag.style.top = sy + 'px';
        }
      }
      // タイマー
      if (g.sudden) { this.timer.textContent = 'SUDDEN DEATH'; this.timer.classList.remove('warn'); }
      else if (timeMode) {
        const fr = Math.max(0, g.timeLeft);
        const s = fr / 60;
        const mm = Math.floor(s / 60), ss = Math.floor(s % 60), cs = Math.floor((s * 100) % 100);
        this.timer.innerHTML = `${mm}:${String(ss).padStart(2, '0')}<small>.${String(cs).padStart(2, '0')}</small>`;
        this.timer.classList.toggle('warn', s < 10);
      } else {
        const s = g.elapsed / 60;
        const mm = Math.floor(s / 60), ss = Math.floor(s % 60), cs = Math.floor((s * 100) % 100);
        this.timer.innerHTML = `${mm}:${String(ss).padStart(2, '0')}<small>.${String(cs).padStart(2, '0')}</small>`;
        this.timer.classList.remove('warn');
      }
      // フラッシュ
      if (this.flashA > 0.001) { this.flashEl.style.opacity = this.flashA; this.flashA *= 0.82; }
      else if (this.flashEl.style.opacity !== '0') this.flashEl.style.opacity = '0';
    }
    destroy() {
      this.root.classList.add('hidden');
      this.cards.innerHTML = ''; this.tags.innerHTML = ''; this.bubbles.innerHTML = '';
      this.clearMsg();
      this.flashEl.style.opacity = '0';
    }
  }
  KB.HUD = HUD;
})(window.KB);
