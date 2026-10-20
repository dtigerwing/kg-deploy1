import { useEffect, useMemo, useRef, useState } from "react";
import type { HealthResponse } from "../shared/types";
import { useWorkflow } from "./lib/useWorkflow";
import { apiUrl } from "./lib/api";
import { loadRunFile, localFileRepository, savePreviewHtml, saveSubtaskResult } from "./lib/storage";
import { isActive, runClock, runToGraph } from "./graph/fromRun";
import { criticalPath } from "./graph/metrics";
import { WorkflowGraph } from "./graph/WorkflowGraph";
import { Timeline } from "./graph/Timeline";
import { TaskForm } from "./components/TaskForm";
import { HeroDemo } from "./components/HeroDemo";
import { PhaseStrip } from "./components/PhaseStrip";
import { RunStats } from "./components/RunStats";
import { RunInspector } from "./components/RunInspector";
import { EvaluationPanel } from "./components/EvaluationPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { YoutubeInsights } from "./youtube/YoutubeInsights";

type Tab = "workflow" | "youtube";
const tabFromHash = (): Tab => (window.location.hash === "#youtube" ? "youtube" : "workflow");

/** 상단 탭. 주소의 #youtube와 맞춰 두어 새로고침하거나 링크로 열어도 같은 탭이 보입니다. */
function useTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const select = (t: Tab) => {
    history.replaceState(null, "", t === "youtube" ? "#youtube" : window.location.pathname + window.location.search);
    setTab(t);
  };
  return [tab, select];
}

/** 진행 중일 때만 주기적으로 다시 그려 경과 시간이 흐르게 합니다. */
function useClock(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return now;
}

export default function App() {
  const wf = useWorkflow();
  const { run, phase, stageError, live } = wf;
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useTab();
  const evaluationRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(apiUrl("/api/health"))
      .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : Promise.reject()))
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const active = !!run && isActive(run);
  const nowMs = useClock(active);
  const clock = run ? runClock(run, nowMs) : 0;
  const graph = useMemo(() => (run ? runToGraph(run, live, clock, stageError) : null), [run, live, clock, stageError]);
  const finished = phase === "done";
  const critical = useMemo(() => (graph && finished ? criticalPath(graph) : new Set<string>()), [graph, finished]);
  const selected = graph?.nodes.find((n) => n.id === selectedId) ?? null;

  // 다음 단계가 열리면 해당 영역으로 부드럽게 이동합니다.
  const jumpTo = (section: "evaluation" | "preview") =>
    (section === "evaluation" ? evaluationRef : previewRef).current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const hadPreview = useRef(false);
  useEffect(() => {
    const has = !!run?.previewHtml;
    if (has && !hadPreview.current) setTimeout(() => jumpTo("preview"), 400);
    hadPreview.current = has;
  }, [run?.previewHtml]);

  const notifySaved = (saved: boolean) => saved && setToast("내 컴퓨터에 저장했습니다");
  const waitingGates = run?.subtasks.filter((s) => s.planStatus === "done" && s.approval === "pending") ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>
          <div>
            <h1>Agentic Workflow Studio</h1>
            <p className="muted">업무를 그래프로 나눠 서브에이전트들이 동시에 처리하고, 하나의 목업으로 모읍니다</p>
          </div>
        </div>
        <div className="row">
          {health && (
            <span className="chip static">
              {health.model} · effort {health.effort}
            </span>
          )}
          <a className="btn ghost" href="/graph-preview.html" target="_blank" rel="noreferrer">
            그래프 데모
          </a>
          {tab === "workflow" && run && (
            <button
              className="btn ghost"
              onClick={() => {
                setSelectedId(null);
                wf.reset();
              }}
            >
              새 업무 시작
            </button>
          )}
        </div>
      </header>

      <nav className="segmented top-tabs" aria-label="화면 선택">
        <button className={tab === "workflow" ? "is-active" : ""} aria-pressed={tab === "workflow"} onClick={() => setTab("workflow")}>
          워크플로우
        </button>
        <button className={tab === "youtube" ? "is-active" : ""} aria-pressed={tab === "youtube"} onClick={() => setTab("youtube")}>
          코코비 유튜브 지표
        </button>
      </nav>

      {tab === "youtube" && <YoutubeInsights onToast={setToast} />}

      {tab === "workflow" && healthError && (
        <div className="banner error">
          <span>
            {apiUrl("")
              ? "API 서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요."
              : <>API 서버에 연결할 수 없습니다. 터미널에서 <code>npm run dev</code>가 실행 중인지 확인하세요.</>}
          </span>
        </div>
      )}
      {tab === "workflow" && health && !health.hasApiKey && (
        <div className="banner warn">
          <span>
            <strong>API 키가 설정되지 않았습니다.</strong> 프로젝트 루트의 <code>.env</code> 파일에{" "}
            <code>ANTHROPIC_API_KEY=sk-ant-...</code>를 입력한 뒤 서버를 재시작하세요.
          </span>
        </div>
      )}

      {tab === "workflow" && !run && (
        <main className="hero reveal">
          <TaskForm
            disabled={!health?.hasApiKey}
            onSubmit={wf.start}
            onLoadFile={(file) =>
              loadRunFile(file)
                .then(wf.load)
                .catch((e: Error) => setToast(e.message))
            }
          />
          <HeroDemo />
        </main>
      )}

      {tab === "workflow" && run && graph && (
        <main className="content reveal">
          <section className="panel summary">
            <div className="summary-head">
              <div>
                <span className="label">입력한 업무</span>
                <p className="task-text">{run.task}</p>
              </div>
              {run.goal && (
                <dl className="goal">
                  <dt>최종 목표</dt>
                  <dd>{run.goal}</dd>
                  <dt>최종 결과물</dt>
                  <dd>{run.finalDeliverable}</dd>
                </dl>
              )}
            </div>
            <PhaseStrip run={run} live={live} />
          </section>

          {stageError && (
            <div className="banner error">
              <span>{stageError.message}</span>
              <button className="btn small" onClick={wf.retryStage}>
                다시 시도
              </button>
            </div>
          )}

          <RunStats graph={graph} clock={clock} finished={finished} />

          <div className="graph-layout">
            <section className="panel graph-panel">
              <WorkflowGraph
                graph={graph}
                subtasks={run.subtasks}
                selectedId={selectedId}
                critical={critical}
                onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              />
              {phase === "decomposing" && !stageError && (
                <p className="graph-hint">분해 에이전트가 업무를 세부 단위와 의존 관계로 나누고 있어요…</p>
              )}
            </section>
            {selected && (
              <RunInspector
                key={selected.id}
                node={selected}
                run={run}
                graph={graph}
                live={live}
                stageError={stageError}
                actions={{
                  decide: wf.decide,
                  revise: (id, feedback) => void wf.planSubtask(id, feedback),
                  replan: (id) => void wf.planSubtask(id),
                  retryExecute: wf.retryExecute,
                  retryStage: wf.retryStage,
                  saveResult: (id) => saveSubtaskResult(run, id).then(notifySaved),
                  jumpTo,
                  close: () => setSelectedId(null),
                }}
              />
            )}
          </div>

          {waitingGates.length > 0 && (
            <div className="action-bar tray" key={waitingGates.length}>
              <p>
                <strong>검토할 계획 {waitingGates.length}개</strong>
                <span className="muted"> · 승인한 업무는 다른 업무를 기다리지 않고 바로 실행됩니다</span>
              </p>
              <div className="row">
                <button className="btn" onClick={() => setSelectedId(`gate:${waitingGates[0].id}`)}>
                  다음 계획 검토
                </button>
                {waitingGates.length > 1 && (
                  <button className="btn primary" onClick={wf.approveAllReady}>
                    모두 승인하고 실행
                  </button>
                )}
              </div>
            </div>
          )}

          {run.subtasks.length > 0 && (
            <section className="panel">
              <div className="section-head">
                <h2>타임라인</h2>
                <span className="muted small">
                  세부 업무마다 계획 → 승인 대기 → 실행이 한 줄로 이어집니다
                  {finished ? " · 테두리 강조는 전체 시간을 결정한 임계 경로" : ""}
                </span>
              </div>
              <Timeline
                graph={graph}
                now={clock}
                subtasks={run.subtasks}
                critical={critical}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </section>
          )}

          {run.evaluation && (
            <div ref={evaluationRef} className="reveal scroll-anchor">
              <EvaluationPanel evaluation={run.evaluation} subtasks={run.subtasks} />
            </div>
          )}

          {run.previewHtml && (
            <div ref={previewRef} className="reveal scroll-anchor">
              <PreviewPanel
                html={run.previewHtml}
                onSaveHtml={() => savePreviewHtml(run).then(notifySaved)}
                onSaveRun={() => localFileRepository.save(run).then(notifySaved)}
                onRebuild={() => void wf.buildPreview()}
              />
            </div>
          )}
        </main>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
