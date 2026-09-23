// ============================================================
// effects.js — パーティクル・ヒットエフェクト・飛び道具のメッシュ
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;

  const FXCOL = {
    hit: [0xfff2a0, 0xffffff], fire: [0xff7a1a, 0xffd060], ice: [0x9fe6ff, 0xffffff],
    holy: [0xffe070, 0xffffff], steam: [0xffffff, 0xdddddd], elec: [0x9fd0ff, 0xffffff],
  };

  class FX {
    constructor(scene) {
      this.scene = scene;
      this.group = new T.Group();
      scene.add(this.group);
      this.parts = [];
      this.pool = [];
      this.meshes = [];
      this.tex = { glow: KB.tex.glow(), star: KB.tex.star(), smoke: KB.tex.smoke(), ring: KB.tex.ring(), streak: KB.tex.streak(), flake: KB.tex.flake(), shard: KB.tex.shard() };
      this.quality = KB.settings.quality;
    }
    dispose() {
      this.scene.remove(this.group);
      this.parts.length = 0;
    }

    // ---------- スプライトパーティクル ----------
    sprite(o) {
      if (this.parts.length > (this.quality === 'low' ? 250 : 600)) return null;
      let sp = this.pool.pop();
      if (!sp) {
        sp = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false }));
      }
      const m = sp.material;
      m.map = this.tex[o.tex || 'glow'];
      m.color.set(o.color !== undefined ? o.color : 0xffffff);
      m.blending = o.add === false ? T.NormalBlending : T.AdditiveBlending;
      m.opacity = o.alpha !== undefined ? o.alpha : 1;
      m.rotation = o.rot || 0;
      m.depthTest = o.depthTest !== false;
      m.needsUpdate = true;
      sp.position.set(o.x, o.y, o.z || 0.3);
      sp.scale.set(o.size, o.size * (o.aspect || 1), 1);
      sp.renderOrder = o.order || 5;
      this.group.add(sp);
      const p = {
        sp, life: o.life || 30, t: 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, grav: o.grav || 0, drag: o.drag !== undefined ? o.drag : 0.96,
        size0: o.size, size1: o.sizeEnd !== undefined ? o.sizeEnd : o.size, a0: m.opacity, rotV: o.rotV || 0, aspect: o.aspect || 1,
        fadeIn: o.fadeIn || 0,
      };
      this.parts.push(p);
      return p;
    }
    update() {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.t++;
        const k = p.t / p.life;
        if (k >= 1) { this.group.remove(p.sp); this.pool.push(p.sp); this.parts.splice(i, 1); continue; }
        p.vx *= p.drag; p.vy = p.vy * p.drag - p.grav; p.vz *= p.drag;
        p.sp.position.x += p.vx; p.sp.position.y += p.vy; p.sp.position.z += p.vz;
        const s = KB.lerp(p.size0, p.size1, KB.easeOut(k));
        p.sp.scale.set(s, s * p.aspect, 1);
        const fi = p.fadeIn ? Math.min(1, p.t / p.fadeIn) : 1;
        p.sp.material.opacity = p.a0 * (1 - k * k) * fi;
        p.sp.material.rotation += p.rotV;
      }
      for (let i = this.meshes.length - 1; i >= 0; i--) {
        const m = this.meshes[i];
        m.t++;
        if (m.update(m, m.t / m.life) === false || m.t >= m.life) {
          this.group.remove(m.obj);
          if (m.dispose) m.dispose();
          this.meshes.splice(i, 1);
        }
      }
    }
    addMesh(obj, life, update, dispose) {
      this.group.add(obj);
      this.meshes.push({ obj, life, t: 0, update, dispose });
    }

    // ---------- 組み合わせエフェクト ----------
    hit(x, y, power, fx = 'hit', dir = 1) {
      const cols = FXCOL[fx] || FXCOL.hit;
      const big = power > 0.55;
      this.sprite({ x, y, tex: 'glow', color: cols[1], size: 0.8 + power * 1.4, sizeEnd: 0.15, life: 9, alpha: 0.85 });
      this.sprite({ x, y, tex: 'star', color: cols[0], size: 0.7 + power * 1.1, sizeEnd: 1.1 + power * 1.6, life: 11, rot: Math.random() * 3, alpha: 0.9 });
      const n = 5 + Math.floor(power * 9);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.07 + Math.random() * 0.16 * (0.6 + power);
        this.sprite({ x, y, tex: 'streak', color: cols[i % 2], size: 0.4 + power * 0.7, aspect: 0.25, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 11 + Math.random() * 7, rot: a, drag: 0.88 });
      }
      this.ringFlat(x, y, cols[0], 0.3, 1.2 + power * 1.8, 14);
      if (fx === 'ice') this.shards(x, y, 6 + power * 8);
      if (fx === 'fire') for (let i = 0; i < 8; i++) this.sprite({ x: x + KB.rand(-0.3, 0.3), y: y + KB.rand(-0.3, 0.3), tex: 'smoke', color: KB.pick([0xff5a10, 0xffa020, 0xffd060]), size: 0.6, sizeEnd: 1.6, vy: 0.03, vx: KB.rand(-0.04, 0.04), life: 26 });
      if (fx === 'holy') for (let i = 0; i < 6; i++) this.sprite({ x, y, tex: 'star', color: 0xffe070, size: 0.5, sizeEnd: 0.1, vx: KB.rand(-0.15, 0.15), vy: KB.rand(0, 0.2), grav: 0.006, life: 34 });
      if (big) {
        this.sprite({ x, y, tex: 'ring', color: 0xffffff, size: 1, sizeEnd: 4 + power * 2, life: 16, alpha: 0.75 });
      }
    }
    ringFlat(x, y, color, s0, s1, life) {
      this.sprite({ x, y, tex: 'ring', color, size: s0, sizeEnd: s1, life, alpha: 0.85 });
    }
    dust(x, y, dir = 0, n = 4) {
      for (let i = 0; i < n; i++) {
        const vx = dir === 0 ? KB.rand(-0.08, 0.08) : dir * KB.rand(0.02, 0.09);
        this.sprite({ x: x + KB.rand(-0.2, 0.2), y: y + 0.1, z: KB.rand(0, 0.5), tex: 'smoke', color: 0xe8e0d0, add: false, alpha: 0.55, size: KB.rand(0.35, 0.6), sizeEnd: KB.rand(0.9, 1.4), vx, vy: KB.rand(0.005, 0.03), life: KB.randi(24, 36), drag: 0.92 });
      }
    }
    trail(f, color = 0xffffff) {
      this.sprite({ x: f.x + KB.rand(-0.2, 0.2), y: f.y + f.dims.cy * 0.9 + KB.rand(-0.3, 0.3), tex: 'glow', color, size: 0.7, sizeEnd: 0.1, life: 18 });
    }
    launchSmoke(x, y, color) {
      this.sprite({ x, y, z: 0.1, tex: 'smoke', color: 0xdad4e8, add: false, alpha: 0.55, size: 0.45, sizeEnd: 1.0, life: 26, drag: 0.9 });
      this.sprite({ x, y, z: 0.15, tex: 'glow', color, size: 0.5, sizeEnd: 0.15, life: 14, alpha: 0.8 });
    }
    shards(x, y, n = 6) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = KB.rand(0.04, 0.16);
        this.sprite({ x, y, tex: 'shard', color: 0xcff4ff, size: KB.rand(0.15, 0.32), aspect: 1.8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 0.03, grav: 0.006, life: KB.randi(22, 36), rot: a, rotV: KB.rand(-0.2, 0.2), drag: 0.97 });
      }
    }
    steam(x, y, vx, vy, n = 4) {
      for (let i = 0; i < n; i++) {
        this.sprite({ x: x + KB.rand(-0.12, 0.12), y, z: KB.rand(-0.1, 0.3), tex: 'smoke', color: 0xffffff, add: false, alpha: 0.75, size: KB.rand(0.3, 0.5), sizeEnd: KB.rand(1.0, 1.6), vx: vx + KB.rand(-0.02, 0.02), vy: vy + KB.rand(-0.02, 0.02), life: KB.randi(22, 34), drag: 0.93 });
      }
    }
    eruption(x, y, s = 1) {
      for (let i = 0; i < 3; i++) {
        this.sprite({ x: x + KB.rand(-0.15, 0.15), y, tex: 'smoke', color: KB.pick([0xff4a10, 0xff9a20, 0xffe070]), size: 0.5 * s, sizeEnd: 1.4 * s, vx: KB.rand(-0.02, 0.02), vy: KB.rand(0.12, 0.2) * s, life: 20, drag: 0.9 });
      }
      this.sprite({ x, y: y + 0.4 * s, tex: 'glow', color: 0xffa040, size: 1.6 * s, sizeEnd: 0.6, life: 8 });
    }
    iceBurst(x, y) {
      this.sprite({ x, y, tex: 'glow', color: 0x4ab8ff, size: 3.2, sizeEnd: 0.8, life: 14, alpha: 0.55 });
      this.sprite({ x, y, tex: 'ring', color: 0x9fe6ff, size: 0.5, sizeEnd: 4.2, life: 20, alpha: 0.8 });
      this.shards(x, y, 20);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.spike(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3, a, 1.2, 0xbfeeff, 22);
      }
    }
    shock(x, y, color = 0xffffff, size = 2.5) {
      const geo = new T.RingGeometry(0.7, 1, 40);
      const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
      const m = new T.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y + 0.05, 0);
      this.addMesh(m, 22, (o, k) => { const s = 0.3 + k * size; o.obj.scale.set(s, s, s); o.obj.material.opacity = 0.8 * (1 - k); }, () => { geo.dispose(); mat.dispose(); });
    }
    // 氷のトゲ（飛び出して消える）
    spike(x, y, ang, len, color, life = 26) {
      const geo = new T.ConeGeometry(0.16 * len, len, 5);
      geo.translate(0, len / 2, 0);
      const mat = new T.MeshPhysicalMaterial({ color: new T.Color(color).multiplyScalar(0.75), emissive: new T.Color(0x2a8ad0), emissiveIntensity: 0.45, roughness: 0.05, transparent: true, opacity: 0.85, flatShading: true, clearcoat: 1 });
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, 0.1);
      m.rotation.z = ang - Math.PI / 2;
      this.addMesh(m, life, (o, k) => {
        const g = k < 0.2 ? KB.easeOut(k / 0.2) : 1;
        o.obj.scale.set(g, g, g);
        if (k > 0.6) o.obj.material.opacity = 0.85 * (1 - (k - 0.6) / 0.4);
      }, () => { geo.dispose(); mat.dispose(); });
    }
    // 撃墜の光線
    koBlast(x, y, color, cx, cy) {
      const dx = cx - x, dy = cy - y;
      const ang = Math.atan2(dy, dx);
      const len = 20;
      const geo = new T.ConeGeometry(3.2, len, 24, 1, true);
      geo.translate(0, len / 2, 0);
      geo.rotateZ(-Math.PI / 2);
      const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, 0);
      m.rotation.z = ang;
      const inner = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
      inner.scale.set(0.8, 0.4, 0.4);
      m.add(inner);
      this.addMesh(m, 56, (o, k) => {
        const w = k < 0.12 ? KB.easeOut(k / 0.12) : 1 - KB.smooth((k - 0.12) / 0.88);
        o.obj.scale.set(0.6 + KB.easeOut(Math.min(1, k * 3)) * 0.6, Math.max(0.01, w), Math.max(0.01, w));
        o.obj.material.opacity = 0.7 * w; inner.material.opacity = 0.6 * w;
      }, () => { geo.dispose(); mat.dispose(); inner.material.dispose(); });
      for (let i = 0; i < 30; i++) {
        const a = ang + KB.rand(-0.6, 0.6), sp = KB.rand(0.15, 0.6);
        this.sprite({ x, y, tex: i % 3 ? 'streak' : 'star', color: i % 2 ? color : 0xffffff, size: KB.rand(0.8, 2.2), aspect: i % 3 ? 0.2 : 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: KB.randi(30, 50), rot: a, drag: 0.93 });
      }
      this.sprite({ x, y, tex: 'glow', color, size: 8, sizeEnd: 2, life: 22, alpha: 0.8 });
    }
    starKO(x, y) {
      this.sprite({ x, y, z: -20, tex: 'star', color: 0xffffff, size: 0.4, sizeEnd: 4, life: 40, depthTest: false });
      this.sprite({ x, y, z: -20, tex: 'glow', color: 0xfff2a0, size: 3, sizeEnd: 0.5, life: 40, depthTest: false });
    }
    chargeSpark(f) {
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        this.sprite({ x: f.x + Math.cos(a) * 0.8, y: f.y + f.dims.cy + Math.sin(a) * 0.8, tex: 'star', color: 0xfff2a0, size: 0.35, sizeEnd: 0.05, vx: -Math.cos(a) * 0.04, vy: -Math.sin(a) * 0.04, life: 16, drag: 1 });
      }
    }
    swipe(x, y, r, color) {
      this.sprite({ x, y, tex: 'glow', color, size: r * 2.2, sizeEnd: r * 1.2, life: 7, alpha: 0.5 });
    }
    respawnHalo(x, y, color) {
      this.sprite({ x, y, tex: 'ring', color, size: 0.5, sizeEnd: 4, life: 30 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        this.sprite({ x, y, tex: 'star', color: 0xffffff, size: 0.4, sizeEnd: 0.05, vx: Math.cos(a) * 0.12, vy: Math.sin(a) * 0.12, life: 30 });
      }
    }
    confetti(x, y, n = 40) {
      for (let i = 0; i < n; i++) {
        this.sprite({ x: x + KB.rand(-4, 4), y: y + KB.rand(0, 2), z: KB.rand(-1, 2), tex: 'shard', color: KB.pick([0xff4a4a, 0x4a9aff, 0x3ad17a, 0xffd23a, 0xff8ad8]), size: 0.18, aspect: 1.6, vx: KB.rand(-0.03, 0.03), vy: KB.rand(0.05, 0.15), grav: 0.004, rot: Math.random() * 6, rotV: KB.rand(-0.2, 0.2), life: KB.randi(80, 140), drag: 0.985, add: false });
      }
    }
  }
  KB.FX = FX;

  // ------------------------------------------------------------
  // 飛び道具のメッシュ
  // ------------------------------------------------------------
  KB.projMesh = (kind, owner) => {
    const g = new T.Group();
    const std = (c, o = {}) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.4 }, o));
    switch (kind) {
      case 'cross': {
        const m = std(0xffd24a, { metalness: 0.8, roughness: 0.25, emissive: 0xffb020, emissiveIntensity: 0.9 });
        const a = new T.Mesh(new T.BoxGeometry(0.18, 0.8, 0.1), m);
        const b = new T.Mesh(new T.BoxGeometry(0.56, 0.17, 0.1), m);
        b.position.y = 0.14;
        g.add(a, b);
        const glow = new T.Sprite(new T.SpriteMaterial({ map: KB.tex.glow(), color: 0xffd060, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
        glow.scale.set(1.4, 1.4, 1);
        g.add(glow);
        break;
      }
      case 'icicle': {
        const m = new T.MeshPhysicalMaterial({ color: 0xcff4ff, emissive: 0x6fd0ff, emissiveIntensity: 0.6, roughness: 0.05, transparent: true, opacity: 0.9, flatShading: true });
        const c = new T.Mesh(new T.ConeGeometry(0.1, 0.55, 5), m);
        c.rotation.z = -Math.PI / 2;
        g.add(c);
        break;
      }
      case 'takoyaki': {
        const ball = new T.Mesh(new T.SphereGeometry(0.26, 18, 14), std(0xc98a3a, { roughness: 0.8 }));
        const sauce = new T.Mesh(new T.SphereGeometry(0.265, 18, 10, 0, Math.PI * 2, 0, 1.2), std(0x5a2a10, { roughness: 0.3 }));
        const nori = new T.Mesh(new T.SphereGeometry(0.03, 6, 4), std(0x2a6a2a));
        nori.position.set(0.05, 0.25, 0.08);
        const mayo = new T.Mesh(new T.TorusGeometry(0.15, 0.025, 6, 16), std(0xfff4d8));
        mayo.rotation.x = Math.PI / 2; mayo.position.y = 0.2;
        g.add(ball, sauce, nori, mayo);
        const glow = new T.Sprite(new T.SpriteMaterial({ map: KB.tex.glow(), color: 0xff8a30, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.5 }));
        glow.scale.set(1.1, 1.1, 1);
        g.add(glow);
        break;
      }
      case 'ball': {
        const tex = KB.tex.stripes('#d42525', '#f7f3ee', 8, 'ballstripe');
        const m = new T.MeshStandardMaterial({ map: tex, roughness: 0.35 });
        const s = new T.Mesh(new T.SphereGeometry(0.32, 20, 16), m);
        s.rotation.z = Math.PI / 2;
        g.add(s);
        break;
      }
      case 'wave': {
        const m = new T.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
        const w = new T.Mesh(new T.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
        w.scale.set(1, 1.2, 0.7);
        g.add(w);
        const glow = new T.Sprite(new T.SpriteMaterial({ map: KB.tex.smoke(), color: 0xfff0d0, transparent: true, depthWrite: false, opacity: 0.8 }));
        glow.scale.set(1.4, 1.0, 1); glow.position.y = 0.2;
        g.add(glow);
        break;
      }
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  };
})(window.KB);
