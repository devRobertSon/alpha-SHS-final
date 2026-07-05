// report.js — 원장님용 주간 수업 현황 보고서 생성 + 누락 항목 검사
// 보고서는 브라우저 메모리에서만 만들어지고 인쇄(PDF 저장)로만 나간다.
// 저장소에는 절대 커밋되지 않는다 (실명·점수 포함).
import { el } from "./ui.js";
import { sortWeeks, ATTENDANCE, ATTENDANCE_ORDER, toYMD } from "./store.js";

// 입력:
//   academyName, weeks(학원 blob의 weeks), weekId(보고 대상 주차 W),
//   students: [{name, blob}] (활성 학생, roster 순서), notices(학원 blob),
//   teacherName, dirty(발행 안 된 변경 존재 여부)
// 반환: { checks: [{level:'ok'|'warn'|'info', text}], doc: HTMLElement }
export function buildDirectorReport({
  academyName,
  weeks,
  weekId,
  students,
  notices,
  teacherName,
  dirty,
}) {
  const sorted = sortWeeks(weeks);
  const wIdx = sorted.findIndex((w) => w.id === weekId);
  const W = sorted[wIdx];
  const P = wIdx > 0 ? sorted[wIdx - 1] : null; // 저번 주차
  const PP = wIdx > 1 ? sorted[wIdx - 2] : null; // 전전 주차 (평균 변화 비교용)

  const checks = [];
  const warn = (text) => checks.push({ level: "warn", text });
  const info = (text) => checks.push({ level: "info", text });

  const doc = el("div", { class: "report-doc" });

  // ---------- 헤더 ----------
  const today = toYMD(new Date());
  doc.appendChild(
    el("div", { class: "rd-header" }, [
      el("h1", { text: `[${academyName}] 주간 수업 현황 보고서` }),
      el("div", { class: "rd-sub", text: W.label }),
      el("div", {
        class: "rd-meta",
        text: `작성: ${teacherName || "담당 교사"} · 생성일: ${today}`,
      }),
    ])
  );

  // ---------- ① 수업 진도 (W) ----------
  const progress = (W.progress || "").trim();
  if (!progress) warn("이번 주 진도가 입력되지 않았습니다 ('진도' 탭에서 입력).");
  doc.appendChild(section("1. 수업 진도", [
    progress
      ? el("p", { class: "rd-text", text: progress })
      : el("p", { class: "rd-empty", text: "(입력되지 않음)" }),
  ]));

  // ---------- ② 출석 현황 (W) ----------
  const attChildren = [];
  const sessions = W.sessions || [];
  if (!sessions.length) {
    warn("이번 주 수업일이 등록되지 않았습니다 ('주차 관리'에서 입력).");
    attChildren.push(el("p", { class: "rd-empty", text: "(수업일 미등록)" }));
  } else {
    const missing = [];
    const tally = Object.fromEntries(ATTENDANCE_ORDER.map((c) => [c, 0]));
    let blank = 0;
    const tbl = el("table", { class: "rd-table" });
    tbl.appendChild(
      el("tr", {}, [
        el("th", { text: "이름" }),
        ...sessions.map((d) => el("th", { text: d.slice(5).replace("-", "/") })),
      ])
    );
    for (const s of students) {
      const att = s.blob.weeks?.[W.id]?.attendance || {};
      const row = el("tr", {}, [el("td", { class: "rd-name", text: s.name })]);
      for (const d of sessions) {
        const code = att[d];
        const label = ATTENDANCE[code]?.label;
        if (label) tally[code]++;
        else {
          blank++;
          missing.push(`${s.name}(${d.slice(5).replace("-", "/")})`);
        }
        row.appendChild(el("td", { text: label || "–" }));
      }
      tbl.appendChild(row);
    }
    if (missing.length) warn(`출석 미입력: ${missing.join(", ")}`);
    const summary = ATTENDANCE_ORDER.filter((c) => tally[c] > 0)
      .map((c) => `${ATTENDANCE[c].label} ${tally[c]}`)
      .concat(blank ? [`미입력 ${blank}`] : [])
      .join(" · ");
    attChildren.push(tbl);
    attChildren.push(el("p", { class: "rd-note", text: `집계: ${summary || "기록 없음"}` }));
  }
  doc.appendChild(section("2. 출석 현황", attChildren));

  // ---------- ③ 지난 주 숙제 수행 (P) ----------
  if (!P) {
    info("이전 주차가 없어 숙제·퀴즈 섹션은 표시되지 않습니다 (첫 주차).");
  } else {
    const hwChildren = [];
    const items = P.homework || [];
    if (!items.length) {
      warn(`지난 주(${P.label})에 등록된 숙제 항목이 없습니다.`);
      hwChildren.push(el("p", { class: "rd-empty", text: "(숙제 항목 없음)" }));
    } else {
      hwChildren.push(
        el("ol", { class: "rd-list" }, items.map((it) => el("li", { text: it.text })))
      );
      const tbl = el("table", { class: "rd-table" });
      tbl.appendChild(
        el("tr", {}, [
          el("th", { text: "이름" }),
          ...items.map((_, i) => el("th", { text: `${i + 1}번` })),
          el("th", { text: "완료율" }),
        ])
      );
      let doneAll = 0;
      for (const s of students) {
        const hw = s.blob.weeks?.[P.id]?.homework || {};
        const done = items.filter((it) => hw[it.id]).length;
        doneAll += done;
        tbl.appendChild(
          el("tr", {}, [
            el("td", { class: "rd-name", text: s.name }),
            ...items.map((it) => el("td", { text: hw[it.id] ? "O" : "X" })),
            el("td", { text: `${Math.round((done / items.length) * 100)}%` }),
          ])
        );
      }
      const totalRate = students.length
        ? Math.round((doneAll / (items.length * students.length)) * 100)
        : 0;
      hwChildren.push(tbl);
      hwChildren.push(el("p", { class: "rd-note", text: `전체 완료율: ${totalRate}%` }));
    }
    doc.appendChild(section(`3. 지난 주 숙제 수행 (${P.label})`, hwChildren));

    // ---------- ④ 지난 주 퀴즈 결과 + 자동 분석 (P) ----------
    const quizChildren = [];
    const scores = [];
    const noScore = [];
    const tbl = el("table", { class: "rd-table" });
    tbl.appendChild(el("tr", {}, [el("th", { text: "이름" }), el("th", { text: "점수" })]));
    let max = 100;
    for (const s of students) {
      const q = s.blob.weeks?.[P.id]?.quiz;
      if (q) {
        scores.push(q.score);
        max = q.max || max;
      } else noScore.push(s.name);
      tbl.appendChild(
        el("tr", {}, [
          el("td", { class: "rd-name", text: s.name }),
          el("td", { text: q ? String(q.score) : "–" }),
        ])
      );
    }
    if (noScore.length) warn(`지난 주 퀴즈 점수 미입력: ${noScore.join(", ")}`);
    quizChildren.push(tbl);
    if (scores.length) {
      const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      const hi = Math.max(...scores);
      const lo = Math.min(...scores);
      let trend = "";
      if (PP) {
        const prevScores = students
          .map((s) => s.blob.weeks?.[PP.id]?.quiz?.score)
          .filter((v) => v != null);
        if (prevScores.length) {
          const prevAvg =
            Math.round((prevScores.reduce((a, b) => a + b, 0) / prevScores.length) * 10) / 10;
          const diff = Math.round((avg - prevAvg) * 10) / 10;
          trend =
            diff > 0
              ? ` 전주 평균(${prevAvg}점)보다 ${diff}점 상승했습니다.`
              : diff < 0
                ? ` 전주 평균(${prevAvg}점)보다 ${Math.abs(diff)}점 하락했습니다.`
                : ` 전주 평균(${prevAvg}점)과 동일합니다.`;
        }
      }
      quizChildren.push(
        el("p", { class: "rd-note", text: `응시 ${scores.length}명 / 만점 ${max}점 기준 · 평균 ${avg}점 · 최고 ${hi}점 · 최저 ${lo}점` })
      );
      quizChildren.push(
        el("p", {
          class: "rd-text",
          text: `분석: 응시 인원 ${scores.length}명의 평균은 ${avg}점(만점 ${max}점)이며, 최고 ${hi}점 · 최저 ${lo}점으로 편차는 ${hi - lo}점입니다.${trend}`,
        })
      );
    } else {
      warn(`지난 주(${P.label}) 퀴즈 점수가 하나도 입력되지 않았습니다.`);
      quizChildren.push(el("p", { class: "rd-empty", text: "(점수 없음)" }));
    }
    doc.appendChild(section(`4. 지난 주 퀴즈 결과 (${P.label})`, quizChildren));
  }

  // ---------- ⑤ 공지사항 (W 기간 + 고정) ----------
  const noticeChildren = [];
  const from = sessions.length ? sessions[0] : null;
  const to = sessions.length ? sessions[sessions.length - 1] : null;
  const included = (notices || []).filter(
    (n) => n.pinned || (from && to && n.date >= from && n.date <= to)
  );
  if (!included.length) {
    info("이 주차 기간에 해당하는 공지가 없습니다.");
    noticeChildren.push(el("p", { class: "rd-empty", text: "(해당 기간 공지 없음)" }));
  } else {
    for (const n of included) {
      noticeChildren.push(
        el("div", { class: "rd-notice" }, [
          el("div", {
            class: "rd-notice-title",
            text: `${n.pinned ? "📌 " : ""}${n.title} (${n.date || ""})`,
          }),
          n.body ? el("div", { class: "rd-text", text: n.body }) : null,
        ])
      );
    }
  }
  doc.appendChild(section("5. 공지사항", noticeChildren));

  // ---------- 푸터 ----------
  doc.appendChild(
    el("div", { class: "rd-footer", text: `본 보고서는 학습 포털에서 자동 생성되었습니다. (${today})` })
  );

  // ---------- 검사 결과 정리 ----------
  if (dirty) info("발행하지 않은 변경이 있습니다 — 보고서는 현재 편집 중인 내용 기준으로 생성됩니다.");
  if (!checks.some((c) => c.level === "warn")) {
    checks.unshift({ level: "ok", text: "모든 항목이 준비되었습니다. PDF로 저장해 보내세요." });
  }
  return { checks, doc };
}

function section(title, children) {
  return el("div", { class: "rd-section" }, [el("h2", { text: title }), ...children]);
}
