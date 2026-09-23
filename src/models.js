// ============================================================
// models.js — 4キャラクターの3Dモデル（プリミティブの組み合わせ）
// モデルは +Z を正面、足元を原点として組み立てる
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;
  const TX = () => KB.tex;

  const std = (color, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0 }, o));
  function add(parent, geo, mat, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  const sph = (r, w = 28, h = 18) => new T.SphereGeometry(r, w, h);

  function makeRig(dims) {
    const root = new T.Group();
    const pivot = new T.Group();
    pivot.position.y = dims.cy;
    root.add(pivot);
    const model = new T.Group();
    model.position.y = -dims.cy;
    pivot.add(model);
    const rig = { root, pivot, model, dims, extras: {}, mats: [] };
    rig.joint = (x, y, z, parent = model) => {
      const g = new T.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    return rig;
  }

  function finalize(rig) {
    const set = new Set();
    rig.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => set.add(m));
      }
    });
    rig.mats = [...set].filter((m) => m.emissive);
    rig.mats.forEach((m) => { m.userData.baseEmissive = m.emissive.clone(); m.userData.baseEI = m.emissiveIntensity; });
    rig.rest = {};
    for (const k of ['armL', 'armR', 'legL', 'legR', 'head']) {
      if (rig[k]) rig.rest[k] = rig[k].rotation.clone();
    }
    // 発光（被弾フラッシュ・無敵点滅）
    rig.flashState = 0;
    rig.setFlash = (amt, color = 0xffffff) => {
      if (amt === rig.flashState && color === rig.flashColor) return;
      rig.flashState = amt; rig.flashColor = color;
      const c = new T.Color(color);
      for (const m of rig.mats) {
        if (amt <= 0) { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
        else { m.emissive.copy(m.userData.baseEmissive).lerp(c, Math.min(1, amt)); m.emissiveIntensity = Math.max(m.userData.baseEI, amt * 0.9); }
      }
    };
    rig.dispose = () => {
      rig.root.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); }
      });
      rig.mats.forEach((m) => KB.tex.disposeMaterial(m));
    };
    return rig;
  }

  // 球面上の点（three.js の SphereGeometry と同じ角度の取り方）
  function onSphere(r, phi, theta) {
    return new T.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
  }

  // ============================================================
  // ATARU — 緑黒の覆面神父
  // ============================================================
  function buildAtaru(pal) {
    const dims = { h: 2.0, hw: 0.45, cy: 1.0, headY: 1.58 };
    const rig = makeRig(dims);
    const M = rig.model;
    const robe = std(pal.robe, { roughness: 0.75 });
    const robeDark = std(new T.Color(pal.robe).multiplyScalar(0.6), { roughness: 0.8 });
    const skin = std(pal.skin, { roughness: 0.6 });
    const gold = std(pal.gold, { metalness: 0.85, roughness: 0.28 });
    const pearl = std('#eeeef4', { roughness: 0.22, metalness: 0.1 });
    const shoe = std('#111114', { roughness: 0.25 });

    // 脚
    for (const s of [-1, 1]) {
      const leg = rig.joint(s * 0.17, 0.45, 0);
      add(leg, new T.CylinderGeometry(0.09, 0.1, 0.36, 12), robeDark, 0, -0.18, 0);
      const sh = add(leg, sph(0.15), shoe, 0, -0.38, 0.05);
      sh.scale.set(1, 0.55, 1.45);
      rig[s < 0 ? 'legR' : 'legL'] = leg;
    }
    // 法衣（スカート部）
    const skirt = add(M, new T.CylinderGeometry(0.34, 0.54, 0.64, 28, 1, true), robe, 0, 0.42, 0);
    skirt.material.side = T.DoubleSide;
    rig.extras.skirt = skirt;
    // 胴
    const torso = add(M, sph(0.4, 28, 18), robe, 0, 0.86, 0);
    torso.scale.set(1, 0.72, 0.85);
    const belt = add(M, new T.TorusGeometry(0.36, 0.035, 8, 32), robeDark, 0, 0.72, 0);
    belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.86, 1);
    // 襟
    add(M, new T.CylinderGeometry(0.2, 0.25, 0.1, 20), robe, 0, 1.08, 0);
    add(M, new T.BoxGeometry(0.13, 0.07, 0.04), std('#f4f4f4', { roughness: 0.4 }), 0, 1.09, 0.215);
    // ロザリオ（ビーズ）
    const bead = sph(0.024, 10, 8);
    for (let i = 0; i <= 18; i++) {
      const t = (i / 18) * 2 - 1;
      add(M, bead, pearl, 0.26 * t, 0.84 + 0.23 * t * t, 0.35 - 0.13 * t * t);
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.15 + (i / 11) * 0.7);
      add(M, bead, pearl, Math.cos(a) * 0.23, 1.1, -Math.sin(a) * 0.2);
    }
    // 十字架
    const cross = new T.Group();
    cross.position.set(0, 0.74, 0.38);
    M.add(cross);
    add(cross, new T.BoxGeometry(0.06, 0.24, 0.035), gold, 0, 0, 0);
    add(cross, new T.BoxGeometry(0.19, 0.055, 0.035), gold, 0, 0.04, 0);
    for (const [x, y] of [[0, 0.13], [0, -0.13], [0.105, 0.04], [-0.105, 0.04]]) add(cross, sph(0.032, 10, 8), gold, x, y, 0);
    rig.extras.cross = cross;

    // 腕
    for (const s of [-1, 1]) {
      const arm = rig.joint(s * 0.4, 1.0, 0);
      add(arm, new T.CylinderGeometry(0.1, 0.14, 0.36, 14), robe, 0, -0.18, 0);
      add(arm, new T.CylinderGeometry(0.155, 0.155, 0.07, 14), robeDark, 0, -0.36, 0);
      add(arm, sph(0.13), skin, 0, -0.46, 0.01);
      arm.rotation.z = s * 0.28;
      rig[s < 0 ? 'armR' : 'armL'] = arm;
    }
    // 頭（覆面）
    const head = rig.joint(0, 1.12, 0);
    rig.head = head;
    const maskMat = std('#ffffff', { map: TX().ataruMask(pal), roughness: 0.32, metalness: 0.05 });
    const hm = add(head, new T.SphereGeometry(0.47, 48, 32), maskMat, 0, 0.47, 0);
    hm.scale.set(1, 1.08, 0.98);
    for (const s of [-1, 1]) {
      const ear = add(head, sph(0.09, 14, 10), skin, s * 0.46, 0.42, -0.02);
      ear.scale.set(0.55, 1, 0.8);
    }
    // ツノ（ヒレ状）
    const sh = new T.Shape();
    sh.moveTo(0.14, 0);
    sh.quadraticCurveTo(0.13, 0.28, 0.03, 0.52);
    sh.quadraticCurveTo(-0.07, 0.22, -0.32, 0);
    sh.lineTo(0.14, 0);
    const fg = new T.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 });
    fg.rotateY(-Math.PI / 2);
    fg.translate(0.035, 0, 0);
    const hornMat = std(pal.a, { roughness: 0.3 });
    const horn = add(head, fg, hornMat, 0, 0.92, 0.02);
    horn.rotation.x = -0.12;
    return finalize(rig);
  }

  // ============================================================
  // FURA — 氷の妖精
  // ============================================================
  function buildFura(pal) {
    const dims = { h: 1.75, hw: 0.4, cy: 0.9, headY: 1.42 };
    const rig = makeRig(dims);
    const M = rig.model;
    const skin = std(pal.skin, { roughness: 0.6 });
    const dressMat = std('#ffffff', { map: TX().furaDress(pal), roughness: 0.6, side: T.DoubleSide });
    const dressPlain = std(pal.dress, { roughness: 0.55 });
    const white = std('#f6f8ff', { roughness: 0.75 });
    const hair = std(pal.hair, { roughness: 0.5 });
    const bowMat = std(pal.bow, { roughness: 0.3, metalness: 0.05 });
    const boot = std(pal.boot, { roughness: 0.35 });
    const red = std('#d8263a', { roughness: 0.4 });

    for (const s of [-1, 1]) {
      const leg = rig.joint(s * 0.12, 0.3, 0);
      add(leg, new T.CylinderGeometry(0.085, 0.095, 0.26, 14), boot, 0, -0.15, 0);
      const f = add(leg, sph(0.1, 14, 10), boot, 0, -0.27, 0.02);
      f.scale.set(1, 0.6, 1.2);
      rig[s < 0 ? 'legR' : 'legL'] = leg;
    }
    add(M, new T.CylinderGeometry(0.26, 0.47, 0.55, 32, 1, true), dressMat, 0, 0.5, 0);
    const bod = add(M, sph(0.27), dressPlain, 0, 0.8, 0);
    bod.scale.set(1, 0.9, 0.85);
    for (const s of [-1, 1]) {
      const c = add(M, sph(0.09, 14, 10), white, s * 0.08, 0.98, 0.17);
      c.scale.set(1.1, 0.45, 0.7);
      const b = add(M, new T.ConeGeometry(0.045, 0.1, 10), red, s * 0.045, 0.96, 0.23);
      b.rotation.z = s * Math.PI / 2;
      const tl = add(M, new T.BoxGeometry(0.03, 0.1, 0.015), red, s * 0.025, 0.9, 0.235);
      tl.rotation.z = s * 0.25;
    }
    add(M, sph(0.03, 10, 8), red, 0, 0.96, 0.235);
    for (const s of [-1, 1]) {
      const arm = rig.joint(s * 0.28, 0.9, 0);
      add(arm, sph(0.12, 16, 12), white, 0, -0.04, 0);
      add(arm, new T.CylinderGeometry(0.05, 0.05, 0.2, 10), skin, 0, -0.17, 0);
      add(arm, sph(0.07, 12, 10), skin, 0, -0.29, 0);
      arm.rotation.z = s * 0.45;
      rig[s < 0 ? 'armR' : 'armL'] = arm;
    }
    // 頭
    const head = rig.joint(0, 1.0, 0);
    rig.head = head;
    const HC = 0.4; // 頭の中心（head ローカル）
    add(head, new T.SphereGeometry(0.42, 48, 32), std('#ffffff', { map: TX().furaFace(pal), roughness: 0.6 }), 0, HC, 0);
    // 髪：頭頂キャップ＋後ろ髪＋前髪
    add(head, new T.SphereGeometry(0.455, 40, 16, 0, Math.PI * 2, 0, 1.08), hair, 0, HC, 0);
    const back = add(head, new T.SphereGeometry(0.475, 40, 24, Math.PI - 0.55, Math.PI + 1.1, 0, 2.3), hair, 0, HC, 0);
    back.material = hair.clone(); back.material.side = T.DoubleSide;
    back.scale.set(1.06, 1, 1.06);
    const strand = (len, rad) => { const g = new T.ConeGeometry(rad, len, 7); g.translate(0, -len / 2, 0); return g; };
    const down = new T.Vector3(0, -1, 0);
    const placeStrand = (phi, theta, len, rad, out = 0.1) => {
      const p = onSphere(0.44, phi, theta);
      const t = new T.Vector3(-Math.cos(phi) * Math.cos(theta), -Math.sin(theta), Math.sin(phi) * Math.cos(theta)).normalize();
      const n = p.clone().normalize();
      t.addScaledVector(n, out).normalize();
      const m = add(head, strand(len, rad), hair, p.x, p.y + HC, p.z);
      m.quaternion.setFromUnitVectors(down, t);
    };
    const F = Math.PI / 2; // 正面の phi
    for (let i = -3; i <= 3; i++) placeStrand(F + i * 0.24, 0.95, 0.26 - Math.abs(i) * 0.015, 0.085, 0.18);
    for (const s of [-1, 1]) {
      placeStrand(F + s * 1.1, 1.0, 0.5, 0.1, 0.12);
      placeStrand(F + s * 1.4, 1.05, 0.52, 0.11, 0.1);
    }
    // 大きなリボン
    const bow = new T.Group();
    bow.position.set(0, HC + 0.36, -0.12);
    bow.rotation.x = -0.35;
    head.add(bow);
    for (const s of [-1, 1]) {
      const lobe = add(bow, sph(0.2, 20, 14), bowMat, s * 0.21, 0.08, 0);
      lobe.scale.set(1.05, 0.72, 0.42);
      lobe.rotation.z = s * -0.35;
    }
    add(bow, sph(0.08, 14, 10), bowMat, 0, 0.02, 0.02);
    rig.extras.bow = bow;
    // 氷の羽
    const wingMat = new T.MeshPhysicalMaterial({
      color: pal.wing, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72,
      emissive: new T.Color(pal.wing).multiplyScalar(0.55), emissiveIntensity: 0.55, clearcoat: 1, flatShading: true,
    });
    const wings = new T.Group();
    wings.position.set(0, 0.92, -0.2);
    M.add(wings);
    const wingParts = [];
    for (const s of [-1, 1]) {
      const side = new T.Group();
      wings.add(side);
      [28, -4, -36].forEach((deg, k) => {
        const a = KB.deg(deg);
        const len = k === 1 ? 0.52 : 0.44;
        const cr = add(side, new T.OctahedronGeometry(1, 0), wingMat, s * Math.cos(a) * (len * 0.95), Math.sin(a) * len * 0.95, -0.02 * k);
        cr.scale.set(0.12, len, 0.045);
        cr.rotation.z = s * (a - Math.PI / 2);
        cr.castShadow = false;
      });
      wingParts.push(side);
    }
    rig.extras.wings = wingParts;
    return finalize(rig);
  }

  // ============================================================
  // MG — 法被を着た丸い猫
  // ============================================================
  function buildMG(pal) {
    const dims = { h: 1.8, hw: 0.66, cy: 0.9, headY: 1.1 };
    const rig = makeRig(dims);
    const M = rig.model;
    const fur = new T.MeshPhysicalMaterial({ color: '#ffffff', map: TX().mgFur(pal), roughness: 0.92, sheen: 1, sheenRoughness: 0.45, sheenColor: new T.Color('#ffffff') });
    const furPlain = new T.MeshPhysicalMaterial({ color: pal.fur, roughness: 0.92, sheen: 1, sheenRoughness: 0.5, sheenColor: new T.Color('#ffffff') });
    const white = new T.MeshPhysicalMaterial({ color: pal.belly, roughness: 0.9, sheen: 1, sheenColor: new T.Color('#ffffff') });
    const black = std('#141416', { roughness: 0.12 });
    const pink = std('#f2a5b0', { roughness: 0.7 });
    const coatTex = TX().happi(pal);
    const coat = std('#ffffff', { map: coatTex, roughness: 0.82, side: T.DoubleSide });
    const trim = std('#1b1b1e', { roughness: 0.8 });
    const ropeTex = TX().rope(pal.rope[0], pal.rope[1]).clone();
    ropeTex.wrapS = T.RepeatWrapping; ropeTex.repeat.set(14, 1); ropeTex.needsUpdate = true;
    const rope = std('#ffffff', { map: ropeTex, roughness: 0.7 });

    for (const s of [-1, 1]) {
      const leg = rig.joint(s * 0.3, 0.3, 0);
      add(leg, new T.CylinderGeometry(0.14, 0.15, 0.2, 14), furPlain, 0, -0.1, 0);
      const f = add(leg, sph(0.15, 16, 12), white, 0, -0.22, 0.05);
      f.scale.set(1, 0.6, 1.2);
      rig[s < 0 ? 'legR' : 'legL'] = leg;
    }
    // 本体（頭と胴が一体）
    const blob = rig.joint(0, 0.25, 0);
    rig.head = blob;
    const BC = 0.73;
    const body = add(blob, new T.SphereGeometry(0.8, 48, 32), fur, 0, BC, 0);
    body.scale.set(1, 0.98, 0.88);
    // 耳
    for (const s of [-1, 1]) {
      const e = add(blob, new T.ConeGeometry(0.2, 0.36, 18), furPlain, s * 0.43, BC + 0.66, -0.02);
      e.rotation.z = -s * 0.42;
      const ei = add(blob, new T.ConeGeometry(0.12, 0.24, 14), pink, s * 0.425, BC + 0.63, 0.06);
      ei.rotation.z = -s * 0.42;
      ei.scale.z = 0.5;
    }
    // 顔
    for (const s of [-1, 1]) {
      add(blob, sph(0.075, 18, 14), black, s * 0.27, BC + 0.2, 0.62);
      const hl = add(blob, sph(0.022, 8, 6), std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), s * 0.27 - 0.022, BC + 0.23, 0.69);
      hl.castShadow = false;
      const mz = add(blob, sph(0.11, 18, 14), white, s * 0.085, BC + 0.03, 0.66);
      mz.scale.set(1, 0.85, 0.7);
      for (let k = 0; k < 3; k++) {
        const w = add(blob, new T.CylinderGeometry(0.005, 0.005, 0.32, 4), std('#ffffff', { roughness: 0.5 }), s * 0.3, BC + 0.06 - k * 0.04, 0.6);
        w.rotation.z = Math.PI / 2 + s * (k - 1) * 0.12;
        w.rotation.y = -s * 0.35;
        w.castShadow = false;
      }
    }
    const nose = add(blob, sph(0.05, 12, 10), black, 0, BC + 0.1, 0.71);
    nose.scale.set(1.3, 0.8, 0.8);
    add(blob, sph(0.07, 12, 10), white, 0, BC - 0.06, 0.65);
    // はちまき（ねじり鉢巻き）
    const band = add(blob, new T.TorusGeometry(0.58, 0.055, 12, 64), rope, 0, BC + 0.52, 0.0);
    band.rotation.x = Math.PI / 2 + 0.12;
    band.scale.set(1, 0.9, 1);
    const knot = new T.Group();
    knot.position.set(-0.52, BC + 0.6, 0.12);
    blob.add(knot);
    for (const [x, y, rz] of [[-0.05, 0.02, 0.6], [0.05, 0.04, -0.4]]) {
      const l = add(knot, new T.TorusGeometry(0.07, 0.035, 8, 16), rope, x, y, 0);
      l.rotation.set(0.3, 0.9, rz);
    }
    for (const [x, rz] of [[-0.11, 1.15], [-0.03, 0.55]]) {
      const tl = add(knot, new T.CylinderGeometry(0.048, 0.036, 0.15, 8), rope, x, 0.08, 0.02);
      tl.rotation.z = rz;
    }
    // 法被
    const gap = 1.15;
    const cg = new T.CylinderGeometry(0.85, 0.92, 0.62, 48, 1, true, gap / 2, Math.PI * 2 - gap);
    const coatM = add(blob, cg, coat, 0, 0.42, 0);
    coatM.scale.z = 0.9;
    const topTrim = add(blob, new T.TorusGeometry(0.85, 0.04, 8, 48, Math.PI * 2 - gap), trim, 0, 0.73, 0);
    topTrim.rotation.set(Math.PI / 2, 0, Math.PI / 2 + gap / 2);
    topTrim.scale.set(1, 0.9, 1);
    for (const s of [-1, 1]) {
      const a = s * gap / 2;
      const lp = add(blob, new T.BoxGeometry(0.11, 0.66, 0.05), trim, Math.sin(a) * 0.885, 0.42, Math.cos(a) * 0.885 * 0.9);
      lp.rotation.y = a;
      lp.rotation.z = s * 0.06;
    }
    // 帯
    const obiTex = TX().dots(pal.obi, 'rgba(40,40,44,.75)').clone();
    obiTex.wrapS = T.RepeatWrapping; obiTex.repeat.set(4, 1); obiTex.needsUpdate = true;
    const obi = std('#ffffff', { map: obiTex, roughness: 0.85 });
    const ob = add(blob, new T.CylinderGeometry(0.87, 0.89, 0.15, 48, 1, true), obi, 0, 0.32, 0);
    ob.scale.z = 0.9; ob.material.side = T.DoubleSide;
    for (const s of [-1, 1]) {
      const lo = add(blob, sph(0.13, 14, 10), obi, s * 0.14, 0.34, 0.8);
      lo.scale.set(1.2, 0.7, 0.5);
      lo.rotation.z = s * -0.3;
    }
    add(blob, sph(0.07, 12, 10), obi, 0, 0.33, 0.82);
    // 腕（袖）
    for (const s of [-1, 1]) {
      const arm = rig.joint(s * 0.76, 0.63, 0.02, blob);
      const sl = add(arm, new T.CylinderGeometry(0.16, 0.2, 0.28, 16, 1, true), std('#ffffff', { map: coatTex, roughness: 0.82, side: T.DoubleSide }), 0, -0.1, 0);
      sl.rotation.y = 0.3;
      add(arm, new T.TorusGeometry(0.18, 0.025, 6, 20), trim, 0, -0.23, 0).rotation.x = Math.PI / 2;
      add(arm, sph(0.14, 16, 12), furPlain, 0, -0.3, 0.02);
      add(arm, sph(0.09, 12, 10), white, 0, -0.38, 0.04);
      arm.rotation.z = s * 0.75;
      rig[s < 0 ? 'armR' : 'armL'] = arm;
    }
    // しっぽ
    const tail = rig.joint(0.1, 0.35, -0.7, blob);
    const tailMats = [furPlain, new T.MeshPhysicalMaterial({ color: pal.stripe, roughness: 0.92, sheen: 1, sheenColor: new T.Color('#ffffff') })];
    let prev = tail;
    const segs = [];
    for (let i = 0; i < 6; i++) {
      const seg = new T.Group();
      seg.position.set(0, i === 0 ? 0 : 0.13, 0);
      prev.add(seg);
      add(seg, sph(0.12 - i * 0.008, 14, 10), tailMats[i % 2], 0, 0.06, 0);
      seg.rotation.x = -0.35;
      seg.rotation.z = 0.12;
      segs.push(seg);
      prev = seg;
    }
    tail.rotation.x = -0.6;
    rig.extras.tail = segs;
    return finalize(rig);
  }

  // ============================================================
  // SIKO — 紅白ボーダーの筒
  // ============================================================
  function buildSiko(pal) {
    const dims = { h: 1.75, hw: 0.52, cy: 0.9, headY: 1.25 };
    const rig = makeRig(dims);
    const M = rig.model;
    const red = std(pal.a, { roughness: 0.42 });
    const bodyMat = std('#ffffff', { map: TX().sikoBody(pal), roughness: 0.42 });
    const inner = std(pal.inner, { roughness: 0.95, side: T.DoubleSide });

    for (const s of [-1, 1]) {
      const leg = rig.joint(s * 0.21, 0.3, 0);
      add(leg, new T.CapsuleGeometry(0.14, 0.12, 6, 14), red, 0, -0.15, 0);
      rig[s < 0 ? 'legR' : 'legL'] = leg;
    }
    // 胴体：回転体
    const key = [[0.0, 0.2], [0.26, 0.205], [0.42, 0.235], [0.52, 0.3], [0.575, 0.42], [0.595, 0.58], [0.595, 0.75], [0.585, 0.9],
      [0.565, 1.05], [0.535, 1.2], [0.495, 1.34], [0.45, 1.46], [0.405, 1.57], [0.36, 1.65], [0.325, 1.705], [0.3, 1.73], [0.28, 1.738]];
    const curve = new T.SplineCurve(key.map((p) => new T.Vector2(p[0], p[1])));
    const pts = curve.getPoints(60);
    const lg = new T.LatheGeometry(pts, 48);
    const uv = lg.attributes.uv, pos = lg.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) - 0.2) / (1.738 - 0.2));
    uv.needsUpdate = true;
    const bodyGroup = rig.joint(0, 0, 0);
    rig.head = bodyGroup; // SIKO は胴体全体が「頭」
    add(bodyGroup, lg, bodyMat, 0, 0, 0);
    const innerPts = [[0.27, 1.735], [0.255, 1.7], [0.245, 1.62], [0.235, 1.55], [0.0, 1.5]].map((p) => new T.Vector2(p[0], p[1]));
    add(bodyGroup, new T.LatheGeometry(innerPts, 40), inner, 0, 0, 0);
    // 目と口
    const eyeWhite = std('#ffffff', { roughness: 0.2 });
    const eyeBlack = std('#0d0d10', { roughness: 0.1 });
    for (const s of [-1, 1]) {
      const x = s * 0.19, y = 1.33;
      const z = Math.sqrt(Math.max(0, 0.5 * 0.5 - x * x)) + 0.005;
      const eg = new T.Group();
      eg.position.set(x, y, z);
      eg.rotation.y = Math.atan2(x, z);
      bodyGroup.add(eg);
      const w = add(eg, sph(0.1, 18, 14), eyeWhite, 0, 0, 0);
      w.scale.set(0.95, 1.12, 0.5);
      const p = add(eg, sph(0.062, 16, 12), eyeBlack, 0, 0.028, 0.03);
      p.scale.set(1, 1.1, 0.6);
      const hl = add(eg, sph(0.02, 8, 6), std('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), 0.02, 0.06, 0.07);
      hl.castShadow = false;
    }
    const mz = 0.555;
    const mouth = add(bodyGroup, new T.SphereGeometry(0.07, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#6a0f16', { roughness: 0.6, side: T.DoubleSide }), 0, 1.12, mz);
    mouth.scale.set(1.15, 1, 0.35);
    const tongue = add(bodyGroup, sph(0.04, 12, 8), std('#ff7d8e', { roughness: 0.6 }), 0, 1.085, mz + 0.012);
    tongue.scale.set(1, 0.5, 0.4);
    rig.extras.mouth = mouth;
    // 腕
    const armTex = TX().sikoArm(pal);
    const armMat = std('#ffffff', { map: armTex, roughness: 0.42 });
    for (const s of [-1, 1]) {
      const arm = rig.joint(s * 0.55, 1.0, 0);
      add(arm, new T.CapsuleGeometry(0.115, 0.24, 6, 14), armMat, 0, -0.2, 0);
      arm.rotation.z = s * 0.5;
      rig[s < 0 ? 'armR' : 'armL'] = arm;
    }
    return finalize(rig);
  }

  KB.MODELS = {
    ataru: {
      build: buildAtaru,
      palettes: [
        { a: '#3fa33a', b: '#17171b', robe: '#17171d', skin: '#f0b98d', gold: '#e2b23e' },
        { a: '#d83a34', b: '#17171b', robe: '#2b1234', skin: '#f0b98d', gold: '#d9dbe4' },
        { a: '#2f6fe0', b: '#f1f1f4', robe: '#1a2340', skin: '#e0a47c', gold: '#e2b23e' },
      ],
      portrait: { y: 1.52, dist: 2.1 },
    },
    fura: {
      build: buildFura,
      palettes: [
        { hair: '#8fd4f5', bow: '#2f5fd8', dress: '#2f63d6', skin: '#f7e3d6', wing: '#bfeeff', boot: '#2b54c8' },
        { hair: '#f7a8d2', bow: '#d8307a', dress: '#d8408a', skin: '#f7e3d6', wing: '#ffd6ef', boot: '#b0306a' },
        { hair: '#f4e38c', bow: '#e07b18', dress: '#e8902a', skin: '#f3dccb', wing: '#fff2b8', boot: '#b86414' },
      ],
      portrait: { y: 1.4, dist: 2.0 },
    },
    mg: {
      build: buildMG,
      palettes: [
        { fur: '#9c9ca0', stripe: '#5d5d63', belly: '#f4f2ee', coat: '#c9201f', obi: '#8c8c90', rope: ['#d42a2a', '#f6f1ea'] },
        { fur: '#e0a060', stripe: '#b0662a', belly: '#fff6e8', coat: '#2250b8', obi: '#e8d8b0', rope: ['#2a4ad4', '#f6f1ea'] },
        { fur: '#3a3a40', stripe: '#1c1c20', belly: '#f0eee8', coat: '#1f8a4a', obi: '#d8c070', rope: ['#e0b020', '#1a1a1a'] },
      ],
      portrait: { y: 1.2, dist: 2.6 },
    },
    siko: {
      build: buildSiko,
      palettes: [
        { a: '#d42525', b: '#f7f3ee', inner: '#4a0808' },
        { a: '#2560d4', b: '#f7f3ee', inner: '#081a4a' },
        { a: '#1f9a50', b: '#fff4c2', inner: '#08361c' },
      ],
      portrait: { y: 1.28, dist: 2.3 },
    },
  };

  KB.buildRig = (charId, variant = 0) => {
    const md = KB.MODELS[charId];
    const pal = md.palettes[variant % md.palettes.length];
    const rig = md.build(pal);
    rig.charId = charId;
    return rig;
  };

  // ------------------------------------------------------------
  // 顔アイコン（HUD やキャラ選択で使う画像）を 3D モデルから描画
  // ------------------------------------------------------------
  let pr = null;
  const pcache = new Map();
  KB.portrait = (charId, variant = 0, mode = 'head') => {
    const key = charId + variant + mode;
    if (pcache.has(key)) return pcache.get(key);
    const size = mode === 'head' ? 192 : 384;
    if (!pr) {
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const scene = new T.Scene();
      const pm = new T.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new THREE_ADDONS.RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.55;
      scene.add(new T.HemisphereLight(0xffffff, 0x445066, 1.3));
      const d = new T.DirectionalLight(0xffffff, 2.4);
      d.position.set(2, 4, 5);
      scene.add(d);
      const rim = new T.DirectionalLight(0x9fd0ff, 1.6);
      rim.position.set(-3, 2, -3);
      scene.add(rim);
      pr = { renderer, scene, cam: new T.PerspectiveCamera(28, 1, 0.1, 50) };
    }
    pr.renderer.setSize(size, size, false);
    const rig = KB.buildRig(charId, variant);
    const md = KB.MODELS[charId];
    rig.root.rotation.y = 0.38;
    pr.scene.add(rig.root);
    const cam = pr.cam;
    if (mode === 'head') {
      cam.position.set(0.55, md.portrait.y + 0.1, md.portrait.dist);
      cam.lookAt(0, md.portrait.y - 0.02, 0);
    } else {
      cam.position.set(0.9, 1.15, 4.6);
      cam.lookAt(0, 0.95, 0);
    }
    pr.renderer.setClearColor(0x000000, 0);
    pr.renderer.render(pr.scene, cam);
    const url = pr.renderer.domElement.toDataURL('image/png');
    pr.scene.remove(rig.root);
    rig.dispose();
    pcache.set(key, url);
    return url;
  };
})(window.KB);
