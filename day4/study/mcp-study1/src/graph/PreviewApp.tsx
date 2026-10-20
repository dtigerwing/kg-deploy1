import { useEffect, useMemo, useState } from "react";
import { WorkflowGraph } from "./WorkflowGraph";
import { Timeline } from "./Timeline";
import { NodeInspector } from "./NodeInspector";
import { computeStats, criticalPath, formatSec } from "./metrics";
import {
  DEMO_SUBTASKS,
  DEMO_TASK,
  createSim,
  decide,
  isFinished,
  retry,
  simToGraph,
  tick,
  type Mode,
} from "./simulation";

const MODE_LABEL: Record<Mode, string> = { pipeline: "파이프라인 (제안)", barrier: "일괄 실행 (현재)" };

export function PreviewApp() {
  const [mode, setMode] = useState<Mode>("pipeline");
  const [autoApprove, setAutoApprove] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const [sim, setSim] = useState(() => createSim(DEMO_SUBTASKS, "pipeline", true));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<Partial<Record<Mode, number>>>({});

  const finished = isFinished(sim);
  const graph = useMemo(() => simToGraph(sim), [sim]);
  const stats = useMemo(() => computeStats(graph, sim.t), [graph, sim.t]);
  const critical = useMemo(() => (finished ? criticalPath(graph) : new Set<string>()), [finished, graph]);

  useEffect(() => {
    if (finished || paused) return;
    const timer = setInterval(() => setSim((s) => tick(s, 0.1 * speed)), 100);
    return () => clearInterval(timer);
  }, [finished, paused, speed]);

  useEffect(() => {
    if (finished) setResults((r) => ({ ...r, [sim.mode]: stats.elapsed }));
  }, [finished, sim.mode, stats.elapsed]);

  const restart = (nextMode = mode, nextAuto = autoApprove) => {
    setMode(nextMode);
    setAutoApprove(nextAuto);
    setPaused(false);
    setSelectedId(null);
    setSim(createSim(DEMO_SUBTASKS, nextMode, nextAuto));
  };

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedSubtask = DEMO_SUBTASKS.find((s) => s.id === selected?.subtaskId) ?? null;
  const speedup = stats.busy > 0 ? stats.sequential / stats.busy : 0;
  const compare = results.pipeline != null && results.barrier != null ? results.barrier - results.pipeline : null;

  return (
    <div className="app graph-app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>
          <div>
            <h1>스마트 그래프 프리뷰</h1>
            <p className="muted">업무 「{DEMO_TASK}」를 그래프로 실행하는 데모 · API를 호출하지 않는 시뮬레이션이며 시간은 압축되어 있습니다</p>
          </div>
        </div>
      </header>

      <section className="panel controls">
        <div className="control">
          <span className="label">실행 방식</span>
          <div className="segmented" role="group" aria-label="실행 방식">
            {(["pipeline", "barrier"] as Mode[]).map((m) => (
              <button key={m} className={m === mode ? "is-active" : ""} onClick={() => restart(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="control">
          <span className="label">승인</span>
          <div className="segmented" role="group" aria-label="승인 방식">
            <button className={autoApprove ? "is-active" : ""} onClick={() => restart(mode, true)}>
              자동 (사람 대기 흉내)
            </button>
            <button className={!autoApprove ? "is-active" : ""} onClick={() => restart(mode, false)}>
              직접 클릭
            </button>
          </div>
        </div>
        <div className="control">
          <span className="label">속도</span>
          <div className="segmented" role="group" aria-label="재생 속도">
            {[1, 2, 4].map((v) => (
              <button key={v} className={v === speed ? "is-active" : ""} onClick={() => setSpeed(v)}>
                {v}×
              </button>
            ))}
          </div>
        </div>
        <div className="row control-actions">
          {!finished && (
            <button className="btn ghost" onClick={() => setPaused((p) => !p)}>
              {paused ? "계속" : "일시정지"}
            </button>
          )}
          <button className="btn primary" onClick={() => restart()}>
            처음부터 다시
          </button>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <span className="label">경과 시간</span>
          <strong>{formatSec(stats.elapsed)}</strong>
          <small>{finished ? "완료" : "진행 중"}</small>
        </div>
        <div className="stat">
          <span className="label">한 줄로 했다면</span>
          <strong>{formatSec(stats.sequential)}</strong>
          <small>에이전트 작업 시간 합계</small>
        </div>
        <div className="stat">
          <span className="label">병렬 효과</span>
          <strong>{speedup > 0 ? `${speedup.toFixed(1)}×` : "—"}</strong>
          <small>최대 {stats.maxConcurrency}개 동시 실행</small>
        </div>
        <div className="stat">
          <span className="label">Claude 호출</span>
          <strong>{stats.modelCalls}회</strong>
          <small>{stats.retries > 0 ? `실패 노드만 ${stats.retries}회 재시도` : "재시도 없음"}</small>
        </div>
        <div className="stat compare">
          <span className="label">방식 비교 (같은 업무)</span>
          <span>
            파이프라인 <b>{results.pipeline != null ? formatSec(results.pipeline) : "—"}</b>
          </span>
          <span>
            일괄 실행 <b>{results.barrier != null ? formatSec(results.barrier) : "—"}</b>
          </span>
          <small>
            {compare != null
              ? compare > 0
                ? `파이프라인이 ${formatSec(compare)} 빠름`
                : "차이 없음"
              : "두 방식을 모두 끝까지 실행해 보세요"}
          </small>
        </div>
      </section>

      <div className="graph-layout">
        <section className="panel graph-panel">
          <WorkflowGraph
            graph={graph}
            subtasks={DEMO_SUBTASKS}
            selectedId={selectedId}
            critical={critical}
            onSelect={setSelectedId}
          />
        </section>
        <NodeInspector
          node={selected}
          graph={graph}
          subtask={selectedSubtask}
          autoApprove={autoApprove}
          now={sim.t}
          onApprove={() => selected?.subtaskId && setSim((s) => decide(s, selected.subtaskId!, "approved"))}
          onExclude={() => selected?.subtaskId && setSim((s) => decide(s, selected.subtaskId!, "excluded"))}
          onRetry={() => selected && setSim((s) => retry(s, selected.id))}
          onClose={() => setSelectedId(null)}
        />
      </div>

      <section className="panel">
        <div className="section-head">
          <h2>타임라인</h2>
          <span className="muted small">세부 업무마다 계획 → 승인 대기 → 실행이 한 줄로 이어집니다{finished ? " · 테두리 강조는 전체 시간을 결정한 임계 경로" : ""}</span>
        </div>
        <Timeline
          graph={graph}
          now={sim.t}
          subtasks={DEMO_SUBTASKS}
          critical={critical}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </section>
    </div>
  );
}
