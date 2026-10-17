// TypeSafe Jev (System One). 문서: https://docs.typesafe.ai/api
// Jev 는 글을 만들지 않고 주어진 질문에 확률(Noul)이나 선택(Choice)만 돌려준다.
import { env } from './env.mjs';
import { ACTORS, allowedActors } from './actors.mjs';

export const jevReady = () => Boolean(env('TYPESAFE_API_KEY'));

export async function askJev(state, questions, { timeoutMs = 20000 } = {}) {
  const res = await fetch(`${env('TYPESAFE_BASE_URL', 'https://api.typesafe.ai').replace(/\/$/, '')}/v1/systemone`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env('TYPESAFE_API_KEY')}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: env('TYPESAFE_MODEL', 'jev-latest'), state, questions }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Jev ${res.status}: ${data.error?.message || data.message || JSON.stringify(data).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// 판단 표 한 칸: "이 후보를 떠올린 사람이 이 질문에 '예'라고 답할 확률"
export function tableQuestion(topicName, text) {
  return {
    type: 'noul',
    instructions: `In a Korean twenty-questions game (스무고개) about ${topicName}, the player is secretly thinking of \`secret_answer\`. The game asks the player this yes/no question in Korean: "${text}". Would a typical Korean player who is thinking of \`secret_answer\` answer 예 (yes)? Judge by common everyday knowledge and how most people would actually answer.`,
  };
}

// 정답을 흉내 낼 캐릭터 고르기. 키가 없거나 실패하면 이름으로 정해지는 규칙으로 고른다.
export async function chooseActor(topicName, candidate) {
  const ids = allowedActors(candidate);
  if (jevReady()) {
    try {
      const data = await askJev(
        { answer: { topic: topicName, name: candidate.name, english: candidate.en, how_it_is_acted_out: candidate.mimic } },
        {
          actor: {
            type: 'choice',
            instructions: 'A kids\' guessing game reveals the answer as a picture of one cute cartoon kid character dressing up as and acting out `answer`. Which character would be the most fun and fitting to act out `answer`, considering each character\'s personality?',
            criteria: Object.fromEntries(ids.map((id) => [id, `${ACTORS[id].look}. ${ACTORS[id].vibe}`])),
          },
        },
      );
      const choice = data.answers?.actor?.choice;
      if (ids.includes(choice)) return { id: choice, by: 'jev' };
    } catch (e) {
      console.warn('[jev] 캐릭터 고르기 실패, 규칙으로 대신 고름:', e.message);
    }
  }
  const hash = [...candidate.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return { id: ids[hash % ids.length], by: 'rule' };
}
