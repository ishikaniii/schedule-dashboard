// LifeBase「学習」タブ（2026-09-21、2026-09-22拡張、2026-09-22確認専用化）
// このタブは確認だけを行う（記録・追加・削除・設定変更・ノート送信は行わない）。
// 入力・設定は別ページ study-input.html で行う（ユーザー要望：学習タブは見るだけにしたい）。
// 復習の予定管理（エビングハウスの忘却曲線を参考にした 1日後→3日後→1週間後→2週間後→1か月後）と、
// FP3級の進み具合。復習そのもの（問題・用語・白紙再生）は、学習エージェント
// （lecture-study-companion）のArtifactページで行い、ここからワンタップで開く。
(function (global) {
  "use strict";
  const STEPS = [1, 3, 7, 14, 30];
  const FP_AREAS = ["ライフプランニングと資金計画", "リスク管理", "金融資産運用", "タックスプランニング", "不動産", "相続・事業承継"];

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => new Date(s + "T00:00:00");
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } } };

  function mount(root, ctx) {
    const sb = ctx.sb;
    const today = ymd(new Date());
    let items = [], cards = [], events = [], inbox = [], inboxMissing = false;

    root.innerHTML = `
      <div class="card st-card">
        <h2><span class="dot study"></span>学習</h2>
        <a id="st-open" class="st-open" href="../study/">復習ページを開く（集中して復習する別ページ）</a>
        <a class="st-open st-open-2" href="study-input.html">記録・設定はこちら（別ページ）</a>
        <div id="st-cards" class="meal-hint"></div>
        <div class="meal-hint">復習は、家計・予定・食事などが出ない専用ページで行います（強度を上げて集中するため）。学習の記録・FPの設定・ノート送信は、上の別ページで行います。ここでは確認だけができます。</div>
      </div>
      <div class="card st-card" id="st-stats"></div>
      <div class="card st-card" id="st-plan"></div>
      <div class="card st-card"><h2>FP3級の進み具合</h2><div id="fp-plan" class="meal-hint"></div><div id="fp-areas"></div></div>
      <div class="card st-card" id="st-inbox"></div>
      <div class="card st-card"><h2>学習の記録（最近15件）</h2><ul class="list" id="st-list"></ul></div>`;
    const $ = (id) => root.querySelector("#" + id);

    async function load() {
      const { data, error } = await sb.from("study_items").select("*").order("created_at", { ascending: false }).limit(300);
      items = error ? [] : (data || []).map(r => ({ ...r, done_steps: r.done_steps || [] }));
      await loadExtra();
    }

    async function loadExtra() {
      const c = await sb.from("study_cards").select("subject,reps,lapses,last_reviewed,next_review").limit(5000);
      cards = c.error ? [] : (c.data || []);
      const ib = await sb.from("study_inbox").select("*").order("created_at", { ascending: false }).limit(5);
      inboxMissing = !!ib.error; inbox = ib.error ? [] : (ib.data || []);
      const sn = await sb.from("dashboard_snapshot").select("data").eq("id", 1).maybeSingle();
      events = (sn.data && sn.data.data && sn.data.data.calendar_events) || [];
      render();
    }

    function render() {
      cardCounts();
      $("st-list").innerHTML = items.slice(0, 15).map(it => `<li class="row"><span class="date mono">${String(it.date).slice(5)}</span><span class="desc">${esc(it.subject)}｜${esc(it.title)}${it.minutes ? `（${it.minutes}分）` : ""}<small class="st-prog"> 復習 ${(it.done_steps || []).length}/${STEPS.length}</small></span></li>`).join("") || '<li class="empty">まだ記録がありません。<a href="study-input.html">記録する</a></li>';
      fpRender(); renderStats(); renderPlan(); renderInbox();
    }

    async function cardCounts() {
      const el = $("st-cards"); if (!el) return;
      const t = ymd(new Date()), tm = ymd(addDays(new Date(), 1));
      const q = (f) => f(sb.from("study_cards").select("id", { count: "exact", head: true }));
      const [d, n, all] = await Promise.all([q(x => x.lte("next_review", t)), q(x => x.eq("next_review", tm)), q(x => x)]);
      if (d.error) { el.textContent = "復習カードは、まだ準備ができていません（Supabaseで schema.sql の「学習」のSQLを実行してください）。"; return; }
      el.innerHTML = `今日の復習：<b>${d.count || 0}枚</b>　明日：${n.count || 0}枚　カード総数：${all.count || 0}枚`;
    }

    // ---------- 学習の見える化 ----------
    const minsBetween = (from, to) => items.filter(x => x.date >= from && x.date <= to).reduce((t, x) => t + (+x.minutes || 0), 0);
    const bar = (label, pct, val, warn) => `<div class="mrow"><div class="ml">${esc(label)}</div><div class="mtrack"><div class="mfill" style="width:${Math.max(2, Math.min(100, pct))}%${warn ? ";background:var(--strength)" : ""}"></div></div><div class="mv">${val}</div></div>`;
    function retention() {
      const by = {};
      cards.forEach(c => { if ((c.reps || 0) > 0) { const g = by[c.subject] = by[c.subject] || { reps: 0, lapses: 0 }; g.reps += c.reps; g.lapses += c.lapses || 0; } });
      return Object.entries(by).map(([subject, g]) => ({ subject, reps: g.reps, rate: Math.round((1 - g.lapses / g.reps) * 100) })).sort((a, b) => a.rate - b.rate);
    }
    function renderStats() {
      const el = $("st-stats"); if (!el) return;
      const now = new Date(), t = ymd(now);
      const d7 = ymd(addDays(now, -6)), p7a = ymd(addDays(now, -13)), p7b = ymd(addDays(now, -7)), d30 = ymd(addDays(now, -29));
      const w = minsBetween(d7, t), pw = minsBetween(p7a, p7b);
      const days = new Set(items.map(x => x.date)); cards.forEach(c => { if (c.last_reviewed) days.add(c.last_reviewed); });
      let streak = 0, cur = days.has(t) ? now : addDays(now, -1);
      while (days.has(ymd(cur))) { streak++; cur = addDays(cur, -1); }
      const reviewedToday = cards.filter(c => c.last_reviewed === t).length;
      const mon = (d) => addDays(d, -((d.getDay() + 6) % 7));
      const weeks = []; for (let i = 7; i >= 0; i--) { const s0 = mon(addDays(now, -7 * i)); weeks.push({ label: ymd(s0).slice(5), m: minsBetween(ymd(s0), ymd(addDays(s0, 6))) }); }
      const wmax = Math.max(60, ...weeks.map(x => x.m));
      const subj = {}; items.filter(x => x.date >= d30 && x.minutes).forEach(x => { subj[x.subject] = (subj[x.subject] || 0) + (+x.minutes || 0); });
      const sl = Object.entries(subj).sort((a, b) => b[1] - a[1]).slice(0, 6), smax = sl.length ? sl[0][1] : 1;
      const ret = retention();
      const diff = w - pw;
      el.innerHTML = `<h2>学習の状況</h2>
        <div class="st-kpis"><div><b>${(w / 60).toFixed(1)}h</b><small>直近7日${pw ? `（前の7日より ${diff >= 0 ? "+" : "−"}${(Math.abs(diff) / 60).toFixed(1)}h）` : ""}</small></div>
          <div><b>${streak}日</b><small>連続（記録か復習をした日）</small></div>
          <div><b>${reviewedToday}枚</b><small>今日復習したカード</small></div></div>
        <div class="tk-h">週ごとの学習時間（8週）</div>
        ${weeks.map(x => bar(x.label, x.m / wmax * 100, x.m ? (x.m / 60).toFixed(1) + "h" : "—")).join("")}
        ${sl.length ? `<div class="tk-h">科目別（直近30日）</div>${sl.map(([n, m]) => bar(n, m / smax * 100, (m / 60).toFixed(1) + "h")).join("")}` : ""}
        <div class="tk-h">復習の定着率（カード）</div>
        ${ret.length ? ret.map(r => bar(r.subject, r.rate, `${r.rate}%<small>（${r.reps}回）</small>`, r.rate < 70 && r.reps >= 3)).join("") + '<div class="meal-hint">70%未満（3回以上復習した科目）は赤で表示します。定着率は、「できなかった」を除いた復習の割合です。復習ページでは、同じ期限のカードの中で、間違いの多いものを先に出します。</div>' : '<div class="meal-hint">復習の記録がたまると、科目ごとの定着率が出ます。</div>'}`;
    }

    // ---------- 試験・課題に向けた学習 ----------
    function renderPlan() {
      const el = $("st-plan"); if (!el) return;
      const up = window.LifeStudyPlan ? LifeStudyPlan.upcoming(events, today) : [];
      const subjects = [...new Set(cards.map(c => c.subject))], ret = Object.fromEntries(retention().map(r => [r.subject, r.rate]));
      const rows = up.map(u => {
        if (u.kind === "assign") return `<li class="row"><span class="desc">${esc(u.title)}<small class="st-prog"> 課題・あと${u.left}日（今日やることに、段階ごとに出ます）</small></span></li>`;
        const sj = LifeStudyPlan.matchSubject(u.title, subjects);
        const due = sj ? cards.filter(c => c.subject === sj && c.next_review <= today).length : 0;
        const extra = sj ? `／${esc(sj)}：復習カード ${due}枚${ret[sj] != null ? `・定着率${ret[sj]}%` : ""}` : "";
        return `<li class="row"><span class="desc">${esc(u.title)}<small class="st-prog"> 試験・あと${u.left}日 → 今日は<b>${u.minutes}分</b>が目安${extra}</small></span></li>`;
      }).join("");
      el.innerHTML = `<h2>試験・課題に向けた学習</h2>
        <ul class="list">${rows || '<li class="empty">14日以内の試験・課題はありません。</li>'}</ul>
        <div class="meal-hint">試験は、カレンダーに「◯◯試験」「小テスト」「期末」などの言葉を入れた予定から拾います。目安：あと8〜14日=30分／4〜7日=60分／1〜3日=90分／当日=30分。試験の勉強は、ホームの「今日やること」にも出ます。</div>`;
    }

    // ---------- ノート・教材（状況の確認のみ。送信は study-input.html） ----------
    function renderInbox() {
      const el = $("st-inbox"); if (!el) return;
      const label = (r) => r.status === "done" ? `✓ ${esc(r.message || "完了")}` : r.status === "error" ? `✗ ${esc(r.message || "失敗")}` : `… ${esc(r.message || "待機中（PCが、約30分以内にカードにします）")}`;
      el.innerHTML = `<h2>ノート・教材からのカード化</h2>
        ${inboxMissing ? '<div class="meal-notice">まだ準備ができていません。Supabaseで schema.sql の「学習の受信箱」のSQLを実行してください。</div>' : ""}
        ${inbox.length ? `<ul class="list">${inbox.map(r => `<li class="row"><span class="desc">${esc(r.subject)}${r.title ? "｜" + esc(r.title) : ""}<small class="st-prog"> ${label(r)}</small></span></li>`).join("")}</ul>` : '<div class="meal-hint">まだ送ったノートはありません。</div>'}
        <div class="meal-hint">ノートを送るのは、上の「記録・設定はこちら」の別ページから行います。</div>`;
    }

    // ---------- FP（確認のみ。設定は study-input.html） ----------
    const fpLoad = () => { try { return JSON.parse(ls.get("lb_fp", "{}")); } catch (e) { return {}; } };
    function fpRender() {
      const f = fpLoad(), target = f.target || 100, hrs = items.filter(x => x.kind === "FP").reduce((s, x) => s + (+x.minutes || 0), 0) / 60;
      let plan = `学習時間：${hrs.toFixed(1)} / ${target} 時間（${Math.min(100, Math.round(hrs / target * 100))}%）。`;
      if (!f.date) { const need0 = Math.max(0, target - hrs); plan += ` 受検日が未定なので、目標時間ベースで表示しています（1日30分なら、あと約${Math.ceil(need0 * 2)}日）。`; }
      if (f.date) { const left = Math.ceil((parse(f.date) - parse(today)) / 86400000); if (left > 0) { const need = Math.max(0, target - hrs); plan += ` 受検まで${left}日。残り${need.toFixed(0)}時間＝1日あたり約${(need / left * 60).toFixed(0)}分。`; } else plan += " 受検日を過ぎています。"; }
      $("fp-plan").textContent = plan;
      const a = f.areas || {};
      $("fp-areas").innerHTML = FP_AREAS.map((n, i) => `<div class="st-area"><span>${esc(n)}<small class="st-prog"> ${(items.filter(x => x.kind === "FP" && String(x.subject).startsWith("FP：" + n)).reduce((t, x) => t + (+x.minutes || 0), 0) / 60).toFixed(1)}h</small></span><span class="st-area-check">${a[i] && a[i].read ? "読了 ✓" : "読了 −"}　${a[i] && a[i].drill ? "問題演習 ✓" : "問題演習 −"}</span></div>`).join("");
    }

    render(); load();
    return { refresh: load };
  }

  global.LifeStudy = { mount };
})(window);
