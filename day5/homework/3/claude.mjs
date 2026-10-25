// Claude API 호출. 모든 에이전트가 Opus 5.5 / effort high 로 돈다.
// 답이 길어질 수 있어서 스트리밍으로 받고 finalMessage()로 한 번에 꺼낸다(HTTP 타임아웃 방지).
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
export const EFFORT = "high";

let client;

export function hasKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// 글로 된 결과물이 필요할 때
export async function ask(system, content, signal) {
  return call(system, content, { effort: EFFORT }, signal);
}

// 정해진 모양(JSON)의 결과가 필요할 때
export async function askJson(system, content, schema, signal) {
  return JSON.parse(await call(system, content, { effort: EFFORT, format: { type: "json_schema", schema } }, signal));
}

// 도구를 쓰는 에이전트. Claude가 도구를 부르면 handlers로 실행해 결과를 돌려주고, 최종 답(JSON)이 나올 때까지 반복한다.
// tools: [{ name, description, input_schema }], handlers: { name: async (input) => 결과 }, onTool: 진행 상황 알림
export async function runAgent({ system, content, tools, handlers, schema, onTool, signal, maxTurns = 10 }) {
  const messages = [{ role: "user", content: toText(content) }];
  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await create(
      { system, messages, tools: tools.map((t) => ({ ...t, strict: true })), output_config: { effort: EFFORT, format: { type: "json_schema", schema } } },
      signal,
    );
    // 생각 블록까지 그대로 다시 보내야 하므로 content 전체를 붙인다.
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "tool_use") return JSON.parse(textOf(response));

    const results = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      onTool?.(block.name, block.input);
      try {
        const handler = handlers[block.name];
        if (!handler) throw new Error(`모르는 도구예요: ${block.name}`);
        results.push({ type: "tool_result", tool_use_id: block.id, content: toText(await handler(block.input)) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error(`에이전트가 ${maxTurns}번 안에 끝내지 못했어요.`);
}

async function call(system, content, outputConfig, signal) {
  const response = await create({ system, messages: [{ role: "user", content: toText(content) }], output_config: outputConfig }, signal);
  return textOf(response);
}

async function create(params, signal) {
  client ??= new Anthropic();
  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64000,
      // 안전 분류기가 거절하면 서버가 다른 모델로 같은 요청을 다시 돌린다.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...params,
    },
    { signal },
  );
  const response = await stream.finalMessage();
  if (response.stop_reason === "refusal") throw new Error("Claude가 요청을 거절했어요.");
  if (response.stop_reason === "max_tokens") throw new Error("Claude 응답이 max_tokens에서 잘렸어요.");
  return response;
}

function textOf(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function toText(content) {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}
