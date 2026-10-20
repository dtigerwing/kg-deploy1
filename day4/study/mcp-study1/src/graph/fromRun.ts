// 실제 실행 기록(WorkflowRun)을 그래프 뷰 모델로 바꿉니다.
import type { NodeTiming, SubtaskRecord, WorkflowRun } from "../../shared/types";
import { depsSettled, type FailedStage, type Live } from "../lib/useWorkflow";
import { buildEdges } from "./edges";
import { formatSec } from "./metrics";
import type { Graph, GraphNode, NodeStatus } from "./types";

const toSec = (iso: string | null | undefined, origin: number) => (iso ? (Date.parse(iso) - origin) / 1000 : null);

/** 지금 진행 중인 노드가 있는지 (있으면 화면 시간이 계속 흐릅니다) */
export function isActive(run: WorkflowRun): boolean {
  return Object.values(run.timings).some((t) => t.startedAt && !t.finishedAt);
}

/** 그래프 기준 현재 시각(초). 진행 중이 아니면 마지막으로 끝난 시각에 멈춥니다. */
export function runClock(run: WorkflowRun, nowMs: number): number {
  const origin = Date.parse(run.createdAt);
  if (isActive(run)) return (nowMs - origin) / 1000;
  const ends = Object.values(run.timings).flatMap((t) => [t.finishedAt, ...t.failures.map((f) => f.endedAt)]);
  return Math.max(0, ...ends.map((e) => toSec(e, origin) ?? 0));
}

export function runToGraph(
  run: WorkflowRun,
  live: Record<string, Live>,
  clock: number,
  stageError: { stage: FailedStage; message: string } | null,
): Graph {
  const origin = Date.parse(run.createdAt);
  const hasSubtasks = run.subtasks.length > 0;
  const titleOf = (id: string) => run.subtasks.find((s) => s.id === id)?.title ?? id;
  const scoreOf = (id: string) => run.evaluation?.perSubtask.find((p) => p.subtaskId === id)?.score;
  const nodes: GraphNode[] = [];

  const add = (
    id: string,
    role: GraphNode["role"],
    kind: GraphNode["kind"],
    title: string,
    status: NodeStatus,
    detailFor: (elapsed: number | null, t: NodeTiming | undefined) => string,
    subtaskId: string | null = null,
  ) => {
    // 결과(목업) 노드는 따로 기록하지 않으므로 프리뷰가 끝난 시각을 그대로 씁니다 (임계 경로의 시작점).
    const t = id === "output" && run.previewHtml ? { ...run.timings.preview!, startedAt: run.timings.preview?.finishedAt ?? null } : run.timings[id];
    const startedAt = toSec(t?.startedAt, origin);
    const finishedAt = toSec(t?.finishedAt, origin);
    const elapsed = startedAt != null ? (finishedAt ?? clock) - startedAt : null;
    const chars = live[id]?.chars ?? 0;
    let detail = detailFor(elapsed, t);
    if (status === "running" && kind === "agent") detail = `${formatSec(elapsed ?? 0)}${chars ? ` · ${chars.toLocaleString()}자` : " · 생각 중"}`;
    nodes.push({
      id,
      role,
      kind,
      title,
      subtaskId,
      status,
      detail,
      startedAt,
      finishedAt,
      attempts: t?.attempts ?? 0,
      failedSpans: (t?.failures ?? []).map((f) => [toSec(f.startedAt, origin)!, toSec(f.endedAt, origin)!]),
      chars,
      badge: role === "exec" && subtaskId && scoreOf(subtaskId) != null ? `${Math.round(scoreOf(subtaskId)!)}점` : null,
    });
  };

  const doneIn = (elapsed: number | null) => (elapsed != null ? `${formatSec(elapsed)} 소요` : "완료");

  // 입력과 분해
  add("input", "input", "io", "업무 입력", "done", () => (run.task.length > 14 ? `${run.task.slice(0, 14)}…` : run.task));
  const decomposeStatus: NodeStatus = hasSubtasks
    ? "done"
    : stageError?.stage === "decompose"
      ? "error"
      : run.timings.decompose?.startedAt
        ? "running"
        : "idle";
  add("decompose", "decompose", "agent", "분해 에이전트", decomposeStatus, (e) =>
    decomposeStatus === "done" ? `${run.subtasks.length}개로 분해 · ${doneIn(e)}` : decomposeStatus === "error" ? "실패 · 클릭해서 확인" : "대기",
  );

  // 세부 업무마다 계획 → 승인 → 실행
  for (const sub of run.subtasks) {
    const planStatus = mapStep(sub.planStatus);
    add(`plan:${sub.id}`, "plan", "agent", sub.title, planStatus, (e) =>
      planStatus === "done" ? (sub.feedback ? "피드백 반영됨" : doneIn(e)) : planStatus === "error" ? "실패 · 다시 계획" : "대기",
    sub.id);

    const gateStatus: NodeStatus =
      sub.planStatus !== "done" ? "idle" : sub.approval === "pending" ? "waiting" : sub.approval === "approved" ? "done" : "skipped";
    add(`gate:${sub.id}`, "gate", "human", "승인", gateStatus, () =>
      gateStatus === "waiting" ? "검토하기" : gateStatus === "done" ? "승인됨" : gateStatus === "skipped" ? "제외됨" : "계획 대기",
    sub.id);

    const execStatus = execStatusOf(run, sub);
    add(`exec:${sub.id}`, "exec", "agent", sub.title, execStatus, (e) => {
      if (execStatus === "done") return doneIn(e);
      if (execStatus === "error") return "실패 · 이 노드만 재시도";
      if (execStatus === "skipped") return "제외됨";
      if (execStatus === "blocked") {
        const waiting = sub.dependsOn.find((d) => {
          const dep = run.subtasks.find((s) => s.id === d);
          return dep && dep.approval !== "excluded" && dep.resultStatus !== "done";
        });
        return waiting ? `'${titleOf(waiting)}' 결과 대기` : "선행 결과 대기";
      }
      return sub.approval === "pending" ? "승인 대기" : "대기";
    }, sub.id);
  }

  // 취합(코드) → 평가 → 프리뷰 → 결과
  const reduceDone = !!run.timings.reduce?.finishedAt;
  add("reduce", "reduce", "code", "결과 취합", reduceDone ? "done" : "idle", () =>
    reduceDone ? `${run.subtasks.filter((s) => s.approval === "approved").length}개 결과 정리` : "모든 결과 대기",
  );
  const stepStatus = (id: "evaluate" | "preview", done: boolean): NodeStatus =>
    done ? "done" : stageError?.stage === id ? "error" : run.timings[id]?.startedAt ? "running" : "idle";
  const evalStatus = stepStatus("evaluate", !!run.evaluation);
  add("evaluate", "evaluate", "agent", "평가 에이전트", evalStatus, (e) =>
    evalStatus === "done" ? `종합 ${Math.round(run.evaluation!.overallScore)}점` : evalStatus === "error" ? "실패 · 다시 시도" : e != null ? doneIn(e) : "대기",
  );
  const previewStatus = stepStatus("preview", !!run.previewHtml);
  add("preview", "preview", "agent", "프리뷰 빌더", previewStatus, (e) =>
    previewStatus === "done" ? doneIn(e) : previewStatus === "error" ? "실패 · 다시 시도" : "대기",
  );
  add("output", "output", "io", "목업", run.previewHtml ? "done" : "idle", () => (run.previewHtml ? "열어 보기" : "대기"));

  const statusOf = new Map(nodes.map((n) => [n.id, n.status]));
  return { nodes, edges: buildEdges(run.subtasks, (id) => statusOf.get(id) ?? "idle") };
}

function mapStep(status: SubtaskRecord["planStatus"]): NodeStatus {
  return status === "running" ? "running" : status === "done" ? "done" : status === "error" ? "error" : "idle";
}

function execStatusOf(run: WorkflowRun, sub: SubtaskRecord): NodeStatus {
  if (sub.approval === "excluded") return "skipped";
  if (sub.resultStatus !== "idle") return mapStep(sub.resultStatus);
  if (sub.approval === "approved") return depsSettled(run, sub) ? "running" : "blocked";
  return "idle";
}
