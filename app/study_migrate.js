// LifeBase：旧FP3級設定（localStorageのlb_fp）を、新しい資格テーブル(qualifications)へ
// 自動で1回だけ移行する（2026-09-24追加）。学習タブ・記録ページのどちらが先に開かれても
// 動くよう、両方から呼ぶ共通スクリプト。移行済みかどうかは、この端末のlocalStorageで判定する
// （lb_fpはブラウザごとのデータだったため、移行も開いたブラウザでしか行えない）。
(function (global) {
  "use strict";
  const FP_AREAS = ["ライフプランニングと資金計画", "リスク管理", "金融資産運用", "タックスプランニング", "不動産", "相続・事業承継"];
  const DONE_KEY = "lb_fp_migrated";

  async function migrateFP(sb) {
    try {
      if (localStorage.getItem(DONE_KEY) === "1") return;
      const raw = localStorage.getItem("lb_fp");
      if (!raw) { localStorage.setItem(DONE_KEY, "1"); return; }
      let f; try { f = JSON.parse(raw); } catch (e) { localStorage.setItem(DONE_KEY, "1"); return; }
      if (!f || (!f.date && !f.target && !f.areas)) { localStorage.setItem(DONE_KEY, "1"); return; }
      const { data: existing, error: selErr } = await sb.from("qualifications").select("id").eq("name", "FP3級").limit(1);
      if (selErr) return;   // qualificationsテーブル未準備。SQL実行後にまた試す
      if (existing && existing.length) { localStorage.setItem(DONE_KEY, "1"); return; }   // 既に手動で作られている
      const area_status = {};
      FP_AREAS.forEach((name, i) => {
        const a = f.areas && f.areas[i];
        if (a && (a.read || a.drill)) area_status[name] = { read: !!a.read, drill: !!a.drill };
      });
      const { error } = await sb.from("qualifications").insert({
        name: "FP3級", target_date: f.date || null, target_hours: parseInt(f.target, 10) || 100,
        areas: FP_AREAS, area_status,
      });
      if (!error) localStorage.setItem(DONE_KEY, "1");
    } catch (e) { /* 移行に失敗しても、通常の表示は続ける */ }
  }

  global.LifeStudyMigrate = { migrateFP };
})(window);
