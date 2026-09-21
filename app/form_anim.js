// LifeBase：フォームの動きを見せる簡易3Dアニメ（2026-09-20）
//
// 骨格は「関節の角度」だけで動く棒人間（横向きの平面内の動き）。実際の動画ほど正確では
// なく、「どの関節をどの順に動かすか」を確認する補助。主な種目だけを用意し、それ以外は
// フォームのコツ（文章）と動画リンクを使う。
//
// 角度（度）はすべて「絶対角」：
//   t   = 骨盤→肩（胴体）：0=真上、+は前へ倒れる、-90=後ろ向きに寝る
//   a1  = 太もも（股関節→膝）、a2 = すね（膝→足首）：0=真下、+は前（体の向き）へ
//   b1  = 上腕（肩→肘）、b2 = 前腕（肘→手首）：0=真下、+は前、180=真上
// 体は +x 方向（画面右）を向いている。
//
// 公開：FormAnim.has(name) / FormAnim.show(container, name) / FormAnim.hide()

(function (global) {
  "use strict";
  const D = Math.PI / 180;
  const L = { torso: 0.50, thigh: 0.42, shin: 0.42, ua: 0.30, fa: 0.27 };
  const dn = (a) => [Math.sin(a * D), -Math.cos(a * D)];   // 「真下=0」の方向ベクトル
  const up = (a) => [Math.sin(a * D), Math.cos(a * D)];    // 「真上=0」の方向ベクトル
  const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s];

  // 2関節（肩→肘→手首）のIK：手首を target に届かせる。bend=+1/-1 で肘の曲がる向きを選ぶ。
  // バーを担ぐ・腰に乗せる種目で、手とバーが離れて見えないようにするために使う。
  function solveArm(sh, target, bend) {
    const dx = target[0] - sh[0], dy = target[1] - sh[1];
    const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(L.ua - L.fa) + 0.01), L.ua + L.fa - 0.005);
    const base = Math.atan2(dy, dx);
    const cosA = (L.ua * L.ua + d * d - L.fa * L.fa) / (2 * L.ua * d);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA))) * bend;
    const el = [sh[0] + L.ua * Math.cos(base + alpha), sh[1] + L.ua * Math.sin(base + alpha)];
    return { el, wr: target };
  }

  function joints(q, ex) {
    const hip = [0, 0];
    const knee = add(hip, dn(q.a1), L.thigh);
    const ankle = add(knee, dn(q.a2), L.shin);
    const sh = add(hip, up(q.t), L.torso);
    if (ex && ex.grip && ex.grip.at) {
      const tg = ex.grip.at === "hip" ? hip : [sh[0] + ex.grip.off[0], sh[1] + ex.grip.off[1]];
      const { el, wr } = solveArm(sh, tg, ex.grip.bend || 1);
      return { hip, knee, ankle, sh, el, wr };
    }
    const el = add(sh, dn(q.b1), L.ua);
    const wr = add(el, dn(q.b2), L.fa);
    return { hip, knee, ankle, sh, el, wr };
  }
  const lerpQ = (A, B, k) => { const o = {}; for (const key in A) o[key] = A[key] + (B[key] - A[key]) * k; return o; };

  // 位置合わせ：mode
  //   ankle : 足首を x=0、足裏を床(y=0)に固定（立つ・しゃがむ系）
  //   root  : 骨盤を固定点に置く（寝る・座る系）
  //   hands : 手首を固定点に置く（懸垂）
  function place(ex, j) {
    let off;
    if (ex.mode === "root") off = ex.root;
    else if (ex.mode === "hands") off = [ex.hands[0] - j.wr[0], ex.hands[1] - j.wr[1]];
    else off = [-j.ankle[0], 0.08 - j.ankle[1]];
    const o = {};
    for (const k in j) o[k] = [j[k][0] + off[0], j[k][1] + off[1]];
    return o;
  }

  const A = (t, a1, a2, b1, b2) => ({ t, a1, a2, b1, b2 });

  // 種目データ：pose A → pose B を往復。labels = [A→Bの動作名, B→Aの動作名]
  const EX = {
    "スクワット": {
      mode: "ankle", cam: [0, 0.95, 4.0],
      A: A(4, 2, -2, -25, 150), B: A(42, 88, -18, 15, 140),
      grip: { at: "sh", off: [-0.07, 0.04], bend: 1 }, gz: 0.3,
      labels: ["しゃがむ（お尻を後ろへ・膝はつま先方向）", "立つ（足裏全体で床を押す）"],
      equip: [{ t: "bar", at: "wr", r: 0.2 }],
    },
    "ベンチプレス": {
      mode: "root", root: [0, 0.5], cam: [-0.2, 0.7, 3.6],
      A: A(-90, 100, 0, 180, 180), B: A(-90, 100, 0, 95, 180), gz: 0.3,
      labels: ["ゆっくり下ろす（胸に軽く触れる）", "押し上げる（肩甲骨は寄せたまま）"],
      equip: [{ t: "bar", at: "wr", r: 0.2 }, { t: "box", x0: -0.85, x1: 0.12, y0: 0, y1: 0.36 }],
    },
    "デッドリフト": {
      mode: "ankle", cam: [0, 0.85, 4.0],
      A: A(60, 75, -20, -10, -10), B: A(4, 1, -1, -3, -3), gz: 0.28,
      labels: ["構え（背中まっすぐ・バーは体の近く）", "立ち上がる（床を足で押す）"],
      equip: [{ t: "bar", at: "wr", r: 0.225 }],
      startAt: "A",
    },
    "ショルダープレス": {
      mode: "ankle", cam: [0, 1.2, 4.2],
      A: A(0, 0, 0, 10, 180), B: A(0, 0, 0, 180, 180), gz: 0.3,
      labels: ["押し上げる（真上へ）", "ゆっくり下ろす（肩の高さまで）"],
      equip: [{ t: "bar", at: "wr", r: 0.2 }],
    },
    "ラットプルダウン": {
      mode: "root", root: [0, 0.48], cam: [0.1, 1.15, 4.0],
      A: A(-8, 85, 0, 165, 175), B: A(-12, 85, 0, 25, 165), gz: 0.48,
      labels: ["肘を下・後ろへ引く（バーを鎖骨へ）", "ゆっくり戻す（背中を伸ばす）"],
      equip: [{ t: "line", from: "wr", to: [0.05, 2.4] }, { t: "bar", at: "wr", r: 0 },
              { t: "box", x0: -0.25, x1: 0.15, y0: 0, y1: 0.38 }],
    },
    "懸垂": {
      mode: "hands", hands: [0.05, 2.05], cam: [0, 1.15, 4.6],
      A: A(0, 5, -25, 180, 180), B: A(-5, 5, -25, 15, 170), gz: 0.42,
      labels: ["肘を体の下へ引き込む（顎をバーの上へ）", "ゆっくり下ろす"],
      equip: [{ t: "bar", at: "wr", r: 0 }],
    },
    "ダンベルカール": {
      mode: "ankle", cam: [0, 0.95, 3.6],
      A: A(0, 0, 0, 3, 3), B: A(0, 0, 0, 3, 140),
      labels: ["巻き上げる（肘は体の横で固定）", "ゆっくり下ろす（2秒以上）"],
      equip: [{ t: "db", at: "wr" }],
    },
    "ケーブルプレスダウン": {
      mode: "ankle", cam: [0, 1.15, 3.9],
      A: A(8, 0, 0, 10, 100), B: A(8, 0, 0, 10, 5), gz: 0.12,
      labels: ["押し下げる（肘は脇に固定）", "ゆっくり戻す（肘は約90°まで）"],
      equip: [{ t: "line", from: "wr", to: [0.2, 2.25] }, { t: "bar", at: "wr", r: 0 }],
    },
    "ベントオーバーロウ": {
      mode: "ankle", cam: [0.1, 0.85, 3.9],
      A: A(65, 30, -10, 0, 0), B: A(65, 30, -10, -75, -10), gz: 0.3,
      labels: ["肘を後ろへ引く（背中は丸めない）", "ゆっくり下ろす"],
      equip: [{ t: "bar", at: "wr", r: 0.2 }],
    },
    "ヒップスラスト": {
      mode: "ankle", cam: [-0.3, 0.6, 3.4],
      A: A(-62, 122, -5, 0, 0), B: A(-98, 96, 0, 0, 0),
      grip: { at: "hip", bend: -1 }, gz: 0.3,
      labels: ["お尻を締めて持ち上げる（体が一直線に）", "ゆっくり下ろす"],
      equip: [{ t: "bar", at: "wr", r: 0.16 }, { t: "boxAtShoulder" }],
    },
  };

  // ---------------- three.js ----------------
  let S = null;   // { renderer, scene, camera, group, wrap, raf, ... }

  function mat(hex, rough) { return new THREE.MeshStandardMaterial({ color: hex, roughness: rough == null ? 0.6 : rough, metalness: 0.05 }); }

  function ensure(container) {
    if (S && S.container === container) return S;
    if (S) { cancelAnimationFrame(S.raf); S.renderer.dispose(); }
    const W = container.clientWidth || 320, H = 260;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 50);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a898, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(2, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-3, 2, -4); scene.add(rim);
    const group = new THREE.Group(); scene.add(group);
    // 床
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.06 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);

    S = { container, renderer, scene, camera, group, W, H, yaw: 0, dragging: false, raf: 0, ex: null, parts: null, dyn: [] };
    const el = renderer.domElement;
    el.style.touchAction = "pan-y"; el.style.cursor = "grab";
    let lx = 0;
    const down = (x) => { S.dragging = true; lx = x; };
    const move = (x) => { if (!S.dragging) return; S.yaw += (x - lx) * 0.012; lx = x; };
    const upf = () => { S.dragging = false; };
    el.addEventListener("mousedown", e => down(e.clientX));
    window.addEventListener("mousemove", e => move(e.clientX));
    window.addEventListener("mouseup", upf);
    el.addEventListener("touchstart", e => down(e.touches[0].clientX), { passive: true });
    el.addEventListener("touchmove", e => { const t = e.touches[0]; if (S.dragging){ e.preventDefault(); move(t.clientX); } }, { passive: false });
    el.addEventListener("touchend", upf);
    return S;
  }

  // 2点を結ぶ円柱（カプセル代わり）
  function limbMesh(r, material) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), material);
    return m;
  }
  function setLimb(mesh, a, b) {   // a,b: THREE.Vector3
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length() || 1e-4;
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  function build(ex) {
    const g = S.group;
    while (g.children.length) g.remove(g.children[0]);
    S.dyn = [];
    const body = mat(0xd9cfc0), dark = mat(0xb5a998), joint = mat(0x8f8576), gearMat = mat(0x3a3f4a, 0.4), plateMat = new THREE.MeshStandardMaterial({ color: 0x2c313b, roughness: 0.5, transparent: true, opacity: 0.38, depthWrite: false }), benchMat = mat(0x6f7684, 0.7);
    const V = (p, z) => new THREE.Vector3(p[0], p[1], z || 0);

    // 体のパーツ（near=手前側 z>0、far=奥側 z<0 は少し暗く）
    const parts = { limbs: [], spheres: [] };
    const mkLimb = (name, r, m) => { const mesh = limbMesh(r, m); g.add(mesh); parts.limbs.push({ name, mesh }); return mesh; };
    const mkSph = (name, r, m) => { const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); g.add(mesh); parts.spheres.push({ name, mesh }); return mesh; };
    const zHip = 0.1, zSh = 0.19;
    for (const s of [1, -1]) {
      const m = s > 0 ? body : dark;
      mkLimb("thigh" + s, 0.075, m); mkLimb("shin" + s, 0.058, m); mkLimb("foot" + s, 0.045, m);
      mkLimb("ua" + s, 0.048, m); mkLimb("fa" + s, 0.04, m);
      mkSph("knee" + s, 0.06, joint); mkSph("ankle" + s, 0.05, joint); mkSph("el" + s, 0.048, joint); mkSph("wr" + s, 0.04, joint); mkSph("sh" + s, 0.07, joint);
    }
    mkLimb("torso", 0.125, body); mkSph("head", 0.105, body); mkLimb("neck", 0.045, body); mkLimb("pelvis", 0.1, body);
    S.parts = parts; S.zHip = zHip; S.zSh = zSh;

    // 静的な器具・動的な器具
    for (const e of ex.equip || []) {
      if (e.t === "box") {
        const b = new THREE.Mesh(new THREE.BoxGeometry(e.x1 - e.x0, e.y1 - e.y0, 0.36), benchMat);
        b.position.set((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, 0); g.add(b);
      } else if (e.t === "boxAtShoulder") {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.4), benchMat); g.add(b); S.dyn.push({ e, mesh: b });
      } else if (e.t === "bar") {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 10), gearMat); bar.rotation.x = Math.PI / 2;
        // 手が握る位置(gz)より外側まで棒を伸ばす（手が棒に触れて見えるように）
        const holder = new THREE.Group(); holder.add(bar);
        if (e.r > 0) for (const z of [0.5, -0.5]) {
          const pl = new THREE.Mesh(new THREE.CylinderGeometry(e.r, e.r, 0.05, 28), plateMat); pl.rotation.x = Math.PI / 2; pl.position.z = z; holder.add(pl);
        }
        g.add(holder); S.dyn.push({ e, mesh: holder });
      } else if (e.t === "db") {
        // ダンベルは左右の手に1つずつ：握り（細い棒）を手の位置に通し、両端に円盤
        for (const s of [1, -1]) {
          const holder = new THREE.Group();
          const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 10), gearMat); grip.rotation.x = Math.PI / 2; holder.add(grip);
          for (const z of [0.09, -0.09]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18), plateMat); d.rotation.x = Math.PI / 2; d.position.z = z; holder.add(d); }
          g.add(holder); S.dyn.push({ e, mesh: holder, side: s });
        }
      } else if (e.t === "line") {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), gearMat); g.add(m); S.dyn.push({ e, mesh: m });
      }
    }
    if (ex.mode === "hands") {   // 懸垂バー
      const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.3, 12), gearMat); pb.rotation.x = Math.PI / 2;
      pb.position.set(ex.hands[0], ex.hands[1], 0); g.add(pb);
    }
  }

  function pose(ex, k) {
    const q = lerpQ(ex.A, ex.B, k);
    return { q, j: place(ex, joints(q, ex)) };
  }

  function update(ex, k) {
    const { q, j } = pose(ex, k);
    const zh = S.zHip, zs = S.zSh;
    const P = {}; for (const p of S.parts.limbs) P[p.name] = p.mesh; for (const p of S.parts.spheres) P[p.name] = p.mesh;
    const dirT = new THREE.Vector2(...up(q.t));
    for (const s of [1, -1]) {
      const hip = V3(j.hip, s * zh), knee = V3(j.knee, s * zh), ankle = V3(j.ankle, s * zh), toe = V3([j.ankle[0] + 0.22, j.ankle[1] - 0.075], s * zh);
      const gz = S.ex.gz != null ? S.ex.gz : zs;                 // 手を置く幅（バーの握り幅）
      const sh = V3(j.sh, s * zs), el = V3(j.el, s * (zs + gz) / 2), wr = V3(j.wr, s * gz);
      setLimb(P["thigh" + s], hip, knee); setLimb(P["shin" + s], knee, ankle); setLimb(P["foot" + s], ankle, toe);
      setLimb(P["ua" + s], sh, el); setLimb(P["fa" + s], el, wr);
      P["knee" + s].position.copy(knee); P["ankle" + s].position.copy(ankle);
      P["el" + s].position.copy(el); P["wr" + s].position.copy(wr); P["sh" + s].position.copy(sh);
    }
    const hipC = V3(j.hip, 0), shC = V3(j.sh, 0);
    setLimb(P.torso, hipC, shC);
    setLimb(P.pelvis, V3(j.hip, -zh), V3(j.hip, zh));
    const head = new THREE.Vector3(j.sh[0] + dirT.x * 0.27, j.sh[1] + dirT.y * 0.27, 0);
    P.head.position.copy(head);
    setLimb(P.neck, shC, head);

    for (const d of S.dyn) {
      const e = d.e;
      if (e.t === "bar") {
        const p = e.at === "wr" ? j.wr : e.at === "hip" ? j.hip : j.sh;
        const o = e.off || [0, 0];
        d.mesh.position.set(p[0] + o[0], p[1] + o[1], 0);
      } else if (e.t === "db") {
        d.mesh.position.set(j.wr[0], j.wr[1], d.side * zs);
      } else if (e.t === "line") {
        const a = V3(j.wr, 0), b = new THREE.Vector3(e.to[0], e.to[1], 0);
        setLimb(d.mesh, a, b);
      } else if (e.t === "boxAtShoulder") {
        d.mesh.position.set(j.sh[0] - 0.05, j.sh[1] - 0.24, 0);
      }
    }
    return j;
  }
  const V3 = (p, z) => new THREE.Vector3(p[0], p[1], z || 0);

  function show(container, name, opts) {
    const ex = EX[name];
    if (!ex || typeof THREE === "undefined") return false;
    ensure(container);
    S.ex = ex; S.name = name;
    if (opts && opts.yaw != null) S.yaw = opts.yaw;
    build(ex);
    const cam = ex.cam;
    S.camTarget = new THREE.Vector3(cam[0], cam[1], 0); S.camDist = cam[2] * 0.85;
    const label = opts && opts.label, fz = opts && opts.freeze;
    let t0 = performance.now();
    cancelAnimationFrame(S.raf);
    const period = 3600;
    const frame = (now) => {
      S.raf = requestAnimationFrame(frame);
      if (!S.container.isConnected || S.container.offsetParent === null) return;   // 非表示中は描画しない
      const w = S.container.clientWidth;
      if (w && w !== S.W) { S.W = w; S.renderer.setSize(w, S.H); S.camera.aspect = w / S.H; S.camera.updateProjectionMatrix(); }
      const ph = ((now - t0) % period) / period;                // 0..1
      const k = fz != null ? fz : (1 - Math.cos(ph * 2 * Math.PI)) / 2;   // A→B→A のなめらかな往復
      update(ex, k);
      S.camera.position.set(S.camTarget.x + Math.sin(S.yaw) * S.camDist, S.camTarget.y + 0.15, Math.cos(S.yaw) * S.camDist);
      S.camera.lookAt(S.camTarget);
      S.renderer.render(S.scene, S.camera);
      if (label) label(ph < 0.5 ? ex.labels[0] : ex.labels[1], ph < 0.5 ? 1 : 2);
    };
    S.raf = requestAnimationFrame(frame);
    return true;
  }
  function hide() { if (S) cancelAnimationFrame(S.raf); }

  // 動作確認用：指定の位相(0..1)の関節座標を返す（テストで足が床から浮いていないか等を確かめる）
  function debugPose(name, k) { const ex = EX[name]; const { q, j } = pose(ex, k); return { q, j }; }

  global.FormAnim = { has: (n) => !!EX[n], names: () => Object.keys(EX), show, hide, debugPose };
})(window);
