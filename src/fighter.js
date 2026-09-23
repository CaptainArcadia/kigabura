// ============================================================
// fighter.js — ファイター（状態遷移・物理・被弾）と飛び道具
// 座標：x=左右, y=上（足元基準）。1ユニット ≒ キャラの半身
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;
  const GROUND_STATES = new Set(['idle', 'walk', 'run', 'crouch', 'skid', 'land', 'jumpsquat', 'shield', 'shieldstun', 'shieldoff', 'roll', 'spotdodge', 'down', 'getup', 'tech', 'dizzy', 'hold', 'respawn']);
  const EDGE_STOP = new Set(['land', 'shield', 'shieldstun', 'shieldoff', 'crouch', 'roll', 'spotdodge', 'jumpsquat', 'down', 'getup', 'tech', 'hold', 'dizzy', 'skid', 'idle']);

  class Fighter {
    constructor(game, slot, cfg) {
      this.game = game;
      this.slot = slot;
      this.cfg = cfg;
      this.def = KB.CHARS[cfg.char];
      this.dims = this.def.dims;
      this.st = this.def.stats;
      this.hw = this.dims.hw;
      this.h = this.dims.h;
      this.input = cfg.input;
      this.isCPU = !!cfg.cpu;
      this.color = KB.PLAYER_COLORS_HEX[slot];
      this.label = this.isCPU ? 'CP' + (slot + 1) : 'P' + (slot + 1);
      this.rig = KB.buildRig(cfg.char, cfg.variant || 0);
      game.scene.add(this.rig.root);
      // シールド
      this.shieldMesh = new T.Mesh(
        new T.SphereGeometry(1, 28, 20),
        new T.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.38, depthWrite: false, blending: T.AdditiveBlending })
      );
      this.shieldMesh.visible = false;
      game.scene.add(this.shieldMesh);
      // 氷漬け
      this.iceMesh = new T.Mesh(
        new T.BoxGeometry(this.hw * 2.6, this.h * 1.15, 1.3),
        new T.MeshPhysicalMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.5, roughness: 0.05, emissive: 0x4ab8ff, emissiveIntensity: 0.3, depthWrite: false })
      );
      this.iceMesh.visible = false;
      game.scene.add(this.iceMesh);
      // リスポーン台
      this.halo = new T.Mesh(
        new T.CylinderGeometry(0.9, 0.6, 0.18, 32),
        new T.MeshStandardMaterial({ color: this.color, emissive: this.color, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 })
      );
      this.halo.visible = false;
      game.scene.add(this.halo);

      this.stocks = cfg.stocks || 3;
      this.score = 0;
      this.kos = 0; this.falls = 0; this.sds = 0; this.dmgDealt = 0; this.dmgTaken = 0;
      this.eliminated = false;
      this.hitSet = new Set();
      this.ctrl = new KB.Controller();
      this.reset(0, 0, 1);
    }

    reset(x, y, facing) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
      this.facing = facing;
      this.ground = null;
      this.state = 'air'; this.sf = 0;
      this.move = null; this.mf = 0; this.mvs = {};
      this.damage = 0;
      this.hitlag = 0; this.hitstun = 0; this.tumble = false; this.tumbleAng = 0;
      this.invuln = 0; this.intangible = false;
      this.shieldHP = 50;
      this.ledge = null; this.ledgeCool = 0; this.ledgeT = 0; this.ledgeInvUsed = false;
      this.drop = 0; this.fastfall = false; this.djumpT = 0;
      this.jumps = this.st.airJumps; this.usedSide = false; this.usedUp = false; this.airdodged = false;
      this.victim = null; this.holder = null; this.holdT = 0;
      this.frozenT = 0; this.flashT = 0;
      this.pendingJump = 0; this.pendingLaunch = null;
      this.lastHitBy = null; this.lastHitFrame = -9999;
      this.animPhase = 0; this.charge = 0; this.charging = false;
      this.counterActive = false;
      this.lastShieldPress = -999;
      this.yawOverride = undefined;
      this.visible = true;
      this.rig.root.visible = true;
      this.snapToGround();
    }

    get alive() { return this.state !== 'dead' && !this.eliminated; }
    fwd(dx) { return this.x + dx * this.facing; }
    sfx(n, p) { KB.Audio.play(n, p); }
    shake(a) { this.game.shake(a); }
    leaveGround() { if (this.ground) { this.ground = null; this.y += 0.01; } }
    countProj(type) { return this.game.projs.filter((p) => p.owner === this && p.type === type && p.alive).length; }
    spawnProj(o) { this.game.projs.push(new Projectile(this.game, this, o)); }

    snapToGround() {
      const s = this.game.stage;
      if (!s) return;
      for (const sf of this.game.surfaces()) {
        if (this.x >= sf.x1 && this.x <= sf.x2 && Math.abs(this.y - sf.y) < 0.05) { this.ground = sf; this.y = sf.y; this.state = 'idle'; return; }
      }
    }

    setState(s) {
      if (this.state === 'ledge' && s !== 'ledge' && this.ledge) { this.ledge.occ = null; }
      this.state = s; this.sf = 0;
      if (s !== 'attack') { this.move = null; this.charging = false; this.counterActive = false; }
    }

    stickDir(c) {
      const ax = Math.abs(c.x), ay = Math.abs(c.y);
      if (ay > 0.5 && ay >= ax) return c.y > 0 ? 'up' : 'down';
      if (ax > 0.4) return Math.sign(c.x) === this.facing ? 'fwd' : 'back';
      return 'none';
    }
    cdirRel(d) {
      if (d === 'up' || d === 'down') return d;
      return (d === 'right' ? 1 : -1) === this.facing ? 'fwd' : 'back';
    }

    // ---------------- ワザ開始 ----------------
    startMove(name, startFrame = 0) {
      let mv = this.def.moves[name];
      if (!mv) return false;
      if (!this.ground && mv.airVariant) mv = this.def.moves[mv.airVariant];
      if (mv.once === 'side' && !this.ground) {
        if (this.usedSide) return false;
        this.usedSide = true;
      }
      if (this.state === 'ledge' && this.ledge) this.ledge.occ = null;
      this.state = 'attack'; this.sf = 0;
      this.move = mv; this.mf = startFrame; this.hitSet.clear();
      this.charge = 0; this.charging = false; this.mvs = {}; this.jabQueued = false;
      this.fastfall = false;
      if (mv.start) mv.start(this);
      return true;
    }
    endMove() {
      const mv = this.move;
      if (mv && mv.rapid) {
        this.mvs.rapidN = (this.mvs.rapidN || 0) + 1;
        const cont = this.ctrl.held.attack || this.ctrl.since('attack') < 10;
        const n = this.mvs.rapidN;
        if (cont && n < mv.rapid.max) { this.startMove(mv.name); this.mvs.rapidN = n; return; }
        this.startMove(mv.rapid.next); return;
      }
      if (mv && mv.onEnd) mv.onEnd(this);
      this.move = null;
      if (this.ground) this.setState('idle');
      else this.setState(mv && mv.helpless ? 'helpless' : 'air');
    }
    chargeHeld() {
      const c = this.ctrl;
      if (this.chargeBtn === 'smash') return c.held.smash;
      if (this.chargeBtn === 'attack') return c.held.attack;
      return false;
    }

    doTilt(c) {
      const d = this.stickDir(c);
      if (d === 'up') return this.startMove('utilt');
      if (d === 'down') return this.startMove('dtilt');
      if (d === 'fwd' || d === 'back') { if (d === 'back') this.facing = -this.facing; return this.startMove('ftilt'); }
      return this.startMove('jab1');
    }
    doSmash(d, btn) {
      if (d === 'up') this.startMove('usmash');
      else if (d === 'down') this.startMove('dsmash');
      else { if (d === 'back') this.facing = -this.facing; this.startMove('fsmash'); }
      this.chargeBtn = btn;
      return true;
    }
    doSpecial(c) {
      const d = this.stickDir(c);
      if (d === 'up') {
        if (this.usedUp && !this.ground) return false;
        this.usedUp = true;
        return this.startMove('uspec');
      }
      if (d === 'down') return this.startMove('dspec');
      if (d === 'fwd' || d === 'back') { if (d === 'back') this.facing = -this.facing; return this.startMove('sspec'); }
      return this.startMove('nspec');
    }
    doAerial(d) {
      const map = { up: 'uair', down: 'dair', fwd: 'fair', back: 'bair', none: 'nair' };
      return this.startMove(map[d]);
    }
    doGrab() {
      const run = this.state === 'run';
      return this.startMove(run ? 'dashgrab' : 'grab');
    }

    // ---------------- 毎フレーム ----------------
    step() {
      const c = this.ctrl;
      if (this.state === 'dead') { this.deadStep(); return; }
      if (c.pressed.shield) this.lastShieldPress = this.game.frame;
      if (this.hitlag > 0) {
        this.hitlag--;
        if (this.hitlag === 0 && this.pendingLaunch) this.applyLaunch();
        return;
      }
      if (this.invuln > 0) this.invuln--;
      if (this.ledgeCool > 0) this.ledgeCool--;
      if (this.drop > 0) this.drop--;
      if (this.djumpT > 0) this.djumpT--;
      if (this.flashT > 0) this.flashT--;
      if (this.state !== 'shield' && this.state !== 'shieldstun') this.shieldHP = Math.min(50, this.shieldHP + 0.08);
      this.gravMul = 1; this.noDrift = false; this.intangible = this.invuln > 0;
      this.sf++;
      this.updateState(c);
      this.physics();
      if (this.state === 'walk' || this.state === 'run') this.animPhase += Math.abs(this.vx) * (this.state === 'run' ? 2.4 : 3.2) + 0.02;
    }

    updateState(c) {
      const s = this.state;
      switch (s) {
        case 'idle': case 'walk': case 'run': case 'crouch': this.groundNeutral(c); break;
        case 'skid':
          this.vx = KB.approach(this.vx, 0, this.st.traction * 2.5);
          if (this.groundAct(c, true)) break;
          if (this.sf >= 7) { this.facing = -this.facing; this.setState('run'); this.vx = this.facing * this.st.run * 0.6; }
          break;
        case 'jumpsquat': this.jumpSquat(c); break;
        case 'land':
          this.vx = KB.approach(this.vx, 0, this.st.traction * 1.5);
          if (this.sf >= this.landLag) { this.setState('idle'); this.groundNeutral(c); }
          break;
        case 'air': this.airNeutral(c); break;
        case 'helpless':
          this.drift(c, 0.6);
          if (this.vy <= 0 && c.tapY === 0 && c.y < -0.7) this.fastfall = true;
          break;
        case 'attack': this.runMove(c); break;
        case 'shield': this.shieldStep(c); break;
        case 'shieldstun':
          this.vx = KB.approach(this.vx, 0, this.st.traction);
          if (this.sf >= this.shieldStun) this.setState(c.held.shield ? 'shield' : 'shieldoff');
          break;
        case 'shieldoff':
          this.vx = KB.approach(this.vx, 0, this.st.traction);
          if (this.sf >= 7) this.setState('idle');
          break;
        case 'roll': {
          const f = this.sf;
          this.intangible = this.intangible || (f >= 4 && f <= 18);
          this.vx = f >= 4 && f <= 22 ? this.rollDir * 0.135 : KB.approach(this.vx, 0, 0.03);
          if (f >= 30) { this.facing = -this.rollDir; this.setState('idle'); }
          break;
        }
        case 'spotdodge':
          this.intangible = this.intangible || (this.sf >= 2 && this.sf <= 16);
          this.vx = 0;
          if (this.sf >= 24) this.setState('idle');
          break;
        case 'airdodge': this.airDodgeStep(c); break;
        case 'hitstun': this.hitstunStep(c); break;
        case 'frozen':
          this.frozenT--;
          if (c.pressed.attack || c.pressed.special || c.pressed.jump || c.pressed.shield || c.tapX === 0) this.frozenT -= 4;
          if (this.frozenT <= 0) this.unfreeze();
          break;
        case 'down':
          this.vx = KB.approach(this.vx, 0, 0.02);
          if (this.sf > 12 && (c.pressed.attack || c.pressed.smash)) { this.startMove('getupatk'); break; }
          if (this.sf > 12 && Math.abs(c.x) > 0.6) { this.rollDir = Math.sign(c.x); this.setState('roll'); this.sf = 3; break; }
          if (this.sf > 12 && (c.pressed.jump || c.pressed.shield || c.y > 0.6) || this.sf > 45) this.setState('getup');
          break;
        case 'getup':
          this.intangible = this.intangible || this.sf <= 18;
          if (this.sf >= 22) this.setState('idle');
          break;
        case 'tech':
          this.intangible = this.intangible || this.sf <= 16;
          this.vx = this.techDir && this.sf >= 2 && this.sf <= 20 ? this.techDir * 0.12 : 0;
          if (this.sf >= 24) this.setState('idle');
          break;
        case 'dizzy':
          if (c.pressed.attack || c.pressed.special || c.pressed.jump || c.tapX === 0) this.dizzyT -= 5;
          this.dizzyT--;
          this.vx = KB.approach(this.vx, 0, 0.02);
          if (this.dizzyT <= 0) this.setState('idle');
          break;
        case 'ledge': this.ledgeStep(c); break;
        case 'ledgeclimb': {
          this.intangible = true;
          const L = this.ledge;
          const k = KB.smooth(KB.win(this.sf, 0, 18));
          this.x = KB.lerp(this.climb.x0, this.climb.x1, k);
          this.y = KB.lerp(this.climb.y0, this.climb.y1, k);
          if (this.sf >= 22) {
            if (L) L.occ = null;
            this.x = this.climb.x1; this.y = this.climb.y1;
            this.ground = this.climb.surf;
            this.setState('idle');
          }
          break;
        }
        case 'hold': this.holdStep(c); break;
        case 'grabbed':
          if (c.pressed.attack || c.pressed.special || c.pressed.jump || c.pressed.shield || c.tapX === 0 || c.tapY === 0) {
            if (this.holder) this.holder.holdT -= 4;
          }
          break;
        case 'respawn':
          this.intangible = true;
          if (this.sf > 30 && (Math.abs(c.x) > 0.3 || c.y < -0.5 || c.pressed.jump || c.pressed.attack || c.pressed.special || c.pressed.shield) || this.sf > 240) {
            this.halo.visible = false;
            this.invuln = 120;
            this.ground = null;
            this.setState('air');
            this.airNeutral(c);
          }
          break;
        case 'victory': case 'clap': break;
      }
    }

    // ---------- 地上 ----------
    groundAct(c, fromSkid = false) {
      const tapJump = c.upTap && KB.settings.tapJump;
      if (c.pressed.jump || tapJump) { this.jsTap = tapJump && !c.pressed.jump; this.setState('jumpsquat'); return true; }
      if (c.pressed.grab || (c.held.shield && c.pressed.attack)) return this.doGrab();
      if (c.pressed.shield) { this.setState('shield'); this.sfx('shieldOn'); return true; }
      if (c.pressed.special) return this.doSpecial(c);
      if (c.cdir) return this.doSmash(this.cdirRel(c.cdir), 'none');
      if (c.pressed.smash) return this.doSmash(this.stickDir(c), 'smash');
      if (c.pressed.attack) {
        if (this.state === 'run' && this.sf > 4 && !fromSkid && Math.abs(c.x) > 0.5) return this.startMove('dash');
        const d = this.stickDir(c);
        if (c.analog && ((c.tapX <= 3 && (d === 'fwd' || d === 'back')) || (c.tapY <= 3 && (d === 'up' || d === 'down')))) return this.doSmash(d, 'attack');
        return this.doTilt(c);
      }
      if (c.held.shield && this.state !== 'shield') { this.setState('shield'); return true; }
      // すり抜け床から降りる
      if (this.ground && this.ground.plat && c.y < -0.7 && c.tapY === 2) {
        this.drop = 14; this.leaveGround(); this.y -= 0.05; this.setState('air'); return true;
      }
      return false;
    }
    groundNeutral(c) {
      if (this.groundAct(c)) return;
      const ax = c.x, st = this.st;
      if (c.y < -0.6 && Math.abs(ax) < 0.5) {
        if (this.state !== 'crouch') this.setState('crouch');
        this.vx = KB.approach(this.vx, 0, st.traction * 2);
        return;
      }
      if (this.state === 'crouch' && c.y >= -0.5) this.setState('idle');
      if (Math.abs(ax) > 0.2) {
        const dir = Math.sign(ax);
        if (this.state === 'run' && dir !== this.facing) { this.setState('skid'); this.game.fx.dust(this.x, this.y, this.facing, 3); return; }
        const running = Math.abs(ax) > 0.75;
        if (running && this.state !== 'run') {
          this.setState('run');
          this.facing = dir;
          this.vx = dir * Math.max(Math.abs(this.vx), st.run * 0.75);
          this.game.fx.dust(this.x, this.y, -dir, 3);
          this.sfx('dash');
        } else if (!running && this.state !== 'walk') { this.setState('walk'); }
        this.facing = dir;
        const tgt = running ? st.run : st.walk * (Math.abs(ax) / 0.75);
        this.vx = KB.approach(this.vx, dir * tgt, running ? 0.035 : 0.02);
      } else {
        this.vx = KB.approach(this.vx, 0, st.traction * 1.5);
        if (this.state !== 'idle' && this.state !== 'crouch') this.setState('idle');
      }
    }
    jumpSquat(c) {
      // 上入力ジャンプ中に攻撃/必殺 → 上方向ワザにする
      if (this.jsTap) {
        if (c.pressed.special) { this.usedUp = true; this.startMove('uspec'); return; }
        if (c.pressed.smash) { this.doSmash('up', 'smash'); return; }
        if (c.pressed.attack) { this.startMove('utilt'); return; }
      }
      if (c.pressed.grab || (c.held.shield && c.pressed.attack)) { this.doGrab(); return; }
      if (this.sf >= this.st.jumpSquat) {
        const full = this.jsTap ? c.y > 0.3 : c.held.jump;
        this.leaveGround();
        this.vy = full ? this.st.jumpV : this.st.shopV;
        this.vx = KB.clamp(this.vx + c.x * 0.02, -this.st.airSpeed * 1.1, this.st.airSpeed * 1.1);
        this.setState('air');
        this.sfx('jump');
        this.game.fx.dust(this.x, this.y, 0, 4);
        // ジャンプと同時押しの攻撃は空中攻撃に
        if (c.since('attack') <= this.st.jumpSquat + 1) this.doAerial(this.stickDir(c));
        else if (c.since('special') <= this.st.jumpSquat + 1) this.doSpecial(c);
      }
    }

    // ---------- 空中 ----------
    airJump(c) {
      if (this.jumps <= 0) return false;
      this.jumps--;
      this.vy = this.st.djumpV;
      this.vx = c.x * this.st.airSpeed; // 向きは変えない（スマブラ準拠）
      this.djumpT = 22; this.fastfall = false; this.pendingJump = 0;
      this.sfx('djump');
      this.game.fx.ringFlat(this.x, this.y, 0xffffff, 0.3, 1.6, 14);
      if (this.state !== 'air') this.setState('air');
      return true;
    }
    airAct(c) {
      if (c.pressed.jump) { if (this.airJump(c)) return true; }
      else if (c.upTap && KB.settings.tapJump && this.jumps > 0) this.pendingJump = 3;
      if (this.pendingJump > 0) {
        if (c.pressed.special || c.pressed.attack || c.pressed.smash) this.pendingJump = 0;
        else if (--this.pendingJump === 0) { this.airJump(c); return true; }
      }
      if (c.pressed.shield && !this.airdodged) { this.startAirDodge(c); return true; }
      if (c.pressed.special) { if (this.doSpecial(c)) return true; }
      if (c.cdir) return this.doAerial(this.cdirRel(c.cdir));
      if (c.pressed.attack || c.pressed.smash || c.pressed.grab) return this.doAerial(this.stickDir(c));
      return false;
    }
    drift(c, mul = 1) {
      if (this.noDrift) return;
      const st = this.st;
      if (Math.abs(c.x) > 0.1) {
        const tgt = c.x * st.airSpeed * mul;
        if ((tgt > 0 && this.vx < tgt) || (tgt < 0 && this.vx > tgt)) this.vx = KB.approach(this.vx, tgt, st.airAccel);
        else this.vx = KB.approach(this.vx, tgt, st.airFric);
      } else this.vx = KB.approach(this.vx, 0, st.airFric);
    }
    airNeutral(c) {
      if (this.airAct(c)) return;
      this.drift(c);
      if (this.vy <= 0 && c.tapY === 0 && c.y < -0.7) this.fastfall = true;
    }
    startAirDodge(c) {
      this.setState('airdodge');
      this.airdodged = true;
      const m = Math.hypot(c.x, c.y);
      if (m > 0.3) { this.adx = c.x / m; this.ady = c.y / m; this.vx = this.adx * 0.3; this.vy = this.ady * 0.3; this.dirDodge = true; }
      else { this.dirDodge = false; this.vy *= 0.3; }
      this.fastfall = false;
      this.sfx('swing', 0.2);
    }
    airDodgeStep(c) {
      const f = this.sf;
      this.intangible = this.intangible || (f >= 3 && f <= 26);
      if (this.dirDodge) {
        if (f <= 20) { this.gravMul = 0; this.vx *= 0.88; this.vy *= 0.88; this.noDrift = true; }
      } else { this.gravMul = f < 10 ? 0.2 : 1; this.drift(c, 0.4); }
      if (f >= 36) this.setState('air');
    }

    // ---------- ワザ進行 ----------
    runMove(c) {
      const mv = this.move;
      if (mv.charge && this.mf === mv.charge && this.charge < 60 && this.chargeHeld()) {
        this.charge++; this.charging = true;
        this.game.fx.chargeSpark(this);
        if (this.charge % 6 === 0) this.sfx('charge', this.charge / 60);
      } else { this.charging = false; this.mf++; }
      const fr = this.mf;
      if (mv.intangible && fr >= mv.intangible[0] && fr <= mv.intangible[1]) this.intangible = true;
      this.counterActive = !!(mv.counter && fr >= mv.counter[0] && fr <= mv.counter[1]);
      if (mv.rehit && mv.hits.length) {
        const s0 = mv.hits[0].s;
        if (fr > s0 && (fr - s0) % mv.rehit === 0 && fr <= (mv.rehitEnd || mv.dur)) this.hitSet.clear();
      }
      if (mv.hits.length && fr === mv.hits[0].s && !this.charging && !mv.hits[0].grab) this.sfx('swing', Math.min(1, mv.hits[0].d / 18));
      if (mv.tick) mv.tick(this, fr);
      if (this.state !== 'attack' || this.move !== mv) return;
      if (mv.throwAt && fr === mv.throwAt) this.releaseThrow();
      // 弱攻撃の連携
      if (mv.jabNext) {
        if (c.pressed.attack && fr >= 2) this.jabQueued = true;
        if (this.jabQueued && fr >= mv.jabWin[0] && fr <= mv.jabWin[1] && this.ground) { this.startMove(mv.jabNext); return; }
      }
      // 空中ワザ中の急降下
      if (!this.ground && this.vy <= 0 && c.tapY === 0 && c.y < -0.7 && mv.air) this.fastfall = true;
      if (!this.ground && mv.air !== false) this.drift(c, mv.air ? 1 : 0.5);
      if (this.ground) {
        if (mv.slide) this.vx = KB.approach(this.vx, 0, this.st.traction * 0.8);
        else if (!mv.tick) this.vx = KB.approach(this.vx, 0, this.st.traction * 1.5);
        else this.vx = KB.approach(this.vx, 0, this.st.traction * 0.5);
      }
      if (fr >= mv.dur) this.endMove();
    }

    // ---------- シールド ----------
    shieldStep(c) {
      this.shieldHP -= 0.14;
      this.vx = KB.approach(this.vx, 0, this.st.traction);
      if (this.shieldHP <= 0) { this.shieldBreak(); return; }
      const tapJump = c.upTap && KB.settings.tapJump;
      if (c.pressed.jump || tapJump) { this.jsTap = tapJump; this.setState('jumpsquat'); return; }
      if (c.pressed.attack || c.pressed.grab) { this.doGrab(); return; }
      if (c.pressed.special && c.y > 0.5) { this.usedUp = true; this.startMove('uspec'); return; }
      if (c.tapX === 0 && Math.abs(c.x) > 0.6 && this.sf > 1) { this.rollDir = Math.sign(c.x); this.setState('roll'); this.sfx('dash'); return; }
      if (c.tapY === 0 && c.y < -0.6 && this.sf > 1) { this.setState('spotdodge'); this.sfx('dash'); return; }
      if (!c.held.shield) this.setState('shieldoff');
    }
    shieldBreak() {
      this.sfx('shieldBreak');
      this.game.fx.shards(this.x, this.y + this.dims.cy, 20);
      this.shieldHP = 30;
      this.leaveGround();
      this.vy = 0.28; this.vx = 0;
      this.dizzyT = 200;
      this.setState('air');
      this.pendingDizzy = true;
    }

    // ---------- つかみ ----------
    onGrab(victim) {
      if (victim.holder || victim.state === 'grabbed' || victim.state === 'ledge') return false;
      this.setState('hold');
      this.victim = victim;
      this.holdT = Math.min(260, 80 + victim.damage * 0.7);
      this.pummelCD = 0;
      victim.releaseHold();
      victim.setState('grabbed');
      victim.holder = this;
      victim.vx = victim.vy = victim.kbx = victim.kby = 0;
      victim.facing = -this.facing;
      victim.pendingLaunch = null; victim.hitlag = 0;
      this.hitlag = 3; victim.hitlag = 3;
      this.sfx('grab');
      return true;
    }
    holdStep(c) {
      const v = this.victim;
      if (!v || v.state !== 'grabbed') { this.victim = null; this.setState('idle'); return; }
      this.holdT--;
      if (this.pummelCD > 0) this.pummelCD--;
      this.placeVictim();
      if (c.pressed.attack && this.pummelCD === 0) {
        this.pummelCD = 16;
        v.damage = Math.min(999, v.damage + 1.5); v.dmgTaken += 1.5; this.dmgDealt += 1.5;
        v.flashT = 4; this.hitlag = 4; v.hitlag = 4;
        this.game.fx.hit(v.x, v.y + v.dims.cy, 0.1);
        this.sfx('hit', 0.15);
        this.game.hud.bump(v);
        return;
      }
      const d = this.stickDir(c);
      const cd = c.cdir ? this.cdirRel(c.cdir) : null;
      const dir = cd || (d !== 'none' && (Math.abs(c.x) > 0.6 || Math.abs(c.y) > 0.6) ? d : null);
      if (dir) {
        const name = { fwd: 'fthrow', back: 'bthrow', up: 'uthrow', down: 'dthrow' }[dir];
        this.state = 'attack'; this.sf = 0;
        this.move = this.def.moves[name]; this.mf = 0; this.mvs = {}; this.hitSet.clear();
        this.sfx('throw');
        return;
      }
      if (this.holdT <= 0) this.grabRelease();
    }
    placeVictim() {
      const v = this.victim;
      if (!v) return;
      v.x = this.x + this.facing * (this.hw + v.hw) * 0.85;
      v.y = this.y + (this.ground ? 0.15 : 0);
      v.ground = null;
    }
    grabRelease() {
      const v = this.victim;
      this.victim = null;
      if (v && v.state === 'grabbed') {
        v.holder = null;
        v.setState('air');
        v.vx = this.facing * 0.12; v.vy = 0.1;
      }
      this.vx = -this.facing * 0.1;
      this.setState('idle');
    }
    releaseHold() {
      // 自分がつかんでいたら離す
      if (this.victim) {
        const v = this.victim;
        this.victim = null;
        if (v.state === 'grabbed') { v.holder = null; v.setState('air'); v.vy = 0.08; }
      }
      // 自分がつかまれていたら解放
      if (this.holder) {
        const h = this.holder;
        this.holder = null;
        if (h.victim === this) { h.victim = null; if (h.state === 'hold') h.setState('idle'); }
      }
    }
    releaseThrow() {
      const v = this.victim;
      this.victim = null;
      if (!v || v.state !== 'grabbed') return;
      v.holder = null;
      const h = this.move.throwHit;
      if (this.move.name === 'bthrow') v.x = this.x - this.facing * (this.hw + v.hw) * 0.8;
      if (this.move.name === 'uthrow') v.y = this.y + 0.6;
      v.receiveHit(h, this, this.facing, v.x, v.y + v.dims.cy, false, true);
      this.game.fx.hit(v.x, v.y + v.dims.cy, 0.5, h.fx || 'hit');
      this.sfx('hit', 0.6);
    }

    // ---------- 崖 ----------
    tryLedge() {
      if (this.ledgeCool > 0 || this.hitstunActive()) return false;
      const okState = this.state === 'air' || this.state === 'helpless' || this.state === 'airdodge' || (this.state === 'attack' && this.move && !this.move.air);
      if (!okState) return false;
      if (this.vy > 0.02 && this.state !== 'attack' && this.state !== 'helpless') return false;
      for (const L of this.game.stage.ledges) {
        if (L.occ && L.occ !== this) continue;
        const out = (this.x - L.x) * L.side;
        const handY = this.y + this.h * 0.85;
        if (out > -0.35 && out < this.hw + 0.8 && handY > L.y - 0.7 && handY < L.y + 0.9) {
          this.grabLedge(L);
          return true;
        }
      }
      return false;
    }
    grabLedge(L) {
      if (this.move && this.move.name === 'dspec' && this.def.id === 'mg') { /* ヒップドロップ中も掴める */ }
      this.setState('ledge');
      this.ledge = L; L.occ = this;
      this.facing = -L.side;
      this.x = L.x + L.side * this.hw; this.y = L.y - this.h * 0.85;
      this.vx = this.vy = this.kbx = this.kby = 0;
      this.ground = null;
      this.jumps = this.st.airJumps; this.usedSide = false; this.usedUp = false; this.airdodged = false; this.fastfall = false;
      this.ledgeT = 0;
      if (!this.ledgeInvUsed) { this.invuln = Math.max(this.invuln, 36); this.ledgeInvUsed = true; }
      this.sfx('ledge');
    }
    ledgeStep(c) {
      const L = this.ledge;
      this.ledgeT++;
      this.gravMul = 0; this.vx = this.vy = 0;
      if (this.sf < 8) return;
      const toward = -c.x * L.side;
      const surf = L.surf;
      const topX = L.x - L.side * (this.hw + 0.25);
      if (c.pressed.jump || (c.upTap && KB.settings.tapJump)) {
        L.occ = null; this.ledgeCool = 20;
        this.setState('air');
        this.vy = this.st.jumpV * 1.05; this.vx = -L.side * 0.06;
        this.y = L.y - this.h * 0.4;
        this.sfx('jump');
        return;
      }
      if (c.pressed.attack || c.pressed.smash) {
        L.occ = null;
        this.x = topX; this.y = L.y; this.ground = surf;
        this.startMove('ledgeatk');
        return;
      }
      if (c.pressed.shield) {
        L.occ = null;
        this.x = L.x - L.side * this.hw * 0.5; this.y = L.y; this.ground = surf;
        this.rollDir = -L.side; this.setState('roll'); this.sf = 2;
        this.intangible = true;
        return;
      }
      if (toward > 0.5 || c.y > 0.5) {
        this.climb = { x0: this.x, y0: this.y, x1: topX, y1: L.y, surf };
        this.setState('ledgeclimb');
        this.ledge = L;
        return;
      }
      if (toward < -0.5 || c.y < -0.5 || this.ledgeT > 300) {
        L.occ = null; this.ledgeCool = 30;
        this.x += L.side * 0.15;
        this.setState('air');
        if (c.y < -0.5) this.fastfall = true;
      }
    }

    // ---------- 被弾 ----------
    hitstunActive() { return this.state === 'hitstun' || this.state === 'frozen' || this.state === 'grabbed'; }
    receiveHit(h, att, dirSign, hx, hy, isProj, isThrow = false, mul = 1) {
      const game = this.game;
      let dmg = h.d * mul;
      if (h.dmgOverride && att && att.mvs.dmgOverride) dmg = att.mvs.dmgOverride;
      // シールド
      if (!isThrow && (this.state === 'shield' || this.state === 'shieldstun')) {
        this.shieldHP -= dmg * 1.15;
        this.state = 'shieldstun'; this.sf = 0;
        this.shieldStun = Math.floor(dmg * 0.75 + 3);
        this.vx = dirSign * (0.03 + dmg * 0.006);
        const lag = Math.floor(dmg * 0.3 + 3);
        this.hitlag = lag;
        if (att && !isProj) { att.hitlag = lag; att.vx = -dirSign * 0.02 * (att.ground ? 1 : 0); }
        game.fx.hit(hx, hy, 0.15, 'hit');
        this.sfx('shieldHit');
        if (this.shieldHP <= 0) this.shieldBreak();
        return 'shield';
      }
      // カウンター
      if (!isThrow && this.counterActive && att) {
        this.triggerCounter(att, dmg);
        return 'counter';
      }
      const frozen = this.state === 'frozen';
      if (frozen) { dmg *= 1.15; this.unfreeze(true); }
      this.releaseHold();
      this.damage = Math.min(999, this.damage + dmg);
      this.dmgTaken += dmg;
      if (att) { att.dmgDealt += dmg; this.lastHitBy = att; this.lastHitFrame = game.frame; }
      let kb = KB.calcKB(this.damage, dmg, this.st.weight, h.b, h.k);
      let ang = h.a;
      if (ang === 361) ang = kb < 60 && this.ground ? 0 : 40;
      let a = KB.deg(ang);
      let absAng = dirSign > 0 ? a : Math.PI - a;
      // 地上でのメテオはバウンド
      if (this.ground && Math.sin(absAng) < -0.1) { absAng = -absAng; kb *= 0.8; }
      if (h.freeze && !frozen) {
        this.setState('frozen');
        this.frozenT = Math.min(120, 34 + this.damage * 0.38);
        kb = Math.min(kb, 45);
        this.sfx('freeze');
      }
      const speed = kb * KB.KB_SPEED;
      const hs = Math.floor(kb * 0.4);
      const lag = Math.min(20, Math.floor(dmg * 0.42 + 4) + (h.freeze ? 4 : 0));
      this.hitlag = lag;
      if (att && !isProj && !isThrow) att.hitlag = Math.max(att.hitlag, lag);
      this.pendingLaunch = { absAng, speed };
      this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
      this.fastfall = false;
      if (!h.freeze || frozen) {
        this.setState('hitstun');
        this.hitstun = hs;
        this.tumble = kb > 80;
        this.tumbleAng = 0;
      }
      if (this.ledge && this.state !== 'ledge') { this.ledge.occ = null; this.ledge = null; }
      this.facing = dirSign > 0 ? -1 : 1;
      this.flashT = 6;
      this.airdodged = false;
      // 演出
      const power = KB.clamp((kb - 30) / 170, 0, 1);
      game.onHit(this, att, kb, power, h.fx || 'hit', hx, hy);
      return 'hit';
    }
    applyLaunch() {
      const L = this.pendingLaunch;
      this.pendingLaunch = null;
      let a = L.absAng;
      const c = this.ctrl;
      // ずらし（DI）
      const m = Math.min(1, Math.hypot(c.x, c.y));
      if (m > 0.2 && L.speed > 0.12) {
        const lx = Math.cos(a), ly = Math.sin(a);
        const perp = (c.x * -ly + c.y * lx) / Math.max(m, 1);
        a += perp * 0.3;
      }
      this.kbx = Math.cos(a) * L.speed;
      this.kby = Math.sin(a) * L.speed;
      if (this.ground && this.kby > 0.035) this.leaveGround();
      if (this.ground) this.kby = 0;
    }
    triggerCounter(att, dmg) {
      this.facing = Math.sign(att.x - this.x) || this.facing;
      this.startMove('counterHit');
      this.mvs.dmgOverride = Math.max(10, dmg * 1.3);
      this.invuln = Math.max(this.invuln, 14);
      att.hitlag = 16;
      this.hitlag = 6;
      this.game.fx.sprite({ x: this.x, y: this.y + this.dims.cy, tex: 'star', color: 0xffe070, size: 2, sizeEnd: 6, life: 20 });
      this.game.fx.sprite({ x: this.x, y: this.y + this.dims.cy, tex: 'glow', color: 0xffffff, size: 6, sizeEnd: 1, life: 16 });
      this.game.flash(0.4);
      this.sfx('counter');
    }
    hitstunStep(c) {
      this.hitstun--;
      if (this.tumble) this.tumbleAng += 0.12 + Math.hypot(this.kbx, this.kby) * 0.6;
      const sp = Math.hypot(this.kbx, this.kby);
      if (sp > 0.14 && this.game.frame % 2 === 0) this.game.fx.launchSmoke(this.x, this.y + this.dims.cy, this.color);
      if (this.hitstun <= 0) {
        this.tumble = false;
        if (this.pendingDizzy && this.ground) { this.pendingDizzy = false; this.setState('dizzy'); }
        else this.setState(this.ground ? 'idle' : 'air');
      }
    }
    freezeVisual(on) { this.iceMesh.visible = on; }
    unfreeze(silent) {
      this.freezeVisual(false);
      this.frozenT = 0;
      if (!silent) { this.sfx('shatter'); this.game.fx.shards(this.x, this.y + this.dims.cy, 14); }
      if (this.state === 'frozen') this.setState(this.ground ? 'idle' : 'air');
    }

    // ---------- 着地 ----------
    land(surf) {
      const wasAir = !this.ground;
      this.ground = surf;
      this.y = surf.y;
      const impact = -this.vy - this.kby;
      this.vy = 0;
      this.jumps = this.st.airJumps; this.usedSide = false; this.usedUp = false; this.airdodged = false; this.fastfall = false;
      this.ledgeInvUsed = false;
      if (!wasAir) return;
      const s = this.state;
      if (s === 'hitstun') {
        const sp = Math.hypot(this.kbx, this.kby);
        const teched = this.game.frame - this.lastShieldPress <= 20;
        if (teched && this.tumble) {
          this.kbx = this.kby = 0;
          this.techDir = Math.abs(this.ctrl.x) > 0.5 ? Math.sign(this.ctrl.x) : 0;
          this.setState('tech');
          this.sfx('tech');
          this.game.fx.sprite({ x: this.x, y: this.y + 0.5, tex: 'star', color: 0xffffff, size: 1.5, sizeEnd: 0.1, life: 14 });
          return;
        }
        if (this.tumble && this.kby < -0.12) {
          // バウンド
          this.kby = -this.kby * 0.72;
          this.ground = null; this.y += 0.02;
          this.game.fx.dust(this.x, this.y, 0, 6);
          this.sfx('land', 1.5);
          return;
        }
        this.kby = 0;
        if (this.tumble) {
          this.kbx *= 0.5;
          this.setState('down');
          this.game.fx.dust(this.x, this.y, 0, 6);
          this.sfx('land', 1.4);
        }
        return;
      }
      this.kby = 0;
      if (s === 'frozen' || s === 'grabbed' || s === 'ledgeclimb') return;
      if (s === 'attack' && this.move) {
        const mv = this.move;
        if (mv.onLand && mv.onLand(this)) return;
        if (mv.air || mv.landLag) {
          this.landLag = mv.landLag || 4;
          this.setState('land');
          this.game.fx.dust(this.x, this.y, 0, 3);
          this.sfx('land', 1);
          return;
        }
        return; // 地上でも続くワザ
      }
      if (s === 'helpless') { this.landLag = 14; this.setState('land'); this.sfx('land', 1.2); this.game.fx.dust(this.x, this.y, 0, 5); return; }
      if (s === 'airdodge') { this.landLag = this.dirDodge ? 10 : 4; this.setState('land'); return; }
      if (this.pendingDizzy) { this.pendingDizzy = false; this.setState('dizzy'); return; }
      this.landLag = 3;
      this.setState('land');
      this.sfx('land', Math.min(1.2, 0.4 + impact * 4));
      if (impact > 0.1) this.game.fx.dust(this.x, this.y, 0, 3);
    }

    // ---------- 物理 ----------
    physics() {
      const st = this.st, game = this.game;
      if (this.state === 'grabbed' || this.state === 'ledge' || this.state === 'ledgeclimb' || this.state === 'respawn') { return; }
      if (this.victim && (this.state === 'hold' || this.state === 'attack')) this.placeVictim();
      // ふっとばしの減衰
      const sp = Math.hypot(this.kbx, this.kby);
      if (sp > 0) {
        const dec = KB.KB_DECAY + (this.ground ? st.traction : 0);
        const ns = Math.max(0, sp - dec);
        this.kbx *= ns / sp; this.kby *= ns / sp;
      }
      if (this.ground) {
        const g = this.ground;
        if (g.dx) this.x += g.dx;
        this.x += this.vx + this.kbx;
        this.y = g.y;
        // 端の処理
        if (this.x < g.x1 || this.x > g.x2) {
          const stop = EDGE_STOP.has(this.state) || (this.state === 'attack' && this.move && !this.move.offEdge) || this.state === 'walk';
          if (stop && Math.abs(this.kbx) < 0.05) {
            this.x = KB.clamp(this.x, g.x1, g.x2);
            if (this.state !== 'attack') this.vx = 0;
          } else {
            this.ground = null;
            if (GROUND_STATES.has(this.state) && this.state !== 'hitstun') this.setState('air');
          }
        }
        if (this.ground && this.ground.dead) { this.ground = null; if (GROUND_STATES.has(this.state)) this.setState('air'); }
      } else {
        const prevY = this.y, prevX = this.x;
        let grav = st.gravity * this.gravMul;
        this.vy -= grav;
        const maxF = this.fastfall ? st.fastFall : st.maxFall;
        if (this.fastfall && this.vy > -st.fastFall && this.gravMul > 0) this.vy = -st.fastFall;
        if (this.vy < -maxF) this.vy = -maxF;
        this.x += this.vx + this.kbx;
        this.y += this.vy + this.kby;
        // 着地判定
        const vyt = this.vy + this.kby;
        if (vyt <= 0) {
          let best = null;
          for (const s of game.surfaces()) {
            if (s.plat && (this.drop > 0 || this.state === 'hitstun' && this.ctrl.y < -0.7)) continue;
            if (this.x < s.x1 - 0.02 || this.x > s.x2 + 0.02) continue;
            const sy = s.y, py = prevY - (s.dy || 0);
            if (py >= sy - 0.001 && this.y <= sy) { if (!best || sy > best.y) best = s; }
          }
          if (best) {
            this.x = KB.clamp(this.x, best.x1, best.x2);
            this.land(best);
          }
        }
        // 固い地形との衝突（壁・天井）
        if (!this.ground) {
          for (const r of game.stage.solids) {
            const l = this.x - this.hw, rr = this.x + this.hw, b = this.y, t = this.y + this.h * 0.9;
            if (rr <= r.x1 || l >= r.x2 || t <= r.y1 || b >= r.y2) continue;
            const pl = prevX - this.hw, pr = prevX + this.hw, pb = prevY, pt = prevY + this.h * 0.9;
            const hitstun = this.state === 'hitstun';
            if (pt <= r.y1 + 0.001) {
              this.y = r.y1 - this.h * 0.9 - 0.001;
              if (this.vy > 0) this.vy = 0;
              if (this.kby > 0) this.kby = hitstun ? -this.kby * 0.6 : 0;
            } else if (pr <= r.x1 + 0.001) {
              this.x = r.x1 - this.hw - 0.001;
              if (this.vx > 0) this.vx = 0;
              if (this.kbx > 0) this.kbx = hitstun ? -this.kbx * 0.6 : 0;
            } else if (pl >= r.x2 - 0.001) {
              this.x = r.x2 + this.hw + 0.001;
              if (this.vx < 0) this.vx = 0;
              if (this.kbx < 0) this.kbx = hitstun ? -this.kbx * 0.6 : 0;
            } else if (pb >= r.y2 - 0.05) {
              this.y = r.y2;
            } else {
              // 押し出し（最短方向）
              const dl = rr - r.x1, dr = r.x2 - l, dd = t - r.y1, du = r.y2 - b;
              const m = Math.min(dl, dr, dd, du);
              if (m === du) this.y = r.y2; else if (m === dl) this.x -= dl; else if (m === dr) this.x += dr; else this.y -= dd;
            }
          }
        }
        if (!this.ground) this.tryLedge();
      }
    }

    // ---------- 撃墜・復帰 ----------
    die() {
      this.releaseHold();
      if (this.ledge) { this.ledge.occ = null; this.ledge = null; }
      this.setState('dead');
      this.deadT = 0;
      this.rig.root.visible = false;
      this.shieldMesh.visible = false; this.iceMesh.visible = false;
      this.pendingLaunch = null; this.hitlag = 0;
    }
    deadStep() {
      this.deadT++;
      if (this.deadT === 70) {
        if (this.game.canRespawn(this)) this.respawn();
        else { this.eliminated = true; }
      }
    }
    respawn() {
      const sp = this.game.stage.respawn;
      const off = (this.slot - 1.5) * 1.6;
      this.reset(sp.x + off, sp.y, sp.x + off > 0 ? -1 : 1);
      this.state = 'respawn'; this.sf = 0;
      this.halo.visible = true;
      this.halo.position.set(this.x, this.y - 0.1, 0);
      this.game.fx.respawnHalo(this.x, this.y + 1, this.color);
      this.sfx('respawn');
    }

    // ---------- 見た目の更新 ----------
    render() {
      const r = this.rig;
      if (this.state === 'dead') { r.root.visible = false; return; }
      r.root.visible = true;
      let ox = 0, oy = 0;
      if (this.hitlag > 0 && this.state === 'hitstun') { ox = (Math.random() - 0.5) * 0.14; oy = (Math.random() - 0.5) * 0.08; }
      r.root.position.set(this.x + ox, this.y + oy, 0);
      KB.Anim.update(this);
      // 発光
      if (this.flashT > 0) r.setFlash(this.flashT / 6, 0xffffff);
      else if (this.invuln > 0 && this.state !== 'ledge') r.setFlash(0.35 + 0.35 * Math.sin(this.game.frame * 0.5), 0xffffff);
      else if (this.intangible && (this.state === 'roll' || this.state === 'spotdodge' || this.state === 'airdodge' || this.state === 'getup' || this.state === 'tech')) r.setFlash(0.25, 0xbfd8ff);
      else if (this.charging) r.setFlash(0.2 + 0.2 * Math.sin(this.game.frame * 0.9), 0xfff0a0);
      else if (this.state === 'helpless') r.setFlash(0.12, 0x202040);
      else r.setFlash(0);
      // シールド
      const sh = this.state === 'shield' || this.state === 'shieldstun';
      this.shieldMesh.visible = sh;
      if (sh) {
        const s = (0.35 + 0.75 * (this.shieldHP / 50)) * Math.max(this.hw * 1.9, this.h * 0.62);
        this.shieldMesh.scale.set(s, s, s * 0.8);
        this.shieldMesh.position.set(this.x, this.y + this.h * 0.5, 0);
        this.shieldMesh.material.opacity = 0.25 + 0.2 * (this.shieldHP / 50);
      }
      this.iceMesh.visible = this.state === 'frozen';
      if (this.iceMesh.visible) this.iceMesh.position.set(this.x, this.y + this.h * 0.5, 0);
      if (this.halo.visible) {
        this.halo.position.set(this.x, this.y - 0.1, 0);
        this.halo.rotation.y += 0.05;
      }
    }

    dispose() {
      const s = this.game.scene;
      s.remove(this.rig.root, this.shieldMesh, this.iceMesh, this.halo);
      this.rig.dispose();
      [this.shieldMesh, this.iceMesh, this.halo].forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
    }
  }
  KB.Fighter = Fighter;

  // ------------------------------------------------------------
  // 飛び道具
  // ------------------------------------------------------------
  class Projectile {
    constructor(game, owner, o) {
      this.game = game; this.owner = owner; this.o = o;
      this.type = o.type;
      const f = owner.facing;
      this.x = o.absDir ? owner.x + o.x : owner.x + o.x * f;
      this.y = owner.y + o.y;
      this.vx = o.absDir ? o.vx : o.vx * f;
      this.vy = o.vy || 0;
      this.grav = o.grav || 0;
      this.r = o.r; this.life = o.life;
      this.hit = Object.assign({ s: 0, e: 0, x: 0, y: 0, r: o.r }, o.hit);
      this.alive = true;
      this.bounces = o.bounces || 0;
      this.hitSet = new Set();
      this.mesh = KB.projMesh(o.mesh, owner);
      this.mesh.position.set(this.x, this.y, 0);
      if (o.ground) {
        const s = this.findGround();
        if (!s) this.alive = false; else { this.gs = s; this.y = s.y + 0.3; }
      }
      game.scene.add(this.mesh);
    }
    findGround() {
      for (const s of this.game.surfaces()) if (this.x >= s.x1 && this.x <= s.x2 && Math.abs(s.y - (this.owner.y)) < 0.2) return s;
      return null;
    }
    update() {
      if (!this.alive) return;
      this.life--;
      if (this.life <= 0) { this.kill(); return; }
      const o = this.o;
      if (o.ground) {
        this.x += this.vx;
        if (!this.gs || this.x < this.gs.x1 || this.x > this.gs.x2) { this.kill(); return; }
        this.y = this.gs.y + 0.3;
        if (this.game.frame % 2 === 0) this.game.fx.dust(this.x, this.gs.y, -Math.sign(this.vx), 1);
      } else {
        const py = this.y;
        this.vy -= this.grav;
        this.x += this.vx; this.y += this.vy;
        // 地形
        for (const s of this.game.surfaces()) {
          if (this.x < s.x1 || this.x > s.x2) continue;
          if (this.vy <= 0 && py >= s.y && this.y - this.r * 0.5 <= s.y) { this.onGround(s); break; }
        }
        if (this.alive) {
          for (const r of this.game.stage.solids) {
            if (this.x > r.x1 && this.x < r.x2 && this.y > r.y1 && this.y < r.y2 - 0.05) { this.onGround(null); break; }
          }
        }
      }
      const b = this.game.stage.blast;
      if (this.x < b.l || this.x > b.r || this.y < b.b || this.y > b.t) this.kill();
      // 見た目
      if (this.mesh) {
        this.mesh.position.set(this.x, this.y, 0);
        if (o.spin) this.mesh.rotation.z += o.spin * -Math.sign(this.vx || 1);
        else if (o.mesh === 'icicle') this.mesh.rotation.z = Math.atan2(this.vy, this.vx) + Math.PI;
        if (o.mesh === 'icicle' && this.game.frame % 2 === 0) this.game.fx.sprite({ x: this.x, y: this.y, tex: 'glow', color: 0x9fe6ff, size: 0.5, sizeEnd: 0.05, life: 10 });
        if (o.mesh === 'cross' && this.game.frame % 2 === 0) this.game.fx.sprite({ x: this.x, y: this.y, tex: 'star', color: 0xffe070, size: 0.5, sizeEnd: 0.05, life: 14 });
        if (o.mesh === 'takoyaki' && this.game.frame % 3 === 0) this.game.fx.sprite({ x: this.x, y: this.y + 0.2, tex: 'smoke', color: 0xffffff, add: false, alpha: 0.4, size: 0.2, sizeEnd: 0.6, vy: 0.02, life: 20 });
        if (o.mesh === 'wave') this.mesh.scale.x = 1 + Math.sin(this.life * 0.5) * 0.08;
      }
    }
    onGround(s) {
      const o = this.o;
      if (o.onGround === 'bounce' && this.bounces > 0 && s) {
        this.bounces--;
        this.y = s.y + this.r * 0.5;
        this.vy = Math.abs(this.vy) * 0.62;
        KB.Audio.play('land', 0.8);
        return;
      }
      if (o.onGround === 'explode') this.explode();
      this.kill();
    }
    explode() {
      const fx = this.game.fx;
      fx.sprite({ x: this.x, y: this.y, tex: 'glow', color: 0xff8a30, size: 2.2, sizeEnd: 0.4, life: 14 });
      for (let i = 0; i < 8; i++) fx.sprite({ x: this.x, y: this.y, tex: 'smoke', color: KB.pick([0xff5a10, 0xffa020, 0x553322]), size: 0.4, sizeEnd: 1.2, vx: KB.rand(-0.08, 0.08), vy: KB.rand(0.02, 0.1), life: 24 });
      KB.Audio.play('fire');
    }
    kill() {
      if (!this.alive) return;
      this.alive = false;
      if (this.mesh) {
        this.game.scene.remove(this.mesh);
        this.mesh.traverse((m) => { if (m.isMesh || m.isSprite) { if (m.geometry) m.geometry.dispose(); m.material.dispose(); } });
        this.mesh = null;
      }
    }
  }
  KB.Projectile = Projectile;
})(window.KB);
