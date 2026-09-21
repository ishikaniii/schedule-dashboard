// LifeBase「学習」タブ（2026-09-21）
// 復習の予定管理（エビングハウスの忘却曲線を参考にした 1日後→3日後→1週間後→2週間後→1か月後）と、
// FP3級の進み具合。復習そのもの（問題・用語・白紙再生）は、学習エージェント
// （lecture-study-companion）のArtifactページで行い、ここからワンタップで開く。
// 保存：Supabase の study_items。テーブルが無い間は、この端末のlocalStorageで動く。
(function (global) {
  "use strict";
  const STEPS = [1, 3, 7, 14, 30];
  const STEP_LABEL = ["1日後", "3日後", "1週間後", "2週間後", "1か月後"];
  const STUDY_PAGE = "../study/";   // 復習専用ページ（ほかの情報を出さない別ページ）。復習はここで行う
  const FP_AREAS = ["ライフプランニングと資金計画", "リスク管理", "金融資産運用", "タックスプランニング", "不動産", "相続・事業承継"];

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => new Date(s + "T00:00:00");
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存不可 */ } } };

  function mount(root, ctx) {
    const sb = ctx.sb;
    const today = ymd(new Date());
    let items = [], useLocal = false;
    const LSK = "lb_study_items";

    async function load() {
      const { data, error } = await sb.from("study_items").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) {
        if (/study_items|relation|schema cache/i.test(error.message || "")) { useLocal = true; try { items = JSON.parse(ls.get(LSK, "[]")); } catch (e) { items = []; } }
        else items = [];
      } else { useLocal = false; items = (data || []).map(r => ({ ...r, done_steps: r.done_steps || [] })); }
      render();
    }
    const persistLocal = () => ls.set(LSK, JSON.stringify(items));
    async function addItem(it) {
      if (useLocal) { it.id = "l" + Date.now(); items.unshift(it); persistLocal(); render(); return; }
      const { data, error } = await sb.from("study_items").insert({ date: it.date, subject: it.subject, title: it.title, kind: it.kind, minutes: it.minutes, done_steps: [] }).select();
      if (error) { useLocal = true; it.id = "l" + Date.now(); items.unshift(it); persistLocal(); render(); return; }
      items.unshift({ ...data[0], done_steps: [] }); render();
    }
    async function markDone(id, step) {
      const it = items.find(x => String(x.id) === String(id)); if (!it) return;
      it.done_steps = [...new Set([...(it.done_steps || []), step])];
      if (useLocal) persistLocal(); else await sb.from("study_items").update({ done_steps: it.done_steps }).eq("id", it.id);
      render();
    }
    async function removeItem(id) {
      items = items.filter(x => String(x.id) !== String(id));
      if (useLocal) persistLocal(); else await sb.from("study_items").delete().eq("id", id);
      render();
    }

    root.innerHTML = `
      <div class="card st-card">
        <h2><span class="dot study"></span>学習</h2>
        <a id="st-open" class="st-open" href="../study/">復習ページを開く（集中して復習する別ページ）</a>
        <div id="st-cards" class="meal-hint"></div>
        <div class="meal-hint">復習は、家計・予定・食事などが出ない専用ページで行います（強度を上げて集中するため）。ここでは、学習の時間とFPの進み具合を管理します。</div>
        <div id="st-notice" class="meal-notice" style="display:none;"></div>
      </div>
      <div class="card st-card">
        <h2>学習の時間を記録</h2>
        <div class="hb-fields">
          <label>科目・分野<input type="text" id="st-subject" list="st-subjects" placeholder="例：経済学 / FP"></label>
          <label>種類<select id="st-kind"><option>講義</option><option>FP</option><option>読書</option><option>その他</option></select></label>
        </div>
        <datalist id="st-subjects"><option>経済学</option><option>FP3級</option>${FP_AREAS.map(a => `<option>FP：${esc(a)}</option>`).join("")}</datalist>
        <label class="hb-l">内容・範囲<input type="text" id="st-title" maxlength="80" placeholder="例：第5回 需要と供給の弾力性／第2章 ライフプラン"></label>
        <label class="hb-l">学習時間(分)<input type="number" id="st-min" min="0" step="5" placeholder="例 30"></label>
        <button type="button" id="st-add" class="meal-primary">記録する</button>
        <div class="meal-hint">復習のカードは、学習エージェントが講義やノートから自動で作り、復習ページに並びます（間隔：1日後→3日後→1週間後→2週間後→1か月後）。</div>
      </div>
      <div class="card st-card">
        <h2>FP3級の進み具合</h2>
        <div class="hb-fields"><label>受検予定日<input type="date" id="fp-date"></label><label>目標の学習時間(h)<input type="number" id="fp-target" min="10" step="10"></label></div>
        <div id="fp-plan" class="meal-hint"></div>
        <div id="fp-areas"></div>
        <div class="meal-hint">学習時間は、上で種類を「FP」にして記録した分から集計します。3級の目安は80〜150時間です。</div>
      </div>
      <div class="card st-card"><h2>学習の記録</h2><ul class="list" id="st-list"></ul></div>`;
    const $ = (id) => root.querySelector("#" + id);

    const stepDate = (it, i) => ymd(addDays(parse(it.date), STEPS[i]));
    const nextStep = (it) => { for (let i = 0; i < STEPS.length; i++) if (!(it.done_steps || []).includes(i)) return i; return -1; };

    function render() {
      const nt = $("st-notice");
      if (useLocal) { nt.style.display = "block"; nt.innerHTML = "いまは、この端末だけに保存しています。共有するには、Supabaseで schema.sql の <b>study_items</b> のSQLを実行してください。"; } else nt.style.display = "none";

      cardCounts();
      $("st-list").innerHTML = items.slice(0, 15).map(it => `<li class="row"><span class="date mono">${String(it.date).slice(5)}</span><span class="desc">${esc(it.subject)}｜${esc(it.title)}${it.minutes ? `（${it.minutes}分）` : ""}<small class="st-prog"> 復習 ${(it.done_steps || []).length}/${STEPS.length}</small></span><button class="del" data-id="${esc(String(it.id))}">×</button></li>`).join("") || '<li class="empty">まだ記録がありません。</li>';
      $("st-list").querySelectorAll(".del").forEach(b => b.addEventListener("click", () => removeItem(b.dataset.id)));
      fpRender();
    }

    async function cardCounts(){
      const el = $("st-cards"); if (!el) return;
      const t = ymd(new Date()), tm = ymd(addDays(new Date(), 1));
      const q = (f) => f(sb.from("study_cards").select("id", { count: "exact", head: true }));
      const [d, n, all] = await Promise.all([q(x => x.lte("next_review", t)), q(x => x.eq("next_review", tm)), q(x => x)]);
      if (d.error){ el.textContent = "復習カードは、まだ準備ができていません（Supabaseで schema.sql の「学習」のSQLを実行してください）。"; return; }
      el.innerHTML = `今日の復習：<b>${d.count || 0}枚</b>　明日：${n.count || 0}枚　カード総数：${all.count || 0}枚`;
    }

    // ---------- FP ----------
    const fpLoad = () => { try { return JSON.parse(ls.get("lb_fp", "{}")); } catch (e) { return {}; } };
    function fpRender() {
      const f = fpLoad(), target = f.target || 100, hrs = items.filter(x => x.kind === "FP").reduce((s, x) => s + (+x.minutes || 0), 0) / 60;
      $("fp-date").value = f.date || ""; $("fp-target").value = target;
      let plan = `学習時間：${hrs.toFixed(1)} / ${target} 時間（${Math.min(100, Math.round(hrs / target * 100))}%）。`;
      if (f.date) { const left = Math.ceil((parse(f.date) - parse(today)) / 86400000); if (left > 0) { const need = Math.max(0, target - hrs); plan += ` 受検まで${left}日。残り${need.toFixed(0)}時間＝1日あたり約${(need / left * 60).toFixed(0)}分。`; } else plan += " 受検日を過ぎています。"; }
      $("fp-plan").textContent = plan;
      const a = f.areas || {};
      $("fp-areas").innerHTML = FP_AREAS.map((n, i) => `<div class="st-area"><span>${esc(n)}</span><label><input type="checkbox" data-a="${i}" data-k="read"${a[i] && a[i].read ? " checked" : ""}> 読了</label><label><input type="checkbox" data-a="${i}" data-k="drill"${a[i] && a[i].drill ? " checked" : ""}> 問題演習</label></div>`).join("");
      $("fp-areas").querySelectorAll("input").forEach(cb => cb.addEventListener("change", () => { const g = fpLoad(); g.areas = g.areas || {}; g.areas[cb.dataset.a] = g.areas[cb.dataset.a] || {}; g.areas[cb.dataset.a][cb.dataset.k] = cb.checked; ls.set("lb_fp", JSON.stringify(g)); }));
    }
    const fpSave = () => { const g = fpLoad(); g.date = $("fp-date").value; g.target = parseInt($("fp-target").value, 10) || 100; ls.set("lb_fp", JSON.stringify(g)); fpRender(); };
    $("fp-date").addEventListener("change", fpSave); $("fp-target").addEventListener("change", fpSave);

    $("st-add").addEventListener("click", () => {
      const subject = $("st-subject").value.trim(), title = $("st-title").value.trim(); if (!subject || !title) return;
      addItem({ date: today, subject, title, kind: $("st-kind").value, minutes: $("st-min").value ? parseInt($("st-min").value, 10) : null, done_steps: [] });
      $("st-title").value = ""; $("st-min").value = "";
    });

    render(); load();
    return { refresh: load };
  }

  global.LifeStudy = { mount };
})(window);
