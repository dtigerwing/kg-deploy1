import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { baseParams, effortConfig, ensureComplete, getClient, usageOf } from "../claude.js";
import { digestOf } from "../transcripts.js";
import { ChunkSummarySchema, type AgentUsage, type ChunkSummary, type WorkChunk } from "../types.js";

const SYSTEM = `당신은 Unity 개발자의 하루 작업 기록을 정리하는 서브에이전트입니다.
입력은 Claude Code 대화 기록에서 뽑아낸 것입니다: 사용자 요청, 할 일 목록, Unity MCP 도구 호출(성공/실패),
수정한 파일, 각 요청을 마칠 때 남긴 마무리 요약, 마지막 답변.

정리 규칙:
- done에는 실제로 한 일만 씁니다. 씬·스크립트·오브젝트·문서 이름을 구체적으로 적습니다.
- results의 상태는 근거로 판단합니다. 마무리 요약에 "확인했다/통과했다"가 있으면 완료,
  "아직/확인 안 됨"이면 확인 필요, 실패한 채 끝났으면 실패입니다.
- Unity MCP 호출 실패가 있었으면 problems에 원인과 어떻게 넘어갔는지 적습니다.
- 기록에 없는 내용은 지어내지 않습니다.
- 모든 문장은 한국어로, 짧고 구체적으로 씁니다.`;

export async function runSummarizer(chunk: WorkChunk): Promise<{ summary: ChunkSummary; usage: AgentUsage }> {
  const stream = getClient().beta.messages.stream({
    ...baseParams,
    system: SYSTEM,
    output_config: { ...effortConfig, format: betaZodOutputFormat(ChunkSummarySchema) },
    messages: [{ role: "user", content: `${digestOf(chunk)}\n\n위 작업 기록을 정리해 주세요.` }],
  });

  const message = await stream.finalMessage();
  ensureComplete(message, `요약 에이전트(${chunk.date})`);
  if (!message.parsed_output) throw new Error(`요약 에이전트(${chunk.date})의 답을 JSON으로 읽지 못했습니다.`);
  return { summary: message.parsed_output, usage: usageOf(message, `summarizer ${chunk.date}`) };
}
