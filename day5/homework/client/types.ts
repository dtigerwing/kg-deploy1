// 서버의 src/types.ts 중 화면에서 쓰는 부분만 옮겨 둔 타입

export type ResultStatus = "완료" | "부분 완료" | "실패" | "확인 필요";

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  sessionCount: number;
  lastActivity: string;
}

export interface ChunkPreview {
  id: string;
  sessionTitle: string;
  date: string;
  start: string;
  end: string;
  requests: number;
  unityCalls: number;
  unityFailures: number;
  filesEdited: number;
  firstRequest: string;
}

export interface WorkStats {
  chunks: number;
  sessions: number;
  activeDays: number;
  requests: number;
  unityCalls: number;
  unityFailures: number;
  filesEdited: number;
  unityToolCounts: { tool: string; count: number }[];
}

export interface ChunkSummary {
  title: string;
  goal: string;
  done: string[];
  results: { item: string; status: ResultStatus; evidence: string }[];
  problems: string[];
  openItems: string[];
}

export interface WorkReport {
  title: string;
  overview: string;
  workstreams: { name: string; status: "완료" | "진행 중" | "막힘" | "시작 전"; progress: number; summary: string; nextStep: string }[];
  done: { date: string; title: string; detail: string }[];
  results: { title: string; status: ResultStatus; evidence: string }[];
  issues: { title: string; detail: string; resolved: boolean }[];
  nextActions: string[];
}

export interface ReportRun {
  id: string;
  createdAt: string;
  model: string;
  effort: string;
  project: { id: string; name: string; path: string };
  period: { from: string; to: string };
  stats: WorkStats;
  chunks: (ChunkPreview & { summary: ChunkSummary })[];
  report: WorkReport;
  usage: { agent: string; model: string; inputTokens: number; outputTokens: number }[];
}

export type Stage = "extract" | "summarize" | "aggregate";

export type WorkflowEvent =
  | { type: "stage"; stage: Stage; status: "start" | "done"; message: string }
  | { type: "progress"; stage: Stage; message: string }
  | { type: "done"; run: ReportRun }
  | { type: "error"; message: string };
