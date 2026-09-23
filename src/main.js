// ============================================================
// main.js — 起動・描画ループ・メニュー用の3Dシーン
// ============================================================
(function (KB) {
  'use strict';
  const T = THREE;
  const A = THREE_ADDONS;

  // メニュー画面で使う「動くだけのキャラ」
  class Puppet {
    constructor(scene, char, variant, slot) {
      this.def = KB.CHARS[char];
      this.dims = this.def.dims;
      this.rig = KB.buildRig(char, variant);
      this.slot = slot;
      this.state = 'idle'; this.sf = 0; this.facing = 1; this.vy = 0; this.ground = true; this.djumpT = 0;
      this.animPhase = 0; this.game = { frame: 0 }; this.move = null; this.mf = 0;
      this.yawOverride = 0.25;
      this.h = this.dims.h;
      scene.add(this.rig.root);
      this.scene = scene;
    }
    update(frame) {
      this.game.frame = frame; this.sf++;
      KB.Anim.update(this);
    }
    dispose() { this.scene.remove(this.rig.root); this.rig.dispose(); }
  }
  KB.Puppet = Puppet;

  // --- タイトル背景：祭りステージをゆっくり旋回
  class TitleView {
    constructor(app) {
      this.scene = new T.Scene();
      this.scene.environment = app.env; this.scene.environmentIntensity = 0.35;
      this.stage = KB.STAGES.matsuri.build(this.scene);
      this.camera = new T.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 1500);
      this.puppets = KB.CHAR_ORDER.map((c, i) => {
        const p = new Puppet(this.scene, c, 0, i);
        p.rig.root.position.set(-4.8 + i * 3.2, 0, 0.3);
        p.facing = i < 2 ? 1 : -1;
        p.yawOverride = (i - 1.5) * -0.25;
        return p;
      });
      this.frame = 0;
      this.fx = new KB.FX(this.scene);
    }
    update() {
      this.frame++;
      this.stage.update(this.frame);
      const t = this.frame * 0.0025;
      this.camera.position.set(Math.sin(t) * 6, 3.4 + Math.sin(t * 0.7) * 0.6, 17 + Math.cos(t) * 2);
      this.camera.lookAt(0, 2.6, 0);
      this.puppets.forEach((p) => p.update(this.frame));
      this.fx.update();
    }
    dispose() { this.puppets.forEach((p) => p.dispose()); }
  }

  // --- キャラ選択・リザルト用のショールーム
  class ShowroomView {
    constructor(app) {
      const s = (this.scene = new T.Scene());
      s.environment = app.env; s.environmentIntensity = 0.3;
      s.background = new T.Color(0x0c0e20);
      s.fog = new T.Fog(0x0c0e20, 18, 60);
      this.camera = new T.PerspectiveCamera(30, innerWidth / innerHeight, 0.3, 200);
      s.add(new T.HemisphereLight(0xbfc8ff, 0x302838, 0.85));
      const key = new T.DirectionalLight(0xfff0e0, 1.9);
      key.position.set(4, 9, 8); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -9, right: 9, top: 7, bottom: -3, near: 1, far: 30 });
      key.shadow.bias = -0.0005;
      s.add(key);
      const rim = new T.DirectionalLight(0x7aa0ff, 1.5); rim.position.set(-6, 5, -6); s.add(rim);
      const rim2 = new T.DirectionalLight(0xff8ab0, 1.2); rim2.position.set(6, 3, -5); s.add(rim2);
      // 床
      const floorTex = KB.tex.make('floorGlow', 512, 512, (g, w) => {
        const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        gr.addColorStop(0, '#3a3f78'); gr.addColorStop(0.55, '#1c1f42'); gr.addColorStop(1, '#0c0e20');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
        g.strokeStyle = 'rgba(140,160,255,.18)'; g.lineWidth = 2;
        for (let r = 40; r < w / 2; r += 36) { g.beginPath(); g.arc(w / 2, w / 2, r, 0, 7); g.stroke(); }
      });
      const floor = new T.Mesh(new T.CircleGeometry(16, 64), new T.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0.2 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
      s.add(floor);
      // 背景の光の柱
      const beamMat = new T.MeshBasicMaterial({ color: 0x5a6aff, transparent: true, opacity: 0.08, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const b = new T.Mesh(new T.CylinderGeometry(0.3, 1.6, 30, 16, 1, true), beamMat);
        b.position.set(-12 + i * 4, 10, -14 - (i % 2) * 4);
        s.add(b);
      }
      this.pedestals = [];
      this.slots = [null, null, null, null];
      this.mode = 'select';
      this.frame = 0;
      this.bloom = { strength: 0.4, threshold: 0.95, radius: 0.4 };
      this.fx = new KB.FX(s);
      this.dust = [];
      for (let i = 0; i < 60; i++) {
        const p = new T.Sprite(new T.SpriteMaterial({ map: KB.tex.glow(), color: 0x8a9aff, transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false }));
        p.position.set(KB.rand(-12, 12), KB.rand(0, 8), KB.rand(-10, 2));
        const sc = KB.rand(0.05, 0.18); p.scale.set(sc, sc, 1);
        s.add(p); this.dust.push(p);
      }
      this.spots = [];
      for (let i = 0; i < 4; i++) {
        const disc = new T.Mesh(new T.CircleGeometry(1.1, 40), new T.MeshBasicMaterial({ color: KB.PLAYER_COLORS_HEX[i], transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01;
        s.add(disc); this.spots.push(disc);
      }
    }
    // slots: [{char, variant, active}] 4つ
    setSlots(list) {
      list.forEach((d, i) => {
        const cur = this.slots[i];
        const want = d && d.active ? d.char + ':' + d.variant : null;
        if (cur && cur.key === want) return;
        if (cur) { cur.p.dispose(); this.slots[i] = null; }
        if (want) {
          const p = new Puppet(this.scene, d.char, d.variant, i);
          this.slots[i] = { p, key: want };
          p.state = 'victory';
          p.sf = 0;
          setTimeout(() => { if (this.slots[i] && this.slots[i].p === p) p.state = 'idle'; }, 900);
          this.slots[i].fresh = true;
        }
      });
      this.layout();
      this.slots.forEach((s, i) => { if (s && s.fresh) { s.fresh = false; this.fx.respawnHalo(s.p.rig.root.position.x, 1, KB.PLAYER_COLORS_HEX[i]); } });
    }
    layout() {
      const aspect = innerWidth / innerHeight;
      const span = Math.min(4.3, 1.55 * aspect + 1.2);
      this.slots.forEach((s, i) => {
        const x = (i - 1.5) * span * 0.95;
        this.spots[i].position.x = x;
        this.spots[i].visible = !!s && this.mode === 'select';
        if (s) { s.p.rig.root.position.set(x, 0, 0); }
      });
    }
    // リザルト配置
    setResults(res) {
      this.mode = 'result';
      this.slots.forEach((s) => s && s.p.dispose());
      this.slots = [null, null, null, null];
      res.forEach((r, i) => {
        const p = new Puppet(this.scene, r.char, r.variant, r.slot);
        const pos = [[-3.3, 0, 1.0], [-0.9, 0, -1.0], [0.9, 0, -2.0], [2.6, 0, -3.0]][i];
        p.rig.root.position.set(pos[0], pos[1], pos[2]);
        p.state = i === 0 ? 'victory' : 'clap';
        p.yawOverride = i === 0 ? 0.3 : -0.35;
        if (i === 0) p.rig.root.scale.setScalar(1.15);
        this.slots[i] = { p, key: 'r' };
      });
      this.spots.forEach((s) => (s.visible = false));
      this.confT = 0;
    }
    update() {
      this.frame++;
      if (this.mode === 'select') {
        this.camera.position.set(Math.sin(this.frame * 0.004) * 0.6, 2.0, 15.5);
        this.camera.lookAt(0, 0.95, 0);
      } else {
        this.camera.position.set(-1.6 + Math.sin(this.frame * 0.004) * 0.5, 2.4, 12.5);
        this.camera.lookAt(-0.2, 1.35, 0);
        if (this.frame % 50 === 1) this.fx.confetti(0, 6, 30);
      }
      this.slots.forEach((s) => s && s.p.update(this.frame));
      this.spots.forEach((s, i) => { s.material.opacity = 0.25 + Math.sin(this.frame * 0.05 + i) * 0.08; });
      for (const d of this.dust) { d.position.y += 0.004; if (d.position.y > 8) d.position.y = 0; }
      this.fx.update();
    }
    dispose() { this.slots.forEach((s) => s && s.p.dispose()); }
  }

  // --- ステージのプレビュー
  class StageView {
    constructor(app, id) {
      this.scene = new T.Scene();
      this.scene.environment = app.env; this.scene.environmentIntensity = 0.35;
      this.stage = KB.STAGES[id].build(this.scene);
      this.camera = new T.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 1500);
      this.frame = 0;
    }
    update() {
      this.frame++;
      this.stage.update(this.frame);
      const t = this.frame * 0.004;
      const pc = this.stage.previewCam;
      this.camera.position.set(pc.pos[0] + Math.sin(t) * 7, pc.pos[1] + 1 + Math.sin(t * 0.8), pc.pos[2] - 2 + Math.cos(t) * 2);
      this.camera.lookAt(pc.look[0], pc.look[1] + 1, pc.look[2]);
    }
    dispose() {}
  }

  const App = {
    view: null, match: null, paused: false,
    acc: 0, last: 0, frame: 0,
    stageViews: {},

    async boot() {
      const canvas = document.getElementById('gl');
      const r = (this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
      r.setPixelRatio(Math.min(devicePixelRatio, KB.settings.quality === 'high' ? 2 : 1));
      r.setSize(innerWidth, innerHeight);
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      r.toneMapping = T.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.0;
      r.outputColorSpace = T.SRGBColorSpace;
      const pm = new T.PMREMGenerator(r);
      this.env = pm.fromScene(new A.RoomEnvironment(), 0.04).texture;
      this.composer = new A.EffectComposer(r);
      this.renderPass = new A.RenderPass(new T.Scene(), new T.PerspectiveCamera());
      this.bloom = new A.UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.5, 0.45, 0.84);
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new A.OutputPass());
      this.applyQuality();
      KB.Input.init();
      window.addEventListener('resize', () => this.resize());

      // 日本語フォントを読み込んでからテクスチャを作る
      const bar = document.querySelector('#loading .load-bar i');
      try {
        await Promise.race([
          Promise.all([document.fonts.load('900 64px "Dela Gothic One"', '祭たこ焼き'), document.fonts.load('800 20px "M PLUS Rounded 1c"', 'あ')]),
          new Promise((res) => setTimeout(res, 2500)),
        ]);
      } catch (e) { /* フォントが無くても続行 */ }
      bar.style.width = '80%';
      await new Promise((res) => setTimeout(res, 30));
      // 顔アイコンを先に描いておく
      for (const c of KB.CHAR_ORDER) { KB.portrait(c, 0, 'head'); }
      bar.style.width = '92%';
      await new Promise((res) => setTimeout(res, 30));
      KB.UI.init(this);
      bar.style.width = '100%';
      const ld = document.getElementById('loading');
      ld.classList.add('fade');
      setTimeout(() => ld.remove(), 600);
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    },

    setBloom(b) {
      b = b || { strength: 0.45, threshold: 0.9, radius: 0.45 };
      this.bloom.strength = b.strength; this.bloom.threshold = b.threshold; this.bloom.radius = b.radius;
    },
    applyQuality() {
      const high = KB.settings.quality === 'high';
      this.bloom.enabled = high || KB.settings.quality === 'mid';
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : KB.settings.quality === 'mid' ? 1.5 : 1));
      this.renderer.shadowMap.enabled = KB.settings.quality !== 'low';
      this.resize();
    },
    resize() {
      const w = innerWidth, h = innerHeight;
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.bloom.setSize(w, h);
      if (this.view && this.view.camera) { this.view.camera.aspect = w / h; this.view.camera.updateProjectionMatrix(); }
      if (this.view && this.view.layout) this.view.layout();
      if (this.match) this.match.resize(w, h);
    },

    setView(v) {
      if (this.view && this.view !== v && this.view.dispose && !this.view.keep) this.view.dispose();
      this.view = v;
      if (v && v.camera) { v.camera.aspect = innerWidth / innerHeight; v.camera.updateProjectionMatrix(); }
    },
    titleView() {
      if (!this._title) { this._title = new TitleView(this); this._title.keep = true; }
      return this._title;
    },
    showroom() {
      if (!this._show) { this._show = new ShowroomView(this); this._show.keep = true; }
      return this._show;
    },
    stageView(id) {
      if (!this.stageViews[id]) { this.stageViews[id] = new StageView(this, id); this.stageViews[id].keep = true; }
      return this.stageViews[id];
    },

    startMatch(cfg) {
      if (this.match) { this.match.dispose(); this.match = null; }
      this.lastCfg = cfg;
      this.match = new KB.Match(this, cfg);
      this.match.scene.environment = this.env;
      this.match.scene.environmentIntensity = 0.35;
      // ポストエフェクトと同じ描画先でコンパイルする（同じシェーダーになるように）
      this.renderer.setRenderTarget(this.composer.renderTarget1);
      this.match.warmup(this.renderer);
      this.renderer.setRenderTarget(null);
      this.paused = false;
      this.view = null;
      this.acc = 0;
    },
    onMatchEnd(results) {
      const m = this.match;
      setTimeout(() => {
        if (this.match !== m) return;
        this.match.dispose();
        this.match = null;
        KB.UI.showResult(results);
      }, 100);
    },
    quitMatch() {
      if (this.match) { this.match.dispose(); this.match = null; }
      this.paused = false;
    },
    pause(on) {
      if (!this.match) return;
      this.paused = on;
      KB.UI.showPause(on);
    },

    loop(now) {
      requestAnimationFrame((t) => this.loop(t));
      let dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      KB.UI.tick();
      const m = this.match;
      if (m) {
        if (!this.paused) {
          this.acc += dt * m.timeScale;
          let n = 0;
          while (this.acc >= 1 / 60 && n < 5) { m.step(); this.acc -= 1 / 60; n++; if (this.match !== m) break; }
          if (n >= 5) this.acc = 0;
          // ポーズボタン
          if (this.match === m) for (const f of m.fighters) if (!f.isCPU && f.ctrl.pressed.start) { this.pause(true); break; }
        }
        if (this.match === m) {
          m.render();
          this.renderPass.scene = m.scene; this.renderPass.camera = m.camera;
          this.setBloom(m.stage.bloom);
        }
      } else if (this.view) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= 1 / 60 && n < 4) { this.view.update(); this.acc -= 1 / 60; n++; }
        if (n >= 4) this.acc = 0;
        this.renderPass.scene = this.view.scene; this.renderPass.camera = this.view.camera;
        this.setBloom(this.view.stage ? this.view.stage.bloom : this.view.bloom);
      }
      this.composer.render();
      KB.Input.endFrame();
    },
  };
  KB.App = App;
  KB.boot = () => App.boot().catch((e) => {
    console.error(e);
    const t = document.querySelector('#loading .load-text');
    if (t) t.textContent = 'エラー: ' + e.message;
  });
})(window.KB);
