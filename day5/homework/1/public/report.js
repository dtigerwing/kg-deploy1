// 리포트를 HTML 문자열로 그린다. 화면 표시와 "저장" 파일이 같은 함수를 쓴다.
const esc = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const RESULT_TONE = { 완료: "ok", "부분 완료": "warn", 실패: "bad", "확인 필요": "info" };
const STREAM_TONE = { 완료: "ok", "진행 중": "info", 막힘: "bad", "시작 전": "muted" };
const chip = (label, tone) => `<span class="chip ${tone}">${esc(label)}</span>`;
const list = (items, tag = "ul") => items.length ? `<${tag}>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</${tag}>` : `<p class="meta">없음</p>`;
function formatDateTime(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function renderReport(run) {
    const { report, stats } = run;
    const failRate = stats.unityCalls ? Math.round((stats.unityFailures / stats.unityCalls) * 100) : 0;
    const maxTool = Math.max(1, ...stats.unityToolCounts.map((t) => t.count));
    const days = new Map();
    for (const item of [...report.done].sort((a, b) => a.date.localeCompare(b.date))) {
        days.set(item.date, [...(days.get(item.date) ?? []), item]);
    }
    return `
    <header>
      <h2>${esc(report.title)}</h2>
      <p class="meta">${esc(run.project.name)} · ${esc(run.period.from)} ~ ${esc(run.period.to)} · ${esc(formatDateTime(run.createdAt))} 생성</p>
    </header>

    <section class="card"><p>${esc(report.overview)}</p></section>

    <section class="kpis">
      <div class="kpi"><div class="value">${stats.activeDays}</div><div class="label">작업한 날</div></div>
      <div class="kpi"><div class="value">${stats.requests}</div><div class="label">요청</div></div>
      <div class="kpi"><div class="value">${stats.unityCalls}</div><div class="label">Unity MCP 호출</div></div>
      <div class="kpi"><div class="value">${failRate}%</div><div class="label">MCP 실패율 (${stats.unityFailures}회)</div></div>
      <div class="kpi"><div class="value">${stats.filesEdited}</div><div class="label">수정한 파일</div></div>
    </section>

    <section class="card">
      <h3>진행 상황</h3>
      <div class="streams">
        ${report.workstreams
        .map((stream) => {
        const progress = Math.max(0, Math.min(100, Math.round(stream.progress)));
        return `<div class="stream">
              <div class="stream-head"><strong>${esc(stream.name)}</strong>${chip(stream.status, STREAM_TONE[stream.status] ?? "muted")}</div>
              <div class="bar" role="img" aria-label="진행률 ${progress}%"><span style="width:${progress}%"></span></div>
              <span class="meta">${progress}%</span>
              <p>${esc(stream.summary)}</p>
              <p class="next">다음: ${esc(stream.nextStep)}</p>
            </div>`;
    })
        .join("")}
      </div>
    </section>

    <section class="card">
      <h3>한 일</h3>
      <div class="timeline">
        ${[...days]
        .map(([date, items]) => `<div class="day"><strong>${esc(date)}</strong><ul>${items
        .map((item) => `<li><strong>${esc(item.title)}</strong> — ${esc(item.detail)}</li>`)
        .join("")}</ul></div>`)
        .join("")}
      </div>
    </section>

    <section class="card">
      <h3>결과</h3>
      <table class="rows">
        ${report.results
        .map((result) => `<tr><td><strong>${esc(result.title)}</strong><br /><span class="meta">${esc(result.evidence)}</span></td>
              <td>${chip(result.status, RESULT_TONE[result.status] ?? "muted")}</td></tr>`)
        .join("")}
      </table>
    </section>

    <section class="card">
      <h3>막혔던 문제</h3>
      ${report.issues.length
        ? `<table class="rows">${report.issues
            .map((issue) => `<tr><td><strong>${esc(issue.title)}</strong><br /><span class="meta">${esc(issue.detail)}</span></td>
                  <td>${issue.resolved ? chip("해결", "ok") : chip("남음", "bad")}</td></tr>`)
            .join("")}</table>`
        : `<p class="meta">없음</p>`}
    </section>

    <section class="card">
      <h3>남은 일</h3>
      ${list(report.nextActions, "ol")}
    </section>

    <section class="card">
      <h3>Unity MCP 도구 사용</h3>
      <div class="tools">
        ${stats.unityToolCounts
        .map((tool) => `<div class="tool-row"><span>${esc(tool.tool)}</span>
              <div class="bar"><span style="width:${(tool.count / maxTool) * 100}%"></span></div>
              <span class="num">${tool.count}</span></div>`)
        .join("") || `<p class="meta">기간 안에 Unity MCP 호출이 없습니다.</p>`}
      </div>
    </section>

    <section class="card">
      <h3>작업 묶음별 요약 (${run.chunks.length})</h3>
      ${run.chunks
        .map((chunk) => `<details class="chunk">
            <summary>${esc(chunk.date)} · ${esc(chunk.summary.title)}
              <span class="meta">요청 ${chunk.requests} · MCP ${chunk.unityCalls}회 (실패 ${chunk.unityFailures})</span></summary>
            <p class="meta">${esc(chunk.sessionTitle)}</p>
            <h4>목표</h4><p>${esc(chunk.summary.goal)}</p>
            <h4>한 일</h4>${list(chunk.summary.done)}
            <h4>결과</h4>${list(chunk.summary.results.map((r) => `[${r.status}] ${r.item}`))}
            <h4>문제</h4>${list(chunk.summary.problems)}
            <h4>남은 것</h4>${list(chunk.summary.openItems)}
          </details>`)
        .join("")}
    </section>`;
}
// 인터넷 없이 열어도 되는 HTML 파일 한 개로 만든다.
export function reportDocument(run, css) {
    return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(run.report.title)}</title>
<style>${css}</style>
</head>
<body>
<article class="report">${renderReport(run)}</article>
</body>
</html>`;
}
