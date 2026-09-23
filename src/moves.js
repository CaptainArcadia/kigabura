// ============================================================
// moves.js — キャラクター性能とワザのデータ
// 角度は「向いている方向を0°」「真上90°」「後ろ180°」「マイナスは下向き」
// H(開始, 終了, 前方x, 高さy, 半径, ダメージ, 角度, 基礎ふっとばし, ふっとばし成長, 追加)
// ============================================================
(function (KB) {
  'use strict';
  const H = (s, e, x, y, r, d, a, b, k, o) => Object.assign({ s, e, x, y, r, d, a, b, k }, o || {});
  const M = (o) => Object.assign({ dur: 30, hits: [], anim: 'jab', landLag: 8 }, o);
  const GRAB = (s, x, r, dur = 30) => M({ dur, anim: 'grab', hits: [H(s, s + 1, x, 0.9, r, 0, 0, 0, 0, { grab: true })], edgeStop: true });

  // 共通ワザ
  const COMMON = {
    ledgeatk: M({ dur: 40, anim: 'ledge', intangible: [0, 16], hits: [H(18, 22, 0.85, 0.5, 0.55, 8, 30, 55, 20)] }),
    getupatk: M({ dur: 34, anim: 'dsmash', intangible: [0, 18], hits: [H(14, 16, 0.8, 0.35, 0.5, 7, 35, 55, 20), H(19, 21, -0.8, 0.35, 0.5, 7, 145, 55, 20)] }),
    pummel: M({ dur: 14, anim: 'jab', pummel: true }),
  };

  // --- 汎用ヘルパー ---
  function stall(f, mul = 0.4, damp = 0.85) {
    if (!f.ground) { f.gravMul = mul; f.vy *= damp; }
  }

  // ============================================================
  // ATARU
  // ============================================================
  const ataru = {
    id: 'ataru', name: 'ATARU', title: '覆面神父',
    desc: 'パワーとリーチに優れた覆面の神父。十字架を投げ、カウンターで返す重量級ファイター。',
    dims: { h: 2.0, hw: 0.45, cy: 1.0 },
    style: { idle: 'boxer', djump: 'flip', victory: 'flex' },
    stats: { weight: 108, walk: 0.085, run: 0.168, airSpeed: 0.102, airAccel: 0.0075, airFric: 0.004, gravity: 0.0105, maxFall: 0.175, fastFall: 0.27, jumpV: 0.267, shopV: 0.172, djumpV: 0.252, airJumps: 1, traction: 0.011, jumpSquat: 4 },
    specials: { n: 'ホーリークロス', s: 'フライングボディプレス', u: '昇天ホーン', d: '懺悔カウンター' },
    moves: {
      jab1: M({ dur: 18, anim: 'jab', hits: [H(3, 4, 0.72, 1.0, 0.36, 2.5, 80, 8, 35)], jabNext: 'jab2', jabWin: [5, 17] }),
      jab2: M({ dur: 20, anim: 'jab2', hits: [H(3, 4, 0.75, 1.0, 0.36, 2.5, 75, 8, 35)], jabNext: 'jab3', jabWin: [5, 19] }),
      jab3: M({ dur: 34, anim: 'headbutt', hits: [H(6, 8, 0.9, 1.4, 0.56, 5, 40, 42, 95), H(6, 8, 0.55, 0.9, 0.45, 5, 40, 42, 95)] }),
      ftilt: M({ dur: 30, anim: 'ftilt', hits: [H(7, 9, 0.95, 0.65, 0.42, 9, 35, 22, 98), H(7, 9, 0.45, 0.7, 0.35, 8, 35, 20, 95)] }),
      utilt: M({ dur: 30, anim: 'hornUp', hits: [H(7, 11, 0.2, 2.1, 0.52, 8, 92, 30, 112), H(7, 11, 0.5, 1.5, 0.4, 7, 100, 30, 105)] }),
      dtilt: M({ dur: 24, anim: 'dtilt', crouch: true, hits: [H(5, 7, 0.95, 0.2, 0.42, 7, 28, 30, 65)] }),
      dash: M({ dur: 38, anim: 'dash', slide: true, hits: [H(7, 10, 0.8, 0.8, 0.5, 11, 42, 50, 70), H(11, 18, 0.8, 0.8, 0.42, 7, 50, 40, 55)] }),
      fsmash: M({ dur: 52, anim: 'fsmash', charge: 8, smash: true, hits: [H(15, 18, 1.05, 1.1, 0.56, 17, 36, 35, 104), H(15, 18, 0.5, 1.1, 0.42, 15, 38, 32, 100)] }),
      usmash: M({ dur: 48, anim: 'usmash', charge: 6, smash: true, hits: [H(11, 15, 0.2, 2.25, 0.62, 16, 88, 34, 100), H(11, 15, 0.3, 1.5, 0.5, 14, 85, 30, 98)] }),
      dsmash: M({ dur: 46, anim: 'dsmash', charge: 5, smash: true, hits: [H(10, 12, 0.95, 0.3, 0.5, 15, 30, 30, 98), H(15, 17, -0.95, 0.3, 0.5, 14, 150, 30, 98)] }),
      nair: M({ dur: 36, air: true, landLag: 8, anim: 'nair', hits: [H(5, 8, 0, 0.95, 0.8, 10, 45, 25, 90), H(9, 20, 0, 0.95, 0.75, 6, 50, 15, 75)] }),
      fair: M({ dur: 40, air: true, landLag: 13, anim: 'fair', hits: [H(13, 14, 0.85, 0.65, 0.4, 14, -75, 20, 80), H(13, 16, 0.65, 1.2, 0.48, 11, 40, 30, 92)] }),
      bair: M({ dur: 32, air: true, landLag: 10, anim: 'bair', hits: [H(8, 11, -0.82, 1.0, 0.5, 13, 145, 28, 102), H(12, 18, -0.7, 1.0, 0.4, 8, 145, 15, 80)] }),
      uair: M({ dur: 32, air: true, landLag: 8, anim: 'uair', hits: [H(7, 11, 0.1, 2.1, 0.55, 10, 85, 25, 108)] }),
      dair: M({ dur: 44, air: true, landLag: 18, anim: 'dair', hits: [H(13, 16, 0.05, -0.1, 0.45, 14, -80, 22, 90), H(17, 24, 0.05, 0.0, 0.4, 9, 60, 20, 80)] }),
      nspec: M({
        dur: 42, anim: 'cast', as: 14, ae: 16,
        tick(f, fr) {
          stall(f, 0.6, 0.95);
          if (fr === 14 && f.countProj('cross') < 1) {
            f.spawnProj({ type: 'cross', mesh: 'cross', x: 0.7, y: 1.3, vx: 0.3, vy: 0, life: 55, r: 0.38, hit: { d: 8, a: 42, b: 35, k: 55, fx: 'holy' }, spin: 0.35 });
            f.sfx('shoot');
          }
        },
      }),
      sspec: M({
        dur: 52, anim: 'bodyPress', as: 10, ae: 38, once: 'side', landLag: 14,
        hits: [H(10, 38, 0.2, 0.8, 0.65, 12, 50, 42, 78)],
        tick(f, fr) {
          if (fr === 6) { f.leaveGround(); f.vx = 0.33 * f.facing; f.vy = f.ground ? 0.2 : Math.max(f.vy, 0.17); f.sfx('jump'); }
          if (fr >= 6 && fr <= 40) f.noDrift = true;
          if (fr < 6) { f.vx *= 0.8; stall(f, 0.2, 0.7); }
        },
        onLand(f) { f.game.fx.dust(f.x, f.y, 0, 10); f.shake(0.15); f.sfx('land', 1.4); return false; },
      }),
      uspec: M({
        dur: 46, anim: 'hornUp', as: 6, ae: 28, helpless: true, landLag: 16, rehit: 4, rehitEnd: 22,
        hits: [H(6, 22, 0.1, 1.9, 0.6, 2, 90, 30, 20), H(24, 27, 0.1, 2.0, 0.65, 6, 80, 55, 95)],
        tick(f, fr) {
          if (fr < 5) { f.vx *= 0.8; f.vy = 0; f.gravMul = 0; }
          if (fr === 5) { f.leaveGround(); f.vy = 0.3; f.sfx('djump'); }
          if (fr > 5 && fr <= 28) { f.vy *= 0.96; f.gravMul = 0.25; f.noDrift = true; f.vx = f.ctrl.x * 0.08; f.game.fx.trail(f, 0x7dff6a); }
        },
      }),
      dspec: M({
        dur: 46, anim: 'counter', as: 6, ae: 28, counter: [6, 28],
        tick(f) { stall(f, 0.35, 0.85); },
      }),
      counterHit: M({ dur: 36, anim: 'counterHit', intangible: [0, 14], hits: [H(5, 8, 0.9, 1.0, 0.8, 12, 38, 60, 92, { fx: 'holy', dmgOverride: true })], tick(f) { stall(f, 0.2, 0.7); } }),
      grab: GRAB(6, 0.75, 0.45),
      dashgrab: Object.assign(GRAB(9, 0.95, 0.5, 38), { slide: true }),
      fthrow: M({ dur: 30, anim: 'throwF', throwAt: 14, throwHit: H(0, 0, 0, 0, 0, 9, 40, 55, 72) }),
      bthrow: M({ dur: 34, anim: 'throwB', throwAt: 18, throwHit: H(0, 0, 0, 0, 0, 11, 135, 62, 76) }),
      uthrow: M({ dur: 30, anim: 'throwU', throwAt: 12, throwHit: H(0, 0, 0, 0, 0, 7, 90, 68, 60) }),
      dthrow: M({ dur: 32, anim: 'throwD', throwAt: 16, throwHit: H(0, 0, 0, 0, 0, 7, 80, 55, 45) }),
    },
  };

  // ============================================================
  // FURA
  // ============================================================
  const fura = {
    id: 'fura', name: 'FURA', title: '氷の妖精',
    desc: 'ふわふわ3段ジャンプの氷の妖精。つららで牽制し、パーフェクトフリーズで相手を凍らせる軽量級。',
    dims: { h: 1.75, hw: 0.4, cy: 0.9 },
    style: { idle: 'float', djump: 'flutter', victory: 'spin' },
    stats: { weight: 78, walk: 0.09, run: 0.178, airSpeed: 0.118, airAccel: 0.01, airFric: 0.005, gravity: 0.0072, maxFall: 0.12, fastFall: 0.2, jumpV: 0.216, shopV: 0.142, djumpV: 0.19, airJumps: 2, traction: 0.01, jumpSquat: 3 },
    specials: { n: 'アイシクルショット', s: 'フリーズダッシュ', u: '妖精の羽ばたき', d: 'パーフェクトフリーズ' },
    moves: {
      jab1: M({ dur: 16, anim: 'jab', hits: [H(3, 4, 0.65, 0.9, 0.33, 2, 75, 8, 30)], jabNext: 'jab2', jabWin: [5, 15] }),
      jab2: M({ dur: 18, anim: 'jab2', hits: [H(3, 4, 0.68, 0.9, 0.33, 2, 75, 8, 30)], jabNext: 'jab3', jabWin: [5, 17] }),
      jab3: M({ dur: 30, anim: 'grab', hits: [H(5, 7, 0.82, 0.95, 0.5, 4, 45, 40, 90, { fx: 'ice' })], tick(f, fr) { if (fr === 5) f.game.fx.shards(f.fwd(0.8), f.y + 0.95, 6); } }),
      ftilt: M({ dur: 26, anim: 'cast', hits: [H(6, 8, 0.85, 0.95, 0.46, 8, 38, 18, 100, { fx: 'ice' })] }),
      utilt: M({ dur: 26, anim: 'utilt', hits: [H(5, 10, 0.1, 1.8, 0.56, 7, 95, 30, 110)] }),
      dtilt: M({ dur: 20, anim: 'dtilt', crouch: true, hits: [H(5, 7, 0.9, 0.2, 0.38, 6, 75, 38, 60, { fx: 'ice' })] }),
      dash: M({ dur: 34, anim: 'dash', slide: true, hits: [H(6, 14, 0.6, 0.45, 0.5, 9, 48, 40, 70, { fx: 'ice' })] }),
      fsmash: M({
        dur: 48, anim: 'fsmash', charge: 7, smash: true,
        hits: [H(14, 16, 1.3, 0.95, 0.5, 15, 36, 32, 102, { fx: 'ice' }), H(14, 16, 0.65, 0.95, 0.42, 13, 38, 30, 98, { fx: 'ice' })],
        tick(f, fr) { if (fr === 14) { f.game.fx.spike(f.fwd(0.4), f.y + 0.95, f.facing > 0 ? 0 : Math.PI, 1.5, 0xbfeeff); f.sfx('ice'); } },
      }),
      usmash: M({
        dur: 44, anim: 'usmash', charge: 5, smash: true, hits: [H(11, 15, 0, 2.0, 0.72, 15, 90, 32, 100, { fx: 'ice' })],
        tick(f, fr) { if (fr === 11) { f.game.fx.spike(f.x, f.y + 1.2, Math.PI / 2, 1.4, 0xbfeeff); f.game.fx.spike(f.x - 0.35, f.y + 1.1, Math.PI / 2 + 0.4, 1.0, 0xbfeeff); f.game.fx.spike(f.x + 0.35, f.y + 1.1, Math.PI / 2 - 0.4, 1.0, 0xbfeeff); f.sfx('ice'); } },
      }),
      dsmash: M({
        dur: 42, anim: 'dsmash', charge: 4, smash: true,
        hits: [H(9, 12, 1.0, 0.25, 0.52, 13, 28, 30, 98, { fx: 'ice' }), H(9, 12, -1.0, 0.25, 0.52, 13, 152, 30, 98, { fx: 'ice' })],
        tick(f, fr) { if (fr === 9) { f.game.fx.spike(f.x + 0.3, f.y + 0.2, 0.15, 1.1, 0xbfeeff); f.game.fx.spike(f.x - 0.3, f.y + 0.2, Math.PI - 0.15, 1.1, 0xbfeeff); f.sfx('ice'); } },
      }),
      nair: M({ dur: 34, air: true, landLag: 6, anim: 'nair', hits: [H(4, 7, 0, 0.95, 0.75, 8, 48, 22, 85), H(8, 18, 0, 0.95, 0.7, 5, 50, 12, 70)] }),
      fair: M({ dur: 34, air: true, landLag: 10, anim: 'kick', hits: [H(8, 11, 0.78, 0.8, 0.5, 10, 42, 25, 98, { fx: 'ice' })] }),
      bair: M({ dur: 30, air: true, landLag: 9, anim: 'bair', hits: [H(7, 10, -0.8, 0.95, 0.52, 11, 150, 22, 105)] }),
      uair: M({ dur: 30, air: true, landLag: 8, anim: 'uair', hits: [H(6, 11, 0.05, 1.9, 0.55, 9, 88, 22, 110, { fx: 'ice' })] }),
      dair: M({ dur: 40, air: true, landLag: 16, anim: 'dair', hits: [H(11, 14, 0.05, -0.05, 0.42, 11, -78, 20, 88, { fx: 'ice' }), H(15, 22, 0, 0.05, 0.38, 7, 65, 20, 70, { fx: 'ice' })] }),
      nspec: M({
        dur: 32, anim: 'cast', as: 11, ae: 13,
        tick(f, fr) {
          stall(f, 0.5, 0.92);
          if (fr === 11) {
            for (const a of [-12, 0, 12]) {
              const r = KB.deg(a);
              f.spawnProj({ type: 'icicle', mesh: 'icicle', x: 0.6, y: 1.0, vx: Math.cos(r) * 0.36, vy: Math.sin(r) * 0.36, life: 34, r: 0.26, hit: { d: 3, a: 35, b: 14, k: 45, fx: 'ice' } });
            }
            f.sfx('ice');
          }
        },
      }),
      sspec: M({
        dur: 42, anim: 'iceDash', as: 6, ae: 22, once: 'side', landLag: 10, offEdge: true,
        hits: [H(6, 22, 0.3, 0.9, 0.6, 8, 45, 45, 55, { fx: 'ice' })],
        tick(f, fr) {
          if (fr >= 5 && fr <= 22) { f.vx = 0.4 * f.facing; f.vy = 0; f.gravMul = 0; f.noDrift = true; if (fr % 2) f.game.fx.shards(f.x, f.y + 0.9, 1); }
          else if (fr > 22) f.vx *= 0.9;
          else stall(f, 0.2, 0.6);
          if (fr === 5) f.sfx('ice');
        },
      }),
      uspec: M({
        dur: 44, anim: 'rise', helpless: true, landLag: 14, hits: [H(4, 12, 0, 1.0, 0.72, 5, 85, 45, 60, { fx: 'ice' })],
        tick(f, fr) {
          if (fr === 4) { f.leaveGround(); f.sfx('djump'); }
          if (fr >= 4 && fr <= 32) { f.vy = 0.225; f.gravMul = 0; f.noDrift = true; f.vx = f.ctrl.x * 0.12; if (fr % 2) f.game.fx.shards(f.x, f.y + 0.7, 1); }
          else if (fr < 4) { f.vy = 0; f.gravMul = 0; }
        },
      }),
      dspec: M({
        dur: 52, anim: 'freeze', as: 12, ae: 16, hits: [H(12, 16, 0, 0.9, 1.7, 6, 70, 22, 30, { fx: 'ice', freeze: true })],
        tick(f, fr) {
          stall(f, 0.3, 0.85);
          if (fr === 12) { f.game.fx.iceBurst(f.x, f.y + 0.9); f.sfx('freeze'); }
        },
      }),
      grab: GRAB(6, 0.7, 0.42),
      dashgrab: Object.assign(GRAB(9, 0.9, 0.48, 36), { slide: true }),
      fthrow: M({ dur: 28, anim: 'throwF', throwAt: 12, throwHit: H(0, 0, 0, 0, 0, 8, 40, 50, 65, { fx: 'ice' }) }),
      bthrow: M({ dur: 32, anim: 'throwB', throwAt: 16, throwHit: H(0, 0, 0, 0, 0, 9, 140, 55, 72) }),
      uthrow: M({ dur: 28, anim: 'throwU', throwAt: 12, throwHit: H(0, 0, 0, 0, 0, 7, 90, 70, 55, { fx: 'ice' }) }),
      dthrow: M({ dur: 30, anim: 'throwD', throwAt: 14, throwHit: H(0, 0, 0, 0, 0, 6, 75, 55, 42) }),
    },
  };

  // ============================================================
  // MG
  // ============================================================
  const mg = {
    id: 'mg', name: 'MG', title: '祭り猫',
    desc: 'おまつり大好きな重量級ねこ。たこ焼きを投げ、ヒップドロップで地面ごと揺らすパワー自慢。',
    dims: { h: 1.8, hw: 0.66, cy: 0.9 },
    style: { run: 'waddle', djump: 'spin', victory: 'dance' },
    stats: { weight: 128, walk: 0.07, run: 0.142, airSpeed: 0.09, airAccel: 0.0055, airFric: 0.004, gravity: 0.0125, maxFall: 0.2, fastFall: 0.3, jumpV: 0.28, shopV: 0.18, djumpV: 0.255, airJumps: 1, traction: 0.014, jumpSquat: 5 },
    specials: { n: 'あつあつたこ焼き', s: 'ころころアタック', u: 'ねこロケット', d: 'ヒップドロップ' },
    moves: {
      jab1: M({ dur: 20, anim: 'jab', hits: [H(4, 5, 0.85, 0.9, 0.42, 3, 75, 10, 35)], jabNext: 'jabR', jabWin: [6, 19] }),
      jabR: M({ dur: 24, anim: 'palm', rehit: 4, rapid: { next: 'jabFin', max: 4 }, hits: [H(2, 22, 0.95, 0.95, 0.52, 1.2, 80, 6, 12)] }),
      jabFin: M({ dur: 34, anim: 'jab', hits: [H(6, 8, 1.0, 0.95, 0.56, 5, 42, 45, 100)] }),
      ftilt: M({ dur: 34, anim: 'belly', hits: [H(9, 11, 0.92, 0.7, 0.62, 11, 36, 25, 100)] }),
      utilt: M({ dur: 32, anim: 'utilt', hits: [H(8, 12, 0.1, 1.95, 0.62, 10, 92, 30, 108)] }),
      dtilt: M({ dur: 26, anim: 'dtilt', crouch: true, hits: [H(6, 8, 1.0, 0.2, 0.46, 8, 30, 30, 70)] }),
      dash: M({ dur: 42, anim: 'dash', slide: true, hits: [H(8, 16, 0.8, 0.6, 0.64, 13, 45, 55, 72)] }),
      fsmash: M({ dur: 56, anim: 'fsmash', charge: 9, smash: true, hits: [H(17, 20, 1.12, 0.95, 0.64, 20, 35, 36, 102)] }),
      usmash: M({ dur: 50, anim: 'usmash', charge: 6, smash: true, hits: [H(12, 17, 0, 2.1, 0.74, 18, 88, 35, 98)] }),
      dsmash: M({
        dur: 50, anim: 'dsmash', charge: 5, smash: true,
        hits: [H(12, 15, 1.05, 0.3, 0.62, 16, 30, 32, 98), H(12, 15, -1.05, 0.3, 0.62, 16, 150, 32, 98)],
        tick(f, fr) { if (fr === 12) { f.game.fx.dust(f.x, f.y, 0, 12); f.shake(0.12); } },
      }),
      nair: M({ dur: 38, air: true, landLag: 9, anim: 'nair', hits: [H(5, 9, 0, 0.9, 0.95, 11, 45, 25, 90), H(10, 20, 0, 0.9, 0.9, 7, 50, 18, 80)] }),
      fair: M({ dur: 42, air: true, landLag: 14, anim: 'fair', hits: [H(13, 14, 0.95, 0.6, 0.45, 15, -70, 22, 82), H(12, 15, 0.95, 1.05, 0.6, 14, 40, 30, 98)] }),
      bair: M({ dur: 36, air: true, landLag: 12, anim: 'bair', hits: [H(9, 12, -0.95, 0.85, 0.58, 14, 148, 26, 102)] }),
      uair: M({ dur: 32, air: true, landLag: 10, anim: 'uair', hits: [H(7, 11, 0, 2.0, 0.66, 12, 86, 25, 105)] }),
      dair: M({ dur: 46, air: true, landLag: 20, anim: 'hipdrop', hits: [H(14, 18, 0, -0.05, 0.62, 15, -75, 25, 88), H(19, 26, 0, 0.05, 0.52, 9, 65, 20, 70)] }),
      nspec: M({
        dur: 36, anim: 'cast', as: 13, ae: 15,
        tick(f, fr) {
          stall(f, 0.6, 0.95);
          if (fr === 13 && f.countProj('tako') < 2) {
            f.spawnProj({ type: 'tako', mesh: 'takoyaki', x: 0.6, y: 1.25, vx: 0.2, vy: 0.19, grav: 0.011, life: 120, r: 0.3, hit: { d: 7, a: 45, b: 35, k: 55, fx: 'fire' }, onGround: 'explode', spin: 0.2 });
            f.sfx('swing', 0.5);
          }
        },
      }),
      sspec: M({
        dur: 56, anim: 'roll', as: 6, ae: 46, once: 'side', landLag: 12, offEdge: true,
        hits: [H(6, 46, 0, 0.85, 0.82, 11, 42, 42, 72)],
        tick(f, fr) {
          if (fr >= 6 && fr <= 46) {
            f.vx = (f.ground ? 0.3 : 0.26) * f.facing; f.noDrift = true;
            if (!f.ground) f.gravMul = 0.5;
            if (f.ground && fr % 3 === 0) f.game.fx.dust(f.x, f.y, -f.facing, 1);
          } else if (fr > 46) f.vx *= 0.85;
          if (fr === 6) f.sfx('dash');
        },
        onHit(f) { f.vx = -0.12 * f.facing; f.vy = f.ground ? 0 : 0.12; f.mf = Math.max(f.mf, 46); },
      }),
      uspec: M({
        dur: 52, anim: 'spinUp', as: 6, ae: 34, helpless: true, landLag: 18, rehit: 5, rehitEnd: 30,
        hits: [H(7, 30, 0, 1.0, 0.92, 1.5, 88, 35, 15), H(32, 35, 0, 1.5, 0.95, 6, 80, 50, 100)],
        tick(f, fr) {
          if (fr < 6) { f.vy = 0; f.gravMul = 0; f.vx *= 0.8; }
          if (fr === 6) { f.leaveGround(); f.vy = 0.3; f.sfx('djump'); }
          if (fr > 6 && fr <= 34) { f.vy *= 0.965; f.gravMul = 0.3; f.noDrift = true; f.vx = f.ctrl.x * 0.07; }
        },
      }),
      dspec: M({
        dur: 240, anim: 'hipdrop', as: 13, ae: 239, landLag: 0,
        hits: [H(13, 239, 0, 0.2, 0.62, 14, -70, 30, 85)],
        tick(f, fr) {
          if (fr === 1 && f.ground) { f.leaveGround(); f.vy = 0.22; }
          if (fr <= 12) { f.gravMul = 0.3; f.vy *= 0.9; f.vx *= 0.8; f.noDrift = true; }
          else { f.vy = -0.55; f.vx = 0; f.noDrift = true; f.gravMul = 0; if (fr === 13) f.sfx('swing', 1); }
        },
        onLand(f) { f.startMove('dspecLand'); return true; },
      }),
      dspecLand: M({
        dur: 26, anim: 'belly', as: 1, ae: 3,
        hits: [H(1, 3, 0.95, 0.35, 0.75, 10, 60, 55, 70), H(1, 3, -0.95, 0.35, 0.75, 10, 120, 55, 70)],
        start(f) { f.game.fx.shock(f.x, f.y, 0xffd9a0, 2.6); f.game.fx.dust(f.x, f.y, 0, 16); f.shake(0.35); f.sfx('stomp'); },
      }),
      grab: GRAB(7, 0.85, 0.5),
      dashgrab: Object.assign(GRAB(10, 1.05, 0.55, 40), { slide: true }),
      fthrow: M({ dur: 32, anim: 'throwF', throwAt: 14, throwHit: H(0, 0, 0, 0, 0, 10, 42, 55, 72) }),
      bthrow: M({ dur: 36, anim: 'throwB', throwAt: 20, throwHit: H(0, 0, 0, 0, 0, 12, 138, 60, 80) }),
      uthrow: M({ dur: 32, anim: 'throwU', throwAt: 14, throwHit: H(0, 0, 0, 0, 0, 8, 90, 70, 62) }),
      dthrow: M({ dur: 34, anim: 'throwD', throwAt: 18, throwHit: H(0, 0, 0, 0, 0, 8, 75, 60, 45) }),
    },
  };

  // ============================================================
  // SIKO
  // ============================================================
  const siko = {
    id: 'siko', name: 'SIKO', title: '紅白ボーダー',
    desc: '頭の穴から砲弾を撃つ紅白の筒。四股踏みの衝撃波と筒ロケットでトリッキーに戦う中量級。',
    dims: { h: 1.75, hw: 0.52, cy: 0.9 },
    style: { idle: 'wobble', run: 'hop', djump: 'flip', victory: 'cheer' },
    stats: { weight: 96, walk: 0.088, run: 0.185, airSpeed: 0.105, airAccel: 0.008, airFric: 0.005, gravity: 0.0108, maxFall: 0.175, fastFall: 0.27, jumpV: 0.27, shopV: 0.172, djumpV: 0.25, airJumps: 1, traction: 0.011, jumpSquat: 4 },
    specials: { n: 'ボーダー砲', s: 'つっぱり', u: '筒ロケット', d: '四股踏み' },
    moves: {
      jab1: M({ dur: 17, anim: 'jab', hits: [H(3, 4, 0.72, 0.95, 0.35, 2.5, 75, 8, 32)], jabNext: 'jab2', jabWin: [5, 16] }),
      jab2: M({ dur: 19, anim: 'jab2', hits: [H(3, 4, 0.75, 0.95, 0.35, 2.5, 75, 8, 32)], jabNext: 'jab3', jabWin: [5, 18] }),
      jab3: M({ dur: 32, anim: 'belly', hits: [H(5, 7, 0.82, 0.9, 0.52, 5, 42, 42, 92)] }),
      ftilt: M({ dur: 30, anim: 'headbutt', hits: [H(8, 10, 0.95, 1.1, 0.52, 9, 36, 22, 98)] }),
      utilt: M({
        dur: 30, anim: 'utilt', hits: [H(7, 12, 0, 2.0, 0.62, 8, 92, 30, 110)],
        tick(f, fr) { if (fr === 7) f.game.fx.steam(f.x, f.y + 1.75, 0, 0.08, 6); },
      }),
      dtilt: M({ dur: 22, anim: 'dtilt', crouch: true, hits: [H(5, 7, 0.9, 0.2, 0.38, 6, 30, 28, 65)] }),
      dash: M({ dur: 38, anim: 'dash', slide: true, hits: [H(7, 14, 0.8, 0.9, 0.56, 10, 45, 48, 70)] }),
      fsmash: M({
        dur: 52, anim: 'headbutt', charge: 8, smash: true, hits: [H(15, 18, 1.1, 1.0, 0.62, 17, 36, 34, 103)],
        tick(f, fr) { if (fr === 15) f.vx = 0.13 * f.facing; },
      }),
      usmash: M({
        dur: 48, anim: 'usmash', charge: 6, smash: true, hits: [H(12, 18, 0, 2.25, 0.72, 17, 90, 32, 100, { fx: 'fire' })],
        tick(f, fr) { if (fr >= 12 && fr <= 18) f.game.fx.eruption(f.x, f.y + 1.8); if (fr === 12) f.sfx('explode'); },
      }),
      dsmash: M({ dur: 44, anim: 'dsmash', charge: 5, smash: true, hits: [H(9, 12, 0.95, 0.4, 0.56, 14, 30, 30, 96), H(13, 16, -0.95, 0.4, 0.56, 14, 150, 30, 96)] }),
      nair: M({ dur: 34, air: true, landLag: 7, anim: 'nair', hits: [H(5, 8, 0, 0.9, 0.8, 9, 45, 22, 88), H(9, 18, 0, 0.9, 0.75, 6, 50, 15, 72)] }),
      fair: M({ dur: 36, air: true, landLag: 11, anim: 'headbutt', hits: [H(10, 13, 0.92, 1.0, 0.56, 12, 40, 28, 98)] }),
      bair: M({ dur: 32, air: true, landLag: 10, anim: 'bair', hits: [H(8, 11, -0.85, 0.8, 0.56, 12, 148, 25, 102)] }),
      uair: M({
        dur: 32, air: true, landLag: 8, anim: 'usmash', hits: [H(6, 12, 0, 2.1, 0.62, 10, 88, 25, 108, { fx: 'fire' })],
        tick(f, fr) { if (fr >= 6 && fr <= 10) f.game.fx.eruption(f.x, f.y + 1.8, 0.6); },
      }),
      dair: M({ dur: 44, air: true, landLag: 16, anim: 'nair', rehit: 4, rehitEnd: 22, hits: [H(8, 22, 0, 0.1, 0.52, 1.5, 70, 20, 10), H(24, 26, 0, 0.05, 0.56, 5, -80, 25, 80)] }),
      nspec: M({
        dur: 42, anim: 'shoot', as: 16, ae: 18,
        tick(f, fr) {
          stall(f, 0.5, 0.9);
          if (fr === 16 && f.countProj('ball') < 1) {
            f.spawnProj({ type: 'ball', mesh: 'ball', x: 0.35, y: 1.75, vx: 0.26, vy: 0.16, grav: 0.009, life: 100, r: 0.34, hit: { d: 9, a: 45, b: 42, k: 60 }, onGround: 'bounce', bounces: 1, spin: 0.25 });
            f.game.fx.steam(f.x, f.y + 1.75, 0.04 * f.facing, 0.05, 8);
            f.sfx('cannon');
          }
        },
      }),
      sspec: M({
        dur: 46, anim: 'palm', as: 6, ae: 37, once: 'side', landLag: 10, rehit: 4, rehitEnd: 32,
        hits: [H(6, 32, 0.85, 0.95, 0.52, 1.8, 30, 22, 12), H(35, 37, 0.95, 0.95, 0.62, 5, 40, 50, 80)],
        tick(f, fr) {
          if (fr >= 6 && fr <= 34) { if (f.ground) f.vx = 0.1 * f.facing; else stall(f, 0.35, 0.9); }
          if (fr % 4 === 2 && fr > 4 && fr < 34) f.sfx('swing', 0.3);
        },
      }),
      uspec: M({
        dur: 50, anim: 'rocket', thrustEnd: 34, helpless: true, landLag: 16, as: 4, ae: 30,
        hits: [H(4, 10, 0, 0.0, 0.75, 7, 50, 30, 50, { fx: 'fire' }), H(11, 30, 0, 1.0, 0.62, 5, 75, 40, 60)],
        tick(f, fr) {
          if (fr < 4) { f.vx *= 0.7; f.vy = 0; f.gravMul = 0; }
          if (fr === 4) { f.leaveGround(); f.sfx('steam'); f.sfx('cannon'); }
          if (fr >= 4 && fr <= 34) {
            f.vy = 0.32 * Math.pow(0.95, fr - 4); f.gravMul = 0; f.noDrift = true; f.vx = f.ctrl.x * 0.1;
            f.game.fx.steam(f.x, f.y + 0.1, 0, -0.1, 1);
          }
        },
      }),
      dspec: M({
        dur: 58, anim: 'stomp', stompFrame: 22, as: 22, ae: 24, airVariant: 'dspecAir',
        hits: [H(22, 24, 0, 0.2, 0.9, 8, 88, 45, 60)],
        tick(f, fr) {
          if (fr === 22) {
            f.shake(0.3); f.sfx('stomp'); f.game.fx.dust(f.x, f.y, 0, 14); f.game.fx.shock(f.x, f.y, 0xffe2c0, 2.2);
            for (const s of [-1, 1]) f.spawnProj({ type: 'wave', mesh: 'wave', ground: true, x: 0.6 * s * f.facing, y: 0.3, vx: 0.24 * s, vy: 0, absDir: true, life: 32, r: 0.5, hit: { d: 10, a: 80, b: 50, k: 55 } });
          }
        },
      }),
      dspecAir: M({
        dur: 240, anim: 'dair', as: 7, ae: 239, landLag: 0,
        hits: [H(7, 239, 0, 0.0, 0.52, 9, -60, 25, 70)],
        tick(f, fr) {
          if (fr <= 6) { f.gravMul = 0.2; f.vy *= 0.7; f.noDrift = true; }
          else { f.vy = -0.45; f.gravMul = 0; f.vx *= 0.9; f.noDrift = true; }
        },
        onLand(f) { f.startMove('dspec', 21); return true; },
      }),
      grab: GRAB(6, 0.75, 0.45),
      dashgrab: Object.assign(GRAB(9, 0.95, 0.5, 38), { slide: true }),
      fthrow: M({ dur: 28, anim: 'throwF', throwAt: 12, throwHit: H(0, 0, 0, 0, 0, 8, 40, 55, 68) }),
      bthrow: M({ dur: 32, anim: 'throwB', throwAt: 16, throwHit: H(0, 0, 0, 0, 0, 10, 135, 60, 74) }),
      uthrow: M({ dur: 32, anim: 'throwU', throwAt: 14, throwHit: H(0, 0, 0, 0, 0, 9, 90, 70, 64, { fx: 'fire' }) }),
      dthrow: M({ dur: 30, anim: 'throwD', throwAt: 14, throwHit: H(0, 0, 0, 0, 0, 7, 78, 55, 45) }),
    },
  };

  KB.CHARS = { ataru, fura, mg, siko };
  KB.CHAR_ORDER = ['ataru', 'fura', 'mg', 'siko'];
  for (const c of Object.values(KB.CHARS)) {
    for (const [k, v] of Object.entries(COMMON)) if (!c.moves[k]) c.moves[k] = v;
    for (const [k, v] of Object.entries(c.moves)) v.name = k;
  }
})(window.KB);
