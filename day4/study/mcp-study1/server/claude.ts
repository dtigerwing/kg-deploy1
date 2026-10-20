import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { BetaMessageStream } from "@anthropic-ai/sdk/lib/BetaMessageStream";
import type { z } from "zod";

/** 모든 에이전트가 사용하는 모델과 추론 강도 */
export const MODEL = "claude-opus-5-5";
export const EFFORT = "high";

// 안전 분류기가 요청을 거절하면 서버 측에서 권장 대체 모델로 자동 재시도합니다.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AgentError extends Error {}

let client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function getClient(): Anthropic {
  if (!hasApiKey()) {
    throw new AgentError(".env 파일에 ANTHROPIC_API_KEY가 없습니다. 키를 입력한 뒤 서버를 재시작하세요.");
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), maxRetries: 4 });
  return client;
}

export interface AgentHooks {
  onThinking?: (delta: string) => void;
  onText?: (charsSoFar: number) => void;
  signal?: AbortSignal;
}

interface AgentCall {
  system: string;
  prompt: string;
  hooks: AgentHooks;
  /** 출력 상한 (사고 과정 포함). 기본 64K, 긴 HTML을 쓰는 프리뷰는 모델 최대치인 128K */
  maxTokens?: number;
}

function baseParams({ system, prompt, maxTokens }: AgentCall) {
  return {
    model: MODEL,
    max_tokens: maxTokens ?? 64000,
    thinking: { type: "adaptive" as const, display: "summarized" as const },
    system,
    messages: [{ role: "user" as const, content: prompt }],
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
  };
}

function attachHooks<T>(stream: BetaMessageStream<T>, hooks: AgentHooks): BetaMessageStream<T> {
  if (hooks.onThinking) stream.on("thinking", (delta) => hooks.onThinking!(delta));
  if (hooks.onText) stream.on("text", (_delta, snapshot) => hooks.onText!(snapshot.length));
  return stream;
}

function assertCompleted(message: BetaMessage): void {
  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category ?? "unknown";
    throw new AgentError(`모델이 이 요청을 처리할 수 없다고 응답했습니다 (category: ${category}). 업무 설명을 바꿔 다시 시도해 주세요.`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AgentError("출력이 최대 길이에 도달해 잘렸습니다. 업무 범위를 줄여 다시 시도해 주세요.");
  }
}

/** Zod 스키마로 검증된 JSON 객체를 돌려주는 에이전트 호출 */
export async function runStructuredAgent<S extends z.ZodType>(
  schema: S,
  call: AgentCall,
): Promise<z.infer<S>> {
  const stream = getClient().beta.messages.stream(
    {
      ...baseParams(call),
      output_config: { effort: EFFORT, format: betaZodOutputFormat(schema) },
    },
    { signal: call.hooks.signal },
  );
  const message = await attachHooks(stream, call.hooks).finalMessage();
  assertCompleted(message);
  if (message.parsed_output == null) {
    throw new AgentError("모델 응답을 정해진 형식으로 해석하지 못했습니다. 다시 시도해 주세요.");
  }
  return message.parsed_output as z.infer<S>;
}

/** 자유 형식 텍스트(마크다운/HTML)를 돌려주는 에이전트 호출 */
export async function runTextAgent(call: AgentCall): Promise<string> {
  const stream = getClient().beta.messages.stream(
    { ...baseParams(call), output_config: { effort: EFFORT } },
    { signal: call.hooks.signal },
  );
  const message = await attachHooks(stream, call.hooks).finalMessage();
  assertCompleted(message);
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

export function describeError(error: unknown): string {
  if (error instanceof AgentError) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return "API 키가 올바르지 않습니다. .env의 ANTHROPIC_API_KEY를 확인하세요.";
  if (error instanceof Anthropic.PermissionDeniedError) return "이 API 키로는 해당 모델에 접근할 수 없습니다.";
  if (error instanceof Anthropic.RateLimitError) return "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  if (error instanceof Anthropic.BadRequestError) return `잘못된 요청입니다: ${error.message}`;
  if (error instanceof Anthropic.APIUserAbortError) return "요청이 취소되었습니다.";
  if (error instanceof Anthropic.APIConnectionError) return "Anthropic API에 연결하지 못했습니다. 네트워크를 확인하세요.";
  if (error instanceof Anthropic.APIError) return `API 오류 (${error.status}): ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
