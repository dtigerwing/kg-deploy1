import * as z from "zod/v4";

// ── 기록에서 뽑아낸 작업 데이터 (코드로 만든다, API 비용 없음) ──

export interface ProjectInfo {
  id: string; // ~/.claude/projects 아래 폴더 이름
  name: string;
  path: string;
  sessionCount: number;
  lastActivity: string;
}

export interface ToolCall {
  time: string;
  tool: string; // mcp__unityMCP__ 를 뗀 이름
  input: string;
  ok: boolean;
  result: string;
}

// 사용자 요청 하나부터 다음 요청 전까지의 작업
export interface Turn {
  sessionId: string;
  agent: string | null; // 서브에이전트가 한 작업이면 그 이름과 설명
  start: string;
  end: string;
  request: string;
  unityCalls: ToolCall[];
  toolCounts: Record<string, number>;
  filesEdited: string[];
  plan: string[];
  recap: string;
  finalText: string;
}

// 요약 서브에이전트 하나가 맡는 단위: 세션 하나의 하루치 작업
export interface WorkChunk {
  id: string;
  sessionId: string;
  sessionTitle: string;
  date: string; // YYYY-MM-DD (로컬 날짜)
  start: string;
  end: string;
  turns: Turn[];
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

// ── 서브에이전트가 돌려주는 모양 (structured output 스키마) ──

const resultStatus = z.enum(["완료", "부분 완료", "실패", "확인 필요"]);

export const ChunkSummarySchema = z.object({
  title: z.string().describe("이 작업 묶음을 한 줄로 부르는 이름"),
  goal: z.string().describe("사용자가 이루려던 것"),
  done: z.array(z.string()).describe("실제로 한 일. 구체적인 씬·스크립트·오브젝트 이름을 넣는다"),
  results: z.array(
    z.object({
      item: z.string(),
      status: resultStatus,
      evidence: z.string().describe("그렇게 판단한 근거 (recap, 도구 결과 등)"),
    }),
  ),
  problems: z.array(z.string()).describe("막혔거나 실패한 것과 어떻게 넘어갔는지"),
  openItems: z.array(z.string()).describe("확인 안 된 것, 다음에 할 것"),
});
export type ChunkSummary = z.infer<typeof ChunkSummarySchema>;

export const WorkReportSchema = z.object({
  title: z.string(),
  overview: z.string().describe("기간 전체를 3~4문장으로 요약"),
  workstreams: z.array(
    z.object({
      name: z.string().describe("작업 흐름 이름 (예: 프로토타입 1, 스테이지 제작)"),
      status: z.enum(["완료", "진행 중", "막힘", "시작 전"]),
      progress: z.number().describe("0~100 사이 진행률 추정치"),
      summary: z.string(),
      nextStep: z.string(),
    }),
  ),
  done: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      title: z.string(),
      detail: z.string(),
    }),
  ),
  results: z.array(
    z.object({
      title: z.string(),
      status: resultStatus,
      evidence: z.string(),
    }),
  ),
  issues: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      resolved: z.boolean(),
    }),
  ),
  nextActions: z.array(z.string()).describe("우선순위 순서"),
});
export type WorkReport = z.infer<typeof WorkReportSchema>;

export interface AgentUsage {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// 리포트 한 번의 결과. 지금은 브라우저에서 파일로 저장하고,
// 나중에는 이 객체를 그대로 Firestore 문서(reports/{id})로 넣을 수 있게 평범한 JSON으로 둔다.
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
  usage: AgentUsage[];
}

export type WorkflowEvent =
  | { type: "stage"; stage: "extract" | "summarize" | "aggregate"; status: "start" | "done"; message: string }
  | { type: "progress"; stage: "summarize" | "aggregate"; message: string }
  | { type: "done"; run: ReportRun }
  | { type: "error"; message: string };
