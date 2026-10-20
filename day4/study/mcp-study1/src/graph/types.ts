// 워크플로우를 노드(작업)와 엣지(데이터 흐름)로 표현하는 그래프 뷰 모델.
// 실제 앱에서는 WorkflowRun으로부터, 프리뷰에서는 시뮬레이션으로부터 만들어집니다.

/** agent: Claude 호출 / code: 모델 없이 코드로 처리 / human: 사용자 승인 / io: 입력·출력 */
export type NodeKind = "io" | "agent" | "code" | "human";

export type NodeStatus =
  | "idle" // 아직 차례가 아님
  | "blocked" // 선행 노드의 결과를 기다리는 중
  | "waiting" // 사용자 승인을 기다리는 중
  | "running"
  | "done"
  | "error"
  | "skipped"; // 사용자가 제외함

export type NodeRole = "input" | "decompose" | "plan" | "gate" | "exec" | "reduce" | "evaluate" | "preview" | "output";

export interface GraphNode {
  id: string;
  role: NodeRole;
  kind: NodeKind;
  title: string;
  /** 세부 업무에 속한 노드면 그 세부 업무 id */
  subtaskId: string | null;
  status: NodeStatus;
  /** 상태 아래 한 줄 설명 (예: "23초 · 1,240자") */
  detail: string;
  startedAt: number | null;
  finishedAt: number | null;
  attempts: number;
  /** 실패했던 시도의 [시작, 끝] 구간 */
  failedSpans: [number, number][];
  chars: number;
  /** 노드 오른쪽 위에 붙는 짧은 표시 (예: 평가 점수) */
  badge: string | null;
}

export type EdgeState = "idle" | "flowing" | "done" | "cut";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** 엣지를 따라 흐르는 데이터의 계약(스키마) 이름 */
  contract: string;
  /** 세부 업무 사이의 의존 관계 엣지인지 */
  dependency: boolean;
  state: EdgeState;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
