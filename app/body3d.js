// LifeBase 人体モデル（解剖学的3D筋肉モデル）
//
// 2026-09-20: 自作プリミティブ（球・回転体の組み合わせ）から、筋肉ごとに
// メッシュが分かれた解剖モデルへ切り替えた。
//
// モデル: assets/anatomy-male.glb
//   出典  : slfresh/fitmitwith-anatomy-atlas (full-body-male-mobile.glb)
//   元      : Z-Anatomy（CC BY-SA 4.0）← BodyParts3D（CC BY-SA 2.1 JP）
//   ライセンス: CC BY-SA 4.0（このモデルファイルのみ。アプリ本体は別ライセンス）
//   クレジット文言は index.html のフッターに表示している。
//   109の筋肉×左右=218メッシュ。各ノードの userData に
//   { key, group, side, layer } が入っている（glTF extras）。
//
// 公開する関数:
//   LifeBody.create(container, { onReady }) → BODY
//     BODY.meshes[muscleId] = [THREE.Mesh...]   ← renderBody() が色を塗る対象
//     BODY.baseColor        = {r,g,b}           ← 色が無い時の地の色
//     BODY.group / BODY.ready / BODY.ids
//
// muscleId は LifeBase の筋肉分類（17種）。下の MAP で解剖モデル側の
// 筋肉キー（extras.key）と対応づけている。

(function (global) {
  "use strict";

  // LifeBase の筋肉ID → モデル側の筋肉キー（extras.key）
  const MAP = {
    chest:       ["pectoralis_major_clavicular", "pectoralis_major_sternocostal", "pectoralis_major_abdominal"],
    delts_front: ["deltoid_anterior"],
    delts_side:  ["deltoid_lateral"],
    delts_rear:  ["deltoid_posterior"],
    biceps:      ["biceps_brachii_long", "biceps_brachii_short", "brachialis"],
    triceps:     ["triceps_long", "triceps_lateral", "triceps_medial"],
    abs:         ["rectus_abdominis"],
    obliques:    ["external_oblique"],
    traps:       ["trapezius_upper", "trapezius_middle", "trapezius_lower"],
    lats:        ["latissimus_dorsi", "teres_major"],
    lower_back:  ["iliocostalis_lumborum", "iliocostalis_thoracis", "longissimus_thoracis",
                  "spinalis_thoracis", "multifidus_lumborum", "quadratus_lumborum"],
    glutes:      ["gluteus_maximus", "gluteus_medius"],
    quads:       ["rectus_femoris", "vastus_lateralis", "vastus_medialis", "vastus_intermedius"],
    hamstrings:  ["biceps_femoris_long", "biceps_femoris_short", "semitendinosus", "semimembranosus"],
    calves:      ["gastrocnemius_lateral", "gastrocnemius_medial", "soleus", "plantaris"],
    adductors:   ["adductor_magnus", "adductor_longus", "adductor_brevis", "gracilis", "pectineus"],
  };
  // 前腕はキーが多い（48メッシュ）ので、グループ名でまとめて対応づける
  const GROUP_MAP = { forearms: ["Forearms"] };

  const KEY_TO_ID = {};
  Object.entries(MAP).forEach(([id, keys]) => keys.forEach(k => { KEY_TO_ID[k] = id; }));
  const GROUP_TO_ID = {};
  Object.entries(GROUP_MAP).forEach(([id, groups]) => groups.forEach(g => { GROUP_TO_ID[g] = id; }));

  const BASE_COLOR = 0xd8cdbd;   // 色を付けない筋肉の地の色（粘土のようなベージュ）
  const CONTEXT_COLOR = 0xa79d90; // 対応づけのない筋肉（首・すね・股関節など）はやや暗く
  const TENDON_COLOR = 0xece6d8;  // 腱・筋膜

  // 表層筋が下の筋肉を覆い隠す部分を、シェーダで正中線付近だけ切り取る。
  // 解剖学的には腹斜筋の腱膜は腹直筋の前を覆い、広背筋は脊柱起立筋の上を
  // 覆っているが、このアプリでは「腹筋」「脊柱起立筋（腰）」に色を付けて
  // 見せたいので、正中の帯（|x| < ax、かつ高さ y < ymax）だけ描画しない。
  // 回転しても切り取り位置が体に付いてくるよう、クリッピング平面ではなく
  // オブジェクト座標でdiscardする。
  const CARVE = {
    external_oblique: { ax: 0.072 },
    latissimus_dorsi: { ax: 0.078, ymax: 1.27 },
  };
  function carve(material, c) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCarve = { value: new THREE.Vector2(c.ax, c.ymax === undefined ? 99 : c.ymax) };
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", `varying vec3 vObj;
void main() {
  vObj = position;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", `uniform vec2 uCarve;
varying vec3 vObj;
void main() {
  if (abs(vObj.x) < uCarve.x && vObj.y < uCarve.y) discard;`);
    };
    material.customProgramCacheKey = () => "carve" + c.ax + "_" + c.ymax;
  }

  function hexToRgb(h) { return { r: (h >> 16) & 255, g: (h >> 8) & 255, b: h & 255 }; }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("load failed: " + src));
      document.head.appendChild(s);
    });
  }

  function create(container, opts) {
    opts = opts || {};
    const BODY = { meshes: {}, group: null, ready: false, ids: Object.keys(MAP).concat(Object.keys(GROUP_MAP)),
                   baseColor: hexToRgb(BASE_COLOR) };
    if (typeof THREE === "undefined") return null;

    const W = container.clientWidth || 240, H = opts.height || 340;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
    camera.position.set(0, 0.02, opts.camZ || 3.65);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b0a2, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(2.5, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-3, 1, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45); rim.position.set(-1, 3, -5); scene.add(rim);
    const rimR = new THREE.DirectionalLight(0xffffff, 0.3); rimR.position.set(3, 1, -4); scene.add(rimR);

    // モデルは足元が y=0、頭頂が約1.71m。回転の中心を体の中央（y≈0.85）に置く。
    const pivot = new THREE.Group();
    pivot.position.y = 0;
    scene.add(pivot);
    BODY.group = pivot;

    const mk = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide });

    function onLoaded(gltf) {
      const model = gltf.scene;
      // 中心を原点へ（足元 y=0、頭頂 ≈1.71 → y方向に -0.855 ずらす）
      model.position.y = -0.855;
      pivot.add(model);

      model.traverse(obj => {
        if (!obj.isMesh) return;
        const ud = obj.userData || {};
        // 単体メッシュがノード直下でなくとも親のextrasを見る
        const ex = ud.muscleId ? ud : (obj.parent && obj.parent.userData) || {};
        if (ex.boneId) { obj.visible = false; return; }               // 骨格は表示しない
        if (ex.supportId === "connective_tissue") { obj.material = mk(TENDON_COLOR); return; }
        if (ex.supportId === "head_hands_feet") { obj.material = mk(CONTEXT_COLOR); return; }

        const id = KEY_TO_ID[ex.key] || GROUP_TO_ID[ex.group];
        if (id) {
          obj.material = mk(BASE_COLOR);
          if (CARVE[ex.key]) carve(obj.material, CARVE[ex.key]);
          (BODY.meshes[id] = BODY.meshes[id] || []).push(obj);
        } else if (ex.layer === "deep") {
          obj.visible = false;                                         // 対応づけの無い深層筋は隠す
        } else {
          obj.material = mk(CONTEXT_COLOR);                            // 首・すねなどの表層筋
        }
      });
      BODY.ready = true;
      if (typeof opts.onReady === "function") opts.onReady(BODY);
    }

    const glbUrl = opts.url || "assets/anatomy-male.glb";
    loadScript("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js")
      .then(() => new Promise((resolve, reject) => new THREE.GLTFLoader().load(glbUrl, resolve, undefined, reject)))
      .then(onLoaded)
      .catch(err => {
        console.error("anatomy model failed", err);
        container.innerHTML = '<p class="empty">3Dモデルを読み込めませんでした（部位バランスの一覧は下に表示されます）。</p>';
        if (typeof opts.onError === "function") opts.onError(err);
      });

    // ドラッグ回転
    let dragging = false, lastX = 0, lastY = 0;
    const el = renderer.domElement;
    el.style.touchAction = "pan-y";
    const down = (x, y) => { dragging = true; lastX = x; lastY = y; };
    const move = (x, y) => {
      if (!dragging) return;
      pivot.rotation.y += (x - lastX) * 0.012;
      pivot.rotation.x = Math.max(-0.5, Math.min(0.5, pivot.rotation.x + (y - lastY) * 0.005));
      lastX = x; lastY = y;
    };
    const up = () => { dragging = false; };
    el.addEventListener("mousedown", e => down(e.clientX, e.clientY));
    window.addEventListener("mousemove", e => move(e.clientX, e.clientY));
    window.addEventListener("mouseup", up);
    el.addEventListener("touchstart", e => down(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    el.addEventListener("touchmove", e => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - lastX) > Math.abs(t.clientY - lastY)) { e.preventDefault(); move(t.clientX, t.clientY); }
      else { lastX = t.clientX; lastY = t.clientY; }
    }, { passive: false });
    el.addEventListener("touchend", up);

    // タブが非表示の間は幅が0になるので、表示された時点／画面幅が変わった時点で
    // 描画サイズを合わせ直す（毎フレーム幅を見るだけなので軽い）。
    let curW = W;
    (function loop() {
      requestAnimationFrame(loop);
      const w = container.clientWidth;
      if (w && w !== curW) { curW = w; renderer.setSize(w, H); camera.aspect = w / H; camera.updateProjectionMatrix(); }
      renderer.render(scene, camera);
    })();

    BODY.turn = function (which) {
      pivot.rotation.x = 0;
      pivot.rotation.y = which === "back" ? Math.PI : 0;
    };
    return BODY;
  }

  global.LifeBody = { create, MAP, GROUP_MAP };
})(window);
