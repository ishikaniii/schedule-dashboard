// LifeBase：画像をGemini（Google AI Studioの無料枠）に読ませる共通処理（2026-09-21）
// APIキーはユーザーが自分で作って貼り付け、この端末のlocalStorageにだけ保存する
// （アプリのコード・GitHub・Supabaseには入らない）。写真はGoogleに送信される。
// 使い道：レシートの読み取り（金額・日付・店名・分類）。食事タブの写真認識も同じキーを使う。
(function (global) {
  "use strict";
  const KEY = "lb_gemini_key", MODEL = "lb_gemini_model";
  const ls = { get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存不可 */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* なし */ } } };

  async function pickModel(key) {
    const cached = ls.get(MODEL); if (cached) return cached;
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key) + "&pageSize=200");
    if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? "キーが正しくないか、権限がありません（" + r.status + "）" : "モデル一覧を取得できませんでした（" + r.status + "）");
    const d = await r.json();
    const names = (d.models || []).filter(x => (x.supportedGenerationMethods || []).includes("generateContent") && /flash/i.test(x.name)
      && !/lite|preview|exp|thinking|tts|image|live|audio/i.test(x.name)).map(x => x.name.replace(/^models\//, ""));
    names.sort().reverse();
    const m = names[0] || "gemini-2.0-flash"; ls.set(MODEL, m); return m;
  }

  async function toJpegBase64(file, maxSide) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const sc = Math.min(1, (maxSide || 1600) / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88).split(",")[1];
  }

  // 画像＋指示 → JSON（オブジェクトまたは配列）。失敗時は Error（メッセージは利用者向け）。
  async function askImage(file, prompt, opts) {
    const key = ls.get(KEY); if (!key) throw new Error("APIキーが未設定です");
    const b64 = await toJpegBase64(file, (opts && opts.maxSide) || 1600), model = await pickModel(key);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
                             generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
    });
    if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error("キーが正しくないか、権限がありません（" + r.status + "）");
    if (r.status === 429) throw new Error("無料枠の利用上限に達しました。しばらく待ってからやり直してください");
    if (r.status === 404) { ls.del(MODEL); throw new Error("モデルが見つかりません。もう一度お試しください"); }
    if (!r.ok) throw new Error("認識に失敗しました（" + r.status + "）");
    const d = await r.json();
    const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
    const text = parts.map(p => p.text || "").join("").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    try { return JSON.parse(text); } catch (e) { throw new Error("結果を読み取れませんでした"); }
  }

  const RECEIPT_PROMPT = "これはレシートの写真です。次の項目を読み取り、JSONオブジェクトだけを返してください（説明文やコードブロックは不要）。" +
    "{\"store\":\"店名\",\"date\":\"YYYY-MM-DD（読み取れなければ空文字）\",\"total\":税込の支払合計金額（円・整数）," +
    "\"category\":\"食費|日用品|交通費|旅行|交際費|趣味・娯楽|固定費|その他 のうち最も近いもの\",\"items\":[{\"name\":\"品名\",\"price\":金額(円・整数)}]}。" +
    "合計は「合計」「お会計」「税込合計」などの金額で、お預り金額・お釣り・ポイント・電話番号・登録番号は合計ではありません。" +
    "読み取れない項目は、文字列なら空文字、数値なら0にしてください。";
  async function readReceipt(file) {
    const o = await askImage(file, RECEIPT_PROMPT);
    const r = Array.isArray(o) ? (o[0] || {}) : o;
    return {
      store: String(r.store || "").slice(0, 60), date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : "",
      total: Math.round(+r.total || 0), category: String(r.category || ""),
      items: (Array.isArray(r.items) ? r.items : []).map(x => ({ name: String(x.name || "").slice(0, 40), price: Math.round(+x.price || 0) })).filter(x => x.name),
    };
  }

  global.LifeGemini = { getKey: () => ls.get(KEY), setKey: (v) => { ls.set(KEY, v); ls.del(MODEL); }, hasKey: () => !!ls.get(KEY), askImage, readReceipt };
})(window);
