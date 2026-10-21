import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY, EFFORT, MODEL } from "./config.js";
import type { AgentUsage } from "./types.js";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!ANTHROPIC_API_KEY) {
    throw new Error(".env 파일의 ANTHROPIC_API_KEY가 비어 있습니다. 키를 넣고 서버를 다시 시작해 주세요.");
  }
  client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return client;
}

// 두 에이전트가 공통으로 쓰는 요청 설정.
// fallbacks: "default" — 안전 분류기가 요청을 거절하면 서버가 권장 모델로 한 번 더 시도한다.
export const baseParams = {
  model: MODEL,
  max_tokens: 64000,
  thinking: { type: "adaptive" },
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
} satisfies Partial<Anthropic.Beta.Messages.MessageCreateParamsStreaming>;

export const effortConfig = { effort: EFFORT } satisfies Anthropic.Beta.Messages.BetaOutputConfig;

// 스트림에서 글자 수가 늘어날 때마다 1초 간격으로 진행 상황을 알린다.
export function watchProgress(
  stream: { on(event: "text", listener: (delta: string) => void): unknown },
  onChars: (chars: number) => void,
): void {
  let chars = 0;
  let last = 0;
  stream.on("text", (delta) => {
    chars += delta.length;
    const now = Date.now();
    if (now - last > 1000) {
      last = now;
      onChars(chars);
    }
  });
}

// 끝까지 답하지 못한 응답은 결과물로 쓰지 않는다.
export function ensureComplete(message: Anthropic.Beta.BetaMessage, agentName: string): void {
  if (message.stop_reason === "refusal") {
    const reason = message.stop_details?.explanation ?? "사유 없음";
    throw new Error(`${agentName}가 요청을 거절했습니다: ${reason}`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(`${agentName}의 답이 max_tokens에서 잘렸습니다. 입력을 줄이거나 max_tokens를 늘려 주세요.`);
  }
}

export function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

export function usageOf(message: Anthropic.Beta.BetaMessage, agent: AgentUsage["agent"]): AgentUsage {
  return {
    agent,
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
