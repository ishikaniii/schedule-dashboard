// LifeBase 試験・課題に向けた学習の提案（2026-09-22）— 学習タブと「今日やること」が共有する。
// カレンダー（dashboard_snapshot.calendar_events）から、試験と課題の締切を拾い、締切までの日数から
// 「今日の学習の目安（分）」を決める。試験かどうかはタイトルの言葉で判定する
// （カレンダーに「【試験】」や「期末試験」「小テスト」などと入れておくと拾える）。
// 同じ規則が PC側 daily-briefing/scripts/today_tasks.py にもある。変えるときは両方直すこと。
(function (global) {
  "use strict";
  const EXAM_RE = /試験|テスト|期末|中間|定期考査|quiz/i;
  const dayDiff = (a, b) => Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);

  // 試験までの日数 → 今日の学習の目安（分）。範囲外は null。
  function examMinutes(left) {
    if (left < 0 || left > 14) return null;
    if (left === 0) return 30;      // 当日：直前の確認だけ
    if (left <= 3) return 90;
    if (left <= 7) return 60;
    return 30;
  }

  // events: calendar_events。戻り値：[{id,date,title,left,minutes,kind:"exam"|"assign"}]（近い順）
  function upcoming(events, today) {
    const out = [];
    for (const e of events || []) {
      const title = e.title || "";
      if (e.family_type === "shift" || e.family_type === "health") continue;
      const left = dayDiff(e.date, today);
      if (e.family_type !== "assignment_due" && EXAM_RE.test(title) && !title.startsWith("✅")) {
        const m = examMinutes(left);
        if (m != null) out.push({ id: e.id || e.date + title, date: e.date, title, left, minutes: m, kind: "exam" });
      } else if (e.family_type === "assignment_due" && !title.startsWith("✅") && left >= 0 && left <= 14) {
        out.push({ id: e.id || e.date + title, date: e.date, title, left, minutes: null, kind: "assign" });
      }
    }
    out.sort((a, b) => a.left - b.left);
    return out;
  }

  // 試験のタイトルに科目名が含まれていれば、その科目を返す（subjects：study_cardsにある科目名）。
  function matchSubject(title, subjects) {
    return (subjects || []).filter(s => title.includes(s)).sort((a, b) => b.length - a.length)[0] || null;
  }

  global.LifeStudyPlan = { upcoming, examMinutes, matchSubject, EXAM_RE };
})(window);
