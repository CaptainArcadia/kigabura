// ============================================================
// ai.js — CPU プレイヤー（Lv1〜9）
// 仮想的なボタン入力を作って Controller に流し込む
// ============================================================
(function (KB) {
  'use strict';

  const INFO = {
    ataru: { upReach: 4.4, sideRec: true, projMin: 3, projMax: 12, projChance: 0.25 },
    fura: { upReach: 6.0, sideRec: true, projMin: 2.5, projMax: 9, projChance: 0.3 },
    mg: { upReach: 3.9, sideRec: true, projMin: 3, projMax: 8, projChance: 0.2 },
    siko: { upReach: 4.8, sideRec: false, projMin: 3, projMax: 10, projChance: 0.25 },
  };

  class CPU {
    constructor(level) {
      this.level = KB.clamp(level || 5, 1, 9);
      this.ctrl = new KB.Controller();
      this.acts = [];
      this.think = 0;
      this.plan = { type: 'idle', t: 0 };
      this.target = null;
      this.lastJump = -99;
      this.ledgeWait = 0;
      this.shieldT = 0;
    }
    get L() { return this.level; }
    reaction() { return [34, 26, 20, 15, 11, 8, 6, 4, 3][this.level - 1]; }
    chance(base) { return Math.random() < base; }

    // t フレーム後に dur フレームの間ボタン/スティック入力
    act(t, dur, o) { this.acts.push(Object.assign({ t, dur }, o)); }
    busy() { return this.acts.length > 0; }

    poll(f) {
      const raw = { x: 0, y: 0, btn: {}, tapUp: false };
      const g = f.game;
      if (!g || g.phase !== 'play') { this.ctrl.feed(raw); return this.ctrl; }
      this.f = f;
      try { this.decide(f, g, raw); } catch (e) { console.warn(e); }
      // 予約入力を適用
      for (let i = this.acts.length - 1; i >= 0; i--) {
        const a = this.acts[i];
        if (a.t > 0) { a.t--; continue; }
        if (a.x !== undefined) raw.x = a.x;
        if (a.y !== undefined) raw.y = a.y;
        if (a.b) raw.btn[a.b] = true;
        a.dur--;
        if (a.dur <= 0) this.acts.splice(i, 1);
      }
      this.ctrl.feed(raw);
      return this.ctrl;
    }

    pickTarget(f, g) {
      let best = null, bd = 1e9;
      for (const o of g.fighters) {
        if (o === f || !o.alive || o.state === 'dead') continue;
        let d = Math.hypot(o.x - f.x, o.y - f.y);
        if (o.state === 'respawn' || o.invuln > 60) d += 12;
        if (this.target === o) d -= 3; // 追い続けやすく
        if (this.level >= 6) d -= o.damage * 0.02;
        if (d < bd) { bd = d; best = o; }
      }
      this.target = best;
      return best;
    }

    decide(f, g, raw) {
      const L = this.level;
      const s = f.state;
      const st = g.stage;
      const main = st.tops[0];
      const info = INFO[f.def.id];
      const fr = g.frame;
      // 連打で抜ける
      if (s === 'grabbed' || s === 'frozen' || s === 'dizzy') {
        if (fr % 3 === 0) raw.btn.attack = true;
        raw.x = fr % 6 < 3 ? 1 : -1;
        this.acts.length = 0;
        return;
      }
      if (s === 'hitstun') {
        this.acts.length = 0;
        // ずらし：ステージ中央＆上方向へ
        if (L >= 3) { raw.x = f.x > 0 ? -1 : 1; raw.y = 0.6; }
        // 受け身
        if (!f.ground && f.y - main.y < 1.6 && f.x > main.x1 && f.x < main.x2 && f.vy + f.kby < 0 && f.tumble && this.chance(L * 0.035)) raw.btn.shield = true;
        return;
      }
      if (s === 'down') { if (this.chance(0.05 + L * 0.02)) { if (this.chance(0.4)) raw.btn.attack = true; else raw.x = this.chance(0.5) ? 1 : -1; } return; }
      if (s === 'ledge') { this.onLedge(f, raw); return; }
      if (s === 'respawn') { if (f.sf > 40 + (9 - L) * 8) raw.y = -1; return; }

      const offstage = f.x < main.x1 - 0.1 || f.x > main.x2 + 0.1 || (f.y < main.y - 0.4 && !f.ground);
      if (!f.ground && offstage) { this.acts.length = 0; this.recover(f, g, raw, main, info); return; }

      const t = this.pickTarget(f, g);
      if (!t) { raw.x = -Math.sign(f.x) * (Math.abs(f.x) > 2 ? 1 : 0); return; }
      if (this.busy()) {
        // 実行中も崖から落ちないように
        if (f.ground && this.nearEdge(f, main, 0.6) && Math.sign(f.vx) === Math.sign(f.x)) raw.x = -Math.sign(f.x);
        return;
      }
      if (--this.think > 0) { this.continuePlan(f, t, raw, main); return; }
      this.think = this.reaction() + KB.randi(0, Math.max(1, 10 - L));
      this.makePlan(f, t, g, raw, main, info);
    }

    nearEdge(f, main, m = 1.2) { return f.x < main.x1 + m || f.x > main.x2 - m; }

    onLedge(f, raw) {
      if (!this.ledgeWait) this.ledgeWait = KB.randi(6, Math.max(8, 44 - this.level * 4));
      if (f.sf < this.ledgeWait) return;
      this.ledgeWait = 0;
      const toward = -f.ledge.side;
      const r = Math.random();
      if (r < 0.4) raw.x = toward;
      else if (r < 0.6) raw.btn.jump = true;
      else if (r < 0.8) raw.btn.attack = true;
      else raw.btn.shield = true;
    }

    recover(f, g, raw, main, info) {
      const side = f.x < (main.x1 + main.x2) / 2 ? -1 : 1;
      const lx = side < 0 ? main.x1 : main.x2;
      const dx = Math.abs(f.x - lx);
      const dy = main.y - f.y; // 正 = 崖より下
      raw.x = -side;
      if (f.state === 'helpless' || f.state === 'attack' || f.state === 'airdodge') return;
      const fr = g.frame;
      const L = this.level;
      const falling = f.vy < 0.02;
      if (falling && f.jumps > 0 && fr - this.lastJump > 14 && (dy > -1.5 || dx > 5)) {
        raw.btn.jump = true; this.lastJump = fr; return;
      }
      const late = L <= 2 ? this.chance(0.5) : false;
      if (!f.usedUp && falling && f.jumps === 0 && !late) {
        if ((dy > 0.3 || dx > 3.5) && dy < info.upReach && dx < info.upReach + 2) { raw.y = 1; raw.x = -side * 0.6; raw.btn.special = true; return; }
        if (dy >= info.upReach - 0.3) { raw.y = 1; raw.btn.special = true; return; }
      }
      if (info.sideRec && !f.usedSide && dx > 4.5 && dy < 2.5 && dy > -3 && this.chance(0.3 + L * 0.05)) {
        raw.x = -side; raw.btn.special = true; return;
      }
    }

    makePlan(f, t, g, raw, main, info) {
      const L = this.level;
      const dx = t.x - f.x, dy = (t.y + t.dims.cy) - (f.y + f.dims.cy);
      const adx = Math.abs(dx);
      const dir = Math.sign(dx) || 1;
      const tOff = t.x < main.x1 - 0.2 || t.x > main.x2 + 0.2 || t.state === 'ledge';
      const aggr = 0.25 + L * 0.075;

      // 相手が無敵・復活中なら様子見
      if (t.state === 'respawn' || (t.invuln > 30 && L >= 5)) { this.plan = { type: 'wait', t: 20 }; return; }

      // 防御：相手の攻撃が来そう
      if (f.ground && t.state === 'attack' && t.move && t.move.hits.length && adx < 3.2 && Math.abs(dy) < 2.5) {
        const h0 = t.move.hits[0];
        if (t.mf < h0.s && this.chance(L * 0.08)) {
          if (this.chance(0.7)) { this.act(0, KB.randi(10, 22), { b: 'shield' }); if (L >= 5 && adx < 1.6) this.act(20, 1, { b: 'grab' }); }
          else this.act(0, 1, { b: 'shield', x: 0, y: -1 });
          return;
        }
      }

      // 崖つかまり中の相手を待ち構える
      if (tOff && t.state === 'ledge' && L >= 5) {
        const edgeX = t.ledge.x - t.ledge.side * 1.3;
        this.plan = { type: 'goto', x: edgeX, t: 30 };
        if (Math.abs(f.x - edgeX) < 1.5 && this.chance(0.25)) this.act(0, 1, { b: 'attack', y: -1 });
        return;
      }
      // 復帰中の相手を追撃（高レベル）
      if (tOff && L >= 6 && t.state !== 'ledge' && Math.abs(t.x) - Math.abs(main.x2) < 6 && t.y > main.y - 4 && this.chance(0.4)) {
        const ex = Math.sign(t.x) * (main.x2 - 0.8);
        if (Math.abs(f.x - ex) > 1.5) { this.plan = { type: 'goto', x: ex, t: 25 }; return; }
        if (adx < 5 && this.chance(0.5)) {
          // 飛び出して攻撃
          this.act(0, 1, { b: 'jump', x: dir });
          this.act(4, 10, { x: dir });
          this.act(10, 1, { b: 'attack', x: t.y < f.y ? 0 : dir, y: t.y < f.y - 1 ? -1 : 0 });
          this.act(16, 18, { x: -dir });
          return;
        }
        if (info.projChance > 0) { this.act(0, 1, { b: 'special', x: dir }); this.act(2, 1, { x: 0 }); }
        return;
      }

      if (!f.ground) {
        // 空中：近ければ空中攻撃
        if (Math.hypot(dx, dy) < 2.2 && this.chance(aggr)) {
          let d = 'none';
          if (dy > 1.0 && adx < 1.4) d = 'up';
          else if (dy < -1.0 && adx < 1.2) d = 'down';
          else if (Math.sign(dx) === f.facing) d = 'fwd';
          else d = 'back';
          const y = d === 'up' ? 1 : d === 'down' ? -1 : 0;
          const x = d === 'fwd' ? f.facing : d === 'back' ? -f.facing : 0;
          this.act(0, 1, { b: 'attack', x, y });
          return;
        }
        this.plan = { type: 'drift', t: 10 };
        return;
      }

      // 地上
      const close = adx < 1.5 + f.hw && Math.abs(dy) < 1.3;
      const mid = adx < 2.8 && Math.abs(dy) < 1.4;
      const above = dy > 1.2 && dy < 4.5 && adx < 1.8;
      const koRange = t.damage > 95 - L * 2;

      if (close && this.chance(aggr)) {
        const face = Math.sign(dx) !== f.facing ? dir : 0;
        const r = Math.random();
        if (t.state === 'shield' || t.state === 'shieldstun') { this.act(0, 1, { b: 'grab', x: face }); return; }
        if (koRange && r < 0.45) { this.smash(f, dir, 'fwd', L); return; }
        if (r < 0.2) { this.act(0, 1, { b: 'grab', x: face }); return; }
        if (r < 0.45) { this.act(0, 1, { b: 'attack', x: face }); this.act(4, 1, { b: 'attack' }); this.act(9, 1, { b: 'attack' }); return; }
        if (r < 0.6) { this.act(0, 1, { b: 'attack', y: -1, x: 0 }); return; }
        if (r < 0.8) { if (face) this.act(0, 1, { x: face }); this.act(face ? 2 : 0, 2, { b: 'attack', x: dir * 0.6 }); return; }
        this.smash(f, dir, KB.pick(['fwd', 'down']), L);
        return;
      }
      if (above && this.chance(aggr)) {
        if (dy < 2.4 && this.chance(0.5)) { this.act(0, 1, { b: koRange ? 'smash' : 'attack', y: 1 }); return; }
        this.act(0, 1, { b: 'jump', x: dir * 0.5 });
        this.act(6, 1, { b: 'attack', y: 1 });
        return;
      }
      if (mid && this.chance(aggr * 0.8)) {
        const r = Math.random();
        if (koRange && r < 0.4) { this.smash(f, dir, 'fwd', L); return; }
        if (r < 0.35) { this.act(0, 1, { b: 'jump', x: dir }); this.act(5, 8, { x: dir }); this.act(7, 1, { b: 'attack', x: dir }); return; }
        if (r < 0.55 && f.state === 'run') { this.act(0, 1, { b: 'attack', x: dir }); return; }
        if (r < 0.75) { this.act(0, 1, { x: dir }); this.act(2, 2, { b: 'attack', x: dir * 0.6 }); return; }
        this.plan = { type: 'approach', t: 12 };
        return;
      }
      // 飛び道具
      if (adx > info.projMin && adx < info.projMax && Math.abs(dy) < 1.8 && this.chance(info.projChance + L * 0.02)) {
        const face = Math.sign(dx) !== f.facing ? dir : 0;
        if (face) this.act(0, 1, { x: face });
        this.act(face ? 2 : 0, 1, { b: 'special', x: 0, y: 0 });
        return;
      }
      // 上の足場にいる相手
      if (dy > 2.4 && adx < 4 && this.chance(0.5)) {
        this.act(0, 1, { b: 'jump', x: dir });
        this.act(1, 16, { x: dir * 0.8 });
        return;
      }
      // 下にいる相手（足場から降りる）
      if (dy < -2 && f.ground && f.ground.plat && this.chance(0.4)) {
        this.act(0, 4, { y: -1 });
        return;
      }
      this.plan = { type: this.chance(0.8 + L * 0.02) ? 'approach' : 'wait', t: 15 };
    }

    smash(f, dir, d, L) {
      const x = d === 'fwd' ? dir : 0, y = d === 'down' ? -1 : d === 'up' ? 1 : 0;
      const hold = L >= 4 ? KB.randi(0, 20) : KB.randi(0, 8);
      this.act(0, 1 + hold, { b: 'smash', x, y });
      this.act(1, hold, { x: 0, y: 0 });
    }

    continuePlan(f, t, raw, main) {
      const p = this.plan;
      const dx = t.x - f.x;
      const edge = this.nearEdge(f, main, 1.0);
      switch (p.type) {
        case 'approach': {
          if (Math.abs(dx) > 1.2) raw.x = Math.sign(dx);
          if (edge && Math.sign(raw.x) === Math.sign(f.x) && f.ground) raw.x = 0;
          if (!f.ground) raw.x = Math.sign(dx) * 0.8;
          break;
        }
        case 'goto': {
          const d = p.x - f.x;
          if (Math.abs(d) > 0.4) raw.x = Math.sign(d) * (Math.abs(d) > 2 ? 1 : 0.6);
          break;
        }
        case 'drift': raw.x = Math.sign(dx) * 0.7; if (f.y > t.y + 2 && f.vy < 0 && Math.random() < 0.05) raw.y = -1; break;
        case 'wait': {
          if (Math.abs(f.x) > 5) raw.x = -Math.sign(f.x) * 0.6;
          break;
        }
      }
    }
  }
  KB.CPU = CPU;
})(window.KB);
