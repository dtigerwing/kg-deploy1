// Unity 현황 대시보드. "새로 읽기"를 누를 때만 Unity에서 읽는다. 사이트는 프로젝트를 바꾸지 않는다.
import { changesBody, dietBody, releaseBody, renderDashboard } from "./dashboard.js";
import { $, esc, saveText, showNotice, streamEvents } from "./util.js";
import { initWorkflow, isBusy as workflowBusy } from "./workflow.js";

const AGENTS = { release: "출시 전 점검", diet: "용량 다이어트", changes: "변경 분석", workflow: "업무 쪼개기" };

let snapshot = null;
let reading = false;
let agentRunning = false;

// ---------- 현황 읽기 ----------

async function refresh() {
  if (reading) return;
  reading = true;
  setConn("busy", "읽는 중…");
  $("refreshBtn").disabled = true;
  showNotice("");
  try {
    const res = await fetch("/api/snapshot", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `서버 오류 (${res.status})`);
    setSnapshot(data);
  } catch (err) {
    setConn("bad", "읽기 실패");
    showNotice(err.message);
  } finally {
    reading = false;
    $("refreshBtn").disabled = false;
  }
}

function setSnapshot(data) {
  snapshot = data;
  setConn("good", "Unity 연결됨");
  render();
}

function setConn(tone, text) {
  $("connBadge").className = `pill ${tone}`;
  $("connBadge").textContent = text;
}

function render() {
  $("dashboard").hidden = !snapshot;
  $("emptyState").hidden = Boolean(snapshot);
  if (snapshot) renderDashboard(snapshot);
  $("saveState").textContent = saveText(snapshot?.saved);
}

// ---------- 에이전트 ----------

async function runAgent(kind) {
  if (agentRunning || workflowBusy()) return;
  for (const b of document.querySelectorAll("[data-agent]")) b.classList.toggle("on", b.dataset.agent === kind);
  if (kind === "workflow") {
    $("agentPanel").hidden = true;
    $("workflow").hidden = false;
    $("task").focus();
    return;
  }
  $("workflow").hidden = true;
  agentRunning = true;
  setAgentButtons(false);
  const log = [];
  const panel = $("agentPanel");
  panel.hidden = false;
  const draw = (body) => (panel.innerHTML = `<p class="agent-title">${esc(AGENTS[kind])}</p>${body}`);
  const drawProgress = () => draw(`<p class="busy-text">${esc(log.at(-1) ?? "에이전트가 생각하는 중")}…</p><p class="sub">${log.map(esc).join(" → ")}</p>`);
  drawProgress();
  try {
    await streamEvents(`/api/agent/${kind}`, {}, (e) => {
      if (e.type === "snapshot") setSnapshot(e.data);
      else if (e.type === "progress") {
        log.push(e.message);
        drawProgress();
      } else if (e.type === "result") {
        const body = { release: releaseBody, diet: dietBody, changes: changesBody }[kind];
        draw(body(e.data) + `<p class="sub">에이전트가 조회한 것: ${log.map(esc).join(" → ") || "대시보드 현황"}</p>`);
      } else if (e.type === "saved") {
        panel.insertAdjacentHTML("beforeend", `<p class="sub">${esc(saveText(e.saved))}</p>`);
      }
    });
  } catch (err) {
    draw(`<p class="error">${esc(err.message)}</p>`);
  } finally {
    agentRunning = false;
    setAgentButtons(true);
  }
}

function setAgentButtons(enabled) {
  for (const b of document.querySelectorAll("[data-agent]")) b.disabled = !enabled;
}

// ---------- 시작 ----------

$("refreshBtn").addEventListener("click", refresh);
for (const b of document.querySelectorAll("[data-agent]")) b.addEventListener("click", () => runAgent(b.dataset.agent));
initWorkflow(setSnapshot);

const status = await fetch("/api/status").then((r) => r.json());
$("projectName").textContent = status.project || "Unity 현황";
$("agentLabel").textContent = `에이전트 · ${status.model} · effort ${status.effort}`;
if (!status.hasKey) showNotice("API 키가 없어요. 3/.env 파일의 ANTHROPIC_API_KEY에 키를 넣고 서버를 다시 켜 주세요. 현황 읽기는 키 없이도 돼요.");
// 서버가 이미 읽어 둔 현황이 있으면 보여만 준다(새로 읽지는 않음).
if (status.snapshot) setSnapshot(status.snapshot);
else render();