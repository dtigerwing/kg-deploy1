// 스무고개 계산. 화면 코드 없이 계산만 한다.
// topic = { questions: [{id, text}], candidates: [{id, name}], table: {후보 id: [질문 순서대로 '예' 확률]} }

export const ANSWERS = [
  { key: 'yes', label: '예', weight: 1 },
  { key: 'probably', label: '아마도요', weight: 0.75 },
  { key: 'unknown', label: '모르겠어요', weight: 0.5 }, // 0.5 면 모든 후보에 같은 값이 곱해져서 반영되지 않음
  { key: 'probablyNot', label: '아마 아닐걸요', weight: 0.25 },
  { key: 'no', label: '아니요', weight: 0 },
];

// 난이도 "보통" (기획서 4절)
export const RULES = {
  maxQuestions: 20, // 이만큼 물으면 확신이 낮아도 추측
  minQuestions: 5, // 너무 빨리 추측하지 않게
  guessAt: 0.6, // 1위 후보 확신도가 이 값을 넘으면 추측 (0.8 → 0.6: 모의 게임에서 정답률은 같고 질문이 약 3개 줄어서)
  maxReguess: 1, // 틀린 뒤 다시 추측하는 횟수. 그래도 틀리면 창고 뒤지기(LLM + Jev, 기획서 4절)로 넘어간다
  reguessMin: 2, // 틀린 뒤 최소 이만큼 더 묻고
  reguessMax: 3, // 최대 이만큼 묻고 다시 추측
};

const WEIGHT = Object.fromEntries(ANSWERS.map((a) => [a.key, a.weight]));
// 판단 표 값이 0이나 1이어도 답변 하나로 후보가 사라지지 않게 여유를 둔다
const clamp = (p) => Math.min(0.97, Math.max(0.03, p));

// answers: [{q: 질문 id, a: 답 key}], excluded: 추측해서 틀린 후보, marks: 틀렸을 때의 답변 수
export const newGame = (topic) => ({ topic, answers: [], excluded: [], marks: [] });

export function posterior(game) {
  const { questions, candidates, table } = game.topic;
  const index = Object.fromEntries(questions.map((q, i) => [q.id, i]));
  const logs = candidates.map((c) => {
    if (game.excluded.includes(c.id)) return -Infinity;
    let sum = 0;
    for (const { q, a } of game.answers) {
      const p = clamp(table[c.id][index[q]]);
      const w = WEIGHT[a];
      sum += Math.log(w * p + (1 - w) * (1 - p));
    }
    return sum;
  });
  const max = Math.max(...logs);
  if (max === -Infinity) return [];
  const raw = logs.map((l) => Math.exp(l - max));
  const total = raw.reduce((a, b) => a + b, 0);
  return candidates.map((c, i) => ({ candidate: c, p: raw[i] / total })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p);
}

const entropy = (weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return -weights.reduce((h, w) => (w > 0 ? h + (w / total) * Math.log2(w / total) : h), 0);
};

// 남은 후보를 가장 잘 갈라주는 질문 (답을 들은 뒤 불확실성이 가장 작아지는 질문).
// 비슷하게 좋은 질문 중에서는 무작위로 골라 매번 같은 순서가 되지 않게 한다.
function pickQuestion(game, post, left) {
  const { questions, table } = game.topic;
  const index = Object.fromEntries(questions.map((q, i) => [q.id, i]));
  const scored = left.map((q) => {
    const yes = post.map(({ candidate, p }) => p * clamp(table[candidate.id][index[q.id]]));
    const no = post.map(({ candidate, p }, i) => p - yes[i]);
    const pYes = yes.reduce((a, b) => a + b, 0);
    return { q, h: pYes * entropy(yes) + (1 - pYes) * entropy(no) };
  });
  const best = Math.min(...scored.map((s) => s.h));
  const good = scored.filter((s) => s.h <= best + 0.05);
  return good[Math.floor(Math.random() * good.length)].q;
}

// 다음에 할 일: 질문 / 추측 / 졌어요
export function nextStep(game) {
  const post = posterior(game);
  if (!post.length || game.marks.length > RULES.maxReguess) return { type: 'lose' };

  const top = post[0];
  const asked = new Set(game.answers.map((a) => a.q));
  const left = game.topic.questions.filter((q) => !asked.has(q.id));
  const count = game.answers.length;

  let guess;
  if (!game.marks.length) {
    guess = (count >= RULES.minQuestions && top.p >= RULES.guessAt) || count >= RULES.maxQuestions;
  } else {
    const since = Math.max(0, count - game.marks.at(-1));
    guess = (since >= RULES.reguessMin && top.p >= RULES.guessAt) || since >= RULES.reguessMax;
  }

  if (guess || !left.length) return { type: 'guess', candidate: top.candidate, confidence: top.p };
  return { type: 'question', question: pickQuestion(game, post, left), confidence: top.p };
}

export const answer = (game, questionId, key) => game.answers.push({ q: questionId, a: key });

export function wrongGuess(game, candidateId) {
  game.excluded.push(candidateId);
  game.marks.push(game.answers.length);
}

// 바로 앞 답변 취소. 취소한 질문을 돌려준다 (다시 그 질문을 보여주려고)
export function undo(game) {
  const last = game.answers.pop();
  return last ? game.topic.questions.find((q) => q.id === last.q) : null;
}
