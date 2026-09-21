// LifeBase「食事」タブ（2026-09-21）
// 目的：質量をつける（増量）＋速筋を鍛える体づくりのための、食事の記録と目安管理。
// お金をかけない・手間をかけない：よく食べる物をワンタップで記録、たんぱく質のコスパ順も出す。
//   - 1日の目標（カロリー・P・F・C）：体重から計算（増量＝維持＋250kcal、たんぱく質＝体重×1.9g）
//   - 記録：内蔵の食品目安データ（成分表ベースの概算・1食分）／手入力／よく食べる物
//   - 今日あと何を食べれば良いか（残りのたんぱく質を安く埋める案）
//   - 体重の記録と、増量ペースの判定（週あたりの増減）
// 保存先：Supabase の meal_logs / body_weight（schema.sql）。無ければ案内を出す。
// 栄養値はあくまで目安（実物や商品ラベルと差がある）。医療上の助言ではない。
(function (global) {
  "use strict";

  // 食品データ：[名前, 1食分の説明, kcal, たんぱく質g, 脂質g, 炭水化物g, 価格の目安(円), 区分]
  const FOODS = [
    ["ご飯（茶碗1杯）", "150g", 252, 3.8, 0.5, 55.7, 25, "自炊"],
    ["鶏むね肉（皮なし）", "100g", 108, 22.3, 1.5, 0, 60, "自炊"],
    ["鶏もも肉（皮つき）", "100g", 204, 16.6, 14.2, 0, 70, "自炊"],
    ["豚もも肉", "100g", 183, 20.5, 10.2, 0.2, 90, "自炊"],
    ["卵", "1個", 91, 7.4, 6.2, 0.2, 25, "自炊"],
    ["納豆", "1パック", 90, 7.4, 4.5, 5.4, 40, "自炊"],
    ["木綿豆腐", "半丁150g", 108, 9.9, 6.3, 2.4, 45, "自炊"],
    ["牛乳", "200ml", 134, 6.6, 7.6, 9.6, 40, "自炊"],
    ["ツナ缶（水煮）", "1缶70g", 63, 12.6, 0.6, 0.1, 110, "自炊"],
    ["さば缶（水煮）", "1缶", 330, 35, 20, 0.5, 200, "自炊"],
    ["塩鮭", "1切れ80g", 160, 18, 9, 0.1, 120, "自炊"],
    ["無糖ヨーグルト", "100g", 62, 3.6, 3, 4.9, 35, "自炊"],
    ["プロテイン（ホエイ）", "1杯30g", 120, 22, 1.5, 3, 90, "自炊"],
    ["プロテイン（ソイ）", "1杯30g", 115, 21, 2, 3, 75, "自炊"],
    ["プロテイン＋牛乳200ml", "1杯", 254, 28.6, 9.1, 12.6, 130, "自炊"],
    ["オートミール", "40g", 152, 5.5, 2.3, 27.6, 25, "自炊"],
    ["食パン", "6枚切1枚", 149, 5.3, 2.5, 27.8, 25, "自炊"],
    ["パスタ（乾麺）", "100g", 378, 12.9, 1.8, 73.1, 30, "自炊"],
    ["バナナ", "1本", 86, 1.1, 0.2, 22.5, 30, "自炊"],
    ["キャベツ", "100g", 23, 1.3, 0.2, 5.2, 20, "自炊"],
    ["ブロッコリー", "100g", 33, 4.3, 0.5, 5.2, 60, "自炊"],
    ["サラダチキン", "1個110g", 115, 24, 1.5, 0.5, 230, "コンビニ"],
    ["ゆで卵", "1個", 75, 6.2, 5.2, 0.2, 60, "コンビニ"],
    ["おにぎり（鮭）", "1個", 180, 5, 1.5, 38, 130, "コンビニ"],
    ["おにぎり（ツナマヨ）", "1個", 230, 5, 8, 34, 130, "コンビニ"],
    ["プロテインバー", "1本", 200, 15, 9, 15, 200, "コンビニ"],
    ["唐揚げ弁当", "1個", 800, 28, 34, 95, 500, "コンビニ"],
    ["カップ麺", "1個", 350, 10, 14, 48, 170, "コンビニ"],
    ["菓子パン", "1個", 350, 7, 12, 52, 150, "コンビニ"],
    ["学食 定食（肉・魚）", "1食", 800, 30, 22, 105, 500, "学食"],
    ["学食 丼もの", "1食", 800, 25, 20, 120, 450, "学食"],
    ["学食 麺類", "1食", 550, 16, 8, 100, 350, "学食"],
    ["学食 小鉢（納豆・冷奴）", "1鉢", 70, 5, 3, 3, 80, "学食"],
    ["学食 唐揚げ", "3個", 300, 15, 18, 12, 150, "学食"],
  ];
  const DEFAULT_TARGET = { kcal: 2600, p: 125, f: 70, c: 365, kg: 65, mode: "gain" };
  const MEALS = ["朝", "昼", "夜", "間食"];

  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const r1 = (n) => Math.round(n * 10) / 10;
  const yen = (n) => "¥" + Math.round(n).toLocaleString("ja-JP");
  const mealNow = () => { const h = new Date().getHours(); return h < 10 ? "朝" : h < 15 ? "昼" : h < 17 ? "間食" : "夜"; };

  function loadTarget() {
    try { return { ...DEFAULT_TARGET, ...(JSON.parse(localStorage.getItem("lb_meal_target") || "{}")) }; } catch (e) { return { ...DEFAULT_TARGET }; }
  }
  function saveTarget(t) { try { localStorage.setItem("lb_meal_target", JSON.stringify(t)); } catch (e) { /* 保存できなくても動く */ } }
  // 体重から目標を計算：維持≒体重×35kcal（バイト・週3運動を含む概算）、増量は+250、
  // たんぱく質は体重×1.9g、脂質はカロリーの25%、残りが炭水化物。
  function calcTarget(kg, mode) {
    const maint = kg * 35, kcal = Math.round((maint + (mode === "gain" ? 250 : mode === "cut" ? -300 : 0)) / 10) * 10;
    const p = Math.round(kg * 1.9), f = Math.round(kcal * 0.25 / 9), c = Math.round((kcal - p * 4 - f * 9) / 4);
    return { kcal, p, f, c, kg, mode };
  }

  function mount(root, ctx) {
    const sb = ctx.sb, banner = ctx.showBanner || (() => {});
    let day = ymd(new Date()), target = loadTarget(), logs = [], weekLogs = [], weights = [], mult = 1, tableMissing = false;

    root.innerHTML = `
      <div class="card meal-card">
        <h2><span class="dot meal"></span>食事<span class="tag" id="meal-daylabel"></span></h2>
        <div class="meal-daynav"><button type="button" id="meal-prev">‹</button><input type="date" id="meal-date"><button type="button" id="meal-next">›</button><button type="button" id="meal-today">今日</button></div>
        <div id="meal-notice" class="meal-notice" style="display:none;"></div>
        <div id="meal-summary"></div>
        <details class="meal-target"><summary>1日の目標を変更（体重から計算）</summary>
          <div class="meal-target-form">
            <label>体重(kg)<input type="number" id="mt-kg" step="0.1" min="30" max="150"></label>
            <label>目的<select id="mt-mode"><option value="gain">増量（+250kcal）</option><option value="keep">維持</option><option value="cut">減量（−300kcal）</option></select></label>
            <button type="button" id="mt-calc">体重から計算</button>
            <label>kcal<input type="number" id="mt-kcal"></label><label>たんぱく質g<input type="number" id="mt-p"></label>
            <label>脂質g<input type="number" id="mt-f"></label><label>炭水化物g<input type="number" id="mt-c"></label>
            <button type="button" id="mt-save" class="meal-primary">目標を保存</button>
          </div>
        </details>
      </div>
      <div class="card meal-card">
        <h2>あと何を食べる？<span class="tag">たんぱく質を安く埋める案</span></h2>
        <div id="meal-suggest"></div>
      </div>
      <div class="card meal-card">
        <h2>食べたものを記録</h2>
        <div class="meal-addrow">
          <label>食事<select id="meal-type">${MEALS.map(m => `<option>${m}</option>`).join("")}</select></label>
          <label>量<select id="meal-mult"><option value="0.5">×0.5</option><option value="1" selected>×1</option><option value="1.5">×1.5</option><option value="2">×2</option><option value="3">×3</option></select></label>
        </div>
        <div id="meal-recent" class="meal-chips"></div>
        <div class="meal-cats" id="meal-cats"></div>
        <div id="meal-foods" class="meal-chips"></div>
        <details class="meal-manual"><summary>手入力で追加（表示にない物・商品ラベルの値）</summary>
          <form id="meal-form" class="meal-target-form">
            <label>名前<input type="text" id="mf-name" required maxlength="60"></label>
            <label>kcal<input type="number" id="mf-kcal" step="1" min="0" required></label>
            <label>たんぱく質g<input type="number" id="mf-p" step="0.1" min="0" value="0"></label>
            <label>脂質g<input type="number" id="mf-f" step="0.1" min="0" value="0"></label>
            <label>炭水化物g<input type="number" id="mf-c" step="0.1" min="0" value="0"></label>
            <label>値段(円)<input type="number" id="mf-price" step="1" min="0"></label>
            <button type="submit" class="meal-primary">追加</button>
          </form>
        </details>
      </div>
      <div class="card meal-card"><h2>この日の食事</h2><ul class="list" id="meal-list"></ul></div>
      <div class="card meal-card">
        <h2>体重と増量ペース</h2>
        <div class="meal-weight"><input type="number" id="bw-kg" step="0.1" min="30" max="150" placeholder="今日の体重(kg)"><button type="button" id="bw-save" class="meal-primary">記録</button></div>
        <div id="bw-info" class="meal-hint"></div><ul class="list" id="bw-list"></ul>
      </div>
      <div class="card meal-card"><h2>直近7日</h2><div id="meal-week" class="meal-week"></div></div>
      <p class="credit">栄養値は日本食品標準成分表などを参考にした概算（1食分の目安）で、商品・量・調理で変わります。価格は目安です。</p>`;

    const $ = (id) => root.querySelector("#" + id);
    let catSel = "自炊";

    async function fetchAll() {
      const since = ymd(addDays(new Date(), -7));
      const from = day < since ? day : since;
      const { data, error } = await sb.from("meal_logs").select("*").gte("date", from).order("created_at", { ascending: true });
      if (error) {
        if (/meal_logs|relation|schema cache/i.test(error.message || "")) { tableMissing = true; }
        else banner("食事の読み込みに失敗しました: " + error.message);
        logs = []; weekLogs = [];
      } else { tableMissing = false; weekLogs = data || []; logs = weekLogs.filter(l => l.date === day); }
      const w = await sb.from("body_weight").select("*").order("date", { ascending: false }).limit(30);
      weights = w.error ? [] : (w.data || []);
      render();
    }

    const sum = (arr) => arr.reduce((t, l) => ({ kcal: t.kcal + (+l.kcal || 0), p: t.p + (+l.protein || 0), f: t.f + (+l.fat || 0), c: t.c + (+l.carb || 0), yen: t.yen + (+l.price || 0) }), { kcal: 0, p: 0, f: 0, c: 0, yen: 0 });

    function bar(label, val, tgt, unit, cls) {
      const pct = tgt ? Math.min(100, Math.round(val / tgt * 100)) : 0;
      const left = Math.round(tgt - val);
      return `<div class="mrow"><div class="ml">${label}</div><div class="mtrack ${cls}"><div class="mfill" style="width:${pct}%"></div></div>
        <div class="mv">${Math.round(val)} / ${tgt}${unit}<span class="mleft">${left >= 0 ? "あと" + left : "+" + (-left) + "超"}</span></div></div>`;
    }

    function render() {
      $("meal-date").value = day;
      $("meal-daylabel").textContent = day === ymd(new Date()) ? "今日" : day;
      const nt = $("meal-notice");
      if (tableMissing) {
        nt.style.display = "block";
        nt.innerHTML = "食事の記録を使うには、Supabaseで schema.sql の <b>meal_logs / body_weight</b> のSQL（ファイル末尾近くの「食事タブ」ブロック）を実行してください。";
      } else nt.style.display = "none";
      const t = sum(logs);
      $("meal-summary").innerHTML = `
        ${bar("カロリー", t.kcal, target.kcal, "kcal", "k")}${bar("たんぱく質", t.p, target.p, "g", "p")}
        ${bar("脂質", t.f, target.f, "g", "f")}${bar("炭水化物", t.c, target.c, "g", "c")}
        <div class="meal-hint">この日の食費（記録した価格の合計）：<b>${yen(t.yen)}</b>　／　たんぱく質1gあたり ${t.p > 0 && t.yen > 0 ? (t.yen / t.p).toFixed(1) + "円" : "－"}</div>`;
      $("mt-kg").value = target.kg; $("mt-mode").value = target.mode;
      $("mt-kcal").value = target.kcal; $("mt-p").value = target.p; $("mt-f").value = target.f; $("mt-c").value = target.c;

      // 提案：残りのたんぱく質を、たんぱく質あたりの値段が安い順に
      const remP = target.p - t.p, remK = target.kcal - t.kcal;
      const cost = FOODS.filter(f => f[3] >= 5 && f[6] > 0 && f[3] / f[2] * 100 >= 6).map(f => ({ f, ppy: f[3] / f[6] * 100 })).sort((a, b) => b.ppy - a.ppy);
      let sug = "";
      if (remP <= 5) sug = `<div class="meal-hint">たんぱく質の目標はほぼ達成です。${remK > 300 ? `カロリーがあと約${Math.round(remK)}kcal足りないので、ご飯・パン・牛乳・バナナなどで補いましょう。` : "今日はこのくらいで十分です。"}</div>`;
      else {
        let need = remP; const picks = [];
        for (const { f } of cost) { if (need <= 4 || picks.length >= 3) break; const qty = Math.min(3, Math.max(1, Math.round(need / f[3]))); if (f[7] === "学食" || f[0].includes("弁当")) continue; picks.push({ f, qty }); need -= f[3] * qty; }
        const totalYen = picks.reduce((s, x) => s + x.f[6] * x.qty, 0), totalK = picks.reduce((s, x) => s + x.f[2] * x.qty, 0);
        sug = `<div class="meal-hint">あとたんぱく質 <b>${Math.round(remP)}g</b>（カロリー あと${Math.round(remK)}kcal）。安く埋める例：</div>
          <div class="meal-chips">${picks.map(x => `<button type="button" class="meal-chip sug" data-name="${esc(x.f[0])}" data-q="${x.qty}">${esc(x.f[0])} ×${x.qty}<small>+${r1(x.f[3] * x.qty)}g・${yen(x.f[6] * x.qty)}</small></button>`).join("")}</div>
          <div class="meal-hint">合計 約${yen(totalYen)}・${Math.round(totalK)}kcal（押すとこの日に追加）</div>`;
      }
      sug += `<details class="meal-manual"><summary>たんぱく質のコスパ順（100円あたり）</summary><ol class="meal-rank">${cost.slice(0, 8).map(x => `<li>${esc(x.f[0])}<span>${r1(x.ppy)}g/100円（${esc(x.f[1])}あたり ${r1(x.f[3])}g・${yen(x.f[6])}）</span></li>`).join("")}</ol></details>`;
      $("meal-suggest").innerHTML = sug;
      $("meal-suggest").querySelectorAll(".sug").forEach(b => b.addEventListener("click", () => addFood(b.dataset.name, parseFloat(b.dataset.q))));

      // 記録UI：カテゴリ・食品ボタン・最近よく食べる物
      $("meal-cats").innerHTML = ["自炊", "コンビニ", "学食"].map(c => `<button type="button" class="${c === catSel ? "active" : ""}" data-c="${c}">${c}</button>`).join("");
      $("meal-cats").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { catSel = b.dataset.c; render(); }));
      $("meal-foods").innerHTML = FOODS.filter(f => f[7] === catSel).map(f => `<button type="button" class="meal-chip" data-name="${esc(f[0])}">${esc(f[0])}<small>${esc(f[1])}・${f[2]}kcal・P${f[3]}</small></button>`).join("");
      $("meal-foods").querySelectorAll(".meal-chip").forEach(b => b.addEventListener("click", () => addFood(b.dataset.name, mult)));
      const freq = {};
      weekLogs.forEach(l => { freq[l.name] = (freq[l.name] || 0) + 1; });
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]).filter(n => FOODS.some(f => f[0] === n));
      $("meal-recent").innerHTML = top.length ? `<span class="meal-label">よく食べる：</span>` + top.map(n => `<button type="button" class="meal-chip fav" data-name="${esc(n)}">${esc(n)}</button>`).join("") : "";
      $("meal-recent").querySelectorAll(".fav").forEach(b => b.addEventListener("click", () => addFood(b.dataset.name, mult)));

      // 一覧
      $("meal-list").innerHTML = logs.length ? MEALS.filter(m => logs.some(l => l.meal === m)).map(m => {
        const items = logs.filter(l => l.meal === m);
        return `<li class="meal-group"><div class="mg-title">${m}<span>${Math.round(sum(items).kcal)}kcal・P${r1(sum(items).p)}g</span></div>` + items.map(l =>
          `<div class="row"><span class="desc">${esc(l.name)}</span><span class="amt mono">${Math.round(l.kcal)}kcal・P${r1(l.protein)}${l.price ? "・" + yen(l.price) : ""}</span><button class="del" data-id="${l.id}">×</button></div>`).join("") + `</li>`;
      }).join("") : '<li class="empty">まだ記録がありません。上のボタンから追加してください。</li>';
      $("meal-list").querySelectorAll(".del").forEach(b => b.addEventListener("click", async () => { await sb.from("meal_logs").delete().eq("id", b.dataset.id); fetchAll(); }));

      // 体重
      $("bw-list").innerHTML = weights.slice(0, 6).map(w => `<li class="row"><span class="date mono">${String(w.date).slice(5)}</span><span class="desc">${w.kg}kg</span><button class="del" data-id="${w.id}">×</button></li>`).join("") || '<li class="empty">まだ記録がありません。</li>';
      $("bw-list").querySelectorAll(".del").forEach(b => b.addEventListener("click", async () => { await sb.from("body_weight").delete().eq("id", b.dataset.id); fetchAll(); }));
      $("bw-info").textContent = paceMessage();

      // 7日
      const days = []; for (let i = 6; i >= 0; i--) days.push(ymd(addDays(new Date(), -i)));
      $("meal-week").innerHTML = `<table><tr><th>日</th><th>kcal</th><th>P(g)</th><th>食費</th></tr>` + days.map(d => {
        const s = sum(weekLogs.filter(l => l.date === d));
        const ok = s.p >= target.p * 0.9;
        return `<tr><td>${d.slice(5)}</td><td>${Math.round(s.kcal) || "－"}</td><td class="${s.p ? (ok ? "ok" : "ng") : ""}">${s.p ? Math.round(s.p) : "－"}</td><td>${s.yen ? yen(s.yen) : "－"}</td></tr>`;
      }).join("") + `</table>`;
    }

    function paceMessage() {
      if (weights.length < 2) return "体重を2回以上（10日以上あけて）記録すると、増量のペースを判定します。毎朝、起床後・トイレ後に測るのがおすすめです。";
      const latest = weights[0], older = weights.slice(1).find(w => (new Date(latest.date) - new Date(w.date)) / 86400000 >= 10) || weights[weights.length - 1];
      const days = (new Date(latest.date) - new Date(older.date)) / 86400000;
      if (days < 7) return "記録の間隔が短いので、まだ判定できません（10日以上あけた記録が必要です）。";
      const perWeek = (latest.kg - older.kg) / days * 7;
      const msg = perWeek < 0.05 ? `週 ${perWeek.toFixed(2)}kg：増えていません。カロリーを +200kcal（ご飯1杯弱）増やしてみましょう。`
        : perWeek <= 0.4 ? `週 +${perWeek.toFixed(2)}kg：ちょうど良いペースです。今の量を続けましょう。`
        : `週 +${perWeek.toFixed(2)}kg：やや速めです。脂肪がつきやすいので、−200kcalほど減らしても良いです。`;
      return msg;
    }

    async function add(row) {
      const { error } = await sb.from("meal_logs").insert(row);
      if (error) { banner("記録に失敗しました: " + error.message); return false; }
      return true;
    }
    async function addFood(name, q) {
      const f = FOODS.find(x => x[0] === name); if (!f) return;
      const m = parseFloat(q) || 1;
      const ok = await add({ date: day, meal: $("meal-type").value, name: f[0], kcal: Math.round(f[2] * m), protein: r1(f[3] * m), fat: r1(f[4] * m), carb: r1(f[5] * m), price: Math.round(f[6] * m) });
      if (ok) fetchAll();
    }

    $("meal-type").value = mealNow();
    $("meal-mult").addEventListener("change", (e) => { mult = parseFloat(e.target.value) || 1; });
    $("meal-date").addEventListener("change", (e) => { day = e.target.value || day; fetchAll(); });
    $("meal-prev").addEventListener("click", () => { day = ymd(addDays(new Date(day + "T00:00:00"), -1)); fetchAll(); });
    $("meal-next").addEventListener("click", () => { day = ymd(addDays(new Date(day + "T00:00:00"), 1)); fetchAll(); });
    $("meal-today").addEventListener("click", () => { day = ymd(new Date()); fetchAll(); });
    $("mt-calc").addEventListener("click", () => {
      const kg = parseFloat($("mt-kg").value) || target.kg; const t = calcTarget(kg, $("mt-mode").value);
      $("mt-kcal").value = t.kcal; $("mt-p").value = t.p; $("mt-f").value = t.f; $("mt-c").value = t.c;
    });
    $("mt-save").addEventListener("click", () => {
      target = { kg: parseFloat($("mt-kg").value) || target.kg, mode: $("mt-mode").value, kcal: parseInt($("mt-kcal").value, 10) || target.kcal,
                 p: parseInt($("mt-p").value, 10) || target.p, f: parseInt($("mt-f").value, 10) || target.f, c: parseInt($("mt-c").value, 10) || target.c };
      saveTarget(target); render();
    });
    $("meal-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const ok = await add({ date: day, meal: $("meal-type").value, name: $("mf-name").value.trim(), kcal: parseFloat($("mf-kcal").value) || 0,
        protein: parseFloat($("mf-p").value) || 0, fat: parseFloat($("mf-f").value) || 0, carb: parseFloat($("mf-c").value) || 0,
        price: $("mf-price").value ? parseInt($("mf-price").value, 10) : null });
      if (ok){ e.target.reset(); $("mf-p").value = 0; $("mf-f").value = 0; $("mf-c").value = 0; fetchAll(); }
    });
    $("bw-save").addEventListener("click", async () => {
      const kg = parseFloat($("bw-kg").value); if (!kg) return;
      const { error } = await sb.from("body_weight").upsert({ date: ymd(new Date()), kg }, { onConflict: "date" });
      if (error) banner(/body_weight|relation|schema cache/i.test(error.message || "") ? "体重の記録には schema.sql の body_weight のSQLが必要です" : "記録に失敗しました: " + error.message);
      else { $("bw-kg").value = ""; fetchAll(); }
    });

    render();
    fetchAll();
    return { refresh: fetchAll };
  }

  global.LifeMeal = { mount, FOODS, calcTarget };
})(window);
