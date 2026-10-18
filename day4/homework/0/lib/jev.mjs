// TypeSafe Jev (System One). 문서: https://docs.typesafe.ai/api
// Jev 는 글을 만들지 않고 주어진 질문에 확률(Noul)이나 선택(Choice)만 돌려준다.
import { cfg as env } from './config.mjs';
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

// 정답을 흉내 낼 배우 고르기. Jev 가 배우마다 어울리는 정도(확률)를 매기고, 그 확률대로 무작위로 뽑되
// 지금까지 적게 나온 배우에게 가산점을 준다 (잘 어울리는 배우들 사이에서 골고루 돌아가게).
// counts: { 배우 id: 지금까지 맡은 그림 수 }, exclude: 이 정답을 이미 맡은 배우 (2장째는 다른 배우로).
// 키가 없거나 실패하면 덜 나온 배우 중에서 고른다.
export async function chooseActor(topicName, candidate, counts = {}, exclude = []) {
  const allowed = allowedActors(candidate);
  const ids = allowed.filter((id) => !exclude.includes(id)).length ? allowed.filter((id) => !exclude.includes(id)) : allowed;
  const avg = ids.reduce((sum, id) => sum + (counts[id] || 0), 0) / ids.length;
  const balance = (id) => ((avg + 1) / ((counts[id] || 0) + 1)) ** 2; // 평균보다 적게 나왔으면 1보다 큼 (제곱으로 세게)
  const draw = (weights) => {
    const total = weights.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of weights) if ((r -= w) <= 0) return id;
    return weights.at(-1)[0];
  };

  if (jevReady()) {
    try {
      const data = await askJev(
        { answer: { topic: topicName, name: candidate.name, english: candidate.en, how_it_is_acted_out: candidate.mimic || '' } },
        {
          actor: {
            type: 'choice',
            instructions: 'A kids\' guessing game reveals the answer as a picture of one cute cartoon kid character dressing up as and acting out `answer`. Which character would be the most fun and fitting to act out `answer`, considering each character\'s personality and look?',
            criteria: Object.fromEntries(ids.map((id) => [id, `${ACTORS[id].look}. ${ACTORS[id].vibe}`])),
          },
        },
      );
      const probs = data.answers?.actor?.probabilities || {};
      const best = Math.max(...ids.map((id) => probs[id] || 0));
      // 1위의 1/10 이상으로 어울리는 배우만 후보로 (너무 엉뚱한 배우는 빼고).
      // 확률은 제곱근으로 완만하게: 그대로 쓰면 1위가 0.8 처럼 압도적일 때 늘 같은 배우만 나온다
      const weights = ids.filter((id) => (probs[id] || 0) >= best / 10).map((id) => [id, Math.sqrt(probs[id] || 0) * balance(id)]);
      if (weights.length && best > 0) return { id: draw(weights), by: 'jev' };
    } catch (e) {
      console.warn('[jev] 배우 고르기 실패, 규칙으로 대신 고름:', e.message);
    }
  }
  return { id: draw(ids.map((id) => [id, balance(id)])), by: 'rule' };
}
