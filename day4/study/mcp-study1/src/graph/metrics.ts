import type { Graph, GraphNode } from "./types";

export interface GraphStats {
  elapsed: number;
  /** 모든 작업을 한 줄로 이어서 했다면 걸렸을 시간 (사람 대기 제외) */
  sequential: number;
  /** 에이전트가 하나라도 일하고 있던 실제 시간 (겹친 구간은 한 번만 셈, 사람 대기 제외) */
  busy: number;
  maxConcurrency: number;
  modelCalls: number;
  retries: number;
}

const isWork = (n: GraphNode) => n.kind === "agent" || n.kind === "code";

function intervals(n: GraphNode, now: number): [number, number][] {
  const spans = [...n.failedSpans];
  if (n.startedAt != null && (n.status === "running" || n.status === "done")) spans.push([n.startedAt, n.finishedAt ?? now]);
  return spans;
}

export function computeStats(graph: Graph, now: number): GraphStats {
  const work = graph.nodes.filter(isWork);
  const spans = work.flatMap((n) => intervals(n, now));
  const output = graph.nodes.find((n) => n.role === "output");

  // 동시에 실행 중인 에이전트 수의 최댓값 (시작/끝 이벤트를 훑어서 계산)
  const events = spans.flatMap(([a, b]) => [[a, 1] as const, [b, -1] as const]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let cur = 0;
  let maxConcurrency = 0;
  let busy = 0;
  let prevT = 0;
  for (const [t, d] of events) {
    if (cur > 0) busy += t - prevT;
    prevT = t;
    maxConcurrency = Math.max(maxConcurrency, (cur += d));
  }

  const agents = graph.nodes.filter((n) => n.kind === "agent");
  return {
    elapsed: output?.finishedAt ?? now,
    sequential: spans.reduce((sum, [a, b]) => sum + (b - a), 0),
    busy,
    maxConcurrency,
    modelCalls: agents.reduce((sum, n) => sum + n.attempts, 0),
    retries: agents.reduce((sum, n) => sum + Math.max(0, n.attempts - 1), 0),
  };
}

/**
 * 임계 경로: 결과 노드에서 거꾸로, 가장 늦게 끝난 선행 노드를 따라갑니다.
 * 이 경로에 있는 노드가 전체 소요 시간을 결정합니다.
 */
export function criticalPath(graph: Graph): Set<string> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const path = new Set<string>();
  let current = graph.nodes.find((n) => n.role === "output" && n.finishedAt != null);
  while (current) {
    path.add(current.id);
    const preds = graph.edges
      .filter((e) => e.to === current!.id && e.state !== "cut")
      .map((e) => byId.get(e.from)!)
      .filter((n) => n.finishedAt != null);
    let next = preds.sort((a, b) => b.finishedAt! - a.finishedAt!)[0];
    // 엣지에 드러나지 않는 대기(예: 일괄 실행의 '전체 승인 대기')가 시작을 늦췄다면,
    // 이 노드가 시작되기 직전에 끝난 노드를 실제 원인으로 봅니다.
    const startedAt = current.startedAt;
    if (next && startedAt != null && startedAt - next.finishedAt! > 0.5) {
      const trigger = graph.nodes
        .filter((n) => n.id !== current!.id && n.finishedAt != null && n.finishedAt <= startedAt && startedAt - n.finishedAt <= 0.5)
        .sort((a, b) => b.finishedAt! - a.finishedAt!)[0];
      if (trigger) next = trigger;
    }
    current = next && !path.has(next.id) ? next : undefined;
  }
  return path;
}

export const formatSec = (sec: number) => {
  if (sec < 60) return `${sec.toFixed(1)}초`;
  const total = Math.round(sec); // 분과 초를 따로 반올림하면 "1분 60초"가 나올 수 있어 먼저 정수로 맞춥니다
  return `${Math.floor(total / 60)}분 ${total % 60}초`;
};
