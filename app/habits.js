// LifeBase「習慣」タブ（2026-09-21）
// 朝・日中・夜のルーティンのチェックリスト、睡眠（就寝・起床）と歩数・瞑想の記録、就寝時刻の逆算、
// 呼吸／瞑想タイマー、ジャーナル（明日のToDo・感謝・ふり返り）、イメージング（WOOP）を1画面にまとめる。
// 根拠（研究の強さ）は「根拠のまとめ」に、出典リンクつきで載せている。医療上の助言ではない。
// 保存：Supabase の habit_logs（1日1行）。テーブルが無い間は、この端末のlocalStorageに保存して動く。
(function (global) {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const fmtMin = (m) => { m = ((m % 1440) + 1440) % 1440; return `${Math.floor(m / 60)}:${pad(m % 60)}`; };

  // チェック項目：id, ラベル, 補足
  const GROUPS = [
    { id: "morning", title: "朝", items: [
      ["wake", "起床時刻を守った（休日もずらしすぎない・前後1時間以内）", "体内時計が安定します"],
      ["light", "朝の光を5〜10分浴びた（曇りでも屋外か窓際）", "起床後1時間以内が目安"],
      ["water", "コップ1杯の水を飲んだ", ""],
      ["breath", "呼吸5分（吐くほうを長く）をした", "下の「呼吸・瞑想タイマー」が使えます"],
      ["mobility", "動的ストレッチ・準備運動を5分した", "股関節・肩まわり"],
      ["breakfast", "たんぱく質のある朝食を食べた（20〜30g）", "卵・納豆・牛乳・ヨーグルト・プロテイン"],
      ["read", "朝の読書・インプットを15〜30分した（読んだ後に、要点を思い出して1行書く）", "一番頭を使うこと（苦手・重要）を先に"],
    ] },
    { id: "day", title: "日中", items: [
      ["walkmeal", "食後に10分ほど歩いた", "血糖の上がり方がゆるやかになります"],
      ["standup", "座り続けず、1時間に1回は立った", ""],
      ["train", "今日のトレーニング／有酸素をした（または休養日と決めた）", "強い運動は就寝の4時間前までに"],
    ] },
    { id: "night", title: "夜", items: [
      ["trainend", "強い運動は、就寝の3〜4時間前までに終えた", ""],
      ["bath", "ぬるめのお風呂（38〜41度・10〜15分）に入った", "就寝の1〜2時間前"],
      ["dim", "就寝1時間前から、照明を暗くしてスマホを置いた", ""],
      ["todo", "明日のToDoを具体的に書いた（5分）", "寝つきが早くなった研究があります"],
      ["calm", "瞑想か呼吸を5〜10分した", ""],
      ["nocaf", "夕方以降のカフェイン・寝酒を避けた", ""],
    ] },
  ];

  // まず効果を試したい4つ（朝の光・起床時刻・夜の呼吸か瞑想・明日のToDo）。初期はこの4つだけ出し、
  // 「すべて表示」で16項目に広げる（2026-09-22）。ここに無い項目のチェック済みの記録は消えない。
  const CORE = ["light", "wake", "calm", "todo"];
  const FULL_KEY = "lb_habit_full";
  const isFull = () => { try { return localStorage.getItem(FULL_KEY) === "1"; } catch (e) { return false; } };
  const visItems = (g) => isFull() ? g.items : g.items.filter(i => CORE.includes(i[0]));
  const visGroups = () => GROUPS.map(g => ({ ...g, items: visItems(g) })).filter(g => g.items.length);

  function mount(root, ctx) {
    const sb = ctx.sb;
    const today = ymd(new Date());
    let day = today, logs = {}, useLocal = false;

    // ---------- 保存（Supabase → だめならlocalStorage） ----------
    const LS = "lb_habit_logs";
    const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } };
    const lsWrite = (o) => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* 保存不可 */ } };
    async function loadAll() {
      const since = ymd(addDays(new Date(), -30));
      const { data, error } = await sb.from("habit_logs").select("*").gte("date", since);
      if (error) {
        if (/habit_logs|relation|schema cache/i.test(error.message || "")) { useLocal = true; const l = lsRead(); logs = l; }
        else { logs = {}; }
      } else { useLocal = false; logs = {}; (data || []).forEach(r => { logs[r.date] = { ...r, checks: r.checks || {} }; }); }
      render();
    }
    const cur = () => logs[day] || (logs[day] = { date: day, checks: {} });
    async function save(patch) {
      const row = cur(); Object.assign(row, patch);
      if (useLocal) { lsWrite(logs); return; }
      const rec = { date: day, checks: row.checks || {}, steps: row.steps ?? null, bed_time: row.bed_time || null, wake_time: row.wake_time || null,
        meditation_min: row.meditation_min ?? null, read_title: row.read_title || null, read_min: row.read_min ?? null, read_note: row.read_note || null, todo: row.todo || null, gratitude: row.gratitude || null, reflection: row.reflection || null, imagery: row.imagery || null, updated_at: new Date().toISOString() };
      const { error } = await sb.from("habit_logs").upsert(rec, { onConflict: "date" });
      if (error) { useLocal = true; lsWrite(logs); render(); }
    }

    // ---------- 画面 ----------
    root.innerHTML = `
      <div class="card hb-card">
        <h2><span class="dot habit"></span>習慣<span class="tag" id="hb-daylabel"></span></h2>
        <div class="meal-daynav"><button type="button" id="hb-prev">‹</button><input type="date" id="hb-date"><button type="button" id="hb-next">›</button><button type="button" id="hb-today">今日</button></div>
        <div id="hb-notice" class="meal-notice" style="display:none;"></div>
        <div id="hb-progress" class="hb-progress"></div>
        <div id="hb-checklist"></div>
      </div>
      <div class="card hb-card">
        <h2>朝の読書・インプット<span class="tag">15〜30分</span></h2>
        <div class="hb-fields">
          <label>読んだ本・教材<input type="text" id="hb-rtitle" maxlength="80" placeholder="例：有機化学 第5章"></label>
          <label>時間(分)<input type="number" id="hb-rmin" min="0" step="5"></label>
        </div>
        <label class="hb-l">要点を、本を閉じて思い出して1〜3行で（思い出すことが記憶に効きます）<textarea id="hb-rnote" rows="3" placeholder="見返さずに、覚えていることを書く。分からなかった所は「？」"></textarea></label>
        <button type="button" id="hb-rsave" class="meal-primary">保存</button><span id="hb-rstate" class="meal-hint"></span>
        <div id="hb-readweek" class="meal-hint"></div>
        <div class="meal-hint">やり方：①起床後の頭が冴えている時間に、一番大事な・難しい内容を読む。②読んだら本を閉じ、思い出して書く（ただ読み返すより記憶に残ります）。③1日後・3日後・1週間後に、要点を見ずに思い出し直す（間隔をあける）。</div>
      </div>
      <div class="card hb-card">
        <h2>睡眠・歩数・瞑想の記録</h2>
        <div class="hb-fields">
          <label>前夜の就寝<input type="time" id="hb-bed"></label>
          <label>今朝の起床<input type="time" id="hb-wake"></label>
          <label>歩数<input type="number" id="hb-steps" min="0" step="100" placeholder="例 6500"></label>
          <label>瞑想・呼吸(分)<input type="number" id="hb-med" min="0" step="1"></label>
        </div>
        <div id="hb-sleepinfo" class="meal-hint"></div>
        <div id="hb-week" class="meal-week"></div>
      </div>
      <div class="card hb-card">
        <h2>就寝時刻の逆算<span class="tag">運動の終わりから</span></h2>
        <div class="hb-fields">
          <label>トレーニング終了予定<input type="time" id="hb-trainend"></label>
          <label>翌朝の起床（目標）<input type="time" id="hb-wakegoal" value="07:00"></label>
        </div>
        <div id="hb-plan" class="meal-hint"></div>
      </div>
      <div class="card hb-card">
        <h2>呼吸・瞑想タイマー</h2>
        <div class="hb-timer">
          <div id="hb-cue" class="hb-cue">準備ができたら開始</div>
          <div id="hb-clock" class="hb-clock">5:00</div>
          <div class="hb-timerbtns">
            <button type="button" id="hb-start-breath" class="meal-primary">呼吸5分（吐くのを長く）</button>
            <button type="button" id="hb-start-med" class="meal-primary">瞑想10分（静かに）</button>
            <button type="button" id="hb-stop">停止</button>
          </div>
          <div class="meal-hint">呼吸：鼻から吸う（4秒）→もう一度短く吸い足す（1秒）→口からゆっくり長く吐く（8秒）。瞑想：目を閉じ、呼吸に注意を向け、それて気づいたら戻す。終わったら「瞑想・呼吸(分)」に自動で足します。</div>
        </div>
      </div>
      <div class="card hb-card">
        <h2>ジャーナル<span class="tag">夜に3〜5分</span></h2>
        <label class="hb-l">明日のToDo（具体的に。時刻・場所・やることまで）<textarea id="hb-todo" rows="3" placeholder="例：9:00 有機化学の課題を提出／17:00 スクワット3×5"></textarea></label>
        <label class="hb-l">今日の感謝・良かったこと（3つ）<textarea id="hb-grat" rows="3"></textarea></label>
        <label class="hb-l">ふり返り（学び・気づき）<textarea id="hb-refl" rows="2"></textarea></label>
        <button type="button" id="hb-jsave" class="meal-primary">保存</button>
        <span id="hb-jstate" class="meal-hint"></span>
      </div>
      <div class="card hb-card">
        <h2>イメージング（WOOP）<span class="tag">目標に向けて</span></h2>
        <div class="meal-hint">成功した姿を思い浮かべるだけだと、かえって努力が減るという研究があります。<b>願い→結果→障害→計画</b>の順に、障害も想像して「もし〜なら、〜する」と決めるのが有効とされています。</div>
        <label class="hb-l">W（願い）今週の目標<input type="text" id="hb-w" placeholder="例：週3回、決めた種目を最後までやり切る"></label>
        <label class="hb-l">O（結果）達成した時の一番良いこと<input type="text" id="hb-o"></label>
        <label class="hb-l">O（障害）自分の中にある、邪魔になりそうなこと<input type="text" id="hb-ob" placeholder="例：バイトで疲れて帰り、面倒になる"></label>
        <label class="hb-l">P（計画）もし障害が起きたら、〜する<input type="text" id="hb-p" placeholder="例：もし面倒になったら、まずウォームアップの5分だけやる"></label>
        <label class="hb-l">動作のイメージ（1〜2分）：次のトレーニングで使う種目のフォームを、自分の目線で、力の入る感覚と一緒に思い浮かべる<textarea id="hb-img" rows="2" placeholder="例：スクワットで、お尻を引いて、床を押して立つ感覚"></textarea></label>
        <button type="button" id="hb-wsave" class="meal-primary">保存</button>
      </div>
      <div class="card hb-card">
        <h2>根拠のまとめ</h2>
        <details class="meal-manual"><summary>研究の強さと出典（タップで開く）</summary>
          <div class="hb-ev">
            <p><b>【強い】</b>睡眠は6時間以上、起床時刻を固定、朝の光・朝食、就寝前の光・カフェイン・寝酒を避ける：<a href="https://www.mhlw.go.jp/content/10904750/001181265.pdf" target="_blank" rel="noopener">厚生労働省 睡眠ガイド2023</a>。睡眠不足で筋肉の合成が下がる：<a href="https://www.biorxiv.org/content/10.1101/2020.03.09.984666v3.full" target="_blank" rel="noopener">研究</a>。</p>
            <p><b>【中】</b>就寝前の運動：就寝4時間以上前に終えれば影響なし、1時間前まで心拍が高いと寝つきが遅れる傾向：<a href="https://www.sciencedirect.com/science/article/abs/pii/S1087079221001209" target="_blank" rel="noopener">メタ分析</a>。食後の散歩で血糖の上昇が下がる：<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12216464/" target="_blank" rel="noopener">研究</a>。就寝前のToDo記入で約9分早く寝つく（57人）：<a href="https://www.ovid.com/journals/jepge/fulltext/10.1037/xge0000374~the-effects-of-bedtime-writing-on-difficulty-falling-asleep" target="_blank" rel="noopener">Scullin 2018</a>。</p>
            <p><b>【中〜弱】</b>マインドフルネス：不安・ストレス・睡眠に中程度の効果（ただし多くは8週間以上のプログラム）：<a href="https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6491852/" target="_blank" rel="noopener">大学生のメタ分析</a>。息を吐くのを長くする呼吸5分×4週で気分が改善（108人）：<a href="https://pubmed.ncbi.nlm.nih.gov/36630953/" target="_blank" rel="noopener">Stanford</a>。感謝の記録：幸福感への効果は小さい（g=0.22）：<a href="https://link.springer.com/article/10.1007/s41042-023-00086-6" target="_blank" rel="noopener">メタ分析</a>。</p>
            <p><b>【読書・学習】</b>学習法の比較では、「思い出す練習（テスト）」と「間隔をあけた復習」の効果が大きく、読み返し・マーカー・要約は効果が低いと評価されています（<a href="https://www.researchgate.net/publication/350528590_A_Meta-Analysis_of_Ten_Learning_Techniques" target="_blank" rel="noopener">10の学習法のメタ分析</a>）。思い出しの利点は、読み返しに対して効果量0.5〜0.6程度で、時間がたつほど大きいとされます（<a href="https://yukaichou.com/gamification-analysis/retrieval-practice-testing-effect-roediger-karpicke-learning/" target="_blank" rel="noopener">解説</a>）。学習の後の睡眠は、覚えた事実の定着を助けます（<a href="https://academic.oup.com/sleep/article/44/3/zsaa210/5920204" target="_blank" rel="noopener">研究</a>）。読書の習慣は、認知機能の低下が緩やか・寿命が長いという観察研究があります（<a href="https://www.nationalgeographic.com/health/article/reading-longevity-brain-health" target="_blank" rel="noopener">解説</a>）が、因果は確かではありません。「起床後の約3時間が脳のゴールデンタイム」という説は、日本の学習塾や解説記事で広まっていますが、私は確かな実験の根拠を確認できていません（個人差が大きい）。</p>
            <p><b>【弱い・注意】</b>運動イメージ（頭の中での練習）で筋力が増えるとする研究はあるが、効果は小さく、多くは小さな筋肉・少人数（<a href="https://link.springer.com/article/10.1007/s40279-018-0874-8" target="_blank" rel="noopener">メタ分析</a>）。実際のトレーニングの代わりにはならず、補助として。成功の空想だけだと努力が減る：WOOP（<a href="https://yukaichou.com/gamification-analysis/woop-mental-contrasting-oettingen-wish-outcome-obstacle-plan/" target="_blank" rel="noopener">解説</a>）。起床後90分カフェインを控える説は、直接の試験がなく根拠が弱い。</p>
            <p class="meal-hint">効果の大きさは条件や個人で変わります。2週間ほど試して、自分に合うかを見てください。医療上の助言ではありません。強い不調が続く場合は専門家に相談してください。</p>
          </div>
        </details>
      </div>`;

    const $ = (id) => root.querySelector("#" + id);

    function render() {
      $("hb-date").value = day; $("hb-daylabel").textContent = day === today ? "今日" : day;
      const nt = $("hb-notice");
      if (useLocal) { nt.style.display = "block"; nt.innerHTML = "いまは、この端末だけに保存しています（他の端末とは共有されません）。共有するには、Supabaseで schema.sql の <b>habit_logs</b> のSQLを実行してください。"; } else nt.style.display = "none";
      const r = cur(), checks = r.checks || {};
      const vg = visGroups(), visKeys = new Set(vg.flatMap(g => g.items.map(i => i[0])));
      const total = visKeys.size, done = [...visKeys].filter(k => checks[k]).length;
      $("hb-progress").innerHTML = `<div class="mrow"><div class="ml">達成</div><div class="mtrack"><div class="mfill" style="width:${Math.round(done / total * 100)}%"></div></div><div class="mv">${done} / ${total}</div></div>`;
      $("hb-checklist").innerHTML = vg.map(g => `<div class="hb-group"><div class="hb-gt">${g.title}<span>${g.items.filter(i => checks[i[0]]).length}/${g.items.length}</span></div>` +
        g.items.map(i => `<label class="hb-item"><input type="checkbox" data-k="${i[0]}"${checks[i[0]] ? " checked" : ""}><span>${esc(i[1])}${i[2] ? `<small>${esc(i[2])}</small>` : ""}</span></label>`).join("") + `</div>`).join("") +
        `<button type="button" id="hb-fulltoggle" style="margin-top:8px;background:none;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--ink-dim);cursor:pointer;">${isFull() ? "4つだけ表示に戻す" : "すべて表示（全16項目）"}</button>`;
      $("hb-fulltoggle").onclick = () => { try { localStorage.setItem(FULL_KEY, isFull() ? "0" : "1"); } catch (e) { /* 保存不可 */ } render(); };
      $("hb-checklist").querySelectorAll("input[type=checkbox]").forEach(cb => cb.addEventListener("change", () => {
        const c = { ...(cur().checks || {}) }; c[cb.dataset.k] = cb.checked; save({ checks: c }); render();
      }));
      $("hb-bed").value = r.bed_time || ""; $("hb-wake").value = r.wake_time || ""; $("hb-steps").value = r.steps ?? ""; $("hb-med").value = r.meditation_min ?? "";
      $("hb-todo").value = r.todo || ""; $("hb-grat").value = r.gratitude || ""; $("hb-refl").value = r.reflection || "";
      // WOOP は端末に保存（週の目標なので日付に紐づけない）
      let w = {}; try { w = JSON.parse(localStorage.getItem("lb_woop") || "{}"); } catch (e) { /* なし */ }
      $("hb-w").value = w.w || ""; $("hb-o").value = w.o || ""; $("hb-ob").value = w.ob || ""; $("hb-p").value = w.p || ""; $("hb-img").value = r.imagery || "";
      $("hb-rtitle").value = r.read_title || ""; $("hb-rmin").value = r.read_min ?? ""; $("hb-rnote").value = r.read_note || "";
      const rd = []; for (let i = 6; i >= 0; i--) { const x = logs[ymd(addDays(new Date(), -i))]; if (x && x.read_min) rd.push(x.read_min); }
      $("hb-readweek").textContent = rd.length ? `直近7日：${rd.length}日、合計${rd.reduce((a, b) => a + b, 0)}分` : "";
      sleepInfo(); weekTable(); plan();
    }

    function sleepMin(r) {
      const b = toMin(r.bed_time), w = toMin(r.wake_time); if (b == null || w == null) return null;
      return w >= b ? w - b + 0 : w + 1440 - b;   // 就寝が前夜（日付をまたぐ）でも、起床が同じ日でも、差を取る
    }
    function sleepInfo() {
      const m = sleepMin(cur());
      $("hb-sleepinfo").textContent = m == null ? "就寝と起床の時刻を入れると、睡眠時間を計算します。" :
        `睡眠時間：${Math.floor(m / 60)}時間${m % 60}分` + (m < 360 ? "（6時間未満。今日は早めに休みましょう）" : m < 420 ? "（もう少し寝ると良いです。7時間前後が目安）" : "（十分です）");
    }
    function weekTable() {
      const days = []; for (let i = 6; i >= 0; i--) days.push(ymd(addDays(new Date(), -i)));
      const rows = days.map(d => ({ d, r: logs[d] || {} }));
      const wakes = rows.map(x => toMin(x.r.wake_time)).filter(x => x != null);
      const spread = wakes.length >= 3 ? Math.max(...wakes) - Math.min(...wakes) : null;
      const sl = rows.map(x => sleepMin(x.r)).filter(x => x != null);
      const avg = sl.length ? Math.round(sl.reduce((a, b) => a + b, 0) / sl.length) : null;
      $("hb-week").innerHTML = `<table><tr><th>日</th><th>睡眠</th><th>起床</th><th>歩数</th><th>瞑想</th><th>達成</th></tr>` + rows.map(({ d, r }) => {
        const m = sleepMin(r), c = Object.values(r.checks || {}).filter(Boolean).length;
        return `<tr><td>${d.slice(5)}</td><td class="${m != null ? (m >= 360 ? "ok" : "ng") : ""}">${m != null ? (m / 60).toFixed(1) + "h" : "－"}</td><td>${r.wake_time || "－"}</td><td>${r.steps ?? "－"}</td><td>${r.meditation_min ?? "－"}</td><td>${c || "－"}</td></tr>`;
      }).join("") + `</table>` + `<div class="meal-hint">${avg != null ? `直近の平均睡眠：${(avg / 60).toFixed(1)}時間。` : ""}${spread != null ? `起床時刻のばらつき：${Math.round(spread)}分` + (spread > 90 ? "（大きめ。ずれを1時間以内に）" : "（安定しています）") : "起床時刻を3日以上記録すると、ばらつきを表示します。"}</div>`;
    }
    function plan() {
      const te = toMin($("hb-trainend").value), wg = toMin($("hb-wakegoal").value);
      const out = [];
      if (wg != null) { const bed = wg - 7.5 * 60; out.push(`起床 ${fmtMin(wg)} に7時間半寝るなら、就寝の目安は <b>${fmtMin(bed)}</b>。入浴は <b>${fmtMin(bed - 90)}</b> ごろ（就寝の90分前）、暗い照明・スマホ置きは <b>${fmtMin(bed - 60)}</b>。`); }
      if (te != null) { out.push(`トレーニング終了 ${fmtMin(te)} なら、就寝は <b>${fmtMin(te + 3 * 60)}〜${fmtMin(te + 4 * 60)}</b> 以降が目安（強い運動は就寝の3〜4時間前まで）。`);
        if (wg != null) { const bed = wg - 7.5 * 60; const gap = ((bed - te) + 1440) % 1440; if (gap < 180 && gap > 0) out.push(`<b>注意：</b>予定どおりだと、運動の終了から就寝まで ${Math.floor(gap / 60)}時間${gap % 60}分しかありません。運動を早めるか、強度を落とすか、起床を遅らせるのがおすすめです。`); } }
      $("hb-plan").innerHTML = out.length ? out.join("<br>") : "起床の目標と、トレーニングの終了予定を入れると、就寝・入浴の時刻を逆算します。";
    }
    ["hb-trainend", "hb-wakegoal"].forEach(id => $(id).addEventListener("input", plan));

    // ---------- 入力の保存 ----------
    $("hb-bed").addEventListener("change", () => { save({ bed_time: $("hb-bed").value }); sleepInfo(); weekTable(); });
    $("hb-wake").addEventListener("change", () => { save({ wake_time: $("hb-wake").value }); sleepInfo(); weekTable(); });
    $("hb-steps").addEventListener("change", () => { save({ steps: $("hb-steps").value === "" ? null : parseInt($("hb-steps").value, 10) }); weekTable(); });
    $("hb-med").addEventListener("change", () => { save({ meditation_min: $("hb-med").value === "" ? null : parseInt($("hb-med").value, 10) }); weekTable(); });
    $("hb-rsave").addEventListener("click", async () => {
      await save({ read_title: $("hb-rtitle").value.trim(), read_min: $("hb-rmin").value === "" ? null : parseInt($("hb-rmin").value, 10), read_note: $("hb-rnote").value.trim() });
      $("hb-rstate").textContent = " 保存しました"; setTimeout(() => { $("hb-rstate").textContent = ""; }, 2500); render();
    });
    $("hb-jsave").addEventListener("click", async () => { await save({ todo: $("hb-todo").value.trim(), gratitude: $("hb-grat").value.trim(), reflection: $("hb-refl").value.trim() }); $("hb-jstate").textContent = " 保存しました"; setTimeout(() => { $("hb-jstate").textContent = ""; }, 2500); });
    $("hb-wsave").addEventListener("click", async () => {
      try { localStorage.setItem("lb_woop", JSON.stringify({ w: $("hb-w").value.trim(), o: $("hb-o").value.trim(), ob: $("hb-ob").value.trim(), p: $("hb-p").value.trim() })); } catch (e) { /* 保存不可 */ }
      await save({ imagery: $("hb-img").value.trim() }); $("hb-wsave").textContent = "保存しました"; setTimeout(() => { $("hb-wsave").textContent = "保存"; }, 2000);
    });
    const go = (n) => { day = ymd(addDays(new Date(day + "T00:00:00"), n)); render(); };
    $("hb-prev").addEventListener("click", () => go(-1)); $("hb-next").addEventListener("click", () => go(1)); $("hb-today").addEventListener("click", () => { day = today; render(); });
    $("hb-date").addEventListener("change", (e) => { day = e.target.value || day; render(); });

    // ---------- 呼吸・瞑想タイマー ----------
    let timer = null, audio = null;
    const beep = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const o = audio.createOscillator(), g = audio.createGain(); o.connect(g); g.connect(audio.destination); o.frequency.value = 660; g.gain.setValueAtTime(0.15, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 1.2); o.start(); o.stop(audio.currentTime + 1.2); } catch (e) { /* 音が出せなくても続行 */ } };
    function stopTimer(final) { if (timer) { clearInterval(timer); timer = null; } if (!final) { $("hb-cue").textContent = "停止しました"; } }
    function startTimer(seconds, kind) {
      stopTimer(true); if (audio && audio.state === "suspended") audio.resume();
      const t0 = Date.now();
      const tick = () => {
        const el = (Date.now() - t0) / 1000, left = Math.max(0, seconds - el);
        $("hb-clock").textContent = `${Math.floor(left / 60)}:${pad(Math.floor(left % 60))}`;
        if (kind === "breath") {
          const c = el % 13.5;
          $("hb-cue").textContent = c < 4 ? "鼻から吸う" : c < 5.5 ? "もう一度、短く吸い足す" : "口からゆっくり長く吐く";
          $("hb-cue").style.transform = `scale(${c < 5.5 ? 1.12 : 0.94})`;
        } else { $("hb-cue").textContent = "呼吸に意識を向ける（それたら戻す）"; $("hb-cue").style.transform = "scale(1)"; }
        if (left <= 0) {
          stopTimer(true); beep(); $("hb-cue").textContent = "おつかれさまでした"; $("hb-cue").style.transform = "scale(1)";
          const add = Math.round(seconds / 60); const cr = cur(); save({ meditation_min: (cr.meditation_min || 0) + add }); $("hb-med").value = cr.meditation_min; weekTable();
        }
      };
      timer = setInterval(tick, 250); tick();
    }
    $("hb-start-breath").addEventListener("click", () => startTimer(300, "breath"));
    $("hb-start-med").addEventListener("click", () => startTimer(600, "med"));
    $("hb-stop").addEventListener("click", () => stopTimer(false));

    render(); loadAll();
    return { refresh: loadAll };
  }

  global.LifeHabits = { mount };
})(window);
