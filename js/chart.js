// chart.js — 순수 SVG 꺾은선 그래프 (본인 점수 vs 반 평균)
// 외부 라이브러리 없음. 색 + 선 스타일(실선/점선) 이중 부호화로 색각 이상에도 안전.
import { el, clear } from "./ui.js";

const COLOR = {
  mine: "#2a78d6", // series-1 blue
  avg: "#52514e", // secondary ink (비교 기준선은 절제된 회색 점선)
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  tick: "#898781",
  surface: "#fcfcfb",
};

// weeks: [{id, label}], mine/avg: (number|null)[], yMax: number
export function renderScoreChart(container, { weeks, mine, avg, yMax = 100 }) {
  clear(container);
  const n = weeks.length;
  if (!n || mine.every((v) => v == null)) {
    container.appendChild(
      el("p", { class: "empty", text: "아직 표시할 퀴즈 점수가 없습니다." })
    );
    return;
  }

  const W = 360;
  const H = 230;
  const M = { top: 14, right: 14, bottom: 30, left: 34 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i) => M.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => M.top + ih - (Math.max(0, Math.min(v, yMax)) / yMax) * ih;

  const short = (label) => String(label).replace(/\s*\(.*\)\s*/, "");

  let s = "";
  // 가로 그리드 (hairline, 5분할)
  const step = yMax / 5;
  for (let g = 0; g <= 5; g++) {
    const gy = y(g * step);
    s += `<line x1="${M.left}" y1="${gy}" x2="${W - M.right}" y2="${gy}" stroke="${
      g === 0 ? COLOR.axis : COLOR.grid
    }" stroke-width="1"/>`;
    s += `<text x="${M.left - 6}" y="${gy + 3.5}" text-anchor="end" font-size="10" fill="${
      COLOR.tick
    }">${Math.round(g * step)}</text>`;
  }
  // X 라벨 (겹치지 않게 솎아내기, 양 끝은 잘리지 않게 정렬)
  const every = Math.max(1, Math.ceil(n / 6));
  for (let i = 0; i < n; i++) {
    if (i % every !== 0 && i !== n - 1) continue;
    const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    const tx = i === 0 ? Math.min(x(i), M.left) : x(i);
    s += `<text x="${tx}" y="${H - M.bottom + 16}" text-anchor="${anchor}" font-size="10" fill="${
      COLOR.tick
    }">${escapeXML(short(weeks[i].label))}</text>`;
  }

  // null이 끼면 선을 끊는다 (0으로 그리지 않음)
  const segments = (vals) => {
    const segs = [];
    let cur = [];
    vals.forEach((v, i) => {
      if (v == null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else cur.push([x(i), y(v)]);
    });
    if (cur.length) segs.push(cur);
    return segs;
  };
  const path = (segs, stroke, dash) =>
    segs
      .map((seg) =>
        seg.length === 1
          ? "" // 점 하나는 마커가 담당
          : `<polyline points="${seg.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${
              dash ? ` stroke-dasharray="${dash}"` : ""
            }/>`
      )
      .join("");

  s += path(segments(avg), COLOR.avg, "5 4");
  s += path(segments(mine), COLOR.mine, null);

  // 본인 점수 마커: r=4 + 표면색 2px 링 (선 위에서도 또렷하게)
  mine.forEach((v, i) => {
    if (v == null) return;
    s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${COLOR.mine}" stroke="${
      COLOR.surface
    }" stroke-width="2"><title>${escapeXML(weeks[i].label)} · 내 점수 ${v}${
      avg[i] != null ? ` · 반 평균 ${avg[i]}` : ""
    }</title></circle>`;
  });

  const svg = el("div", { class: "chart-svg" });
  svg.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="주차별 내 점수와 반 평균 추이 그래프" style="width:100%;height:auto;display:block">${s}</svg>`;

  // 터치/클릭 → 캡션 갱신 (주차 세로 구간 전체를 히트 영역으로)
  const caption = el("div", { class: "chart-caption", text: "점을 누르면 자세한 값이 표시됩니다." });
  const svgEl = svg.querySelector("svg");
  const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  for (let i = 0; i < n; i++) {
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const half = n === 1 ? iw / 2 : iw / (n - 1) / 2;
    r.setAttribute("x", x(i) - half);
    r.setAttribute("y", M.top);
    r.setAttribute("width", half * 2);
    r.setAttribute("height", ih);
    r.setAttribute("fill", "transparent");
    r.style.cursor = "pointer";
    const show = () => {
      const parts = [weeks[i].label];
      parts.push(mine[i] != null ? `내 점수 ${mine[i]}` : "내 점수 없음");
      if (avg[i] != null) parts.push(`반 평균 ${avg[i]}`);
      caption.textContent = parts.join(" · ");
    };
    r.addEventListener("click", show);
    r.addEventListener("mouseenter", show);
    hitLayer.appendChild(r);
  }
  svgEl.appendChild(hitLayer);

  // 범례 (2계열 → 항상 표시, 텍스트는 잉크 색)
  const legend = el("div", { class: "chart-legend" }, [
    el("span", { class: "legend-item" }, [
      el("span", { class: "legend-swatch", html: legendLine(COLOR.mine, false) }),
      "내 점수",
    ]),
    el("span", { class: "legend-item" }, [
      el("span", { class: "legend-swatch", html: legendLine(COLOR.avg, true) }),
      "반 평균",
    ]),
  ]);

  container.appendChild(svg);
  container.appendChild(legend);
  container.appendChild(caption);
}

function legendLine(color, dashed) {
  return `<svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" stroke="${color}" stroke-width="2"${
    dashed ? ' stroke-dasharray="5 4"' : ""
  }/>${dashed ? "" : `<circle cx="14" cy="5" r="3.5" fill="${color}" stroke="#fcfcfb" stroke-width="1.5"/>`}</svg>`;
}

function escapeXML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
