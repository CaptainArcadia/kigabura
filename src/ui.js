// ============================================================
// ui.js — タイトル / メニュー / キャラ選択 / ステージ選択 / ポーズ / リザルト
// ============================================================
(function (KB) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const TYPES = ['kb1', 'kb2', 'pad0', 'pad1', 'pad2', 'pad3', 'cpu', 'none'];

  const UI = {
    app: null, screen: null, keys: {}, padPrev: {},
    cfg: null,

    init(app) {
      this.app = app;
      this.root = $('#screens');
      const def = {
        slots: [
          { type: 'kb1', char: 'ataru', variant: 0, level: 5 },
          { type: 'cpu', char: 'fura', variant: 0, level: 5 },
          { type: 'cpu', char: 'mg', variant: 0, level: 5 },
          { type: 'cpu', char: 'siko', variant: 0, level: 5 },
        ],
        mode: 'stock', stocks: 3, time: 3, stage: 'matsuri',
      };
      try {
        const s = JSON.parse(localStorage.getItem('kigabura-cfg') || 'null');
        this.cfg = s && s.slots && s.slots.length === 4 ? Object.assign(def, s) : def;
      } catch (e) { this.cfg = def; }
      this.active = 0;
      this.showTitle();
    },
    save() { try { localStorage.setItem('kigabura-cfg', JSON.stringify(this.cfg)); } catch (e) { /* noop */ } },

    mount(id, html, cls = '') {
      this.root.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'screen ' + cls;
      d.id = id;
      d.innerHTML = html;
      this.root.appendChild(d);
      this.screen = id;
      this.keys = {};
      return d;
    },
    on(root, handlers) {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || !root.contains(b)) return;
        KB.Audio.unlock();
        const act = b.dataset.act;
        if (handlers[act]) handlers[act](b, e);
      });
    },

    // 毎フレーム：キーボード/パッドでのメニュー操作
    tick() {
      const I = KB.Input;
      const pads = I.pads();
      let padA = false, padB = false, padStart = false, padL = false, padR = false;
      pads.forEach((p, i) => {
        if (!p || !p.connected) return;
        const cur = { a: !!(p.buttons[0] && p.buttons[0].pressed), b: !!(p.buttons[1] && p.buttons[1].pressed), s: !!(p.buttons[9] && p.buttons[9].pressed), l: !!(p.buttons[14] && p.buttons[14].pressed) || (p.axes[0] || 0) < -0.6, r: !!(p.buttons[15] && p.buttons[15].pressed) || (p.axes[0] || 0) > 0.6 };
        const pr = this.padPrev[i] || {};
        if (cur.a && !pr.a) padA = true;
        if (cur.b && !pr.b) padB = true;
        if (cur.s && !pr.s) padStart = true;
        if (cur.l && !pr.l) padL = true;
        if (cur.r && !pr.r) padR = true;
        this.padPrev[i] = cur;
      });
      const k = this.keys;
      if (this.app.match) {
        if (!this.app.paused && (I.hit('Escape') || I.hit('KeyP'))) { this.app.pause(true); return; }
        if (this.app.paused && (I.hit('Escape') || I.hit('KeyP') || padStart || padB)) { this.app.pause(false); return; }
        if (this.app.paused && padA) { this.app.pause(false); return; }
        return;
      }
      if (k.confirm && (I.hit('Enter') || I.hit('NumpadEnter') || padA || padStart)) { k.confirm(); return; }
      if (k.back && (I.hit('Escape') || I.hit('Backspace') || padB)) { k.back(); return; }
      if (k.left && (I.hit('ArrowLeft') || padL)) k.left();
      if (k.right && (I.hit('ArrowRight') || padR)) k.right();
      if (k.any && (I.pressedThisFrame.size > 0 || padA || padStart)) k.any();
    },

    // ---------------- タイトル ----------------
    showTitle() {
      this.app.setView(this.app.titleView());
      const d = this.mount('s-title', `
        <div class="logo-wrap">
          <div class="logo" data-t="キガブラ"><span>キガブラ</span></div>
          <div class="logo-sub">大 乱 闘 ア ク シ ョ ン</div>
        </div>
        <div class="press">クリック または なにかキーを押してスタート</div>
        <div class="credit">ATARU ・ FURA ・ MG ・ SIKO</div>`);
      const go = () => { KB.Audio.unlock(); KB.Audio.play('select'); this.showMenu(); };
      d.addEventListener('click', go);
      this.keys.any = go;
      KB.Audio.playMusic('matsuri');
    },

    // ---------------- メインメニュー ----------------
    showMenu() {
      this.app.setView(this.app.titleView());
      KB.Audio.playMusic('menu');
      const d = this.mount('s-menu', `
        <div class="menu-logo">キガブラ</div>
        <button class="btn primary menu-btn" data-act="versus"><span class="ic">⚔</span><span>大乱闘<small>最大4人でバトル（CPU対戦もOK）</small></span></button>
        <button class="btn menu-btn" data-act="howto"><span class="ic">？</span><span>あそびかた<small>操作方法とキャラクターのワザ</small></span></button>
        <button class="btn menu-btn" data-act="options"><span class="ic">⚙</span><span>せってい<small>音量・画質・操作</small></span></button>
        <button class="btn ghost small" data-act="title" style="margin-top:10px">タイトルへ</button>`);
      this.on(d, {
        versus: () => { KB.Audio.play('select'); this.showSelect(); },
        howto: () => { KB.Audio.play('select'); this.showHowto(); },
        options: () => { KB.Audio.play('select'); this.showOptions(); },
        title: () => { KB.Audio.play('back'); this.showTitle(); },
      });
      this.keys.confirm = () => { KB.Audio.play('select'); this.showSelect(); };
      this.keys.back = () => { KB.Audio.play('back'); this.showTitle(); };
    },

    // ---------------- キャラ選択 ----------------
    showSelect() {
      const sr = this.app.showroom();
      sr.mode = 'select';
      this.app.setView(sr);
      KB.Audio.playMusic('menu');
      const roster = KB.CHAR_ORDER.map((c) => `<div class="ricon" data-act="pick" data-c="${c}"><img src="${KB.portrait(c, 0, 'head')}" alt=""><b>${KB.CHARS[c].name}</b></div>`).join('')
        + '<div class="ricon random" data-act="pick" data-c="random">?</div>';
      const d = this.mount('s-select', `
        <div class="topbar">
          <button class="btn ghost small" data-act="back">◀ もどる</button>
          <h2>キャラクターをえらぼう</h2>
          <div class="sp"></div>
          <div class="rules">
            <label>ルール</label>
            <button class="btn small" data-act="mode" id="r-mode"></button>
            <button class="btn small" data-act="vdown">◀</button>
            <div class="val" id="r-val"></div>
            <button class="btn small" data-act="vup">▶</button>
          </div>
        </div>
        <div class="roster">${roster}</div>
        <div class="slots" id="slots"></div>
        <div class="hint">スロットをクリックして選び、上のアイコンでキャラを決定　／　「操作」ボタンで キーボード・パッド・CPU を切り替え</div>
        <div class="select-foot"><button class="btn primary" data-act="next" id="b-next">ステージ選択へ ▶</button></div>`);
      this.renderSlots();
      this.renderRules();
      const cfg = this.cfg;
      this.on(d, {
        back: () => { KB.Audio.play('back'); this.showMenu(); },
        pick: (b) => {
          const s = cfg.slots[this.active];
          if (s.type === 'none') s.type = 'cpu';
          s.char = b.dataset.c === 'random' ? KB.pick(KB.CHAR_ORDER) : b.dataset.c;
          s.variant = 0;
          this.fixVariants(this.active);
          KB.Audio.play('select');
          // 次の未設定スロットへ
          this.renderSlots();
        },
        mode: () => { cfg.mode = cfg.mode === 'stock' ? 'time' : 'stock'; KB.Audio.play('cursor'); this.renderRules(); },
        vdown: () => { if (cfg.mode === 'stock') cfg.stocks = Math.max(1, cfg.stocks - 1); else cfg.time = Math.max(1, cfg.time - 1); KB.Audio.play('cursor'); this.renderRules(); },
        vup: () => { if (cfg.mode === 'stock') cfg.stocks = Math.min(9, cfg.stocks + 1); else cfg.time = Math.min(9, cfg.time + 1); KB.Audio.play('cursor'); this.renderRules(); },
        next: () => this.toStage(),
        slot: (b, e) => {
          const i = +b.dataset.i;
          if (this.active !== i) { this.active = i; KB.Audio.play('cursor'); this.renderSlots(); }
        },
        type: (b, e) => {
          e.stopPropagation();
          const i = +b.dataset.i, s = cfg.slots[i];
          const used = cfg.slots.filter((o, k) => k !== i).map((o) => o.type);
          let idx = TYPES.indexOf(s.type);
          for (let n = 0; n < TYPES.length; n++) {
            idx = (idx + 1) % TYPES.length;
            const t = TYPES[idx];
            if (t === 'cpu' || t === 'none' || !used.includes(t)) { s.type = t; break; }
          }
          this.active = i;
          KB.Audio.play('cursor');
          this.renderSlots();
        },
        cprev: (b, e) => { e.stopPropagation(); this.cycleChar(+b.dataset.i, -1); },
        cnext: (b, e) => { e.stopPropagation(); this.cycleChar(+b.dataset.i, 1); },
        color: (b, e) => {
          e.stopPropagation();
          const i = +b.dataset.i, s = cfg.slots[i];
          const n = KB.MODELS[s.char].palettes.length;
          for (let k = 0; k < n; k++) {
            s.variant = (s.variant + 1) % n;
            if (!cfg.slots.some((o, j) => j !== i && o.type !== 'none' && o.char === s.char && o.variant === s.variant)) break;
          }
          KB.Audio.play('cursor');
          this.renderSlots();
        },
        lvdown: (b, e) => { e.stopPropagation(); const s = cfg.slots[+b.dataset.i]; s.level = Math.max(1, s.level - 1); KB.Audio.play('cursor'); this.renderSlots(); },
        lvup: (b, e) => { e.stopPropagation(); const s = cfg.slots[+b.dataset.i]; s.level = Math.min(9, s.level + 1); KB.Audio.play('cursor'); this.renderSlots(); },
      });
      this.keys.confirm = () => this.toStage();
      this.keys.back = () => { KB.Audio.play('back'); this.showMenu(); };
    },
    cycleChar(i, d) {
      const s = this.cfg.slots[i];
      if (s.type === 'none') return;
      const L = KB.CHAR_ORDER;
      s.char = L[(L.indexOf(s.char) + d + L.length) % L.length];
      s.variant = 0;
      this.fixVariants(i);
      this.active = i;
      KB.Audio.play('cursor');
      this.renderSlots();
    },
    fixVariants(i) {
      const cfg = this.cfg, s = cfg.slots[i];
      const n = KB.MODELS[s.char].palettes.length;
      for (let k = 0; k < n; k++) {
        if (!cfg.slots.some((o, j) => j !== i && o.type !== 'none' && o.char === s.char && o.variant === s.variant)) return;
        s.variant = (s.variant + 1) % n;
      }
    },
    renderRules() {
      const c = this.cfg;
      $('#r-mode').textContent = c.mode === 'stock' ? 'ストック制' : 'タイム制';
      $('#r-val').textContent = c.mode === 'stock' ? c.stocks + ' ストック' : c.time + ' 分';
      this.save();
    },
    renderSlots() {
      const cfg = this.cfg;
      const el = $('#slots');
      if (!el) return;
      el.innerHTML = cfg.slots.map((s, i) => {
        const col = KB.PLAYER_COLORS[i];
        const on = s.type !== 'none';
        const C = KB.CHARS[s.char];
        const isPad = s.type.startsWith('pad');
        const padOk = !isPad || KB.Input.padConnected(+s.type.slice(3));
        const lbl = s.type === 'cpu' ? 'CP' + (i + 1) : 'P' + (i + 1);
        return `<div class="slot ${this.active === i ? 'active' : ''} ${on ? '' : 'off'}" style="--pc:${col}" data-act="slot" data-i="${i}">
          <div class="row"><span class="pbadge">${on ? lbl : '—'}</span><button class="btn small ghost who" data-act="type" data-i="${i}">操作：${KB.deviceLabel(s.type)}${isPad && !padOk ? '（未接続）' : ''}</button></div>
          ${on ? `
          <div class="row"><button class="btn small arrow" data-act="cprev" data-i="${i}">◀</button><div class="cname">${C.name}</div><button class="btn small arrow" data-act="cnext" data-i="${i}">▶</button></div>
          <div class="ctitle">${C.title}</div>
          <div class="row"><button class="btn small ghost" data-act="color" data-i="${i}">🎨 カラー ${s.variant + 1}</button>
            ${s.type === 'cpu' ? `<button class="btn small arrow" data-act="lvdown" data-i="${i}">◀</button><div class="lv">Lv ${s.level}</div><button class="btn small arrow" data-act="lvup" data-i="${i}">▶</button>` : '<div class="lv" style="color:var(--muted)">プレイヤー</div>'}
          </div>` : '<div class="ctitle" style="padding:30px 0">参加しない</div>'}
        </div>`;
      }).join('');
      const n = cfg.slots.filter((s) => s.type !== 'none').length;
      const btn = $('#b-next');
      if (btn) btn.disabled = n < 2;
      this.app.showroom().setSlots(cfg.slots.map((s) => ({ char: s.char, variant: s.variant, active: s.type !== 'none' })));
      this.save();
    },
    toStage() {
      const n = this.cfg.slots.filter((s) => s.type !== 'none').length;
      if (n < 2) { KB.Audio.play('back'); return; }
      KB.Audio.play('select');
      this.showStage();
    },

    // ---------------- ステージ選択 ----------------
    showStage() {
      const cfg = this.cfg;
      const cards = KB.STAGE_ORDER.map((id) => {
        const S = KB.STAGES[id];
        const [a, b, c] = S.thumb;
        return `<div class="scard ${cfg.stage === id ? 'active' : ''}" data-act="pick" data-id="${id}">
          <div class="thumb" style="background:linear-gradient(180deg, ${a}, ${b} 60%, ${c})"></div>
          <div class="info"><b>${S.name}</b><small>${S.sub}</small></div></div>`;
      }).join('');
      const d = this.mount('s-stage', `
        <div class="topbar">
          <button class="btn ghost small" data-act="back">◀ もどる</button>
          <h2>ステージをえらぼう</h2>
          <div class="sp"></div>
          <button class="btn primary" data-act="fight">ファイト！</button>
        </div>
        <div class="stagelist">${cards}</div>`);
      const preview = () => this.app.setView(this.app.stageView(cfg.stage));
      preview();
      KB.Audio.playMusic(KB.STAGES[cfg.stage].bgm);
      const select = (id) => {
        cfg.stage = id;
        d.querySelectorAll('.scard').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
        KB.Audio.play('cursor');
        preview();
        KB.Audio.playMusic(KB.STAGES[id].bgm);
        this.save();
      };
      this.on(d, {
        back: () => { KB.Audio.play('back'); this.showSelect(); },
        pick: (b) => select(b.dataset.id),
        fight: () => this.fight(),
      });
      const L = KB.STAGE_ORDER;
      this.keys.left = () => select(L[(L.indexOf(cfg.stage) + L.length - 1) % L.length]);
      this.keys.right = () => select(L[(L.indexOf(cfg.stage) + 1) % L.length]);
      this.keys.confirm = () => this.fight();
      this.keys.back = () => { KB.Audio.play('back'); this.showSelect(); };
    },
    fight() {
      const cfg = this.cfg;
      KB.Audio.play('go');
      const players = cfg.slots.map((s, i) => ({ slot: i, type: s.type, char: s.char, variant: s.variant, level: s.level })).filter((p) => p.type !== 'none');
      this.root.innerHTML = '';
      this.screen = 'match';
      this.keys = {};
      this.app.startMatch({ players, mode: cfg.mode, stocks: cfg.stocks, time: cfg.time, stage: cfg.stage });
    },

    // ---------------- ポーズ ----------------
    showPause(on) {
      const old = $('#s-pause');
      if (old) old.remove();
      if (!on) return;
      const d = document.createElement('div');
      d.className = 'screen overlay'; d.id = 's-pause';
      d.innerHTML = `<div class="panel"><h3>ポーズ</h3><div class="col">
        <button class="btn primary" data-act="resume">つづける</button>
        <button class="btn" data-act="retry">さいしょから</button>
        <button class="btn" data-act="select">キャラ選択へ</button>
        <button class="btn ghost" data-act="title">タイトルへ</button></div>
        <div class="hint" style="margin-top:12px">Esc / P で再開</div></div>`;
      this.root.appendChild(d);
      this.on(d, {
        resume: () => this.app.pause(false),
        retry: () => { d.remove(); this.app.quitMatch(); this.fightCfg(this.app.lastCfg); },
        select: () => { d.remove(); this.app.quitMatch(); this.showSelect(); },
        title: () => { d.remove(); this.app.quitMatch(); this.showTitle(); },
      });
    },
    fightCfg(c) {
      this.root.innerHTML = '';
      this.screen = 'match';
      this.keys = {};
      KB.Audio.play('go');
      this.app.startMatch(c);
    },

    // ---------------- リザルト ----------------
    showResult(res) {
      const sr = this.app.showroom();
      sr.setResults(res);
      this.app.setView(sr);
      KB.Audio.stopMusic();
      KB.Audio.playMusic('victory');
      setTimeout(() => { if (this.screen === 's-result') KB.Audio.playMusic('menu'); }, 4200);
      const w = res[0];
      const rows = res.map((r) => `<div class="rank" style="--pc:${KB.PLAYER_COLORS[r.slot]}">
        <div class="no">${r.rank}</div><img src="${KB.portrait(r.char, r.variant, 'head')}" alt="">
        <div class="rn">${r.label} ${r.name}<small>${r.title}</small></div>
        <div class="st">撃墜 <b>${r.kos}</b>　落下 <b>${r.falls}</b><br>与ダメージ <b>${r.dmg}%</b>${this.app.lastCfg.mode === 'time' ? `<br>スコア <b>${r.score > 0 ? '+' : ''}${r.score}</b>` : ''}</div></div>`).join('');
      const d = this.mount('s-result', `
        <div class="result-box">
          <div class="winner-title" style="color:${KB.PLAYER_COLORS[w.slot]}"><small>WINNER</small>${w.name}</div>
          ${rows}
          <div class="result-btns">
            <button class="btn primary" data-act="again">もう一度</button>
            <button class="btn" data-act="select">キャラ選択へ</button>
            <button class="btn ghost" data-act="title">タイトルへ</button>
          </div>
        </div>`);
      this.on(d, {
        again: () => this.fightCfg(this.app.lastCfg),
        select: () => { sr.mode = 'select'; this.showSelect(); },
        title: () => this.showTitle(),
      });
      this.keys.confirm = () => this.fightCfg(this.app.lastCfg);
      this.keys.back = () => { sr.mode = 'select'; this.showSelect(); };
    },

    // ---------------- あそびかた ----------------
    showHowto() {
      this.app.setView(this.app.titleView());
      const kv = (arr) => arr.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('');
      const chars = KB.CHAR_ORDER.map((c) => {
        const C = KB.CHARS[c];
        return `<div class="panel"><h4>${C.name}　<span style="color:var(--muted);font-size:12px">${C.title}</span></h4>
          <div class="movelist">${C.desc}<br><br>
          <b>必殺ワザ</b>：${C.specials.n}<br><b>横＋必殺</b>：${C.specials.s}<br><b>上＋必殺</b>：${C.specials.u}（復帰）<br><b>下＋必殺</b>：${C.specials.d}</div></div>`;
      }).join('');
      const d = this.mount('s-howto', `
        <div class="topbar"><button class="btn ghost small" data-act="back">◀ もどる</button><h2>あそびかた</h2></div>
        <div style="overflow:auto;padding:0 22px 22px">
          <div class="howto-grid">
            <div class="panel"><h4>キーボード1（P1）</h4><div class="kv">${kv([
              ['<kbd>A</kbd><kbd>D</kbd>', 'いどう（押しっぱなしでダッシュ）'], ['<kbd>W</kbd> / <kbd>Space</kbd>', 'ジャンプ（空中でもう一度）'], ['<kbd>S</kbd>', 'しゃがむ・すり抜け床から降りる・急降下'],
              ['<kbd>J</kbd>', '攻撃（方向キーと組み合わせ）'], ['<kbd>U</kbd>', 'スマッシュ攻撃（長押しでため）'], ['<kbd>K</kbd>', '必殺ワザ（方向で4種類）'],
              ['<kbd>L</kbd>', 'シールド（＋方向で回避）'], ['<kbd>I</kbd>', 'つかみ → 方向で投げ'], ['<kbd>Esc</kbd> / <kbd>P</kbd>', 'ポーズ']])}</div></div>
            <div class="panel"><h4>キーボード2（P2）</h4><div class="kv">${kv([
              ['<kbd>←</kbd><kbd>→</kbd>', 'いどう'], ['<kbd>↑</kbd> / <kbd>0</kbd>', 'ジャンプ'], ['<kbd>↓</kbd>', 'しゃがむ・降りる'],
              ['<kbd>1</kbd> / <kbd>.</kbd>', '攻撃'], ['<kbd>4</kbd> / <kbd>;</kbd>', 'スマッシュ'], ['<kbd>2</kbd> / <kbd>/</kbd>', '必殺ワザ'],
              ['<kbd>3</kbd> / <kbd>右Shift</kbd>', 'シールド'], ['<kbd>5</kbd> / <kbd>:</kbd>', 'つかみ']])}</div>
              <div class="hint" style="text-align:left;padding-top:8px">数字はテンキー</div></div>
            <div class="panel"><h4>ゲームパッド</h4><div class="kv">${kv([
              ['左スティック', 'いどう（はじくとダッシュ・上でジャンプ）'], ['A', '攻撃'], ['B', '必殺ワザ'], ['X / Y', 'ジャンプ'],
              ['右スティック', 'スマッシュ攻撃'], ['LB', 'つかみ'], ['RB / LT / RT', 'シールド'], ['START', 'ポーズ']])}</div></div>
            <div class="panel" style="grid-column: span 3"><h4>バトルのルール</h4><div class="movelist">
              攻撃を当てると相手の <b>ダメージ%</b> がたまり、%が高いほど遠くへ <b>ふっとび</b> ます。画面の外までふっとばせば <b>撃墜</b>！<br>
              ・キーボードは <b>U</b>（P2はテンキー4）、パッドは <b>スティックをはじきながらA</b> か <b>右スティック</b> でスマッシュ攻撃。キーボードは長押しでためると強力に。<br>
              ・ステージから落ちたら <b>空中ジャンプ</b> と <b>上＋必殺ワザ</b> で崖につかまろう。崖につかまったら上/横で登る・攻撃で崖のぼり攻撃。<br>
              ・シールドは使うほど小さくなり、割れるとしばらく動けません。シールド中は<b>つかみ</b>に注意。<br>
              ・ふっとばされて着地する直前にシールドを押すと <b>受け身</b>。ふっとび中に方向キーで <b>ずらし</b>（ふっとぶ方向を少し変える）ができます。
            </div></div>
            ${chars}
          </div>
        </div>`);
      this.on(d, { back: () => { KB.Audio.play('back'); this.showMenu(); } });
      this.keys.back = () => { KB.Audio.play('back'); this.showMenu(); };
    },

    // ---------------- 設定 ----------------
    showOptions() {
      this.app.setView(this.app.titleView());
      const s = KB.settings;
      const d = this.mount('s-options', `
        <div class="panel" style="width:min(520px,92vw)"><h3>せってい</h3>
          <div class="opt-row"><span>全体の音量</span><input type="range" min="0" max="1" step="0.05" value="${s.master}" data-k="master"></div>
          <div class="opt-row"><span>BGM</span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></div>
          <div class="opt-row"><span>効果音</span><input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></div>
          <div class="opt-row"><span>画質</span><button class="btn small" data-act="quality">${{ high: '高', mid: '中', low: '低（軽量）' }[s.quality]}</button></div>
          <div class="opt-row"><span>上入力でジャンプ</span><button class="btn small" data-act="tap">${s.tapJump ? 'ON' : 'OFF'}</button></div>
          <div class="opt-row"><span>画面のゆれ</span><button class="btn small" data-act="shake">${s.shake ? 'ON' : 'OFF'}</button></div>
          <div style="text-align:center;margin-top:16px"><button class="btn primary" data-act="back">OK</button></div>
        </div>`, 'overlay');
      d.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
        s[inp.dataset.k] = parseFloat(inp.value);
        KB.Audio.applyVolumes();
        KB.saveSettings();
      }));
      this.on(d, {
        quality: (b) => { s.quality = s.quality === 'high' ? 'mid' : s.quality === 'mid' ? 'low' : 'high'; b.textContent = { high: '高', mid: '中', low: '低（軽量）' }[s.quality]; this.app.applyQuality(); KB.saveSettings(); KB.Audio.play('cursor'); },
        tap: (b) => { s.tapJump = !s.tapJump; b.textContent = s.tapJump ? 'ON' : 'OFF'; KB.saveSettings(); KB.Audio.play('cursor'); },
        shake: (b) => { s.shake = !s.shake; b.textContent = s.shake ? 'ON' : 'OFF'; KB.saveSettings(); KB.Audio.play('cursor'); },
        back: () => { KB.Audio.play('select'); this.showMenu(); },
      });
      this.keys.back = () => { KB.Audio.play('back'); this.showMenu(); };
    },
  };
  KB.UI = UI;
})(window.KB);
