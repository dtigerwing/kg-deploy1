import { useEffect, useState } from "react";
import type { SubtaskRecord, WorkflowRun } from "../../shared/types";
import { depsSettled, type FailedStage, type Live } from "../lib/useWorkflow";
import { ROLE_INFO, STATUS_LABEL } from "../graph/NodeInspector";
import { formatSec } from "../graph/metrics";
import type { Graph, GraphNode } from "../graph/types";
import { LiveTicker } from "./LiveTicker";

interface Actions {
  decide: (id: string, approval: SubtaskRecord["approval"]) => void;
  revise: (id: string, feedback: string) => void;
  replan: (id: string) => void;
  retryExecute: (id: string) => void;
  retryStage: () => void;
  saveResult: (id: string) => void;
  jumpTo: (section: "evaluation" | "preview") => void;
  close: () => void;
}

const LIVE_LABEL: Partial<Record<GraphNode["role"], string>> = {
  decompose: "업무를 세부 단위와 의존 관계로 나누는 중",
  plan: "계획을 세우는 중",
  exec: "계획대로 실행하는 중",
  evaluate: "결과를 취합해 평가하는 중",
  preview: "목업을 만드는 중",
};

function PlanView({ sub }: { sub: SubtaskRecord }) {
  const plan = sub.plan!;
  return (
    <div className="insp-content plan-view">
      <h4>실행 계획</h4>
      <p>{plan.approach}</p>
      <ol className="steps">
        {plan.steps.map((step, i) => (
          <li key={i}>
            <strong>{step.title}</strong>
            <span>{step.detail}</span>
          </li>
        ))}
      </ol>
      <h4>결과물 형태</h4>
      <p>{plan.outputFormat}</p>
      <h4>완료 기준</h4>
      <ul>
        {plan.acceptanceCriteria.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      {plan.assumptions.length > 0 && (
        <>
          <h4>가정</h4>
          <ul>
            {plan.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {sub.feedback && <p className="feedback-note">반영한 피드백: {sub.feedback}</p>}
    </div>
  );
}

export function RunInspector({
  node,
  run,
  graph,
  live,
  stageError,
  actions,
}: {
  node: GraphNode;
  run: WorkflowRun;
  graph: Graph;
  live: Record<string, Live>;
  stageError: { stage: FailedStage; message: string } | null;
  actions: Actions;
}) {
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    setRevising(false);
    setFeedback("");
  }, [node.id]);

  const sub = node.subtaskId ? run.subtasks.find((s) => s.id === node.subtaskId) ?? null : null;
  const info = ROLE_INFO[node.role];
  const titleOf = (id: string) => run.subtasks.find((s) => s.id === id)?.title ?? graph.nodes.find((n) => n.id === id)?.title ?? id;
  const inputs = graph.edges.filter((e) => e.to === node.id);
  const outputs = graph.edges.filter((e) => e.from === node.id);
  const duration = node.startedAt != null && node.finishedAt != null ? node.finishedAt - node.startedAt : null;
  const dependents = sub ? run.subtasks.filter((s) => s.dependsOn.includes(sub.id)) : [];
  const evalItem = sub ? run.evaluation?.perSubtask.find((p) => p.subtaskId === sub.id) : undefined;
  const stageErr = (stage: FailedStage) => (stageError?.stage === stage ? stageError.message : null);

  return (
    <aside className="inspector" aria-label="노드 자세히 보기">
      <div className="insp-head">
        <span className={`g-kind-chip ${node.kind}`}>{node.kind === "io" ? "I/O" : node.kind.toUpperCase()}</span>
        <span className={`insp-status ${node.status}`}>{STATUS_LABEL[node.status]}</span>
        <button className="insp-close" onClick={actions.close} aria-label="닫기">
          ×
        </button>
      </div>
      <h3>{node.role === "gate" && sub ? `${sub.title} · 승인` : node.title}</h3>
      {sub && <p className="muted small">{sub.objective}</p>}

      <dl className="insp-meta">
        <dt>처리</dt>
        <dd>
          {node.kind === "agent"
            ? `${run.model} · effort high`
            : node.kind === "code"
              ? "코드 (모델 호출 없음)"
              : node.kind === "human"
                ? "사용자"
                : "—"}
        </dd>
        {duration != null && node.kind !== "io" && (
          <>
            <dt>{node.role === "gate" ? "검토 시간" : "소요"}</dt>
            <dd>
              {formatSec(duration)}
              {node.attempts > 1 ? ` · ${node.attempts}번째 시도` : ""}
            </dd>
          </>
        )}
        {inputs.length > 0 && (
          <>
            <dt>받는 데이터</dt>
            <dd>
              {inputs.map((e) => (
                <span key={e.id} className={`contract-chip ${e.dependency ? "dep" : ""}`}>
                  {e.contract} <small>← {titleOf(e.from)}</small>
                </span>
              ))}
            </dd>
          </>
        )}
        {outputs.length > 0 && (
          <>
            <dt>내보내는 데이터</dt>
            <dd>
              {[...new Set(outputs.map((e) => e.contract))].map((c) => (
                <span key={c} className="contract-chip">
                  {c}
                </span>
              ))}
            </dd>
          </>
        )}
        {sub && node.role === "exec" && dependents.length > 0 && (
          <>
            <dt>이 결과를 쓰는 업무</dt>
            <dd>
              {dependents.map((d) => (
                <span key={d.id} className="contract-chip dep">
                  {d.title}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>

      {node.status === "running" && LIVE_LABEL[node.role] && <LiveTicker live={live[node.id]} label={LIVE_LABEL[node.role]!} />}

      {/* ---------- 분해 */}
      {node.role === "decompose" && run.goal && (
        <div className="insp-content">
          <h4>최종 목표</h4>
          <p>{run.goal}</p>
          <h4>최종 결과물</h4>
          <p>{run.finalDeliverable}</p>
        </div>
      )}
      {node.role === "decompose" && stageErr("decompose") && (
        <div className="error-box">
          <p>{stageErr("decompose")}</p>
          <button className="btn small" onClick={actions.retryStage}>
            다시 시도
          </button>
        </div>
      )}

      {/* ---------- 계획 · 승인 */}
      {(node.role === "plan" || node.role === "gate") && sub && (
        <>
          {sub.planStatus === "error" && (
            <div className="error-box">
              <p>{sub.planError}</p>
              <button className="btn small" onClick={() => actions.replan(sub.id)}>
                다시 계획
              </button>
            </div>
          )}
          {sub.planStatus === "done" && sub.plan && <PlanView sub={sub} />}

          {sub.planStatus === "done" && sub.approval === "pending" && !revising && (
            <div className="insp-actions">
              <button className="btn primary" onClick={() => actions.decide(sub.id, "approved")}>
                {depsSettled(run, sub) ? "승인하고 바로 실행" : "승인 (선행 업무가 끝나면 실행)"}
              </button>
              <div className="row">
                <button className="btn small" onClick={() => setRevising(true)}>
                  수정 요청
                </button>
                <button className="btn ghost small" onClick={() => actions.decide(sub.id, "excluded")}>
                  제외
                </button>
              </div>
            </div>
          )}
          {revising && (
            <form
              className="revise"
              onSubmit={(e) => {
                e.preventDefault();
                if (!feedback.trim()) return;
                actions.revise(sub.id, feedback.trim());
                setRevising(false);
                setFeedback("");
              }}
            >
              <textarea
                rows={3}
                autoFocus
                value={feedback}
                placeholder="어떤 점을 바꾸면 좋을지 알려 주세요"
                onChange={(e) => setFeedback(e.target.value)}
              />
              <div className="row end">
                <button type="button" className="btn ghost small" onClick={() => setRevising(false)}>
                  취소
                </button>
                <button type="submit" className="btn primary small" disabled={!feedback.trim()}>
                  계획 다시 세우기
                </button>
              </div>
            </form>
          )}
          {sub.approval !== "pending" && sub.resultStatus === "idle" && (
            <button className="btn ghost small" onClick={() => actions.decide(sub.id, "pending")}>
              {sub.approval === "approved" ? "승인 취소" : "제외 취소"}
            </button>
          )}
        </>
      )}

      {/* ---------- 실행 */}
      {node.role === "exec" && sub && (
        <>
          {node.status === "blocked" && (
            <p className="insp-note">선행 업무의 결과가 나오면 자동으로 시작합니다. 다른 업무는 이 업무를 기다리지 않습니다.</p>
          )}
          {sub.resultStatus === "error" && (
            <div className="error-box">
              <p>{sub.resultError}</p>
              <button className="btn small" onClick={() => actions.retryExecute(sub.id)}>
                이 노드만 다시 실행
              </button>
            </div>
          )}
          {evalItem && (
            <div className="insp-content">
              <h4>평가 {Math.round(evalItem.score)}점</h4>
              <ul className="pros">
                {evalItem.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <ul className="cons">
                {evalItem.issues.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {sub.result && (
            <div className="insp-content">
              <h4>실행 결과 ({sub.result.length.toLocaleString()}자)</h4>
              <pre className="insp-result">{sub.result}</pre>
              <button className="btn small" onClick={() => actions.saveResult(sub.id)}>
                결과 원본 저장 (.md)
              </button>
            </div>
          )}
          {!sub.result && sub.plan && node.status !== "running" && <PlanView sub={sub} />}
        </>
      )}

      {/* ---------- 취합 · 평가 · 프리뷰 */}
      {node.role === "reduce" && (
        <div className="insp-content">
          <h4>포함되는 결과</h4>
          <ul>
            {run.subtasks.map((s) => (
              <li key={s.id} className={s.approval === "excluded" ? "muted" : ""}>
                {s.title} — {s.approval === "excluded" ? "제외됨" : s.resultStatus === "done" ? "완료" : "대기"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {node.role === "evaluate" && run.evaluation && (
        <div className="insp-content">
          <h4>종합 {Math.round(run.evaluation.overallScore)}점</h4>
          <p>{run.evaluation.summary}</p>
          <button className="btn small" onClick={() => actions.jumpTo("evaluation")}>
            평가 자세히 보기
          </button>
        </div>
      )}
      {(node.role === "evaluate" || node.role === "preview") && stageErr(node.role) && (
        <div className="error-box">
          <p>{stageErr(node.role)}</p>
          <button className="btn small" onClick={actions.retryStage}>
            다시 시도
          </button>
        </div>
      )}
      {(node.role === "preview" || node.role === "output") && run.previewHtml && (
        <button className="btn primary" onClick={() => actions.jumpTo("preview")}>
          목업 열어 보기
        </button>
      )}
      {node.role === "input" && <p className="insp-what">{run.task}</p>}

      <p className="insp-what">{info.what}</p>
      {info.principle && <p className="insp-principle">📐 {info.principle}</p>}
    </aside>
  );
}
