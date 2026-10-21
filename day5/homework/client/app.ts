import { renderReport, reportDocument } from "./report.js";
import type { ChunkPreview, ProjectInfo, ReportRun, Stage, WorkflowEvent, WorkStats } from "./types.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const projectSelect = $<HTMLSelectElement>("project");
const fromInput = $<HTMLInputElement>("from");
const toInput = $<HTMLInputElement>("to");
const chunkList = $<HTMLUListElement>("chunk-list");
const runButton = $<HTMLButtonElement>("run");
const saveHtmlButton = $<HTMLButtonElement>("save-html");
const saveJsonButton = $<HTMLButtonElement>("save-json");
const errorBox = $<HTMLParagraphElement>("error");
const emptyView = $<HTMLDivElement>("empty");
const reportView = $<HTMLElement>("report");

let projects: ProjectInfo[] = [];
let currentRun: ReportRun | null = null;
let running = false;

const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function setPeriod(days: number): void {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  fromInput.value = dateOf(from);
  toInput.value = dateOf(to);
}

async function loadStatus(): Promise<void> {
  const status = (await (await fetch("/api/status")).json()) as { hasApiKey: boolean; model: string; effort: string };
  $("model-badge").textContent = `${status.model} · effort ${status.effort}`;
  const keyBadge = $("key-status");
  keyBadge.textContent = status.hasApiKey ? "API 키 연결됨" : ".env에 API 키를 넣어 주세요";
  keyBadge.className = `badge ${status.hasApiKey ? "ok" : "warn"}`;
}

async function loadProjects(): Promise<void> {
  projects = (await (await fetch("/api/projects")).json()) as ProjectInfo[];
  if (projects.length === 0) {
    projectSelect.innerHTML = `<option>Claude Code 기록이 있는 Unity 프로젝트가 없습니다</option>`;
    projectSelect.disabled = true;
    return;
  }
  projectSelect.replaceChildren(
    ...projects.map((project) => {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = `${project.name} · 세션 ${project.sessionCount} · 최근 ${project.lastActivity.slice(0, 10)}`;
      return option;
    }),
  );
  await loadChunks();
}

// 고른 기간의 작업 묶음 미리보기 (서버가 코드로만 계산, API 비용 없음)
async function loadChunks(): Promise<void> {
  const project = projects.find((p) => p.id === projectSelect.value);
  $("project-path").textContent = project?.path ?? "";
  if (!project || !fromInput.value || !toInput.value) return;

  const query = new URLSearchParams({ from: fromInput.value, to: toInput.value });
  const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/chunks?${query}`);
  if (!response.ok) {
    chunkList.innerHTML = `<li class="hint">기간을 다시 확인해 주세요.</li>`;
    updateRunButton();
    return;
  }
  const { chunks, stats } = (await response.json()) as { chunks: ChunkPreview[]; stats: WorkStats };
  $("chunk-total").textContent = chunks.length
    ? `(${chunks.length}개 · 요청 ${stats.requests} · MCP ${stats.unityCalls}회)`
    : "";

  chunkList.replaceChildren(
    ...chunks.map((chunk) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = chunk.id;
      box.checked = true;
      box.addEventListener("change", updateRunButton);
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = `${chunk.date.slice(5)} ${hhmm(chunk.start)}~${hhmm(chunk.end)} · ${chunk.sessionTitle}`;
      const counts = document.createElement("span");
      counts.className = "counts";
      counts.textContent = `요청 ${chunk.requests} · MCP ${chunk.unityCalls}회 (실패 ${chunk.unityFailures}) · 파일 ${chunk.filesEdited}개`;
      const first = document.createElement("span");
      first.className = "first";
      first.textContent = chunk.firstRequest;
      first.title = chunk.firstRequest;
      label.append(box, title, counts, first);
      li.append(label);
      return li;
    }),
  );
  if (chunks.length === 0) chunkList.innerHTML = `<li class="hint">이 기간에는 작업 기록이 없습니다.</li>`;
  updateRunButton();
}

function selectedChunkIds(): string[] {
  return [...chunkList.querySelectorAll<HTMLInputElement>("input:checked")].map((box) => box.value);
}

function updateRunButton(): void {
  runButton.disabled = running || selectedChunkIds().length === 0;
}

function setStep(stage: Stage, state: "idle" | "running" | "done", message: string): void {
  const step = $(`step-${stage}`);
  step.dataset.state = state;
  step.querySelector(".step-msg")!.textContent = message;
}

async function runReport(): Promise<void> {
  running = true;
  updateRunButton();
  runButton.textContent = "만드는 중…";
  errorBox.hidden = true;
  for (const stage of ["extract", "summarize", "aggregate"] as const) setStep(stage, "idle", "대기");

  try {
    const response = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectSelect.value,
        from: fromInput.value,
        to: toInput.value,
        chunkIds: selectedChunkIds(),
      }),
    });
    if (!response.body) throw new Error("서버 응답이 비어 있습니다.");

    // 서버가 한 줄에 하나씩 보내는 진행 이벤트를 읽는다.
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line) as WorkflowEvent);
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    running = false;
    runButton.textContent = "리포트 만들기";
    updateRunButton();
  }
}

function handleEvent(event: WorkflowEvent): void {
  switch (event.type) {
    case "stage":
      setStep(event.stage, event.status === "start" ? "running" : "done", event.message);
      break;
    case "progress":
      setStep(event.stage, "running", event.message);
      break;
    case "done":
      showRun(event.run);
      break;
    case "error":
      showError(event.message);
      break;
  }
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function showRun(run: ReportRun): void {
  currentRun = run;
  reportView.innerHTML = renderReport(run);
  reportView.hidden = false;
  emptyView.hidden = true;
  saveHtmlButton.disabled = false;
  saveJsonButton.disabled = false;
  const tokens = run.usage.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);
  $("report-meta").textContent = `에이전트 ${run.usage.length}번 호출 · ${tokens.toLocaleString()} 토큰`;
}

// 원본을 유저 컴퓨터에 파일로 내려받는다. (2차에서는 여기서 Firestore에 저장)
function saveFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileBase(run: ReportRun): string {
  const name = run.project.name.replace(/[^\w가-힣.-]+/g, "_");
  return `${name}_${run.period.from}_${run.period.to}`;
}

saveHtmlButton.addEventListener("click", async () => {
  if (!currentRun) return;
  const css = await (await fetch("report.css")).text();
  saveFile(`${fileBase(currentRun)}.html`, reportDocument(currentRun, css), "text/html");
});
saveJsonButton.addEventListener("click", () => {
  if (currentRun) saveFile(`${fileBase(currentRun)}.json`, JSON.stringify(currentRun, null, 2), "application/json");
});
runButton.addEventListener("click", () => void runReport());
projectSelect.addEventListener("change", () => void loadChunks());
fromInput.addEventListener("change", () => void loadChunks());
toInput.addEventListener("change", () => void loadChunks());
document.querySelectorAll<HTMLButtonElement>(".quick button").forEach((button) => {
  button.addEventListener("click", () => {
    setPeriod(Number(button.dataset.days));
    void loadChunks();
  });
});

setPeriod(7);
void loadStatus();
void loadProjects();
