// Claude API 호출. 요약 글은 ask, 정해진 형식의 분석 결과는 askJson.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const claude = new Anthropic();

export async function ask(system, data) {
  return call(system, data, { effort: "low" });
}

export async function askJson(system, data, schema) {
  const text = await call(system, data, { effort: "low", format: { type: "json_schema", schema } });
  return JSON.parse(text);
}

async function call(system, data, outputConfig) {
  const response = await claude.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: outputConfig,
    system,
    messages: [{ role: "user", content: JSON.stringify(data, null, 2) }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude가 요청을 거절했어요.");
  if (response.stop_reason === "max_tokens") throw new Error("Claude 응답이 max_tokens에서 잘렸어요.");
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}
