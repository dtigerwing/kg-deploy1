// Claude가 하는 일은 두 가지뿐: 두 스토어의 장르를 하나의 목록으로 통일하고, 게임마다 한 줄 소개를 쓴다.
// 순위는 절대 Claude에게 묻지 않는다.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
// 분류와 짧은 요약이라 깊게 생각할 필요가 없다.
const EFFORT = "low";

export const GENRES = ["RPG", "액션", "전략", "퍼즐", "캐주얼", "시뮬레이션", "아케이드", "어드벤처", "스포츠·레이싱", "보드·카드", "기타"];

const SYSTEM = `모바일 게임 목록을 받아 게임마다 장르 하나와 한 줄 소개를 정한다.
- 장르는 주어진 목록에서 그 게임을 가장 잘 설명하는 하나만 고른다. 스토어 장르가 있으면 참고하되, 설명을 보고 실제 플레이 방식으로 판단한다. 방치형 성장 RPG는 RPG, 타워 디펜스와 SLG는 전략이다.
- 게임 이름과 설명은 여러 나라 스토어에서 와서 영어·일본어·중국어일 수 있다. 한 줄 소개는 언제나 한국어로 40자 안쪽, 어떤 게임인지 처음 보는 사람이 알 수 있게 쓴다. 광고 문구(무료 뽑기, 이벤트 등)는 빼고 플레이 방식을 쓴다.
- 받은 id를 그대로 돌려준다.`;

const SCHEMA = {
  type: "object",
  properties: {
    games: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          genre: { type: "string", enum: GENRES },
          summary: { type: "string" },
        },
        required: ["id", "genre", "summary"],
        additionalProperties: false,
      },
    },
  },
  required: ["games"],
  additionalProperties: false,
};

let client;

export function hasKey() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// apps: stores.mjs의 앱 목록. 돌려주는 값: { [id]: { genre, summary } }
export async function classify(apps) {
  if (apps.length === 0) return {};
  client ??= new Anthropic();
  const input = apps.map((a) => ({ id: a.id, title: a.title, developer: a.developer, storeGenres: a.storeGenres, description: a.description }));
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    // 안전 분류기가 거절하면 서버가 다른 모델로 같은 요청을 다시 돌린다.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
  });
  const response = await stream.finalMessage();
  if (response.stop_reason === "refusal") throw new Error("Claude가 요청을 거절했어요.");
  if (response.stop_reason === "max_tokens") throw new Error("Claude 응답이 max_tokens에서 잘렸어요.");

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const ids = new Set(apps.map((a) => a.id));
  const result = {};
  for (const g of JSON.parse(text).games) {
    if (ids.has(g.id)) result[g.id] = { genre: g.genre, summary: g.summary };
  }
  return result;
}
