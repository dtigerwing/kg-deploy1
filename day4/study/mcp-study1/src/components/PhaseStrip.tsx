import type { WorkflowRun } from "../../shared/types";
import type { Live } from "../lib/useWorkflow";

interface Phase {
  key: string;
  label: string;
  done: number;
  total: number;
  active: boolean;
  complete: boolean;
}

/**
 * 단계 표시줄. 파이프라인에서는 여러 단계가 동시에 진행되므로
 * 한 번에 한 단계만 켜지는 스텝퍼 대신 단계마다 진행률과 활성 여부를 보여 줍니다.
 */
export function PhaseStrip({ run, live }: { run: WorkflowRun; live: Record<string, Live> }) {
  const subs = run.subtasks;
  const approved = subs.filter((s) => s.approval === "approved");
  const n = subs.length;
  const phases: Phase[] = [
    { key: "decompose", label: "분해", done: n > 0 ? 1 : 0, total: 1, active: !!live.decompose, complete: n > 0 },
    {
      key: "plan",
      label: "계획",
      done: subs.filter((s) => s.planStatus === "done").length,
      total: n,
      active: subs.some((s) => s.planStatus === "running"),
      complete: n > 0 && subs.every((s) => s.planStatus === "done"),
    },
    {
      key: "approve",
      label: "승인",
      done: subs.filter((s) => s.approval !== "pending").length,
      total: n,
      active: subs.some((s) => s.planStatus === "done" && s.approval === "pending"),
      complete: n > 0 && subs.every((s) => s.approval !== "pending"),
    },
    {
      key: "exec",
      label: "실행",
      done: approved.filter((s) => s.resultStatus === "done").length,
      total: approved.length,
      active: subs.some((s) => s.resultStatus === "running"),
      complete: approved.length > 0 && approved.every((s) => s.resultStatus === "done") && subs.every((s) => s.approval !== "pending"),
    },
    { key: "evaluate", label: "평가", done: run.evaluation ? 1 : 0, total: 1, active: !!live.evaluate, complete: !!run.evaluation },
    { key: "preview", label: "프리뷰", done: run.previewHtml ? 1 : 0, total: 1, active: !!live.preview, complete: !!run.previewHtml },
  ];

  return (
    <ol className="phases" aria-label="진행 단계">
      {phases.map((p) => (
        <li key={p.key} className={p.complete ? "complete" : p.active ? "active" : ""}>
          <div className="phase-top">
            <span className="phase-label">{p.label}</span>
            {p.total > 0 && ["plan", "approve", "exec"].includes(p.key) && (
              <span className="phase-count">
                {p.done}/{p.total}
              </span>
            )}
            {p.complete && <span className="phase-check">✓</span>}
          </div>
          <div className="phase-bar">
            <i style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
