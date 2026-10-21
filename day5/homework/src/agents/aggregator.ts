import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { baseParams, effortConfig, ensureComplete, getClient, usageOf, watchProgress } from "../claude.js";
import { WorkReportSchema, type AgentUsage, type ChunkPreview, type ChunkSummary, type WorkReport, type WorkStats } from "../types.js";

const SYSTEM = `당신은 여러 서브에이전트가 정리한 Unity 작업 요약을 모아 기간 리포트를 만드는 취합 에이전트입니다.

리포트 규칙:
- workstreams: 날짜를 넘어 이어지는 작업 흐름(예: 프로토타입 1, 스테이지 제작)으로 묶습니다.
  progress는 남은 일과 확인 안 된 항목을 보고 추정하고, 완료라도 실제 기기 확인 등이 남았으면 100으로 두지 않습니다.
- done: 날짜순으로, 한 일을 굵직한 단위로 정리합니다.
- results: 결과물과 그 상태. 근거가 없으면 "확인 필요"로 둡니다.
- issues: 막혔던 문제. 기간 안에 해결됐으면 resolved를 true로 둡니다.
- nextActions: 남은 일을 우선순위 순서로 씁니다.
- 숫자 통계는 함께 주는 값을 그대로 씁니다. 요약에 없는 내용은 지어내지 않습니다.
- 모든 문장은 한국어로 씁니다.`;

export async function runAggregator(
  projectName: string,
  period: { from: string; to: string },
  stats: WorkStats,
  summaries: (ChunkPreview & { summary: ChunkSummary })[],
  onChars: (chars: number) => void,
): Promise<{ report: WorkReport; usage: AgentUsage }> {
  const input = {
    project: projectName,
    period,
    stats,
    chunks: summaries.map(({ date, sessionTitle, requests, unityCalls, unityFailures, summary }) => ({
      date, sessionTitle, requests, unityCalls, unityFailures, summary,
    })),
  };

  const stream = getClient().beta.messages.stream({
    ...baseParams,
    system: SYSTEM,
    output_config: { ...effortConfig, format: betaZodOutputFormat(WorkReportSchema) },
    messages: [
      { role: "user", content: `<work_summaries>\n${JSON.stringify(input, null, 2)}\n</work_summaries>\n\n기간 리포트를 만들어 주세요.` },
    ],
  });
  watchProgress(stream, onChars);

  const message = await stream.finalMessage();
  ensureComplete(message, "취합 에이전트");
  if (!message.parsed_output) throw new Error("취합 에이전트의 답을 JSON으로 읽지 못했습니다.");
  return { report: message.parsed_output, usage: usageOf(message, "aggregator") };
}
