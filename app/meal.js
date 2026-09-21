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

  // 検索用の追加辞書（外食・定番料理など、1食分の目安）：[名前, 1食分, kcal, P, F, C, 価格の目安, 検索キーワード]
  // 商品名の検索は Open Food Facts（無料の公開データ）にも問い合わせる。どれも「大体の値」。
  const DISHES = [
    ["カレーライス", "1皿", 750, 20, 20, 120, 500, "カレー"],
    ["牛丼（並）", "1杯", 650, 20, 20, 95, 400, "ぎゅうどん 吉野家 すき家 松屋"],
    ["親子丼", "1杯", 700, 30, 17, 110, 450, "おやこどん 丼"],
    ["カツ丼", "1杯", 900, 32, 28, 110, 550, "かつどん 丼"],
    ["天丼", "1杯", 750, 20, 20, 115, 550, "てんどん 丼"],
    ["鶏の唐揚げ定食", "1食", 950, 35, 35, 110, 650, "からあげ 定食 唐揚げ"],
    ["焼き魚定食", "1食", 650, 30, 15, 95, 650, "さば 鮭 焼魚 定食"],
    ["生姜焼き定食", "1食", 850, 30, 30, 100, 650, "しょうが焼き 豚 定食"],
    ["ラーメン（醤油）", "1杯", 500, 20, 15, 70, 700, "らーめん 中華そば"],
    ["ラーメン（豚骨）", "1杯", 600, 22, 22, 75, 800, "とんこつ らーめん"],
    ["うどん（かけ）", "1杯", 340, 9, 2, 70, 350, "かけうどん"],
    ["きつねうどん", "1杯", 420, 13, 8, 72, 400, "うどん"],
    ["ざるそば", "1枚", 300, 11, 2, 60, 500, "そば 蕎麦"],
    ["ナポリタン", "1皿", 650, 17, 20, 95, 700, "パスタ スパゲティ"],
    ["ミートソースパスタ", "1皿", 700, 25, 20, 100, 800, "パスタ スパゲティ ミート"],
    ["ハンバーグ", "1個", 250, 15, 17, 8, 150, "ハンバーグ"],
    ["餃子", "6個", 300, 12, 15, 28, 250, "ギョーザ ぎょうざ"],
    ["チャーハン", "1皿", 700, 16, 22, 105, 600, "炒飯 焼き飯"],
    ["オムライス", "1皿", 750, 22, 27, 100, 700, "オムライス"],
    ["ハンバーガー", "1個", 300, 15, 12, 33, 200, "バーガー マック"],
    ["ピザ", "1切れ", 250, 10, 9, 30, 200, "ピザ"],
    ["フライドポテト（M）", "1個", 400, 5, 20, 50, 250, "ポテト"],
    ["サンドイッチ（ミックス）", "1パック", 350, 12, 18, 35, 300, "サンド"],
    ["味噌汁", "1杯", 40, 3, 1.3, 4, 30, "みそしる"],
    ["焼き鳥（もも・タレ）", "1本", 90, 6, 5, 4, 100, "やきとり"],
    ["刺身（盛り合わせ）", "1人前", 200, 30, 6, 2, 600, "さしみ 魚"],
    ["冷奴", "1丁150g", 108, 9.9, 6.3, 2.4, 45, "豆腐 ひややっこ"],
    ["サラダ（ドレッシング付）", "1皿", 80, 2, 5, 8, 250, "野菜"],
    ["おでん（大根・卵など3品）", "1人前", 150, 10, 6, 12, 300, "おでん"],
    ["缶コーヒー（加糖）", "1缶", 60, 1, 1, 12, 130, "コーヒー"],
    ["スポーツドリンク", "500ml", 100, 0, 0, 25, 150, "ポカリ アクエリ"],
    ["コーラ", "500ml", 225, 0, 0, 56, 160, "ジュース 炭酸"],
    ["チョコレート", "1/2板25g", 140, 2, 8, 15, 60, "ちょこ お菓子"],
    ["ポテトチップス", "1/3袋", 180, 2, 11, 18, 60, "スナック お菓子"],
    ["アイスクリーム", "1個", 200, 3, 10, 24, 150, "アイス"],
    ["メロンパン", "1個", 400, 7, 12, 65, 150, "パン"],
    ["カレーパン", "1個", 350, 7, 20, 35, 150, "パン"],
    ["おにぎり（梅）", "1個", 170, 4, 0.5, 38, 120, "おむすび"],
    ["おにぎり（明太子）", "1個", 175, 5, 0.6, 38, 130, "おむすび"],
    ["幕の内弁当", "1個", 750, 25, 20, 110, 550, "弁当"],
    ["ミルクティー", "500ml", 150, 2, 3, 28, 150, "紅茶"],
  ];

  // ---------- 自炊レシピ（冷凍OK・高たんぱく・安い・初心者向け） ----------
  // 栄養は1食分の概算（食品成分表ベース）。作り置き→小分け冷凍→レンジで温め、が基本。
  const RECIPES = [
    { name: "鶏むね肉の味噌しょうゆ漬け焼き", tag: "主菜", unit: "1食（約125g）", batch: "6食分（むね肉3枚）",
      kcal: 150, p: 28, f: 2, c: 3, price: 85,
      ing: ["鶏むね肉（皮なし）3枚（約750g）", "味噌 大さじ2", "しょうゆ 大さじ1", "みりん 大さじ1", "砂糖 小さじ1", "おろしにんにく（チューブ）少々"],
      steps: ["むね肉は厚い所に切り込みを入れて厚さをそろえ、半分に切る（フォークで数か所刺すと柔らかくなる）。", "調味料を混ぜ、むね肉と一緒に冷凍用保存袋に入れて、袋の上からもんでなじませる。", "空気を抜いて平らにし、そのまま冷凍する（1食分ずつ小分けにしても良い）。", "食べる日の前夜に冷蔵庫で解凍する。", "フライパンに油を薄くひき、中火で片面3〜4分ずつ、中まで火が通るまで焼く（切って白く、透明な汁が出ればOK）。"],
      freeze: "冷凍：漬けた状態で約3〜4週間。解凍は冷蔵庫でゆっくり（常温・再冷凍はしない）。焼いた後の冷凍も可（約2〜3週間、レンジで温め直す）。" },
    { name: "鶏そぼろ（高たんぱく）", tag: "主菜・どんぶり", unit: "1食（約100g）", batch: "4食分（ひき肉400g）",
      kcal: 135, p: 21, f: 2, c: 5, price: 70,
      ing: ["鶏ひき肉（むね）400g", "しょうゆ 大さじ2", "みりん 大さじ2", "酒 大さじ2", "砂糖 大さじ1", "しょうが（チューブ）少々"],
      steps: ["フライパンに、ひき肉と調味料をすべて入れ、火を付ける前によく混ぜる（ダマになりにくい）。", "中火にかけ、菜箸4本でかき混ぜながら、ポロポロになるまで加熱する。", "水分が少なくなり、全体に火が通れば完成。", "粗熱を取り、1食分（約100g）ずつラップに包むか、小分け容器に入れて冷凍する。"],
      freeze: "冷凍：約3〜4週間。レンジ（600Wで約1分）で温め、ご飯やお弁当に。卵やほうれん草を足すと栄養が増える。" },
    { name: "豆腐入り鶏ハンバーグ", tag: "主菜", unit: "1個", batch: "4個分",
      kcal: 165, p: 21, f: 5, c: 5, price: 100,
      ing: ["鶏ひき肉（むね中心）300g", "木綿豆腐 150g（軽く水切り）", "卵 1個", "パン粉 大さじ4", "玉ねぎ 1/2個（みじん切り）", "塩 小さじ1/3、こしょう少々"],
      steps: ["玉ねぎをレンジ（600W）で1分加熱して冷ます。", "ボウルに材料をすべて入れ、粘りが出るまでよく混ぜる。", "4等分して小判形にまとめ、中央を軽くくぼませる。", "油を薄くひいたフライパンで、中火で片面3分焼き、裏返してふたをして弱火で5〜6分蒸し焼きにする。", "粗熱を取り、1個ずつラップに包んで、保存袋に入れて冷凍する。"],
      freeze: "冷凍：約3〜4週間。凍ったまま、または冷蔵庫で解凍して、レンジで温める（600Wで約2分、途中で裏返す）。" },
    { name: "鶏むねカレー（じゃがいもなし）", tag: "主菜・カレー", unit: "1食（ご飯なし・約250g）", batch: "6食分",
      kcal: 230, p: 24, f: 9, c: 14, price: 120,
      ing: ["鶏むね肉（皮なし）500g（ひと口大）", "玉ねぎ 2個", "にんじん 1本", "カレールー 100g（約5皿分）", "水 700ml", "（お好みで）トマト缶・ほうれん草"],
      steps: ["むね肉は、そぎ切りにして片栗粉を薄くまぶす（パサつき防止）。", "玉ねぎは薄切り、にんじんは小さめの乱切りにする。", "鍋に油を熱して玉ねぎを炒め、透き通ったら肉と、にんじんを加えて炒める。", "水を入れ、沸騰したらアクを取り、弱火で15分煮る。", "火を止めてルーを溶かし、弱火で5分煮る。", "粗熱を取り、1食分ずつ保存袋か容器に入れて冷凍する。"],
      freeze: "冷凍：約3〜4週間。じゃがいもは冷凍すると食感が悪くなるので入れない。解凍はレンジ（600Wで約3分）。ご飯は別に冷凍しておくと便利。" },
    { name: "豚こま肉のしょうが焼き（下味冷凍）", tag: "主菜", unit: "1食（約100g）", batch: "4食分（豚こま400g）",
      kcal: 210, p: 21, f: 11, c: 6, price: 110,
      ing: ["豚こま切れ肉 400g", "しょうゆ 大さじ2", "みりん 大さじ2", "酒 大さじ1", "砂糖 小さじ2", "しょうが（チューブ）小さじ2", "片栗粉 小さじ2"],
      steps: ["1食分（約100g）ずつ、冷凍用保存袋に入れる。", "調味料と片栗粉を、袋の上から均等に加え、もんでなじませる。", "平らにして空気を抜き、冷凍する。", "食べる日の前夜に冷蔵庫で解凍する（急ぐときはレンジの解凍モード）。", "フライパンで中火で、肉の色が変わるまで炒め、たれをからめる。キャベツを添えると良い。"],
      freeze: "冷凍：約3〜4週間。下味冷凍は、焼いてから冷凍するより、味がしみて柔らかい。" },
    { name: "まとめ炊きご飯の小分け冷凍", tag: "主食", unit: "1食（150g）", batch: "5〜6食分（3合）",
      kcal: 252, p: 3.8, f: 0.5, c: 55.7, price: 25,
      ing: ["米 3合（炊飯器で普通に炊く）"],
      steps: ["炊き上がったら、すぐに1食分（約150g）ずつラップに平らに包む（薄くすると早く冷めて、レンジで温めムラも少ない）。", "粗熱を取ってから、冷凍用保存袋にまとめて入れ、冷凍する。", "食べる時は、ラップのままレンジ（600Wで約2分）。"],
      freeze: "冷凍：約1か月。炊きたてを、時間を置かず包んで冷凍すると、美味しさが保てる。" },
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
        <div class="meal-search">
          <input type="search" id="ms-q" placeholder="食品名で検索して自動入力（例：牛丼、カレー、サラダチキン）">
          <div id="ms-res" class="meal-results"></div>
        </div>
        <div class="meal-photo">
          <label class="meal-photo-btn">写真から入力<input type="file" id="mp-file" accept="image/*" hidden></label>
          <input type="text" id="mp-hint" class="mp-hint" placeholder="補足（任意）：例）鶏むね150g、ご飯200g、手作り" maxlength="120">
          <span id="mp-status" class="meal-hint"></span>
        </div>
        <div id="mp-result"></div>
        <details class="meal-manual" id="mp-settings"><summary>写真認識の設定（無料のGemini APIキー）</summary>
          <div class="meal-hint">写真の認識には、Googleの無料枠のAI（Gemini）を使います。<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Google AI Studio</a> でAPIキーを作成（無料・クレジットカード不要）して、下に貼り付けてください。キーはこの端末のブラウザにだけ保存され、アプリのコードやGitHubには入りません。写真はGoogleに送信されます（無料枠では入力内容がGoogleのサービス改善に使われる場合があります）。<b>他人が写る写真や個人情報が写る写真は送らないでください。</b></div>
          <div class="meal-weight"><input type="password" id="mp-key" placeholder="APIキー（AIza…）" autocomplete="off"><button type="button" id="mp-keysave" class="meal-primary">保存</button></div>
          <div class="meal-hint" id="mp-keystate"></div>
        </details>
        <div id="meal-recent" class="meal-chips"></div>
        <div class="meal-cats" id="meal-cats"></div>
        <div id="meal-foods" class="meal-chips"></div>
        <details class="meal-manual"><summary>手入力で追加（表示にない物・商品ラベルの値）</summary>
          <form id="meal-form" class="meal-target-form">
            <label>名前<input type="text" id="mf-name" required maxlength="60"></label>
            <label>量(g・任意)<input type="number" id="mf-grams" step="1" min="1" placeholder="検索した商品用"></label>
            <label>kcal<input type="number" id="mf-kcal" step="1" min="0" required></label>
            <label>たんぱく質g<input type="number" id="mf-p" step="0.1" min="0" value="0"></label>
            <label>脂質g<input type="number" id="mf-f" step="0.1" min="0" value="0"></label>
            <label>炭水化物g<input type="number" id="mf-c" step="0.1" min="0" value="0"></label>
            <label>値段(円)<input type="number" id="mf-price" step="1" min="0"></label>
            <button type="submit" class="meal-primary">追加</button>
          </form>
        </details>
      </div>
      <div class="card meal-card">
        <h2>自炊レシピ<span class="tag">冷凍OK・高たんぱく・安い</span></h2>
        <div class="meal-hint">週末に作って小分けで冷凍しておくと、突発的な外出が多い日も、レンジだけで食べられます。栄養は1食分の概算です。</div>
        <div id="meal-recipes"></div>
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


    // ---------------- 自炊レシピ ----------------
    $("meal-recipes").innerHTML = RECIPES.map((r, i) => `
      <details class="meal-recipe"><summary><b>${esc(r.name)}</b><span>${esc(r.unit)}：${r.kcal}kcal・P${r.p}g・約${r.price}円</span></summary>
        <div class="mr-body">
          <div class="meal-hint">${esc(r.tag)}／作る量：${esc(r.batch)}／1食（${esc(r.unit)}）：F${r.f}g・C${r.c}g</div>
          <div class="mr-h">材料</div><ul>${r.ing.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          <div class="mr-h">作り方</div><ol>${r.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol>
          <div class="mr-h">冷凍・温め直し</div><p>${esc(r.freeze)}</p>
          <button type="button" class="meal-primary mr-add" data-i="${i}">この1食を記録（食事の種類は上の選択）</button>
        </div></details>`).join("");
    $("meal-recipes").querySelectorAll(".mr-add").forEach(b => b.addEventListener("click", async () => {
      const r = RECIPES[+b.dataset.i];
      if (await add({ date: day, meal: $("meal-type").value, name: "手作り：" + r.name, kcal: r.kcal, protein: r.p, fat: r.f, carb: r.c, price: r.price })) { fetchAll(); b.textContent = "記録しました"; }
    }));

    // ---------------- 検索（辞書＋Open Food Facts） ----------------
    let scale = null;            // 100gあたりの栄養（Open Food Facts）→ 量(g)から計算
    const openManual = () => { const d = root.querySelector(".meal-manual:has(#meal-form)") || $("meal-form").closest("details"); if (d) d.open = true; };
    function fillForm(name, kcal, p, f, c, price, grams) {
      openManual();
      $("mf-name").value = name; $("mf-kcal").value = Math.round(kcal); $("mf-p").value = r1(p); $("mf-f").value = r1(f); $("mf-c").value = r1(c);
      $("mf-price").value = price || ""; $("mf-grams").value = grams || "";
      $("meal-form").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    $("mf-grams").addEventListener("input", () => {
      if (!scale) return; const g = parseFloat($("mf-grams").value) || 0;
      $("mf-kcal").value = Math.round(scale.kcal * g / 100); $("mf-p").value = r1(scale.p * g / 100); $("mf-f").value = r1(scale.f * g / 100); $("mf-c").value = r1(scale.c * g / 100);
    });
    const norm = (s) => String(s || "").toLowerCase().replace(/[\s　（）()・]/g, "");
    let searchSeq = 0, searchTimer = null;
    function localHits(q) {
      const nq = norm(q);
      const all = FOODS.map(f => ({ name: f[0], serving: f[1], kcal: f[2], p: f[3], f: f[4], c: f[5], price: f[6], key: "" }))
        .concat(DISHES.map(d => ({ name: d[0], serving: d[1], kcal: d[2], p: d[3], f: d[4], c: d[5], price: d[6], key: d[7] })));
      return all.filter(x => norm(x.name).includes(nq) || norm(x.key).includes(nq)).slice(0, 8);
    }
    async function offHits(q, seq) {
      const url = "https://jp.openfoodfacts.org/cgi/search.pl?" + new URLSearchParams({ search_terms: q, search_simple: 1, action: "process", json: 1, page_size: 8, fields: "product_name,brands,nutriments,serving_size" });
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
      try {
        const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status);
        const d = await r.json(); if (seq !== searchSeq) return null;
        return (d.products || []).map(p => {
          const n = p.nutriments || {};
          return { name: (p.product_name || "").trim(), brand: p.brands || "", kcal: +n["energy-kcal_100g"], p: +n.proteins_100g || 0, f: +n.fat_100g || 0, c: +n.carbohydrates_100g || 0, serving: p.serving_size || "" };
        }).filter(x => x.name && x.kcal >= 20 && x.kcal <= 900).slice(0, 6);
      } catch (e) { return []; } finally { clearTimeout(to); }
    }
    function renderResults(local, off, offState) {
      const rows = local.map((x, i) => `<button type="button" class="meal-res" data-k="l${i}"><b>${esc(x.name)}</b><small>${esc(x.serving)}・${Math.round(x.kcal)}kcal・P${r1(x.p)}・F${r1(x.f)}・C${r1(x.c)}</small></button>`).join("")
        + (off || []).map((x, i) => `<button type="button" class="meal-res off" data-k="o${i}"><b>${esc(x.name)}</b>${x.brand ? `<em>${esc(x.brand)}</em>` : ""}<small>100gあたり ${Math.round(x.kcal)}kcal・P${r1(x.p)}・F${r1(x.f)}・C${r1(x.c)}（商品データ）</small></button>`).join("");
      $("ms-res").innerHTML = (rows || "") + (offState ? `<div class="meal-hint">${offState}</div>` : "") ;
      $("ms-res").querySelectorAll(".meal-res").forEach(b => b.addEventListener("click", () => {
        const k = b.dataset.k, i = parseInt(k.slice(1), 10);
        if (k[0] === "l") { const x = local[i]; scale = null; fillForm(x.name, x.kcal * mult, x.p * mult, x.f * mult, x.c * mult, Math.round(x.price * mult), ""); }
        else { const x = off[i]; scale = { kcal: x.kcal, p: x.p, f: x.f, c: x.c }; const gm = parseInt((String(x.serving).match(/(\d+)\s*g/) || [])[1], 10) || 100; fillForm(x.name, x.kcal * gm / 100, x.p * gm / 100, x.f * gm / 100, x.c * gm / 100, "", gm); }
      }));
    }
    $("ms-q").addEventListener("input", () => {
      const q = $("ms-q").value.trim(); clearTimeout(searchTimer);
      if (q.length < 2) { $("ms-res").innerHTML = ""; return; }
      const local = localHits(q); renderResults(local, [], "商品データベースを検索中…");
      const seq = ++searchSeq;
      searchTimer = setTimeout(async () => {
        const off = await offHits(q, seq); if (off === null || seq !== searchSeq) return;
        renderResults(local, off, off.length ? "" : (local.length ? "" : "見つかりませんでした。別の言い方で検索するか、下の手入力で追加してください。"));
      }, 600);
    });

    // ---------------- 写真から入力（Gemini 無料枠） ----------------
    const KEYNAME = "lb_gemini_key", MODELNAME = "lb_gemini_model";
    const getKey = () => { try { return localStorage.getItem(KEYNAME) || ""; } catch (e) { return ""; } };
    const showKeyState = () => { $("mp-keystate").textContent = getKey() ? "APIキーは保存済みです（この端末のみ）。" : "APIキーが未設定です。"; };
    showKeyState();
    $("mp-keysave").addEventListener("click", () => {
      const v = $("mp-key").value.trim(); if (!v) return;
      try { localStorage.setItem(KEYNAME, v); localStorage.removeItem(MODELNAME); } catch (e) { /* 保存不可 */ }
      $("mp-key").value = ""; showKeyState(); $("mp-status").textContent = "キーを保存しました。写真を選んでください。";
    });
    async function pickModel(key) {
      let m = ""; try { m = localStorage.getItem(MODELNAME) || ""; } catch (e) { /* なし */ }
      if (m) return m;
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key) + "&pageSize=200");
      if (!r.ok) throw new Error("models:" + r.status);
      const d = await r.json();
      const names = (d.models || []).filter(x => (x.supportedGenerationMethods || []).includes("generateContent") && /flash/i.test(x.name) && !/lite|preview|exp|thinking|tts|image|live|audio/i.test(x.name)).map(x => x.name.replace(/^models\//, ""));
      names.sort().reverse();
      m = names[0] || "gemini-2.0-flash";
      try { localStorage.setItem(MODELNAME, m); } catch (e) { /* なし */ }
      return m;
    }
    async function toJpegBase64(file) {
      const bmp = await (window.createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }) : Promise.reject());
      const scaleF = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scaleF); c.height = Math.round(bmp.height * scaleF);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.85).split(",")[1];
    }
    const PROMPT = "この食事の写真に写っている料理・食品をすべて挙げ、日本の一般的な1食分として、それぞれの量と栄養を推定してください。" +
      "必ずJSONの配列だけを返してください（説明文やコードブロックは不要）。形式：[{\"name\":\"料理名\",\"amount\":\"量の説明（例：1杯、150g）\",\"kcal\":数値,\"protein\":数値(g),\"fat\":数値(g),\"carb\":数値(g)}]。" +
      "食べ物が写っていなければ空の配列[]を返してください。値は概算でかまいません。";
    let photoItems = [];
    function renderPhoto() {
      if (!photoItems.length) { $("mp-result").innerHTML = ""; return; }
      $("mp-result").innerHTML = `<div class="meal-hint"><b>認識結果（概算）</b>：チェックして「追加」。数値は直せます。</div>` + photoItems.map((x, i) => `
        <div class="mp-row"><label><input type="checkbox" class="mp-chk" data-i="${i}" checked> <b>${esc(x.name)}</b> <small>${esc(x.amount)}</small></label>
          <div class="mp-nums"><input type="number" data-i="${i}" data-k="kcal" value="${Math.round(x.kcal)}"><span>kcal</span>
          <input type="number" data-i="${i}" data-k="protein" step="0.1" value="${r1(x.protein)}"><span>P</span>
          <input type="number" data-i="${i}" data-k="fat" step="0.1" value="${r1(x.fat)}"><span>F</span>
          <input type="number" data-i="${i}" data-k="carb" step="0.1" value="${r1(x.carb)}"><span>C</span></div></div>`).join("") +
        `<button type="button" id="mp-add" class="meal-primary" style="margin-top:8px;">選んだものを追加</button>`;
      $("mp-result").querySelectorAll("input[type=number]").forEach(inp => inp.addEventListener("input", () => { photoItems[+inp.dataset.i][inp.dataset.k] = parseFloat(inp.value) || 0; }));
      $("mp-add").addEventListener("click", async () => {
        const sel = [...$("mp-result").querySelectorAll(".mp-chk")].filter(c => c.checked).map(c => photoItems[+c.dataset.i]);
        for (const x of sel) { if (!(await add({ date: day, meal: $("meal-type").value, name: x.name, kcal: Math.round(x.kcal), protein: r1(x.protein), fat: r1(x.fat), carb: r1(x.carb), price: null }))) return; }
        photoItems = []; renderPhoto(); $("mp-status").textContent = `${sel.length}件を追加しました。`; fetchAll();
      });
    }
    $("mp-file").addEventListener("change", async () => {
      const file = $("mp-file").files[0]; if (!file) return;
      const key = getKey();
      if (!key) { $("mp-settings").open = true; $("mp-status").textContent = "先に、下の設定でAPIキーを保存してください。"; $("mp-file").value = ""; return; }
      $("mp-result").innerHTML = ""; $("mp-status").textContent = "認識しています…（10〜20秒）";
      try {
        const b64 = await toJpegBase64(file), model = await pickModel(key);
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT + ($("mp-hint").value.trim() ? "\n補足情報（量や材料など、写真より優先してください）：" + $("mp-hint").value.trim() : "") + (/手作り|自炊/.test($("mp-hint").value) ? "\n手作りの料理なので、家庭の一般的な調理（油や調味料の量）で推定してください。" : "") }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }),
        });
        if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error("キーが正しくないか、権限がありません（" + r.status + "）。キーを確認してください。");
        if (r.status === 429) throw new Error("無料枠の利用上限に達しました。しばらく待ってからやり直してください。");
        if (r.status === 404) { try { localStorage.removeItem(MODELNAME); } catch (e) { /* なし */ } throw new Error("モデルが見つかりません。もう一度お試しください。"); }
        if (!r.ok) throw new Error("認識に失敗しました（" + r.status + "）。");
        const d = await r.json();
        const text = (((d.candidates || [])[0] || {}).content || {}).parts ? d.candidates[0].content.parts.map(p => p.text || "").join("") : "";
        const arr = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
        photoItems = (Array.isArray(arr) ? arr : []).filter(x => x && x.name).map(x => ({ name: String(x.name).slice(0, 60), amount: x.amount || "", kcal: +x.kcal || 0, protein: +x.protein || 0, fat: +x.fat || 0, carb: +x.carb || 0 }));
        $("mp-status").textContent = photoItems.length ? "" : "食べ物を認識できませんでした。別の写真か、検索・手入力をお試しください。";
        renderPhoto();
      } catch (e) {
        $("mp-status").textContent = e && e.message && !/JSON|Unexpected/.test(e.message) ? e.message : "結果を読み取れませんでした。もう一度お試しください。";
      } finally { $("mp-file").value = ""; }
    });

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
      if (ok){ scale = null; e.target.reset(); $("mf-p").value = 0; $("mf-f").value = 0; $("mf-c").value = 0; fetchAll(); }
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
