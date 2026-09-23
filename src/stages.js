// ============================================================
// stages.js — ステージ（当たり判定＋見た目＋背景演出）
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;

  // ---------------- 共通ヘルパー ----------------
  function mk(parent, geo, mat, x = 0, y = 0, z = 0, o = {}) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.cast) m.castShadow = true;
    if (o.recv !== false) m.receiveShadow = !!o.recv;
    parent.add(m);
    return m;
  }
  const std = (color, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.75 }, o));

  function skyDome(parent, o) {
    const mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new T.Color(o.top) }, mid: { value: new T.Color(o.mid) }, bot: { value: new T.Color(o.bot) },
        sunCol: { value: new T.Color(o.sun || 0xffffff) }, sunDir: { value: new T.Vector3(...(o.sunDir || [0.3, 0.1, -1])).normalize() },
        sunAmt: { value: o.sunAmt !== undefined ? o.sunAmt : 1 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 top, mid, bot, sunCol, sunDir; uniform float sunAmt; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h * 1.6, 0.0, 1.0), 0.7)) : mix(mid, bot, pow(clamp(-h * 4.0, 0.0, 1.0), 0.6));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * sunAmt * (pow(s, 900.0) * 2.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.15);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new T.Mesh(new T.SphereGeometry(400, 48, 24), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }

  function starField(parent, n = 1200, r = 380, minY = 0.05, size = 1.6, color = 0xffffff) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      let y = Math.abs(u) * (1 - minY) + minY;
      const rr = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(th) * rr * r; pos[i * 3 + 1] = y * r; pos[i * 3 + 2] = -Math.abs(Math.sin(th) * rr * r);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(g, new T.PointsMaterial({ color, size, sizeAttenuation: false, map: KB.tex.flake(), transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending }));
    p.renderOrder = -9;
    parent.add(p);
    return p;
  }

  function mountainLayer(parent, z, color, height, rough, seed, y0 = -20, width = 700) {
    const r = KB.tex.rng(seed);
    const sh = new T.Shape();
    const n = 90;
    sh.moveTo(-width / 2, y0 - 60);
    for (let i = 0; i <= n; i++) {
      const x = -width / 2 + (i / n) * width;
      const k = i / n;
      const y = y0 + height * (0.55 + 0.45 * Math.sin(k * 9.3 + seed) * Math.sin(k * 3.1 + seed * 2)) + (r() - 0.5) * rough;
      sh.lineTo(x, y);
    }
    sh.lineTo(width / 2, y0 - 60);
    const m = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color, fog: true }));
    m.position.z = z;
    parent.add(m);
    return m;
  }

  function glowSprite(parent, x, y, z, size, color, opacity = 1) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: KB.tex.glow(), color, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity }));
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
    parent.add(s);
    return s;
  }

  // 大量の発光点（提灯の光・町明かりなど）
  function glowPoints(parent, pts, size, color, atten = true) {
    const pos = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pm = new T.Points(g, new T.PointsMaterial({ color, size, sizeAttenuation: atten, map: KB.tex.glow(), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    parent.add(pm);
    return pm;
  }

  // 花火
  class Fireworks {
    constructor(parent) {
      this.parent = parent;
      this.bursts = [];
      this.timer = 60;
      this.mat = new T.PointsMaterial({ size: 3.2, map: KB.tex.glow(), vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    }
    launch() {
      const cx = KB.rand(-90, 90), cy = KB.rand(45, 95), cz = KB.rand(-230, -170);
      const n = KB.randi(90, 150);
      const pal = KB.pick([[1, 0.35, 0.3], [1, 0.8, 0.3], [0.4, 0.8, 1], [0.8, 0.45, 1], [0.4, 1, 0.55], [1, 0.55, 0.85]]);
      const pal2 = Math.random() < 0.5 ? [1, 1, 0.85] : pal;
      const g = new T.BufferGeometry();
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const vel = [];
      const sp = KB.rand(0.45, 0.8);
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
        const s = sp * (0.85 + Math.random() * 0.3);
        vel.push([Math.cos(th) * rr * s, u * s, Math.sin(th) * rr * s * 0.6]);
        pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz;
        const c = i % 3 === 0 ? pal2 : pal;
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      const pts = new T.Points(g, this.mat.clone());
      pts.frustumCulled = false;
      this.parent.add(pts);
      this.bursts.push({ pts, vel, t: 0, life: 110, base: col.slice() });
      KB.Audio.play('firework', 0.8);
    }
    update() {
      if (--this.timer <= 0) { this.launch(); if (Math.random() < 0.35) this.timer = 12; else this.timer = KB.randi(60, 150); }
      for (let i = this.bursts.length - 1; i >= 0; i--) {
        const b = this.bursts[i];
        b.t++;
        const pa = b.pts.geometry.attributes.position, ca = b.pts.geometry.attributes.color;
        for (let k = 0; k < b.vel.length; k++) {
          const v = b.vel[k];
          v[0] *= 0.965; v[1] = v[1] * 0.965 - 0.012; v[2] *= 0.965;
          pa.array[k * 3] += v[0]; pa.array[k * 3 + 1] += v[1]; pa.array[k * 3 + 2] += v[2];
        }
        const fade = Math.max(0, 1 - b.t / b.life);
        const tw = 0.7 + Math.random() * 0.3;
        for (let k = 0; k < ca.array.length; k++) ca.array[k] = b.base[k] * fade * (b.t > 60 ? tw : 1);
        pa.needsUpdate = true; ca.needsUpdate = true;
        if (b.t >= b.life) { this.parent.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); this.bursts.splice(i, 1); }
      }
    }
  }

  function makeStageBase(o) {
    // o: {solids, tops, plats, blast, cam, spawns, respawn}
    const tops = o.tops.map((t) => Object.assign({ plat: false, dx: 0, dy: 0 }, t));
    const plats = (o.plats || []).map((p) => Object.assign({ plat: true, dx: 0, dy: 0 }, p));
    const ledges = [];
    for (const t of tops) {
      if (t.ledges === false) continue;
      ledges.push({ x: t.x1, y: t.y, side: -1, surf: t, occ: null });
      ledges.push({ x: t.x2, y: t.y, side: 1, surf: t, occ: null });
    }
    return {
      solids: o.solids, tops, plats, ledges, surfaces: [...tops, ...plats],
      blast: o.blast, cam: o.cam, spawns: o.spawns, respawn: o.respawn,
    };
  }

  function lights(scene, o) {
    const g = new T.Group();
    const hemi = new T.HemisphereLight(o.sky, o.ground, o.hemi);
    g.add(hemi);
    const sun = new T.DirectionalLight(o.sunColor, o.sun);
    sun.position.set(...o.sunPos);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = KB.settings.quality !== 'low';
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 18; sc.bottom = -14; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    g.add(sun, sun.target);
    if (o.rim) {
      const rim = new T.DirectionalLight(o.rim, o.rimI || 1.2);
      rim.position.set(...(o.rimPos || [-10, 8, -14]));
      g.add(rim);
    }
    if (o.fill) {
      const fill = new T.DirectionalLight(o.fill, o.fillI || 0.6);
      fill.position.set(-12, 5, 16);
      g.add(fill);
    }
    scene.add(g);
    return g;
  }

  // ============================================================
  // ステージ1：夏祭り 神社境内
  // ============================================================
  function buildMatsuri(scene) {
    const root = new T.Group();
    scene.add(root);
    scene.fog = new T.Fog(0x2d2346, 45, 260);
    scene.background = new T.Color(0x1a1530);
    lights(root, { sky: 0x9a8ad8, ground: 0x4a2a20, hemi: 1.15, sunColor: 0xffc890, sun: 2.3, sunPos: [10, 22, 20], rim: 0x7a8cff, rimI: 1.4, fill: 0xff9a6a, fillI: 0.5 });
    skyDome(root, { top: 0x0f1238, mid: 0x6a3a78, bot: 0xff8a50, sun: 0xffb070, sunDir: [-0.35, 0.02, -1], sunAmt: 1.2 });
    starField(root, 900, 380, 0.25, 1.5);
    // 月
    glowSprite(root, 120, 150, -330, 70, 0xfff2d0, 0.55);
    const moon = new T.Mesh(new T.CircleGeometry(9, 40), new T.MeshBasicMaterial({ color: 0xfff6dc, fog: false }));
    moon.position.set(120, 150, -332);
    root.add(moon);
    // 山
    mountainLayer(root, -300, 0x3a2a55, 70, 10, 3, -10);
    mountainLayer(root, -240, 0x2a2044, 50, 8, 7, -16);
    mountainLayer(root, -170, 0x1e1834, 34, 6, 11, -22);
    // 町明かり
    const town = [];
    for (let i = 0; i < 500; i++) town.push([KB.rand(-220, 220), KB.rand(-26, -18), KB.rand(-160, -90)]);
    glowPoints(root, town, 1.4, 0xffc070);

    const woodTex = KB.tex.wood('#8a5a32').clone();
    woodTex.repeat.set(5, 1); woodTex.wrapS = woodTex.wrapT = T.RepeatWrapping; woodTex.needsUpdate = true;
    const wood = std(0xffffff, { map: woodTex, roughness: 0.62 });
    const darkWood = std(0x3a2418, { roughness: 0.8 });
    const vermilion = std(0xd8401c, { roughness: 0.45 });
    const stoneTex = KB.tex.stone('stoneA').clone();
    stoneTex.wrapS = stoneTex.wrapT = T.RepeatWrapping; stoneTex.repeat.set(4, 1); stoneTex.needsUpdate = true;
    const stone = std(0xffffff, { map: stoneTex, roughness: 0.92 });

    // --- メインステージ（神楽殿風の舞台＋石垣）
    const deck = mk(root, new T.BoxGeometry(18, 0.36, 5), wood, 0, -0.18, 0, { recv: true });
    mk(root, new T.BoxGeometry(18.3, 0.14, 5.3), vermilion, 0, -0.42, 0, { recv: true });
    mk(root, new T.BoxGeometry(17.6, 1.8, 4.6), darkWood, 0, -1.4, 0, { recv: true });
    for (let i = 0; i < 9; i++) {
      const x = -8.2 + i * 2.05;
      mk(root, new T.CylinderGeometry(0.2, 0.2, 1.8, 12), vermilion, x, -1.4, 2.35, { recv: true });
    }
    mk(root, new T.BoxGeometry(17.8, 0.22, 0.2), vermilion, 0, -2.2, 2.4);
    // しめ縄と紙垂
    const ropeTex = KB.tex.rope('#c9a86a', '#e8d4a0').clone();
    ropeTex.wrapS = T.RepeatWrapping; ropeTex.repeat.set(30, 1); ropeTex.needsUpdate = true;
    const ropePts = [];
    for (let i = 0; i <= 40; i++) { const k = i / 40; const x = -8.6 + k * 17.2; ropePts.push(new T.Vector3(x, -0.72 - Math.sin(k * Math.PI * 4) ** 2 * 0.25, 2.55)); }
    mk(root, new T.TubeGeometry(new T.CatmullRomCurve3(ropePts), 120, 0.13, 8), std(0xffffff, { map: ropeTex, roughness: 0.9 }));
    const shideMat = std(0xffffff, { roughness: 0.6, side: T.DoubleSide, emissive: 0x333333 });
    for (let i = 0; i < 8; i++) {
      const x = -7.5 + i * 2.15;
      const g = new T.Group(); g.position.set(x, -0.95, 2.62); root.add(g);
      for (let k = 0; k < 4; k++) { const p = mk(g, new T.PlaneGeometry(0.22, 0.2), shideMat, (k % 2) * 0.12 - 0.06, -k * 0.2, 0); p.rotation.z = (k % 2 ? 0.3 : -0.3); }
    }
    // 石垣（3段、当たり判定と一致）
    const t2 = mk(root, new T.BoxGeometry(13, 2.3, 4.2), stone, 0, -3.35, -0.1, { recv: true });
    const st3 = stoneTex.clone(); st3.repeat.set(2.2, 1); st3.needsUpdate = true;
    mk(root, new T.BoxGeometry(7, 2.0, 3.6), std(0xffffff, { map: st3, roughness: 0.92 }), 0, -5.5, -0.2, { recv: true });
    const cone = mk(root, new T.ConeGeometry(3.4, 5, 7), std(0x4a4540, { roughness: 1 }), 0, -8.9, -0.3);
    cone.rotation.x = Math.PI;
    t2.userData.noShadow = true;
    // 舞台四隅の提灯
    const lanternMatA = new T.MeshBasicMaterial({ map: KB.tex.lantern('#e8352b', '祭'), color: 0xffffff });
    const lanternGeo = new T.SphereGeometry(0.34, 16, 12);
    const capGeo = new T.CylinderGeometry(0.2, 0.2, 0.08, 12);
    const capMat = std(0x1a1a1a);
    const swingers = [];
    const hangLantern = (x, y, z, scale = 1, mat = lanternMatA) => {
      const g = new T.Group(); g.position.set(x, y, z); root.add(g);
      const l = mk(g, lanternGeo, mat, 0, -0.45 * scale, 0);
      l.scale.set(scale, scale * 1.3, scale);
      mk(g, capGeo, capMat, 0, -0.45 * scale + 0.42 * scale, 0).scale.setScalar(scale);
      mk(g, capGeo, capMat, 0, -0.45 * scale - 0.42 * scale, 0).scale.setScalar(scale);
      mk(g, new T.CylinderGeometry(0.01, 0.01, 0.1, 4), capMat, 0, -0.02, 0);
      const gl = glowSprite(g, 0, -0.45 * scale, 0.1, 2.2 * scale, 0xff9a40, 0.55);
      swingers.push({ g, ph: Math.random() * 6, gl });
      return g;
    };
    for (const x of [-8.6, 8.6]) hangLantern(x, -0.5, 2.55, 1.1);

    // --- すり抜け床（3枚）
    const platDefs = [{ x1: -6.3, x2: -2.4, y: 3.1 }, { x1: 2.4, x2: 6.3, y: 3.1 }, { x1: -1.95, x2: 1.95, y: 6.0 }];
    const woodP = woodTex.clone(); woodP.repeat.set(1.2, 1); woodP.needsUpdate = true;
    const platMat = std(0xffffff, { map: woodP, roughness: 0.6 });
    const goldTrim = std(0xe8b84a, { metalness: 0.7, roughness: 0.3, emissive: 0x5a3a08, emissiveIntensity: 0.6 });
    for (const p of platDefs) {
      const w = p.x2 - p.x1, cx = (p.x1 + p.x2) / 2;
      mk(root, new T.BoxGeometry(w, 0.26, 2.4), platMat, cx, p.y - 0.13, 0, { recv: true });
      mk(root, new T.BoxGeometry(w + 0.24, 0.2, 2.64), vermilion, cx, p.y - 0.36, 0, { recv: true });
      mk(root, new T.BoxGeometry(w + 0.26, 0.06, 0.06), goldTrim, cx, p.y - 0.02, 1.24);
      mk(root, new T.BoxGeometry(w + 0.3, 0.07, 0.08), goldTrim, cx, p.y - 0.46, 1.34);
      hangLantern(p.x1 + 0.4, p.y - 0.33, 0.9, 0.62);
      hangLantern(p.x2 - 0.4, p.y - 0.33, 0.9, 0.62);
    }

    // --- 背景：境内
    const pave = KB.tex.pavement().clone();
    pave.wrapS = pave.wrapT = T.RepeatWrapping; pave.repeat.set(30, 30); pave.needsUpdate = true;
    const groundM = mk(root, new T.PlaneGeometry(400, 300), std(0x5a4a44, { map: pave, roughness: 1 }), 0, -7.5, -140);
    groundM.rotation.x = -Math.PI / 2;
    // 参道（石畳）
    const path = mk(root, new T.PlaneGeometry(9, 70), std(0x8a8070, { map: pave, roughness: 0.9 }), 0, -7.45, -40);
    path.rotation.x = -Math.PI / 2;

    // 屋台
    const stalls = [
      ['たこ焼き', '#d42525', '#fff'], ['わたあめ', '#ff7ab8', '#fff'], ['金魚すくい', '#2f7ad8', '#fff'], ['りんご飴', '#c8102e', '#fff4c0'],
      ['やきそば', '#1f7a3a', '#fff'], ['かき氷', '#3aa8e8', '#fff'], ['お面', '#6a3ab8', '#fff'], ['射的', '#e0a020', '#2a1a00'],
    ];
    const stallGroup = new T.Group(); root.add(stallGroup);
    const warm = [];
    stalls.forEach((s, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const x = side * (14.5 + (row % 2) * 0.6), z = -8 - row * 8.5;
      const g = new T.Group(); g.position.set(x, -7.5, z); g.rotation.y = side * -0.95; stallGroup.add(g);
      mk(g, new T.BoxGeometry(4, 1.2, 1.6), std(0x7a5234, { map: KB.tex.wood('#7a5234') }), 0, 0.6, 0.6);
      for (const [px, pz] of [[-1.9, -0.6], [1.9, -0.6], [-1.9, 1.3], [1.9, 1.3]]) mk(g, new T.BoxGeometry(0.12, 3.1, 0.12), darkWood, px, 1.55, pz);
      const aw = mk(g, new T.BoxGeometry(4.6, 0.08, 2.6), std(0xffffff, { map: KB.tex.stripes(s[1], '#f4f0e8', 10) }), 0, 3.15, 0.35);
      aw.rotation.x = 0.16;
      const nr = mk(g, new T.PlaneGeometry(4.2, 0.8), new T.MeshStandardMaterial({ map: KB.tex.noren(s[1], s[2], s[0]), side: T.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.22, emissiveMap: KB.tex.noren(s[1], s[2], s[0]) }), 0, 2.72, 1.52);
      nr.rotation.x = -0.05;
      mk(g, new T.PlaneGeometry(3.6, 1.6), new T.MeshBasicMaterial({ color: 0xffb060 }), 0, 2.0, -0.55);
      for (let k = 0; k < 5; k++) mk(g, new T.SphereGeometry(0.16, 10, 8), std(KB.pick([0xff5a5a, 0xffe066, 0x66ccff, 0xff88cc, 0x88ff88])), -1.4 + k * 0.7, 1.35, 0.9);
      warm.push([x, -4.8, z + 0.6]);
    });
    glowPoints(root, warm, 7, 0xffa050);
    // 石灯籠
    const toroMat = std(0x8a857c, { roughness: 0.95 });
    const toroLight = new T.MeshBasicMaterial({ color: 0xffc070 });
    const toroPts = [];
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
      const x = side * 5.2, z = -14 - i * 6;
      const g = new T.Group(); g.position.set(x, -7.5, z); root.add(g);
      mk(g, new T.BoxGeometry(1, 0.3, 1), toroMat, 0, 0.15, 0);
      mk(g, new T.CylinderGeometry(0.22, 0.28, 1.4, 8), toroMat, 0, 1.0, 0);
      mk(g, new T.BoxGeometry(0.9, 0.2, 0.9), toroMat, 0, 1.8, 0);
      mk(g, new T.BoxGeometry(0.62, 0.55, 0.62), toroLight, 0, 2.18, 0);
      const rf = mk(g, new T.ConeGeometry(0.85, 0.55, 4), toroMat, 0, 2.72, 0); rf.rotation.y = Math.PI / 4;
      mk(g, new T.SphereGeometry(0.12, 8, 6), toroMat, 0, 3.05, 0);
      toroPts.push([x, -5.3, z]);
    }
    glowPoints(root, toroPts, 3.5, 0xffb060);

    // 鳥居
    const torii = new T.Group(); torii.position.set(0, -7.5, -44); root.add(torii);
    const tv = std(0xe24a1c, { roughness: 0.5 });
    const tb = std(0x1a1414, { roughness: 0.6 });
    for (const s of [-1, 1]) {
      const p = mk(torii, new T.CylinderGeometry(0.62, 0.72, 13, 20), tv, s * 6, 6.5, 0);
      p.rotation.z = s * 0.03;
      mk(torii, new T.CylinderGeometry(0.85, 0.85, 0.9, 20), tb, s * 6, 0.45, 0);
    }
    mk(torii, new T.BoxGeometry(15.5, 0.65, 0.7), tv, 0, 10.2, 0);
    mk(torii, new T.BoxGeometry(17, 0.8, 1.1), tv, 0, 12.4, 0);
    const kasagi = mk(torii, new T.BoxGeometry(19, 0.6, 1.4), tb, 0, 13.05, 0);
    for (const s of [-1, 1]) { const e = mk(torii, new T.BoxGeometry(2.4, 0.6, 1.4), tb, s * 10.3, 13.35, 0); e.rotation.z = s * 0.28; }
    mk(torii, new T.BoxGeometry(1.4, 2, 0.4), tb, 0, 11.3, 0.2);
    mk(torii, new T.BoxGeometry(1.1, 1.7, 0.1), std(0xd9a93a, { metalness: 0.6, roughness: 0.4 }), 0, 11.3, 0.45);
    kasagi.castShadow = false;

    // 拝殿
    const shrine = new T.Group(); shrine.position.set(0, -7.5, -68); root.add(shrine);
    mk(shrine, new T.BoxGeometry(24, 1.2, 14), std(0x7a746a, { map: KB.tex.stone('stoneB'), roughness: 0.95 }), 0, 0.6, 0);
    mk(shrine, new T.BoxGeometry(18, 5, 10), std(0x6a4028), 0, 3.7, 0);
    const shoji = new T.MeshBasicMaterial({ map: KB.tex.shoji(), color: 0xffd9a0 });
    for (let i = 0; i < 5; i++) mk(shrine, new T.PlaneGeometry(2.6, 3.4), shoji, -6.4 + i * 3.2, 3.6, 5.02);
    for (let i = 0; i < 6; i++) mk(shrine, new T.CylinderGeometry(0.3, 0.3, 5, 12), tv, -8.2 + i * 3.28, 3.7, 5.3);
    const roofShape = new T.Shape();
    roofShape.moveTo(-9.5, 0); roofShape.quadraticCurveTo(-4, 0.9, -0.6, 5.2); roofShape.lineTo(0.6, 5.2); roofShape.quadraticCurveTo(4, 0.9, 9.5, 0);
    roofShape.lineTo(9.2, -0.5); roofShape.quadraticCurveTo(4, 0.3, 0, 4.4); roofShape.quadraticCurveTo(-4, 0.3, -9.2, -0.5);
    const rg = new T.ExtrudeGeometry(roofShape, { depth: 24, bevelEnabled: false, curveSegments: 16 });
    rg.translate(0, 0, -12); rg.rotateY(Math.PI / 2);
    const roof = mk(shrine, rg, std(0x2e3a3a, { map: KB.tex.tiles('#3a4a4a'), roughness: 0.7 }), 0, 6.2, 0);
    roof.scale.set(1, 1, 1);
    mk(shrine, new T.BoxGeometry(24, 0.5, 0.6), std(0xd9a93a, { metalness: 0.7, roughness: 0.3 }), 0, 11.6, 0);
    glowSprite(shrine, 0, 3.6, 6, 26, 0xffa050, 0.45);

    // 提灯の列（参道の上空）
    const lanternInst = [];
    const lines = [];
    for (const z of [-36, -50]) lines.push({ a: [-11, 2.2, z], b: [11, 2.2, z], sag: 1.4 });
    for (const s of [-1, 1]) {
      lines.push({ a: [s * 10.5, -0.6, -5], b: [s * 10.5, -0.6, -24], sag: 1.1 });
      lines.push({ a: [s * 10.5, -0.6, -24], b: [s * 9, 0.4, -44], sag: 1.1 });
    }
    const wireMat = new T.LineBasicMaterial({ color: 0x2a1a10 });
    for (const L of lines) {
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        pts.push(new T.Vector3(KB.lerp(L.a[0], L.b[0], t), KB.lerp(L.a[1], L.b[1], t) - Math.sin(t * Math.PI) * L.sag, KB.lerp(L.a[2], L.b[2], t)));
      }
      root.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), wireMat));
      const n = Math.floor(pts[0].distanceTo(pts[24]) / 1.5);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        lanternInst.push([KB.lerp(L.a[0], L.b[0], t), KB.lerp(L.a[1], L.b[1], t) - Math.sin(t * Math.PI) * L.sag - 0.45, KB.lerp(L.a[2], L.b[2], t)]);
      }
    }
    const texes = [KB.tex.lantern('#e8352b', '祭'), KB.tex.lantern('#f4efe4', '奉'), KB.tex.lantern('#e8352b', '納')];
    const buckets = [[], [], []];
    lanternInst.forEach((p, i) => buckets[i % 3].push(p));
    const lGeo = new T.SphereGeometry(0.32, 14, 10);
    const dummy = new T.Object3D();
    buckets.forEach((b, bi) => {
      const im = new T.InstancedMesh(lGeo, new T.MeshBasicMaterial({ map: texes[bi], color: bi === 1 ? 0xffe6b0 : 0xffffff }), b.length);
      b.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.scale.set(1, 1.3, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      root.add(im);
    });
    glowPoints(root, lanternInst, 2.6, 0xff8a3a);

    // 杉の木
    const coneGeo = new T.ConeGeometry(1, 1, 9);
    const treeMat = std(0x1d3428, { roughness: 1 });
    const trunkMat = std(0x3a2618);
    const treeSpots = [];
    const rr = KB.tex.rng(77);
    for (let i = 0; i < 46; i++) {
      const side = i % 2 ? 1 : -1;
      treeSpots.push([side * (13 + rr() * 26), -7.5, -8 - rr() * 70, 7 + rr() * 8]);
    }
    for (let i = 0; i < 16; i++) treeSpots.push([-30 + i * 4 + rr() * 2, -7.5, -82 - rr() * 10, 10 + rr() * 6]);
    const tiers = 4;
    const im = new T.InstancedMesh(coneGeo, treeMat, treeSpots.length * tiers);
    let idx = 0;
    for (const [x, y, z, h] of treeSpots) {
      for (let k = 0; k < tiers; k++) {
        const r = (1 - k / tiers) * h * 0.26 + 0.4, hh = h * 0.36;
        dummy.position.set(x, y + h * 0.25 + k * h * 0.2 + hh / 2, z);
        dummy.scale.set(r, hh, r);
        dummy.rotation.set(0, rr() * 3, 0);
        dummy.updateMatrix();
        im.setMatrixAt(idx++, dummy.matrix);
      }
      mk(root, new T.CylinderGeometry(0.25, 0.35, h * 0.35, 6), trunkMat, x, y + h * 0.17, z);
    }
    root.add(im);

    // 蛍（ホタル）
    const flyN = 40;
    const flies = glowPoints(root, Array.from({ length: flyN }, () => [KB.rand(-16, 16), KB.rand(-4, 9), KB.rand(-12, 3)]), 0.5, 0xd8ff7a);
    const flyPh = Array.from({ length: flyN }, () => Math.random() * 100);

    const fw = new Fireworks(root);
    // 舞台近くの暖色ライト
    const pl = new T.PointLight(0xff9a50, 30, 22, 2);
    pl.position.set(0, 2.5, 5);
    root.add(pl);

    const S = makeStageBase({
      solids: [{ x1: -9, x2: 9, y1: -2.2, y2: 0 }, { x1: -6.5, x2: 6.5, y1: -4.5, y2: -2.2 }, { x1: -3.5, x2: 3.5, y1: -6.5, y2: -4.5 }],
      tops: [{ x1: -9, x2: 9, y: 0 }],
      plats: platDefs,
      blast: { l: -24, r: 24, t: 21, b: -13 },
      cam: { l: -19, r: 19, b: -7, t: 16 },
      spawns: [[-6.5, 0], [6.5, 0], [-2.2, 0], [2.2, 0]],
      respawn: { x: 0, y: 9.5 },
    });
    S.root = root;
    S.update = (fr) => {
      fw.update();
      for (const s of swingers) { s.g.rotation.z = Math.sin(fr * 0.03 + s.ph) * 0.06; s.gl.material.opacity = 0.5 + Math.sin(fr * 0.1 + s.ph) * 0.06; }
      const pa = flies.geometry.attributes.position;
      for (let i = 0; i < flyN; i++) {
        const p = flyPh[i] + fr * 0.01;
        pa.array[i * 3] += Math.sin(p * 1.3) * 0.01;
        pa.array[i * 3 + 1] += Math.cos(p * 1.7) * 0.008;
      }
      pa.needsUpdate = true;
      flies.material.opacity = 0.6 + Math.sin(fr * 0.05) * 0.3;
    };
    S.previewCam = { pos: [0, 4, 26], look: [0, 1.5, 0] };
    S.bloom = { strength: 0.55, threshold: 0.82, radius: 0.45 };
    return S;
  }

  // ============================================================
  // ステージ2：氷の湖
  // ============================================================
  function buildIce(scene) {
    const root = new T.Group();
    scene.add(root);
    scene.fog = new T.Fog(0x9ccbef, 90, 420);
    scene.background = new T.Color(0x7fb8ea);
    lights(root, { sky: 0xd8ecff, ground: 0x5a7290, hemi: 0.85, sunColor: 0xfff2e0, sun: 2.1, sunPos: [14, 26, 18], rim: 0x9fd0ff, rimI: 0.9, fill: 0xc0dcff, fillI: 0.25 });
    skyDome(root, { top: 0x1450b8, mid: 0x78b8ec, bot: 0xcfe8fa, sun: 0xfff0d0, sunDir: [0.4, 0.3, -1], sunAmt: 1.1 });
    // 雲
    const cloudMat = new T.SpriteMaterial({ map: KB.tex.smoke(), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.85, fog: false });
    const clouds = [];
    for (let i = 0; i < 24; i++) {
      const s = new T.Sprite(cloudMat);
      s.position.set(KB.rand(-260, 260), KB.rand(40, 110), KB.rand(-320, -220));
      const sc = KB.rand(50, 110);
      s.scale.set(sc * 1.8, sc, 1);
      root.add(s); clouds.push(s);
    }
    // 雪山
    const snowPeak = (x, z, h, w) => {
      const g = new T.ConeGeometry(w, h, 7);
      const m = mk(root, g, std(0xdfeaf8, { roughness: 0.9, flatShading: true }), x, -16 + h / 2, z);
      m.rotation.y = Math.random() * 3;
      const r = mk(root, new T.ConeGeometry(w * 1.02, h * 0.55, 7), std(0x4a6488, { roughness: 1, flatShading: true }), x, -16 + h * 0.27, z);
      r.rotation.y = m.rotation.y + 0.3;
    };
    const rng = KB.tex.rng(99);
    for (let i = 0; i < 16; i++) snowPeak(-200 + i * 27 + rng() * 10, -210 - rng() * 60, 50 + rng() * 60, 30 + rng() * 20);
    // 凍った湖
    const lake = mk(root, new T.PlaneGeometry(600, 400), new T.MeshStandardMaterial({ color: 0x6fb4e0, roughness: 0.15, metalness: 0.35, map: (() => { const t = KB.tex.ice().clone(); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(40, 30); t.needsUpdate = true; return t; })() }), 0, -16, -150);
    lake.rotation.x = -Math.PI / 2;
    // 岸辺の雪と木
    const shore = mk(root, new T.PlaneGeometry(600, 60), std(0xdce8f4, { map: KB.tex.snow(), roughness: 1 }), 0, -15.9, -180);
    shore.rotation.x = -Math.PI / 2;
    const coneGeo = new T.ConeGeometry(1, 1, 8);
    const pine = std(0x2a5a4a, { roughness: 1 });
    const snowCap = std(0xffffff, { roughness: 0.9 });
    const spots = [];
    for (let i = 0; i < 60; i++) spots.push([KB.rand(-160, 160), -16, KB.rand(-200, -165), KB.rand(6, 12)]);
    for (let i = 0; i < 20; i++) spots.push([(i % 2 ? 1 : -1) * KB.rand(38, 90), -16, KB.rand(-70, -130), KB.rand(7, 12)]);
    const im = new T.InstancedMesh(coneGeo, pine, spots.length * 3);
    const im2 = new T.InstancedMesh(coneGeo, snowCap, spots.length * 3);
    const dummy = new T.Object3D();
    let k = 0;
    for (const [x, y, z, h] of spots) {
      for (let t = 0; t < 3; t++) {
        const r = (1 - t / 3) * h * 0.3 + 0.4, hh = h * 0.42;
        dummy.position.set(x, y + h * 0.15 + t * h * 0.24 + hh / 2, z);
        dummy.scale.set(r, hh, r); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
        im.setMatrixAt(k, dummy.matrix);
        dummy.position.y += hh * 0.18; dummy.scale.set(r * 0.72, hh * 0.65, r * 0.72); dummy.updateMatrix();
        im2.setMatrixAt(k, dummy.matrix);
        k++;
      }
    }
    root.add(im, im2);

    // --- メインステージ：浮かぶ氷山
    const iceMat = new T.MeshPhysicalMaterial({ color: 0x6fc4ec, roughness: 0.1, metalness: 0.05, clearcoat: 1, transparent: true, opacity: 0.95, map: KB.tex.ice(), emissive: 0x0a3a60, emissiveIntensity: 0.4, flatShading: true });
    const snowTex = KB.tex.snow().clone(); snowTex.wrapS = snowTex.wrapT = T.RepeatWrapping; snowTex.repeat.set(6, 2); snowTex.needsUpdate = true;
    const snow = std(0xe4eef8, { map: snowTex, roughness: 0.9 });
    mk(root, new T.BoxGeometry(20, 0.45, 5.2), snow, 0, -0.2, 0, { recv: true });
    // 雪のふち（丸み）
    const lip = mk(root, new T.CylinderGeometry(0.28, 0.28, 20, 12), snow, 0, -0.25, 2.55, { recv: true });
    lip.rotation.z = Math.PI / 2;
    mk(root, new T.BoxGeometry(19.6, 2.4, 4.8), iceMat, 0, -1.6, 0, { recv: true });
    mk(root, new T.BoxGeometry(14, 2.6, 4.2), iceMat, 0, -4.1, -0.1);
    mk(root, new T.BoxGeometry(8, 2.2, 3.6), iceMat, 0, -6.5, -0.2);
    const tip = mk(root, new T.OctahedronGeometry(3.6, 0), iceMat, 0, -9.2, -0.3);
    tip.scale.set(1, 1.3, 0.7);
    // つらら
    for (let i = 0; i < 14; i++) {
      const x = -9 + i * 1.38 + KB.rand(-0.2, 0.2);
      const h = KB.rand(0.6, 1.6);
      const c = mk(root, new T.ConeGeometry(0.16, h, 5), iceMat, x, -2.8 - h / 2, 2.35);
      c.rotation.x = Math.PI;
    }
    // 結晶の飾り
    const crystals = [];
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const c = mk(root, new T.OctahedronGeometry(KB.rand(0.35, 0.8), 0), new T.MeshPhysicalMaterial({ color: 0xbfeaff, emissive: 0x3aa0e0, emissiveIntensity: 0.5, roughness: 0.05, transparent: true, opacity: 0.85, flatShading: true }), side * KB.rand(13, 24), KB.rand(-3, 13), KB.rand(-16, -8));
      c.scale.y = 1.8;
      crystals.push({ m: c, ph: Math.random() * 6, y0: c.position.y });
    }
    // --- 足場（2枚固定＋1枚移動）
    const slab = (w) => {
      const g = new T.Group();
      mk(g, new T.BoxGeometry(w, 0.26, 2.4), snow, 0, -0.13, 0, { recv: true });
      mk(g, new T.BoxGeometry(w - 0.2, 0.5, 2.2), iceMat, 0, -0.5, 0, { recv: true });
      for (let i = 0; i < 3; i++) { const c = mk(g, new T.ConeGeometry(0.12, 0.6, 5), iceMat, -w / 2 + 0.6 + i * (w - 1.2) / 2, -1.0, 0.9); c.rotation.x = Math.PI; }
      root.add(g);
      return g;
    };
    const platDefs = [{ x1: -7.2, x2: -3.6, y: 3.2 }, { x1: 3.6, x2: 7.2, y: 3.2 }];
    for (const p of platDefs) { const g = slab(p.x2 - p.x1); g.position.set((p.x1 + p.x2) / 2, p.y, 0); }
    const mw = 3.6;
    const mover = slab(mw);
    const mp = { x1: -mw / 2, x2: mw / 2, y: 6.3, cx: 0 };
    mover.position.set(0, mp.y, 0);

    // 雪
    const snowN = KB.settings.quality === 'low' ? 250 : 600;
    const spos = new Float32Array(snowN * 3);
    for (let i = 0; i < snowN; i++) { spos[i * 3] = KB.rand(-40, 40); spos[i * 3 + 1] = KB.rand(-12, 30); spos[i * 3 + 2] = KB.rand(-25, 12); }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(spos, 3));
    const snowPts = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.22, map: KB.tex.flake(), transparent: true, depthWrite: false }));
    root.add(snowPts);

    const S = makeStageBase({
      solids: [{ x1: -10, x2: 10, y1: -2.8, y2: 0 }, { x1: -7, x2: 7, y1: -5.4, y2: -2.8 }, { x1: -4, x2: 4, y1: -7.6, y2: -5.4 }],
      tops: [{ x1: -10, x2: 10, y: 0 }],
      plats: [...platDefs, mp],
      blast: { l: -25, r: 25, t: 21, b: -14 },
      cam: { l: -20, r: 20, b: -8, t: 16 },
      spawns: [[-7, 0], [7, 0], [-2.5, 0], [2.5, 0]],
      respawn: { x: 0, y: 10 },
    });
    const mpS = S.plats[2];
    S.root = root;
    S.update = (fr) => {
      const nx = Math.sin(fr * 0.0085) * 4.6;
      mpS.dx = nx - mpS.cx; mpS.cx = nx;
      mpS.x1 = nx - mw / 2; mpS.x2 = nx + mw / 2;
      mover.position.x = nx;
      for (const c of crystals) { c.m.rotation.y += 0.01; c.m.position.y = c.y0 + Math.sin(fr * 0.02 + c.ph) * 0.4; }
      const pa = sg.attributes.position.array;
      for (let i = 0; i < snowN; i++) {
        pa[i * 3 + 1] -= 0.03 + (i % 5) * 0.004;
        pa[i * 3] += Math.sin(fr * 0.01 + i) * 0.01;
        if (pa[i * 3 + 1] < -12) pa[i * 3 + 1] = 30;
      }
      sg.attributes.position.needsUpdate = true;
      for (const c of clouds) { c.position.x += 0.03; if (c.position.x > 280) c.position.x = -280; }
    };
    S.previewCam = { pos: [0, 5, 27], look: [0, 1.5, 0] };
    S.bloom = { strength: 0.22, threshold: 1.25, radius: 0.35 };
    return S;
  }

  // ============================================================
  // ステージ3：星降る終点
  // ============================================================
  function buildFinal(scene) {
    const root = new T.Group();
    scene.add(root);
    scene.fog = new T.Fog(0x0a0a22, 80, 400);
    scene.background = new T.Color(0x05051a);
    lights(root, { sky: 0x6a6ae0, ground: 0x201040, hemi: 0.9, sunColor: 0xdfe6ff, sun: 2.4, sunPos: [-8, 24, 20], rim: 0xff5ad8, rimI: 1.6, rimPos: [12, 6, -12], fill: 0x5ad8ff, fillI: 0.6 });
    skyDome(root, { top: 0x04041a, mid: 0x1a1048, bot: 0x3a1a5a, sun: 0x9a7aff, sunDir: [0, 0.15, -1], sunAmt: 0.8 });
    starField(root, 2200, 380, -0.3, 1.8);
    // 星雲
    const neb = [[0xff4ad8, -120, 60, 160], [0x4ab0ff, 100, 90, 180], [0x8a4aff, 0, 30, 220], [0x4affd0, -60, 120, 120]];
    for (const [c, x, y, s] of neb) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: KB.tex.smoke(), color: c, transparent: true, depthWrite: false, opacity: 0.22, blending: T.AdditiveBlending, fog: false }));
      sp.position.set(x, y, -330); sp.scale.set(s * 1.6, s, 1);
      root.add(sp);
    }
    // 惑星
    const planet = mk(root, new T.SphereGeometry(40, 48, 32), new T.MeshStandardMaterial({ color: 0x6a5ad8, roughness: 0.9, emissive: 0x201060, emissiveIntensity: 0.5, fog: false }), 110, 60, -280);
    const ring = mk(root, new T.RingGeometry(55, 80, 64), new T.MeshBasicMaterial({ color: 0xc8b8ff, side: T.DoubleSide, transparent: true, opacity: 0.35, fog: false }), 110, 60, -280);
    ring.rotation.set(1.2, 0.3, 0);
    // 浮かぶ岩
    const rocks = [];
    for (let i = 0; i < 16; i++) {
      const r = mk(root, new T.DodecahedronGeometry(KB.rand(0.6, 2.2), 0), std(0x3a3456, { roughness: 0.9, flatShading: true }), KB.rand(-40, 40), KB.rand(-14, 18), KB.rand(-40, -12));
      rocks.push({ m: r, ph: Math.random() * 6, y0: r.position.y, rv: KB.rand(-0.01, 0.01) });
    }
    // 舞台
    const top = std(0x46447a, { roughness: 0.3, metalness: 0.45 });
    const edgeMat = new T.MeshBasicMaterial({ color: 0x6af0ff });
    mk(root, new T.BoxGeometry(22, 0.5, 5.5), top, 0, -0.25, 0, { recv: true });
    mk(root, new T.BoxGeometry(22.1, 0.06, 0.08), edgeMat, 0, -0.03, 2.76);
    mk(root, new T.BoxGeometry(22.1, 0.06, 0.08), edgeMat, 0, -0.5, 2.76);
    // 床のグリッド模様
    const grid = new T.GridHelper(22, 22, 0x6a60c0, 0x3a3470);
    grid.scale.z = 5.5 / 22; grid.position.y = 0.005;
    grid.material.transparent = true; grid.material.opacity = 0.35;
    root.add(grid);
    const under = new T.ConeGeometry(11, 9, 4, 1);
    const um = mk(root, under, std(0x1a1834, { roughness: 0.4, metalness: 0.5, flatShading: true }), 0, -5, 0);
    um.rotation.x = Math.PI; um.rotation.y = Math.PI / 4; um.scale.z = 0.26;
    const core = mk(root, new T.OctahedronGeometry(1.2, 0), new T.MeshBasicMaterial({ color: 0x9af4ff }), 0, -8.2, 1.4);
    glowSprite(root, 0, -8.2, 1.6, 8, 0x6af0ff, 0.8);
    // オーロラ
    const auroraMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false,
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; uniform float t; void main(){ vUv = uv; vec3 p = position; p.y += sin(p.x * 0.03 + t) * 8.0; p.z += cos(p.x * 0.02 + t * 0.7) * 10.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float t; void main(){ float a = smoothstep(0.0, 0.3, vUv.y) * (1.0 - vUv.y); float w = 0.5 + 0.5 * sin(vUv.x * 40.0 + t * 2.0); vec3 c = mix(vec3(0.2,1.0,0.7), vec3(0.6,0.3,1.0), vUv.y); gl_FragColor = vec4(c, a * (0.35 + 0.25 * w)); }',
    });
    const aur = new T.Mesh(new T.PlaneGeometry(400, 50, 80, 1), auroraMat);
    aur.position.set(0, 70, -250);
    root.add(aur);

    const S = makeStageBase({
      solids: [{ x1: -11, x2: 11, y1: -0.5, y2: 0 }, { x1: -9, x2: 9, y1: -3, y2: -0.5 }, { x1: -5, x2: 5, y1: -6, y2: -3 }],
      tops: [{ x1: -11, x2: 11, y: 0 }],
      plats: [],
      blast: { l: -25, r: 25, t: 20, b: -13 },
      cam: { l: -20, r: 20, b: -7, t: 15 },
      spawns: [[-7, 0], [7, 0], [-2.5, 0], [2.5, 0]],
      respawn: { x: 0, y: 8 },
    });
    S.root = root;
    S.update = (fr) => {
      auroraMat.uniforms.t.value = fr * 0.01;
      core.rotation.y += 0.02;
      planet.rotation.y += 0.0005;
      for (const r of rocks) { r.m.position.y = r.y0 + Math.sin(fr * 0.01 + r.ph) * 0.8; r.m.rotation.x += r.rv; r.m.rotation.y += r.rv; }
    };
    S.previewCam = { pos: [0, 4, 27], look: [0, 1, 0] };
    S.bloom = { strength: 0.7, threshold: 0.78, radius: 0.5 };
    return S;
  }

  KB.STAGES = {
    matsuri: { id: 'matsuri', name: '夏祭り 神社境内', sub: '宵の祭囃子と花火', bgm: 'matsuri', build: buildMatsuri, thumb: ['#1b1f4a', '#6b3a6e', '#ff9a5a'] },
    ice: { id: 'ice', name: '氷の湖', sub: '動く氷の足場', bgm: 'ice', build: buildIce, thumb: ['#2f78d8', '#b8e0fa', '#eaf6ff'] },
    final: { id: 'final', name: '星降る終点', sub: '足場なしの真剣勝負', bgm: 'final', build: buildFinal, thumb: ['#04041a', '#1a1048', '#3a1a5a'] },
  };
  KB.STAGE_ORDER = ['matsuri', 'ice', 'final'];
})(window.KB);
