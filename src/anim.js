// ============================================================
// anim.js — 手続き的アニメーション（状態 → ポーズ → リグ）
// F = カメラ側（手前）の腕/脚、B = 奥側
// ============================================================
(function (KB) {
  'use strict';
  const TAU = Math.PI * 2;
  const KEYS = ['flip', 'spin', 'roll', 'bob', 'sx', 'sy', 'hx', 'hy', 'hz', 'aFx', 'aFz', 'aBx', 'aBz', 'lFx', 'lFz', 'lBx', 'lBz'];
  const ANGLE = new Set(['flip', 'spin', 'roll']);
  const base = () => ({ flip: 0, spin: 0, roll: 0, bob: 0, sx: 1, sy: 1, hx: 0, hy: 0, hz: 0, aFx: 0, aFz: 0, aBx: 0, aBz: 0, lFx: 0, lFz: 0, lBx: 0, lBz: 0, rate: 0.25 });

  // 攻撃アニメの型：wind=予備動作, strike=攻撃判定中, prog=判定中の進行に比例
  const ARCH = {
    jab: { wind: { aFx: 0.5, flip: -0.05 }, strike: { aFx: -1.65, aFz: -0.15, flip: 0.12, spin: 0.15 } },
    jab2: { wind: { aBx: 0.5 }, strike: { aBx: -1.65, aBz: -0.15, flip: 0.14, spin: -0.3 } },
    jab3: { wind: { lFx: 0.4, flip: -0.1 }, strike: { lFx: -1.5, flip: -0.22, aFz: 0.5, aBz: 0.5 } },
    ftilt: { wind: { lFx: 0.5, flip: -0.1 }, strike: { lFx: -1.6, flip: -0.28, aFx: 0.4, aBx: 0.4, aFz: 0.3 } },
    utilt: { wind: { aFx: 0.8, sy: -0.1 }, strike: { aFx: -2.9, sy: 0.08, flip: -0.22, hx: -0.3 } },
    dtilt: { wind: { sy: -0.28, sx: 0.1, lFx: 0.3 }, strike: { sy: -0.28, sx: 0.12, lFx: -1.4, flip: 0.28 } },
    dash: { wind: { flip: 0.2 }, strike: { flip: 0.6, aFx: -1.5, aBx: -1.5, lBx: 0.8, bob: -0.08 } },
    fsmash: { wind: { flip: -0.35, aFx: 1.3, aBx: 1.0, spin: 0.45 }, strike: { flip: 0.45, aFx: -1.8, aBx: -1.25, spin: -0.35, lBx: 0.5 } },
    usmash: { wind: { sy: -0.25, sx: 0.12, aFx: 0.5, aBx: 0.5 }, strike: { sy: 0.2, sx: -0.1, aFx: -3.0, aBx: -3.0, bob: 0.25, hx: -0.4 } },
    dsmash: { wind: { sy: -0.15, aFz: 1.2, aBz: 1.2 }, strike: { sy: -0.2, sx: 0.15, lFz: 0.9, lBz: 0.9, aFz: 1.4, aBz: 1.4 }, prog: { spin: TAU }, rate: 1 },
    nair: { strike: { aFz: 1.4, aBz: 1.4, lFz: 0.6, lBz: 0.6 }, prog: { spin: TAU * 2 }, rate: 1 },
    fair: { wind: { flip: -0.6, aFx: -3.0, aBx: -3.0 }, strike: { flip: 0.95, aFx: -0.6, aBx: -0.6 } },
    bair: { wind: { spin: 0.3 }, strike: { flip: 0.55, lBx: 1.7, lFx: -0.3, hy: 0.6 } },
    uair: { strike: { lFx: -1.8, lBx: -1.2 }, prog: { flip: -TAU }, rate: 1 },
    dair: { wind: { sy: -0.15, aFx: -2.6, aBx: -2.6 }, strike: { sy: 0.15, lFx: 0.3, lBx: 0.3, aFx: -2.8, aBx: -2.8, flip: 0.1 } },
    grab: { wind: { aFx: -0.5, aBx: -0.5 }, strike: { aFx: -1.55, aBx: -1.55, flip: 0.2 } },
    throwF: { wind: { spin: 0.6, aFx: -1.5 }, strike: { spin: -0.6, aFx: -1.8, aBx: -1.8, flip: 0.35 } },
    throwB: { strike: { aFx: -1.6, aBx: -1.6 }, prog: { spin: TAU }, rate: 1 },
    throwU: { wind: { sy: -0.15 }, strike: { aFx: -3, aBx: -3, sy: 0.15, bob: 0.1 } },
    throwD: { strike: { flip: 0.5, aFx: -0.8, aBx: -0.8, sy: -0.15 } },
    cast: { wind: { aFx: 1.4, flip: -0.15 }, strike: { aFx: -1.8, flip: 0.2 } },
    shoot: { wind: { sy: -0.18, sx: 0.1 }, strike: { flip: 0.5, sy: 0.12 } },
    spinUp: { strike: { aFz: 1.3, aBz: 1.3, sy: 0.05 }, prog: { spin: TAU * 3 }, rate: 1 },
    counter: { wind: { aFx: -1.2, aBx: -1.2, aFz: -0.4, aBz: -0.4, sy: -0.1 }, strike: { aFx: -1.2, aBx: -1.2, aFz: -0.4, aBz: -0.4, sy: -0.1, flip: -0.1 } },
    counterHit: { strike: { aFx: -1.8, flip: 0.35, spin: -0.5, lBx: 0.6 } },
    bodyPress: { wind: { flip: 0.3, sy: -0.1 }, strike: { flip: 1.35, aFx: -2.8, aBx: -2.8, lFx: 0.3, lBx: 0.3 } },
    hipdrop: { wind: { flip: -0.3, sy: -0.15 }, strike: { sy: 0.1, lFx: -1.2, lBx: -1.2, aFz: 1.3, aBz: 1.3 } },
    freeze: { wind: { sy: -0.2, aFz: 0.2, aBz: 0.2 }, strike: { sy: 0.1, aFz: 1.6, aBz: 1.6, aFx: -0.3, aBx: -0.3 } },
    iceDash: { wind: { flip: 0.3 }, strike: { flip: 1.25, aFx: -2.9, aBx: -2.2 } },
    kick: { wind: { lFx: 0.4 }, strike: { lFx: -1.5, flip: -0.1 } },
    headbutt: { wind: { flip: -0.35, hx: -0.3 }, strike: { flip: 0.55, hx: 0.3, aFx: 0.6, aBx: 0.6 } },
    hornUp: { wind: { sy: -0.2, flip: 0.2 }, strike: { sy: 0.18, flip: -0.1, hx: -0.4, aFx: -2.8, aBx: 0.5 } },
    belly: { wind: { flip: -0.3, sy: -0.1 }, strike: { flip: 0.35, sx: 0.1, sy: -0.05 } },
    ledge: { wind: { sy: -0.1 }, strike: { lFx: -1.4, flip: -0.1 } },
  };
  // 特殊なアニメ（関数）
  const CUSTOM = {
    palm(p, fr) {
      const a = Math.sin(fr * 0.9);
      p.aFx = a > 0 ? -1.6 : -0.3; p.aBx = a > 0 ? -0.3 : -1.6; p.flip = 0.15; p.rate = 0.7;
    },
    rise(p, fr) {
      const a = Math.sin(fr * 0.8);
      p.aFz = 1.2 + a * 0.5; p.aBz = 1.2 + a * 0.5; p.sy = 1.05; p.lFx = 0.3; p.lBx = -0.2;
    },
    stomp(p, fr, mv) {
      const s = mv.stompFrame || 22;
      if (fr < s) {
        const t = KB.win(fr, 0, s - 4);
        p.lFz = 1.5 * t; p.lFx = -0.3 * t; p.roll = -0.18 * t; p.aFx = -0.6; p.aBx = -0.6; p.sy = 1 - 0.05 * t;
      } else {
        const t = KB.win(fr, s, s + 6);
        p.lFz = 1.5 * (1 - t) + 0.4 * t; p.sy = 0.78 + 0.2 * KB.win(fr, s + 6, mv.dur); p.sx = 1.12; p.aFz = 0.9; p.aBz = 0.9;
        p.rate = 0.6;
      }
    },
    roll(p, fr) {
      p.flip = fr * 0.5; p.sy = 0.88; p.sx = 1.05; p.aFx = -2.6; p.aBx = -2.6; p.lFx = -1.2; p.lBx = -1.2; p.rate = 1;
    },
    rocket(p, fr, mv) {
      const t0 = 4, t1 = mv.thrustEnd || 34;
      if (fr < t0) { p.sy = 0.8; p.sx = 1.1; }
      else if (fr < t1) { p.flip = Math.PI; p.aFz = 0.9; p.aBz = 0.9; p.rate = 0.5; }
      else { p.flip = Math.PI * (1 - KB.win(fr, t1, mv.dur)); p.rate = 0.5; }
    },
    charge(p, fr) { p.sy = 0.85; p.sx = 1.1; p.flip = -0.2 + Math.sin(fr * 0.6) * 0.04; },
  };

  function attackPose(p, f) {
    const mv = f.move, fr = f.mf;
    if (typeof mv.anim === 'function') { mv.anim(p, fr, mv, f); return; }
    if (CUSTOM[mv.anim]) { CUSTOM[mv.anim](p, fr, mv, f); return; }
    const A = ARCH[mv.anim] || ARCH.jab;
    const h0 = mv.hits && mv.hits[0];
    const s = mv.as !== undefined ? mv.as : h0 ? h0.s : Math.floor(mv.dur * 0.3);
    const e = mv.ae !== undefined ? mv.ae : h0 ? mv.hits[mv.hits.length - 1].e : s + 4;
    const d = mv.dur;
    const wind = fr < s ? KB.smooth(KB.win(fr, 0, Math.max(1, s - 1))) : 0;
    const strike = fr < s ? 0 : fr <= e ? 1 : 1 - KB.smooth(KB.win(fr, e, e + (d - e) * 0.85));
    const prog = KB.win(fr, s, e);
    if (A.wind) for (const k in A.wind) p[k] += A.wind[k] * wind;
    if (A.strike) for (const k in A.strike) p[k] += A.strike[k] * strike;
    if (A.prog) for (const k in A.prog) p[k] += A.prog[k] * prog;
    p.rate = A.rate || 0.55;
    // スマッシュのため中は震える
    if (f.charging) { p.bob += Math.sin(f.game.frame * 1.7) * 0.015; }
  }

  function statePose(f, t) {
    const p = base();
    const st = f.state, sf = f.sf;
    const style = f.def.style || {};
    switch (st) {
      case 'idle': {
        const b = Math.sin(t * 0.075);
        p.sy = 1 + b * 0.018; p.aFz = 0.06 + b * 0.04; p.aBz = 0.06 + b * 0.04; p.hx = b * 0.03;
        if (style.idle === 'boxer') { p.aFx = -0.9; p.aBx = -0.7; p.aFz = -0.1; p.bob = Math.abs(Math.sin(t * 0.12)) * 0.04; }
        if (style.idle === 'float') { p.bob = 0.03 + Math.sin(t * 0.06) * 0.03; }
        if (style.idle === 'wobble') { p.roll = Math.sin(t * 0.05) * 0.04; }
        p.rate = 0.18;
        break;
      }
      case 'walk': case 'run': {
        const run = st === 'run';
        const ph = f.animPhase;
        const amp = run ? 1.0 : 0.6;
        p.lFx = Math.sin(ph) * amp * 0.9; p.lBx = -Math.sin(ph) * amp * 0.9;
        p.aFx = -Math.sin(ph) * amp * 0.8; p.aBx = Math.sin(ph) * amp * 0.8;
        p.bob = Math.abs(Math.sin(ph)) * (run ? 0.08 : 0.04);
        p.flip = run ? 0.24 : 0.06;
        if (style.run === 'waddle') { p.roll = Math.sin(ph) * 0.12; p.flip *= 0.4; }
        if (style.run === 'hop') { p.bob = Math.abs(Math.sin(ph)) * 0.16; p.sy = 1 + Math.sin(ph * 2) * 0.05; }
        p.rate = 0.35;
        break;
      }
      case 'skid': p.flip = -0.3; p.lFx = -0.8; p.aFz = 0.6; p.aBz = 0.6; p.rate = 0.4; break;
      case 'crouch': p.sy = 0.72; p.sx = 1.12; p.flip = 0.15; p.hx = 0.1; p.rate = 0.4; break;
      case 'jumpsquat': p.sy = 0.78; p.sx = 1.12; p.rate = 0.6; break;
      case 'land': p.sy = 0.84; p.sx = 1.08; p.rate = 0.5; break;
      case 'air': case 'helpless': {
        const up = f.vy > 0.02;
        if (f.djumpT > 0) {
          const k = 1 - f.djumpT / 22;
          if (style.djump === 'spin') p.spin = TAU * KB.easeOut(k);
          else if (style.djump === 'flutter') { p.aFz = 1.3 + Math.sin(k * 20) * 0.4; p.aBz = p.aFz; p.sy = 1.08; }
          else p.flip = -TAU * KB.easeOut(k);
          p.rate = 1;
        } else if (up) {
          p.sy = 1.05; p.lFx = -0.5; p.lBx = 0.3; p.aFz = 0.4; p.aBz = 0.4; p.aFx = -0.3;
        } else {
          p.aFz = 0.8; p.aBz = 0.8; p.lFx = -0.2; p.lBx = 0.15; p.flip = 0.05;
        }
        if (st === 'helpless') {
          p.aFz = 1.2 + Math.sin(t * 0.35) * 0.3; p.aBz = 1.2 + Math.cos(t * 0.35) * 0.3; p.flip = 0.15; p.roll = Math.sin(t * 0.1) * 0.15;
        }
        if (p.rate < 1) p.rate = 0.22;
        break;
      }
      case 'shield': case 'shieldstun':
        p.sy = 0.9; p.aFx = -1.0; p.aBx = -1.0; p.aFz = -0.3; p.aBz = -0.3; p.flip = 0.08; p.rate = 0.4; break;
      case 'dizzy':
        p.hz = Math.sin(t * 0.12) * 0.3; p.roll = Math.sin(t * 0.12) * 0.12; p.aFz = 0.3; p.aBz = 0.3; p.flip = 0.2; p.rate = 0.2; break;
      case 'roll': {
        const k = KB.win(sf, 3, 22);
        p.flip = TAU * k; p.sy = 0.8; p.aFx = -2; p.aBx = -2; p.lFx = -1; p.lBx = -1; p.rate = 1;
        break;
      }
      case 'spotdodge': p.sy = 0.85; p.hx = 0.3; p.aFx = -0.8; p.aBx = -0.8; p.rate = 0.5; break;
      case 'airdodge': p.spin = TAU * KB.win(sf, 1, 26); p.aFz = 0.9; p.aBz = 0.9; p.rate = 1; break;
      case 'hitstun': case 'frozen': {
        if (st === 'frozen') { p.rate = 0; break; }
        if (f.tumble) {
          p.flip = f.tumbleAng; p.aFz = 1.3; p.aBz = 1.0; p.lFz = 0.5; p.lBz = 0.3; p.rate = 1;
        } else {
          p.flip = -0.38; p.hx = -0.3; p.aFz = 1.0; p.aBz = 0.8; p.lFx = -0.3; p.rate = 0.5;
        }
        break;
      }
      case 'down': p.flip = -Math.PI / 2; p.bob = -f.dims.cy * 0.62; p.aFz = 0.9; p.aBz = 0.9; p.rate = 0.4; break;
      case 'getup': case 'tech': {
        const k = KB.win(sf, 0, 16);
        p.flip = -Math.PI / 2 * (1 - k); p.bob = -f.dims.cy * 0.62 * (1 - k); p.rate = 0.6;
        if (st === 'tech') { p.flip = 0; p.bob = 0; p.sy = 0.85; p.spin = f.techDir ? TAU * k : 0; p.rate = 0.7; }
        break;
      }
      case 'ledge':
        p.aFx = -2.9; p.aBx = -2.9; p.aFz = 0.1; p.aBz = 0.1; p.lFx = 0.2 + Math.sin(t * 0.07) * 0.1; p.lBx = -0.1; p.flip = 0.12; p.rate = 0.4; break;
      case 'ledgeclimb': {
        const k = KB.win(sf, 0, 20);
        p.sy = 0.85 + 0.15 * k; p.flip = 0.35 * (1 - k); p.aFx = -2.5 * (1 - k); p.aBx = -2.5 * (1 - k); p.rate = 0.5; break;
      }
      case 'grabbed':
        p.aFz = 1.5; p.aBz = 1.5; p.flip = -0.25; p.lFx = Math.sin(t * 0.4) * 0.5; p.lBx = -Math.sin(t * 0.4) * 0.5; p.bob = 0.1; p.rate = 0.4; break;
      case 'hold':
        p.aFx = -1.5; p.aBx = -1.5; p.aFz = -0.2; p.aBz = -0.2; p.flip = 0.1; p.rate = 0.4; break;
      case 'attack':
        attackPose(p, f);
        break;
      case 'victory': {
        const k = Math.sin(t * 0.12);
        const v = style.victory || 'cheer';
        if (v === 'cheer') { p.aFx = -2.9; p.aBx = -2.9; p.bob = Math.abs(k) * 0.3; p.sy = 1 + k * 0.05; }
        else if (v === 'flex') { p.aFz = 1.6; p.aBz = 1.6; p.aFx = -0.3; p.aBx = -0.3; p.bob = Math.abs(k) * 0.08; p.hx = -0.15; }
        else if (v === 'spin') { p.spin = (t * 0.1) % TAU; p.aFz = 1.4; p.aBz = 1.4; p.bob = 0.1 + Math.abs(k) * 0.1; p.rate = 1; }
        else if (v === 'dance') { p.roll = k * 0.25; p.aFx = -2.5 + k; p.aBx = -2.5 - k; p.bob = Math.abs(k) * 0.12; }
        break;
      }
      case 'clap': {
        const k = Math.sin(t * 0.5);
        p.aFx = -1.4; p.aBx = -1.4; p.aFz = -0.25 + k * 0.3; p.aBz = -0.25 + k * 0.3; p.hx = 0.1; p.rate = 0.6; break;
      }
      default: break;
    }
    return p;
  }

  function extras(f, t, p) {
    const r = f.rig, ex = r.extras;
    const air = !f.ground;
    if (ex.wings) {
      const sp = air ? 0.55 : 0.12, amp = air ? 0.55 : 0.18;
      ex.wings.forEach((w, i) => { const s = i === 0 ? -1 : 1; w.rotation.y = s * (0.25 + Math.sin(t * sp) * amp); w.rotation.z = s * Math.sin(t * sp + 1) * 0.05; });
    }
    if (ex.tail) {
      ex.tail.forEach((sg, i) => { sg.rotation.z = 0.12 + Math.sin(t * 0.08 - i * 0.5) * (0.12 + (f.state === 'run' ? 0.15 : 0)); });
    }
    if (ex.skirt) {
      const fl = air ? 1.1 : f.state === 'run' ? 1.05 : 1;
      ex.skirt.scale.x = KB.lerp(ex.skirt.scale.x, fl, 0.2); ex.skirt.scale.z = ex.skirt.scale.x;
    }
    if (ex.bow) ex.bow.rotation.z = Math.sin(t * 0.09) * 0.05 + (air ? Math.sin(t * 0.4) * 0.05 : 0);
    if (ex.cross) ex.cross.rotation.z = Math.sin(t * 0.07) * 0.08 - p.flip * 0.1;
  }

  function applyPose(rig, cur, facing) {
    rig.pivot.rotation.set(cur.flip, cur.spin, cur.roll);
    rig.pivot.position.y = rig.dims.cy + cur.bob;
    rig.model.scale.set(cur.sx, cur.sy, cur.sx);
    const rs = rig.rest;
    if (rig.head) rig.head.rotation.set(rs.head.x + cur.hx, rs.head.y + cur.hy, rs.head.z + cur.hz);
    const setJ = (j, x, z, sideSign) => { if (!j) return; j.rotation.x = x; j.rotation.z = (rs[j.userData.key] ? rs[j.userData.key].z : 0) + sideSign * z; };
    if (!rig._keyed) { for (const k of ['armL', 'armR', 'legL', 'legR']) if (rig[k]) rig[k].userData.key = k; rig._keyed = true; }
    setJ(rig.armR, cur.aRx, cur.aRz, -1);
    setJ(rig.armL, cur.aLx, cur.aLz, 1);
    setJ(rig.legR, cur.lRx, cur.lRz, -1);
    setJ(rig.legL, cur.lLx, cur.lLz, 1);
  }

  KB.Anim = {
    ARCH, CUSTOM, base,
    // フレームごとに呼ぶ
    update(f) {
      const rig = f.rig;
      const t = f.game ? f.game.frame + f.slot * 37 : performance.now() / 16.7;
      const p = statePose(f, t);
      // F/B → L/R
      const front = f.facing > 0 ? 'R' : 'L', back = front === 'R' ? 'L' : 'R';
      const tgt = {
        flip: p.flip, spin: p.spin, roll: p.roll, bob: p.bob, sx: p.sx, sy: p.sy, hx: p.hx, hy: p.hy, hz: p.hz,
      };
      tgt['a' + front + 'x'] = p.aFx; tgt['a' + front + 'z'] = p.aFz; tgt['a' + back + 'x'] = p.aBx; tgt['a' + back + 'z'] = p.aBz;
      tgt['l' + front + 'x'] = p.lFx; tgt['l' + front + 'z'] = p.lFz; tgt['l' + back + 'x'] = p.lBx; tgt['l' + back + 'z'] = p.lBz;
      if (!rig.cur) rig.cur = Object.assign({}, tgt);
      const c = rig.cur, rate = p.rate;
      if (rate > 0) {
        for (const k in tgt) {
          if (c[k] === undefined) c[k] = tgt[k];
          c[k] = ANGLE.has(k) ? KB.lerpAngle(c[k], tgt[k], rate) : KB.lerp(c[k], tgt[k], rate);
        }
      }
      applyPose(rig, c, f.facing);
      // 向き（手前に少しひねる）
      const yaw = f.yawOverride !== undefined ? f.yawOverride : f.facing * (Math.PI / 2 - 0.5);
      rig.root.rotation.y = KB.lerpAngle(rig.root.rotation.y, yaw, f.state === 'attack' ? 0.6 : 0.3);
      extras(f, t, c);
    },
  };
})(window.KB);
