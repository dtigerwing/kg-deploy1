import type { GraphEdge, NodeStatus } from "./types";

/** 엣지 상태: 앞 노드가 끝났고 뒤 노드가 일하는 중이면 데이터가 흐르는 중입니다. */
export function edgeState(from: NodeStatus, to: NodeStatus): GraphEdge["state"] {
  if (from === "skipped" || to === "skipped") return "cut";
  if (from === "done" && to === "running") return "flowing";
  if (from === "done" && (to === "done" || to === "waiting")) return "done";
  return "idle";
}

/** 워크플로우의 엣지와 각 엣지를 따라 흐르는 데이터 계약 */
export function buildEdges(
  subtasks: { id: string; dependsOn: string[] }[],
  statusOf: (nodeId: string) => NodeStatus,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const edge = (from: string, to: string, contract: string, dependency = false) =>
    edges.push({ id: `${from}->${to}`, from, to, contract, dependency, state: edgeState(statusOf(from), statusOf(to)) });

  edge("input", "decompose", "업무 텍스트");
  for (const sub of subtasks) {
    edge("decompose", `plan:${sub.id}`, "Subtask");
    edge(`plan:${sub.id}`, `gate:${sub.id}`, "Plan");
    edge(`gate:${sub.id}`, `exec:${sub.id}`, "승인된 Plan");
    for (const dep of sub.dependsOn) edge(`exec:${dep}`, `exec:${sub.id}`, "선행 결과", true);
    edge(`exec:${sub.id}`, "reduce", "Markdown");
  }
  edge("reduce", "evaluate", "CompletedItem[]");
  edge("evaluate", "preview", "Evaluation");
  edge("preview", "output", "HTML");
  return edges;
}
