import { formatSec } from "./metrics";
import type { SimSubtask } from "./simulation";
import type { Graph, GraphNode } from "./types";

export const ROLE_INFO: Record<GraphNode["role"], { what: string; principle: string }> = {
  input: { what: "사용자가 입력한 업무입니다. 그래프 전체의 시작점입니다.", principle: "" },
  decompose: {
    what: "업무를 세부 업무로 나누고, 어떤 업무가 어떤 업무의 결과를 실제로 필요로 하는지(의존 관계)까지 설계합니다.",
    principle: "01 순서가 아니라 의존 관계로 생각하기 · 14 그래프 설계를 Claude에게 맡기기",
  },
  plan: {
    what: "세부 업무 하나의 실행 계획을 세웁니다. 다른 세부 업무의 계획과 동시에 진행됩니다.",
    principle: "05 독립적인 일은 펼쳐서 동시에 · 03 노드마다 하나의 일과 하나의 계약(스키마)",
  },
  gate: {
    what: "사용자가 계획을 승인해야 데이터가 다음 노드로 흐릅니다. 파이프라인 방식에서는 승인된 업무가 다른 업무의 승인을 기다리지 않고 바로 실행됩니다.",
    principle: "06 데이터가 필요할 때만 합류하기 · 13 구조가 소요 시간을 결정한다",
  },
  exec: {
    what: "승인된 계획대로 결과물을 만듭니다. 선행 업무의 결과가 필요한 경우에만 그 업무를 기다리고, 실패하면 이 노드만 다시 실행합니다.",
    principle: "01 의존 관계 · 10 실패는 국소적으로",
  },
  reduce: {
    what: "모델을 부르지 않고 코드로 결과를 모아 평가에 넘길 형태로 정리합니다. 모든 결과가 필요하므로 여기서만 전체를 기다립니다.",
    principle: "04 노드는 생각하고, 엣지는 변환한다 · 06 진짜로 필요한 곳에서만 합류",
  },
  evaluate: {
    what: "모든 결과를 계획의 완료 기준으로 채점하고, 결과물 사이의 충돌과 누락을 찾습니다.",
    principle: "07 다이아몬드: 나누기 → 병렬 작업 → 모으기 → 종합 · 09 결과를 검증하기",
  },
  preview: { what: "결과와 평가를 하나의 인터랙티브 HTML 목업으로 종합합니다.", principle: "07 다이아몬드의 마지막 종합 노드" },
  output: { what: "사용자가 저장해서 바로 쓸 수 있는 목업 HTML입니다.", principle: "" },
};

export const STATUS_LABEL: Record<GraphNode["status"], string> = {
  idle: "대기",
  blocked: "선행 결과 대기",
  waiting: "승인 대기",
  running: "실행 중",
  done: "완료",
  error: "실패",
  skipped: "제외됨",
};

export function NodeInspector({
  node,
  graph,
  subtask,
  autoApprove,
  now,
  onApprove,
  onExclude,
  onRetry,
  onClose,
}: {
  node: GraphNode | null;
  graph: Graph;
  subtask: SimSubtask | null;
  autoApprove: boolean;
  now: number;
  onApprove: () => void;
  onExclude: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  if (!node) return null;

  const info = ROLE_INFO[node.role];
  const titleOf = (id: string) => graph.nodes.find((n) => n.id === id)?.title ?? id;
  const inputs = graph.edges.filter((e) => e.to === node.id);
  const outputs = graph.edges.filter((e) => e.from === node.id);
  const elapsed = node.startedAt != null ? (node.finishedAt ?? now) - node.startedAt : null;

  return (
    <aside className="inspector">
      <div className="insp-head">
        <span className={`g-kind-chip ${node.kind}`}>{node.kind === "io" ? "I/O" : node.kind.toUpperCase()}</span>
        <span className={`insp-status ${node.status}`}>{STATUS_LABEL[node.status]}</span>
        <button className="insp-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      <h3>{node.title}</h3>
      {node.role !== "gate" && subtask && <p className="muted small">{subtask.objective}</p>}

      <dl className="insp-meta">
        <dt>처리</dt>
        <dd>
          {node.kind === "agent"
            ? "claude-opus-5-5 · effort high · adaptive thinking"
            : node.kind === "code"
              ? "코드 (모델 호출 없음)"
              : node.kind === "human"
                ? "사용자"
                : "—"}
        </dd>
        {elapsed != null && node.kind !== "io" && (
          <>
            <dt>{node.role === "gate" ? "대기 시간" : "소요"}</dt>
            <dd>
              {formatSec(elapsed)}
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
      </dl>

      <p className="insp-what">{info.what}</p>
      {info.principle && <p className="insp-principle">📐 {info.principle}</p>}

      {node.role === "plan" && subtask && node.status === "done" && (
        <div className="insp-content">
          <h4>계획 (예시)</h4>
          <ol>
            {subtask.planSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {node.role === "exec" && subtask && node.status === "done" && (
        <div className="insp-content">
          <h4>결과 (예시)</h4>
          <pre>{subtask.resultExcerpt}</pre>
        </div>
      )}

      {node.role === "gate" && node.status === "waiting" && !autoApprove && (
        <div className="row">
          <button className="btn primary small" onClick={onApprove}>
            승인
          </button>
          <button className="btn ghost small" onClick={onExclude}>
            제외
          </button>
        </div>
      )}
      {node.status === "error" && !autoApprove && (
        <button className="btn small" onClick={onRetry}>
          이 노드만 다시 실행
        </button>
      )}
    </aside>
  );
}
