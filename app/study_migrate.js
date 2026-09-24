// LifeBase：旧FP3級設定（localStorageのlb_fp）を、新しい資格テーブル(qualifications)へ
// 自動で移行する（2026-09-24追加）。学習タブ・記録ページのどちらが先に開かれても動くよう、
// 両方から呼ぶ共通スクリプト。
//
// 複数端末で使っていた場合への対応（2026-09-24追記）：lb_fpは端末（ブラウザ）ごとの
// データなので、最初に開いた端末が「新規作成」、2台目以降に開いた端末は「合算」になる。
// 合算は上書きしない方向でだけ行う：
//   ・受検日：どちらかにあれば使う（両方にあれば、後から開いた端末の値を優先——
//     普通は「決まった／直した」日付のほうが新しいとみなせるため）
//   ・目標時間：大きいほうを残す（減らす方向には自動で動かさない）
//   ・分野の読了・問題演習：どちらかでチェック済みなら、チェック済みのまま（true同士のORで、
//     一度チェックしたものが自動で外れることはない）
// 各端末は、自分がこの合算を行ったら（この端末のlocalStorageで）完了とし、以後は行わない。
(function (global) {
  "use strict";
  const FP_AREAS = ["ライフプランニングと資金計画", "リスク管理", "金融資産運用", "タックスプランニング", "不動産", "相続・事業承継"];
  const DONE_KEY = "lb_fp_migrated";

  async function migrateFP(sb) {
    try {
      if (localStorage.getItem(DONE_KEY) === "1") { console.log("[FP移行] 既にこの端末で完了済み"); return; }
      const raw = localStorage.getItem("lb_fp");
      if (!raw) { console.log("[FP移行] この端末にlb_fpが無いため、何もしません"); localStorage.setItem(DONE_KEY, "1"); return; }
      let f; try { f = JSON.parse(raw); } catch (e) { console.warn("[FP移行] lb_fpの中身が壊れています:", raw); localStorage.setItem(DONE_KEY, "1"); return; }
      if (!f || (!f.date && !f.target && !f.areas)) { console.log("[FP移行] lb_fpが空でした:", f); localStorage.setItem(DONE_KEY, "1"); return; }
      console.log("[FP移行] ローカルのFPデータを検出:", f);

      const localAreaStatus = {};
      FP_AREAS.forEach((name, i) => {
        const a = f.areas && f.areas[i];
        if (a && (a.read || a.drill)) localAreaStatus[name] = { read: !!a.read, drill: !!a.drill };
      });
      const localTargetHours = parseInt(f.target, 10) || 100;

      const { data: existing, error: selErr } = await sb.from("qualifications").select("*").eq("name", "FP3級").limit(1);
      if (selErr) { console.warn("[FP移行] qualificationsテーブルが未準備、またはエラー。SQL実行後に再試行されます:", selErr); return; }

      if (!existing || !existing.length) {
        // この端末が最初：新規作成
        const { error } = await sb.from("qualifications").insert({
          name: "FP3級", target_date: f.date || null, target_hours: localTargetHours,
          areas: FP_AREAS, area_status: localAreaStatus,
        });
        if (error) { console.error("[FP移行] 新規作成に失敗しました:", error); return; }
        console.log("[FP移行] 新規作成しました");
        localStorage.setItem(DONE_KEY, "1");
        return;
      }

      // 2台目以降：既存の内容と、上書きしない方向で合算する
      const remote = existing[0];
      const mergedAreaStatus = { ...(remote.area_status || {}) };
      Object.keys(localAreaStatus).forEach((name) => {
        const cur = mergedAreaStatus[name] || {};
        mergedAreaStatus[name] = { read: !!cur.read || !!localAreaStatus[name].read, drill: !!cur.drill || !!localAreaStatus[name].drill };
      });
      const mergedAreas = Array.from(new Set([...(remote.areas || []), ...FP_AREAS]));
      const patch = {
        target_date: f.date || remote.target_date || null,
        target_hours: Math.max(remote.target_hours || 0, localTargetHours),
        areas: mergedAreas,
        area_status: mergedAreaStatus,
      };
      const { error } = await sb.from("qualifications").update(patch).eq("id", remote.id);
      if (error) { console.error("[FP移行] 合算に失敗しました:", error); return; }
      console.log("[FP移行] 既存の資格と合算しました:", patch);
      localStorage.setItem(DONE_KEY, "1");
    } catch (e) { console.error("FP3級の移行に失敗しました（通常の表示は続けます）:", e); }
  }

  global.LifeStudyMigrate = { migrateFP };
})(window);
