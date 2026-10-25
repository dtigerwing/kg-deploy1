// 업무 쪼개기: 업무 입력 → 쪼개기·계획 → 승인 → 실행 → 평가·프리뷰
// 서버는 상태를 들고 있지 않아서, 승인한 계획과 수정 요청은 이 화면이 모아 /api/execute 로 보낸다.
import { $, esc, saveText, showNotice, streamEvents } from "./util.js";

const STATUS = {
  planning: ["계획 중", "busy"],
  planned: ["계획 완료", "none"],
  executing: ["실행 중", "busy"],
  done: ["완료", "good"],
  skipped: ["제외", "none"],
  error: ["오류", "bad"],
};

let state = fresh();
let onSnapshot = () => {};

function fresh() {
  return { phase: "input", task: "", goal: "", subtasks: [], review: null };
}

export function isBusy() {
  return ["planning", "executing", "reviewing"].includes(state.phase);
}

// 업무 쪼개기 도중 서버가 현황을 처음 읽으면 대시보드에도 반영한다.
export function initWorkflow(handleSnapshot) {
  onSnapshot = handleSnapshot;
  $("planBtn").addEventListener("click", startPlan);
  $("approveBtn").addEventListener("click", startExecute);
  $("resetBtn").addEventListener("click", () => {
    state = fresh();
    $("task").value = "";
    showNotice("");
    render();
  });
  $("task").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) startPlan();
  });
  // 승인 단계의 체크박스·수정 요청은 다시 그리지 않고 상태에만 담는다(입력 중 포커스가 날아가지 않게).
  $("tasks").addEventListener("input", (e) => {
    const { include, note } = e.target.dataset;
    if (include) {
      find(include).include = e.target.checked;
      e.target.closest(".approve").querySelector("textarea").disabled = !e.target.checked;
      renderApproveBar();
    }
    if (note) find(note).note = e.target.value;
  });
  $("downloadBtn").addEventListener("click", () => {
    const blob = new Blob([state.review.html], { type: "text/html" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${state.review.title || "preview"}.html` });
    a.click();
    URL.revokeObjectURL(a.href);
  });
  render();
}

function common(e) {
  if (e.type === "snapshot") onSnapshot(e.data);
  if (e.type === "warning") showNotice(e.message);
}

async function startPlan() {
  const task = $("task").value.trim();
  if (!task) return showNotice("업무 내용을 먼저 적어 주세요.");
  state = { ...fresh(), phase: "planning", task };
  showNotice("");
  render();
  try {
    await streamEvents("/api/plan", { task }, (e) => {
      common(e);
      if (e.type === "subtasks") {
        state.goal = e.goal;
        state.subtasks = e.subtasks.map((s) => ({ ...s, status: "planning", include: true, note: "" }));
      } else if (e.type === "plan") {
        Object.assign(find(e.id), { plan: e.plan, status: "planned" });
      } else if (e.type === "error") {
        Object.assign(find(e.id), { status: "error", error: e.message, include: false });
      } else if (e.type === "done") {
        state.phase = "approval";
      }
      render();
    });
  } catch (err) {
    fail(err);
  }
}

async function startExecute() {
  const items = state.subtasks.filter((s) => s.include && s.plan);
  if (!items.length) return showNotice("실행할 세부 업무를 하나 이상 골라 주세요.");
  for (const s of state.subtasks) s.status = s.include && s.plan ? "executing" : s.status === "error" ? "error" : "skipped";
  state.phase = "executing";
  showNotice("");
  render();
  try {
    await streamEvents(
      "/api/execute",
      {
        task: state.task,
        goal: state.goal,
        items: items.map(({ id, title, description, plan, note }) => ({ id, title, description, plan, note })),
      },
      (e) => {
        common(e);
        if (e.type === "result") Object.assign(find(e.id), { result: e.result, status: "done" });
        else if (e.type === "error") Object.assign(find(e.id), { status: "error", error: e.message });
        else if (e.type === "reviewing") state.phase = "reviewing";
        else if (e.type === "review") {
          state.review = e;
          state.phase = "review";
        } else if (e.type === "saved") state.saved = e.saved;
        render();
      },
    );
  } catch (err) {
    fail(err);
  }
}

function find(id) {
  return state.subtasks.find((s) => s.id === id) ?? {};
}

function fail(err) {
  console.error(err);
  showNotice(err.message);
  // 계획 단계에서 실패하면 다시 시도할 수 있게 입력 단계로, 실행 단계에서 실패하면 승인 단계로 돌린다.
  state.phase = state.phase === "planning" ? "input" : "approval";
  for (const s of state.subtasks) if (s.status === "planning" || s.status === "executing") s.status = s.plan ? "planned" : "error";
  render();
}

function render() {
  const { phase } = state;
  $("task").disabled = phase !== "input";
  $("planBtn").hidden = phase !== "input";
  $("resetBtn").hidden = phase === "input" || isBusy();
  renderStepper();

  $("planSection").hidden = !state.subtasks.length && phase !== "planning";
  $("goal").textContent = state.goal || "쪼개기 에이전트가 업무를 나누는 중…";
  $("tasks").innerHTML = state.subtasks.map(taskCard).join("");
  renderApproveBar();

  $("reviewSection").hidden = phase !== "reviewing" && phase !== "review";
  $("reviewBody").innerHTML = phase === "reviewing" ? `<p class="busy-text">취합·평가 에이전트가 결과물을 평가하고 하나로 합치는 중…</p>` : reviewBody();
  $("previewCard").hidden = !state.review;
  if (state.review && $("preview").srcdoc !== state.review.html) $("preview").srcdoc = state.review.html;
}

function renderApproveBar() {
  const approving = state.phase === "approval";
  $("approveBar").hidden = !approving;
  if (!approving) return;
  const count = state.subtasks.filter((s) => s.include && s.plan).length;
  $("approveText").textContent = `계획을 확인하고, 실행할 세부 업무를 골라 주세요. ${count}개를 실행해요.`;
  $("approveBtn").disabled = count === 0;
}

function renderStepper() {
  const order = ["input", "planning", "approval", "executing", "review"];
  const current = order.indexOf(state.phase === "reviewing" ? "review" : state.phase);
  for (const li of $("stepper").children) {
    const i = order.indexOf(li.dataset.step);
    li.className = i < current ? "past" : i === current ? "on" : "";
  }
}

function taskCard(s) {
  const [label, tone] = STATUS[s.status] ?? ["", "none"];
  const review = state.review?.reviews.find((r) => r.id === s.id);
  const parts = [
    `<div class="task-head"><span class="tid">${esc(s.id)}</span><strong class="task-title">${esc(s.title)}</strong>` +
      (review ? `<span class="score">${review.score}/10</span>` : "") +
      `<span class="badge ${tone}">${esc(label)}</span></div>`,
    `<p class="desc">${esc(s.description)}</p>`,
  ];
  if (s.plan) parts.push(planBody(s.plan));
  else if (s.status === "planning") parts.push(`<p class="busy-text">계획 에이전트가 계획을 세우는 중…</p>`);
  if (s.error) parts.push(`<p class="error">${esc(s.error)}</p>`);

  if (state.phase === "approval" && s.plan) {
    parts.push(
      `<div class="approve">` +
        `<label class="check"><input type="checkbox" data-include="${esc(s.id)}" ${s.include ? "checked" : ""} /> 이 계획대로 실행</label>` +
        `<textarea rows="2" data-note="${esc(s.id)}" placeholder="수정 요청 (선택) 표로 정리해 주세요" ${s.include ? "" : "disabled"}>${esc(s.note)}</textarea>` +
        `</div>`,
    );
  } else if (s.note) {
    parts.push(`<p class="note">수정 요청: ${esc(s.note)}</p>`);
  }

  if (s.status === "executing") parts.push(`<p class="busy-text">실행 에이전트가 결과물을 만드는 중…</p>`);
  if (s.result) parts.push(`<details class="result"><summary>결과물 보기</summary><pre>${esc(s.result)}</pre></details>`);
  if (review) parts.push(`<div class="review"><p>잘된 점: ${esc(review.good)}</p><p>고칠 점: ${esc(review.improve)}</p></div>`);
  return `<article class="card task ${s.status === "skipped" ? "dim" : ""}">${parts.join("")}</article>`;
}

function planBody(plan) {
  const assumptions = plan.assumptions.length
    ? `<p class="sub">가정</p><ul>${plan.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
    : "";
  return (
    `<div class="plan">` +
    `<p><span class="sub">접근</span> ${esc(plan.approach)}</p>` +
    `<ol>${plan.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>` +
    `<p><span class="sub">결과물</span> ${esc(plan.deliverable)}</p>` +
    assumptions +
    `</div>`
  );
}

function reviewBody() {
  const r = state.review;
  if (!r) return "";
  return `<div class="overall"><span class="big">${r.score}<small>/10</small></span><div><strong>${esc(r.title)}</strong><p>${esc(r.summary)}</p></div></div>` +
    (state.saved ? `<p class="sub">${esc(saveText(state.saved))}</p>` : "");
}
