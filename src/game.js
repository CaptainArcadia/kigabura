// ============================================================
// game.js — 試合の進行（当たり判定・撃墜・カメラ・ルール）
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;

  function circleRect(cx, cy, r, b) {
    const px = KB.clamp(cx, b.x1, b.x2), py = KB.clamp(cy, b.y1, b.y2);
    const dx = cx - px, dy = cy - py;
    return dx * dx + dy * dy <= r * r;
  }
  function hurtbox(v) {
    let h = v.h;
    if (v.state === 'crouch' || (v.state === 'attack' && v.move && v.move.crouch)) h *= 0.62;
    if (v.state === 'down') h *= 0.45;
    return { x1: v.x - v.hw * 0.92, x2: v.x + v.hw * 0.92, y1: v.y, y2: v.y + h };
  }

  class Match {
    constructor(app, cfg) {
      this.app = app;
      this.cfg = cfg;
      this.scene = new T.Scene();
      this.stage = KB.STAGES[cfg.stage].build(this.scene);
      this.fx = new KB.FX(this.scene);
      this.frame = 0; this.elapsed = 0;
      this.phase = 'intro'; this.phaseT = 0;
      this.projs = [];
      this.timeLeft = (cfg.time || 3) * 60 * 60;
      this.sudden = false;
      this.camera = new T.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 1500);
      this.cam = { x: 0, y: 3, d: 34, sx: 0, sy: 0, shake: 0 };
      this.timeScale = 1;
      this.slowT = 0;
      this.elimOrder = [];
      this.fighters = cfg.players.map((p) => {
        const input = p.type === 'cpu' ? new KB.CPU(p.level) : new KB.HumanInput(p.type);
        const f = new KB.Fighter(this, p.slot, { char: p.char, variant: p.variant, input, cpu: p.type === 'cpu', stocks: cfg.mode === 'stock' ? cfg.stocks : 1 });
        return f;
      });
      const sp = this.stage.spawns;
      this.fighters.forEach((f, i) => {
        const s = sp[f.slot % sp.length];
        f.reset(s[0], s[1], s[0] > 0 ? -1 : 1);
      });
      this.hud = new KB.HUD(this);
      KB.Audio.playMusic(KB.STAGES[cfg.stage].bgm);
      this.updateCamera(true);
      this.cam.d = 46; this.cam.y = 8;
    }
    // 途中で初めて出るメッシュのシェーダーを先にコンパイルしておく（カクつき防止）
    warmup(renderer) {
      const tmp = new T.Group();
      for (const k of ['cross', 'icicle', 'takoyaki', 'ball', 'wave']) tmp.add(KB.projMesh(k));
      this.scene.add(tmp);
      this.fx.spike(0, -50, 0, 1, 0xbfeeff, 2);
      this.fx.shock(0, -50, 0xffffff, 1);
      this.fx.koBlast(0, -50, 0xffffff, 0, 0);
      this.fx.sprite({ x: 0, y: -50, tex: 'glow', size: 1, life: 2 });
      this.fighters.forEach((f) => { f.shieldMesh.visible = true; f.iceMesh.visible = true; f.halo.visible = true; });
      try { renderer.compile(this.scene, this.camera); } catch (e) { /* 失敗しても続行 */ }
      this.fighters.forEach((f) => { f.shieldMesh.visible = false; f.iceMesh.visible = false; f.halo.visible = false; });
      this.scene.remove(tmp);
      tmp.traverse((m) => { if (m.isMesh || m.isSprite) { if (m.geometry) m.geometry.dispose(); m.material.dispose(); } });
      for (let i = 0; i < 3; i++) this.fx.update();
    }
    surfaces() { return this.stage.surfaces; }
    shake(a) { if (KB.settings.shake) this.cam.shake = Math.max(this.cam.shake, a); }
    flash(a) { this.hud.flash(a); }
    canRespawn(f) { return this.cfg.mode === 'time' && !this.sudden ? true : f.stocks > 0; }

    // ---------------- 1フレーム ----------------
    step() {
      this.frame++; this.phaseT++;
      this.stage.update(this.frame);
      const play = this.phase === 'play';
      if (this.phase === 'intro') this.introStep();
      for (const f of this.fighters) {
        if (play && !f.eliminated) f.ctrl = f.input.poll(f);
        else { if (!f._idleCtrl) f._idleCtrl = new KB.Controller(); f._idleCtrl.feed({ x: 0, y: 0, btn: {} }); f.ctrl = f._idleCtrl; }
      }
      if (this.phase !== 'result') {
        for (const f of this.fighters) if (!f.eliminated) f.step();
        for (const p of this.projs) p.update();
        this.projs = this.projs.filter((p) => p.alive);
        if (this.phase === 'play' || this.phase === 'end') this.detectHits();
        this.checkBlast();
      }
      if (play) {
        this.elapsed++;
        if (this.cfg.mode === 'time' && !this.sudden) {
          this.timeLeft--;
          if (this.timeLeft <= 600 && this.timeLeft % 60 === 0 && this.timeLeft > 0) KB.Audio.play('count');
          if (this.timeLeft <= 0) this.endGame('TIME UP!');
        }
        if (this.slowT > 0) { this.slowT--; this.timeScale = this.slowT > 0 ? 0.25 : 1; }
      }
      if (this.phase === 'end') {
        this.timeScale = this.phaseT < 70 ? 0.35 : 1;
        if (this.phaseT === 200) this.finish();
      }
      this.fx.update();
      this.updateCamera(false);
    }

    introStep() {
      const t = this.phaseT;
      if (t === 40) { this.hud.msg('3'); KB.Audio.play('count'); }
      if (t === 90) { this.hud.msg('2'); KB.Audio.play('count'); }
      if (t === 140) { this.hud.msg('1'); KB.Audio.play('count'); }
      if (t === 190) {
        this.hud.msg(this.sudden ? 'SUDDEN DEATH' : 'GO!');
        KB.Audio.play('go');
        this.phase = 'play'; this.phaseT = 0;
      }
    }

    // ---------------- 当たり判定 ----------------
    detectHits() {
      const list = [];
      const F = this.fighters;
      for (const a of F) {
        if (a.state !== 'attack' || !a.move || a.hitlag > 0 || a.charging || !a.alive) continue;
        const mv = a.move, fr = a.mf;
        if (!mv.hits.length) continue;
        for (const h of mv.hits) {
          if (fr === h.s && !h.grab && KB.settings.quality !== 'low') this.fx.swipe(a.x + h.x * a.facing, a.y + h.y, h.r, h.fx === 'ice' ? 0x9fe6ff : h.fx === 'fire' ? 0xffa040 : 0xffffff);
        }
        for (const v of F) {
          if (v === a || !v.alive || v.state === 'respawn' || v.intangible || a.hitSet.has(v) || v.holder === a) continue;
          const hb = hurtbox(v);
          for (const h of mv.hits) {
            if (fr < h.s || fr > h.e) continue;
            const hx = a.x + h.x * a.facing, hy = a.y + h.y;
            if (circleRect(hx, hy, h.r, hb)) {
              if (h.grab && (!v.ground || v.state === 'grabbed' || v.state === 'ledge')) continue;
              list.push({ a, v, h, hx, hy });
              break;
            }
          }
        }
      }
      for (const e of list) {
        const { a, v, h } = e;
        if (a.hitSet.has(v) || a.state !== 'attack') continue;
        a.hitSet.add(v);
        if (h.grab) { if (v.state !== 'grabbed' && !v.intangible) a.onGrab(v); continue; }
        const px = (e.hx + v.x) / 2, py = KB.clamp(e.hy, v.y + 0.2, v.y + v.h);
        const mul = a.move && a.move.smash ? 1 + 0.4 * (a.charge / 60) : 1;
        const res = v.receiveHit(h, a, a.facing, px, py, false, false, mul);
        if (res === 'hit' && a.move && a.move.onHit) a.move.onHit(a, v);
      }
      // 飛び道具
      for (const p of this.projs) {
        if (!p.alive) continue;
        for (const v of F) {
          if (v === p.owner || !v.alive || v.state === 'respawn' || v.intangible || p.hitSet.has(v)) continue;
          if (circleRect(p.x, p.y, p.r, hurtbox(v))) {
            p.hitSet.add(v);
            const dir = Math.sign(p.vx) || p.owner.facing;
            v.receiveHit(p.hit, p.owner, dir, p.x, p.y, true);
            if (p.o.onGround === 'explode') p.explode();
            if (!p.o.pierce) p.kill();
            break;
          }
        }
      }
      // 飛び道具同士の相殺
      for (let i = 0; i < this.projs.length; i++) for (let j = i + 1; j < this.projs.length; j++) {
        const p = this.projs[i], q = this.projs[j];
        if (!p.alive || !q.alive || p.owner === q.owner) continue;
        if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r) {
          this.fx.hit((p.x + q.x) / 2, (p.y + q.y) / 2, 0.2);
          KB.Audio.play('shieldHit');
          p.kill(); q.kill();
        }
      }
    }

    onHit(v, att, kb, power, fx, hx, hy) {
      this.fx.hit(hx, hy, power, fx, att ? att.facing : 1);
      const snd = { fire: 'hitFire', ice: 'hitIce', holy: 'hitHoly' }[fx] || 'hit';
      KB.Audio.play(snd, power);
      if (power > 0.3) this.shake(0.1 + power * 0.5);
      if (power > 0.6) this.flash(0.12 + power * 0.15);
      this.hud.bump(v);
      // 撃墜確定っぽい強打はスロー演出
      const sp = kb * KB.KB_SPEED;
      const dist = (sp * sp) / (2 * KB.KB_DECAY);
      const b = this.stage.blast;
      const need = Math.min(Math.abs(b.r - Math.abs(v.x)), b.t - v.y);
      if (this.phase === 'play' && kb > 140 && dist > need * 1.05) {
        const lastStock = this.cfg.mode === 'stock' && v.stocks === 1;
        if (lastStock || Math.random() < 0.35) {
          this.slowT = 26;
          v.hitlag += 8; if (att) att.hitlag += 8;
          this.flash(0.35);
          this.fx.sprite({ x: hx, y: hy, tex: 'ring', color: 0xff5a3a, size: 1, sizeEnd: 14, life: 26 });
          this.cam.punch = 1;
        }
      }
    }

    checkBlast() {
      const b = this.stage.blast;
      for (const f of this.fighters) {
        if (f.state === 'dead' || f.eliminated) continue;
        if (f.x < b.l || f.x > b.r || f.y < b.b || f.y > b.t) this.ko(f);
      }
    }
    ko(f) {
      const b = this.stage.blast;
      const x = KB.clamp(f.x, b.l, b.r), y = KB.clamp(f.y, b.b, b.t);
      const star = f.y > b.t && Math.random() < 0.4;
      if (star) {
        this.fx.starKO(x * 0.35, KB.clamp(y * 0.7, 0, 16));
        KB.Audio.play('star');
      } else {
        this.fx.koBlast(x, y, f.color, this.cam.x, this.cam.y);
        KB.Audio.play('ko');
        this.shake(0.9);
        this.flash(0.25);
      }
      KB.Audio.play('crowd');
      const killer = f.lastHitBy && this.frame - f.lastHitFrame < 600 && f.lastHitBy !== f ? f.lastHitBy : null;
      if (this.phase === 'play') {
        if (killer) { killer.kos++; killer.score++; } else { f.sds++; }
        f.falls++; f.score--;
        if (this.cfg.mode === 'stock' || this.sudden) f.stocks--;
      }
      f.die();
      if (this.phase === 'play' && (this.cfg.mode === 'stock' || this.sudden) && f.stocks <= 0) {
        this.elimOrder.push(f);
        f.elimFrame = this.frame;
        const left = this.fighters.filter((o) => o.stocks > 0);
        if (left.length <= 1) this.endGame('GAME SET');
      }
    }

    endGame(text) {
      if (this.phase === 'end') return;
      // タイム制の同点はサドンデス
      if (text === 'TIME UP!' && !this.sudden) {
        const best = Math.max(...this.fighters.map((f) => f.score));
        const tied = this.fighters.filter((f) => f.score === best);
        if (tied.length > 1) {
          this.hud.msg('TIME UP!', 'stay');
          KB.Audio.play('gameset');
          this.phase = 'suddenWait'; this.phaseT = 0;
          this.suddenList = tied;
          setTimeout(() => this.startSudden(), 1800);
          return;
        }
      }
      this.phase = 'end'; this.phaseT = 0;
      this.hud.msg(text, 'stay');
      KB.Audio.play('gameset');
      KB.Audio.stopMusic();
    }
    startSudden() {
      if (this.disposed) return;
      this.sudden = true;
      const sp = this.stage.spawns;
      for (const f of this.fighters) {
        if (this.suddenList.includes(f)) {
          const s = sp[f.slot % sp.length];
          f.eliminated = false;
          f.reset(s[0], s[1], s[0] > 0 ? -1 : 1);
          f.damage = 300; f.stocks = 1;
        } else {
          f.die(); f.eliminated = true; f.stocks = 0;
        }
      }
      this.projs.forEach((p) => p.kill());
      this.hud.clearMsg();
      this.phase = 'intro'; this.phaseT = 0;
    }
    finish() {
      if (this.finished) return;
      this.finished = true;
      this.phase = 'result';
      this.app.onMatchEnd(this.results());
    }
    results() {
      const F = [...this.fighters];
      let order;
      if (this.cfg.mode === 'stock' || this.sudden) {
        const alive = F.filter((f) => f.stocks > 0);
        const dead = [...this.elimOrder].reverse();
        order = [...alive, ...dead, ...F.filter((f) => !alive.includes(f) && !dead.includes(f))];
      } else {
        order = F.sort((a, b) => b.score - a.score || a.falls - b.falls || b.dmgDealt - a.dmgDealt);
      }
      return order.map((f, i) => ({
        rank: i + 1, slot: f.slot, char: f.def.id, variant: f.cfg.variant || 0, label: f.label, name: f.def.name, title: f.def.title,
        kos: f.kos, falls: f.falls, sds: f.sds, dmg: Math.round(f.dmgDealt), score: f.score,
      }));
    }

    // ---------------- カメラ ----------------
    updateCamera(snap) {
      const c = this.cam, st = this.stage;
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, n = 0;
      for (const f of this.fighters) {
        if (f.state === 'dead' || f.eliminated) continue;
        const x = KB.clamp(f.x, st.blast.l + 4, st.blast.r - 4), y = KB.clamp(f.y, st.blast.b + 3, st.blast.t - 3);
        minX = Math.min(minX, x - 2.5); maxX = Math.max(maxX, x + 2.5);
        minY = Math.min(minY, y - 1.2); maxY = Math.max(maxY, y + f.h + 1.8);
        n++;
      }
      if (!n) { minX = -6; maxX = 6; minY = -1; maxY = 6; }
      if (this.phase === 'intro' && !this.sudden) { minX = Math.min(minX, -9); maxX = Math.max(maxX, 9); }
      const aspect = window.innerWidth / window.innerHeight;
      const ht = Math.tan(KB.deg(this.camera.fov / 2));
      const w = maxX - minX, h = maxY - minY;
      let d = Math.max(h / 2 / ht, w / 2 / (ht * aspect));
      d = KB.clamp(d * 1.08, 14, 42);
      let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      cx = KB.clamp(cx, st.cam.l + 6, st.cam.r - 6);
      cy = KB.clamp(cy, st.cam.b + 3, st.cam.t - 2);
      if (this.cam.punch > 0.01) { d *= 1 - 0.18 * this.cam.punch; this.cam.punch *= 0.9; }
      if (snap) { c.x = cx; c.y = cy; c.d = d; }
      else {
        const k = this.phase === 'intro' ? 0.035 : 0.075;
        c.x = KB.lerp(c.x, cx, k); c.y = KB.lerp(c.y, cy, k); c.d = KB.lerp(c.d, d, this.phase === 'intro' ? 0.03 : 0.06);
      }
      c.shake *= 0.86;
      const sx = (Math.random() - 0.5) * c.shake, sy = (Math.random() - 0.5) * c.shake;
      this.camera.position.set(c.x + sx, c.y + 1.6 + c.d * 0.07 + sy, c.d);
      this.camera.lookAt(c.x + sx * 0.5, c.y + sy * 0.5, 0);
    }

    // 描画前（補間なし）
    render() {
      for (const f of this.fighters) f.render();
      this.hud.update();
    }
    resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

    dispose() {
      this.disposed = true;
      this.hud.destroy();
      for (const f of this.fighters) f.dispose();
      this.projs.forEach((p) => p.kill());
      this.fx.dispose();
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => KB.tex.disposeMaterial(m));
      });
    }
  }
  KB.Match = Match;
})(window.KB);
