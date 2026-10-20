import type { Decomposition, Evaluation, Plan, Subtask } from "./schemas";

export type { Decomposition, Evaluation, Plan, Subtask };

// ---------------------------------------------------------------------------
// 워크플로우 실행 기록.
// 추후 Firestore 문서(`runs/{id}`)로 그대로 저장할 수 있도록
// undefined 대신 null, 날짜는 ISO 문자열, 중첩 배열 없이 구성합니다.
// ---------------------------------------------------------------------------

export type Approval = "pending" | "approved" | "excluded";
export type StepStatus = "idle" | "running" | "done" | "error";

export interface SubtaskRecord extends Subtask {
  plan: Plan | null;
  planStatus: StepStatus;
  planError: string | null;
  /** 사용자가 "수정 요청" 시 남긴 피드백 (재계획 시 계획 에이전트에 전달) */
  feedback: string | null;
  approval: Approval;
  result: string | null;
  resultStatus: StepStatus;
  resultError: string | null;
}

/**
 * 그래프 노드 하나의 실행 시각 기록. 노드 id는 "decompose", "plan:{subtaskId}", "gate:{subtaskId}",
 * "exec:{subtaskId}", "reduce", "evaluate", "preview" 형식입니다.
 */
export interface NodeTiming {
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  /** 실패했던 시도 (Firestore는 배열 안의 배열을 허용하지 않아 객체 배열로 둡니다) */
  failures: { startedAt: string; endedAt: string }[];
}

export interface WorkflowRun {
  id: string;
  schemaVersion: 2;
  createdAt: string;
  updatedAt: string;
  model: string;
  task: string;
  goal: string | null;
  finalDeliverable: string | null;
  subtasks: SubtaskRecord[];
  evaluation: Evaluation | null;
  previewHtml: string | null;
  timings: Record<string, NodeTiming>;
}

// ---------------------------------------------------------------------------
// API 요청 본문
// ---------------------------------------------------------------------------

export interface DecomposeRequest {
  task: string;
}

export interface PlanRequest {
  task: string;
  goal: string;
  allSubtasks: Subtask[];
  subtask: Subtask;
  previousPlan: Plan | null;
  feedback: string | null;
}

export interface ExecuteRequest {
  task: string;
  goal: string;
  finalDeliverable: string;
  subtask: Subtask;
  plan: Plan;
  /** dependsOn으로 연결된 선행 업무의 결과물 */
  upstream: { id: string; title: string; result: string }[];
}

export interface CompletedItem {
  subtask: Subtask;
  plan: Plan;
  result: string;
}

export interface EvaluateRequest {
  task: string;
  goal: string;
  finalDeliverable: string;
  items: CompletedItem[];
}

export interface PreviewRequest extends EvaluateRequest {
  evaluation: Evaluation;
}

export interface HealthResponse {
  ok: true;
  hasApiKey: boolean;
  model: string;
  effort: string;
  /** 배포 환경처럼 접속 코드가 필요한지 */
  accessRequired: boolean;
}

// ---------------------------------------------------------------------------
// 서버 → 클라이언트 스트림 이벤트 (NDJSON, 한 줄에 하나)
// ---------------------------------------------------------------------------

export type StreamEvent<T> =
  /** 모델이 생각 중일 때 요약된 사고 과정 */
  | { type: "thinking"; text: string }
  /** 출력 생성 진행 상황 (누적 글자 수) */
  | { type: "progress"; chars: number }
  | { type: "done"; data: T }
  | { type: "error"; message: string };
