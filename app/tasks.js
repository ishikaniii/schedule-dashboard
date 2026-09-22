// LifeBase「今日やること」（2026-09-22）
// 散らばっていた「やること」を、ホームの1か所に集めて、優先順に並べる。
// 何がタスクか（定義）：
//   必須：締切の前日・当日（過ぎたもの含む）の課題、【タスク】の私用予定、自分で追加したタスクで期限が今日まで
//   推奨：締切4日前からの課題の着手（段階ごと）、復習カード、未確認の支出、予定済みの運動で未記録のもの、期限が近い自分のタスク
// 保存：自分で追加したタスクは Supabase の tasks、チェックは task_checks（key単位）。
//       テーブルが無い間は、この端末のlocalStorageで動く。
(function (global) {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存不可 */ } } };
  const LS_TASKS = "lb_tasks", LS_CHECKS = "lb_task_checks";

  const STAGES = ["提出する", "見直して仕上げる", "下書きを書く", "構成を決める・資料を集める"];

  function mount(root, ctx) {
    const sb = ctx.sb;
    let snap = null, useLocal = false;
    let userTasks = [], checks = new Set();
    let extra = { cards: 0, pending: 0, trained: false };

    const jparse = (k, d) => { try { return JSON.parse(ls.get(k, "")) || d; } catch (e) { return d; } };
    const missing = (e) => e && /tasks|task_checks|relation|schema cache/i.test(e.message || "");

    async function loadStore() {
      const t = await sb.from("tasks").select("*").eq("done", false).order("due_date", { ascending: true, nullsFirst: false });
      const c = await sb.from("task_checks").select("key");
      if (missing(t.error) || missing(c.error)) {
        useLocal = true;
        userTasks = jparse(LS_TASKS, []).filter(x => !x.done);
        checks = new Set(jparse(LS_CHECKS, []));
        return;
      }
      useLocal = false;
      userTasks = t.data || [];
      checks = new Set((c.data || []).map(x => x.key));
    }

    async function loadExtra(today) {
      const cnt = (q) => q.then(r => (r.error ? 0 : (r.count || 0)), () => 0);
      const [cards, pending, s, c] = await Promise.all([
        cnt(sb.from("study_cards").select("id", { count: "exact", head: true }).lte("next_review", today)),
        cnt(sb.from("pending_expenses").select("id", { count: "exact", head: true }).eq("status", "pending")),
        cnt(sb.from("strength_logs").select("id", { count: "exact", head: true }).eq("date", today)),
        cnt(sb.from("cardio_logs").select("id", { count: "exact", head: true }).eq("date", today)),
      ]);
      extra = { cards, pending, trained: (s + c) > 0 };
    }

    // 今日の一覧を組み立てる。level: 0=必須, 1=推奨。
    function build(today) {
      const items = [];
      const in3 = ymd(addDays(new Date(), 3)), back7 = ymd(addDays(new Date(), -7));
      const evs = (snap && snap.calendar_events) || [];
      for (const e of evs) {
        const title = e.title || "";
        if (e.family_type === "assignment_due") {
          if (title.startsWith("✅")) continue;                // 提出済み
          if (e.date < back7) continue;
          // 締切までの日数で「今日やる段階」を決める（課題の大きさは分からないので、
          // 一律に 構成→下書き→見直し→提出 の4段階に分ける）。段階ごとにチェックできる。
          const left = Math.round((new Date(e.date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
          if (left > 4) continue;
          const stage = left <= 0 ? 0 : left === 1 ? 1 : left === 2 ? 2 : 3;
          const key = "as:" + (e.id || e.date + title) + ":" + stage;
          if (checks.has(key)) continue;
          const late = left < 0;
          const level = left <= 1 ? 0 : 1;
          const when = late ? `期限切れ（${e.date.slice(5)}）` : (left === 0 ? "今日締切" : (left === 1 ? "明日締切" : e.date.slice(5) + " 締切"));
          items.push({ key, level, sort: e.date, label: `${title}：${STAGES[stage]}`, badge: when, kind: "課題", late });
        } else if (e.family_type === "personal" && title.startsWith("【タスク】")) {
          if (e.date > today || e.date < back7) continue;
          const key = "pl:" + (e.id || e.date + title);
          if (checks.has(key)) continue;
          items.push({ key, level: 0, sort: e.date, label: title.replace("【タスク】", ""), badge: e.date < today ? `${e.date.slice(5)}から` : "今日", kind: "タスク", late: e.date < today });
        } else if (e.family_type === "health" && e.date === today && !extra.trained) {
          const key = "hl:" + (e.id || e.date + title);
          items.push({ key, level: 1, sort: today + (e.start_time || ""), label: title, badge: e.start_time ? e.start_time + "〜" : "今日", kind: "運動", auto: true });
        }
      }
      // 試験勉強（studyplan.js）。7日前から。前日・当日は必須。今日の分をチェックすると消える。
      if (global.LifeStudyPlan) {
        for (const u of LifeStudyPlan.upcoming(evs, today)) {
          if (u.kind !== "exam" || u.left > 7) continue;
          const key = "ex:" + u.id + ":" + today;
          if (checks.has(key)) continue;
          items.push({ key, level: u.left <= 1 ? 0 : 1, sort: u.date, label: `試験勉強：${u.title}（今日${u.minutes}分）`, badge: u.left === 0 ? "今日" : `あと${u.left}日`, kind: "学習" });
        }
      }
      for (const t of userTasks) {
        const due = t.due_date || null;
        if (due && due > in3) continue;                          // 遠い期限はまだ出さない
        const level = (!due || due <= today) ? 0 : 1;
        items.push({ key: "us:" + t.id, level, sort: due || today, label: t.title, badge: due ? (due < today ? `期限切れ（${due.slice(5)}）` : (due === today ? "今日" : due.slice(5))) : "期限なし",
          kind: "自分", late: !!(due && due < today), mine: true, id: t.id, est: t.est_min });
      }
      if (extra.cards > 0) items.push({ key: "auto:cards", level: 1, sort: today + "z1", label: `復習カード ${extra.cards}枚`, badge: "毎日", kind: "学習", auto: true, link: "../study/" });
      if (extra.pending > 0) items.push({ key: "auto:pending", level: 1, sort: today + "z2", label: `未確認の支出 ${extra.pending}件を確認`, badge: "ホーム下", kind: "家計", auto: true });
      items.sort((a, b) => a.level - b.level || (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
      return items;
    }

    function render() {
      const today = ymd(new Date());
      const items = build(today);
      const must = items.filter(i => i.level === 0), rec = items.filter(i => i.level === 1);
      const row = (i) => `<li class="row tk-row${i.late ? " tk-late" : ""}" data-key="${esc(i.key)}">
        ${i.auto ? '<span class="tk-auto" title="自動で消えます">•</span>' : `<input type="checkbox" class="tk-chk" data-key="${esc(i.key)}" ${i.mine ? `data-id="${esc(i.id)}"` : ""} aria-label="完了">`}
        <span class="desc">${i.link ? `<a href="${esc(i.link)}">${esc(i.label)}</a>` : esc(i.label)}</span>
        <span class="tk-kind">${esc(i.kind)}</span><span class="tk-badge">${esc(i.badge)}</span>
        ${i.mine ? `<button class="del tk-del" data-id="${esc(i.id)}" aria-label="削除">×</button>` : ""}</li>`;
      root.innerHTML = `
        <h2><span class="dot goals"></span>今日やること<span class="tag">${must.length}件 必須 / ${rec.length}件 推奨</span></h2>
        ${useLocal ? '<p class="empty" style="font-size:11px;">いまは、この端末だけに保存しています。共有するには、Supabaseで schema.sql の「今日やること」のSQLを実行してください。</p>' : ""}
        ${items.length ? "" : '<p class="empty">今日やることは、ありません。</p>'}
        ${must.length ? `<div class="tk-h">必須</div><ul class="list">${must.map(row).join("")}</ul>` : ""}
        ${rec.length ? `<div class="tk-h">推奨</div><ul class="list">${rec.map(row).join("")}</ul>` : ""}
        <form class="tk-add" id="tk-form">
          <input type="text" id="tk-title" placeholder="タスクを追加（例：レポートの構成を決める）" maxlength="120" required>
          <input type="date" id="tk-due" value="${today}" aria-label="期限">
          <button type="submit" class="submit goals" style="width:auto;padding:8px 14px;margin:0;">追加</button>
        </form>
        <details class="tk-def"><summary>何がタスク？（表示のルール）</summary>
          <p><b>必須</b>：締切の前日・当日（過ぎたもの含む）の課題／カレンダーの【タスク】予定／自分で追加した期限が今日まで（または期限なし）のタスク。</p>
          <p><b>推奨</b>：締切まで4日以内の課題（4日前：構成・資料集め → 2日前：下書き → 前日：見直し → 当日：提出）／復習カード／未確認の支出／予定済みで未記録の運動／期限が近い自分のタスク。</p>
          <p>「•」の項目は、済むと自動で消えます。カレンダーに【タスク】と付けた予定は、ここに出ます。</p>
        </details>`;

      root.querySelectorAll(".tk-chk").forEach(cb => cb.addEventListener("change", async () => {
        cb.disabled = true;
        if (cb.dataset.id) await completeUser(cb.dataset.id); else await check(cb.dataset.key);
        render();
      }));
      root.querySelectorAll(".tk-del").forEach(b => b.addEventListener("click", async () => { await removeUser(b.dataset.id); render(); }));
      root.querySelector("#tk-form").addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const title = root.querySelector("#tk-title").value.trim();
        if (!title) return;
        await addUser(title, root.querySelector("#tk-due").value || null);
        render();
      });
    }

    async function check(key) {
      checks.add(key);
      if (useLocal) { ls.set(LS_CHECKS, JSON.stringify([...checks])); return; }
      const { error } = await sb.from("task_checks").upsert({ key, checked_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) ctx.showBanner("チェックの保存に失敗しました: " + error.message);
    }
    async function addUser(title, due) {
      if (useLocal) {
        userTasks.push({ id: "l" + Date.now(), title, due_date: due, done: false });
        ls.set(LS_TASKS, JSON.stringify(userTasks)); return;
      }
      const { data, error } = await sb.from("tasks").insert({ title, due_date: due }).select();
      if (error) { ctx.showBanner("タスクの追加に失敗しました: " + error.message); return; }
      userTasks.push(data[0]);
    }
    async function completeUser(id) {
      userTasks = userTasks.filter(t => String(t.id) !== String(id));
      if (useLocal) { ls.set(LS_TASKS, JSON.stringify(userTasks)); return; }
      const { error } = await sb.from("tasks").update({ done: true, done_at: new Date().toISOString() }).eq("id", id);
      if (error) ctx.showBanner("完了の保存に失敗しました: " + error.message);
    }
    async function removeUser(id) {
      userTasks = userTasks.filter(t => String(t.id) !== String(id));
      if (useLocal) { ls.set(LS_TASKS, JSON.stringify(userTasks)); return; }
      const { error } = await sb.from("tasks").delete().eq("id", id);
      if (error) ctx.showBanner("削除に失敗しました: " + error.message);
    }

    async function refresh(snapshotData) {
      snap = snapshotData || snap;
      await Promise.all([loadStore(), loadExtra(ymd(new Date()))]);
      render();
    }
    render();
    return { refresh };
  }

  global.LifeTasks = { mount };
})(window);
