// 창고 뒤지기 (기획서 4절): 판단 표로 못 맞혔을 때 목록 밖 정답까지 찾아본다.
//   1) LLM 이 질문·답을 보고 후보 15개를 떠올림  2) 판단 표에서 아직 남은 상위 후보 5개를 더함
//   3) Jev 가 후보마다 "이 답들과 맞는지" 점수를 매기고, 인물이면 정치인·범죄자를 걸러 냄  4) 상위 5개를 돌려줌
// 점수 = Jev 점수 + LLM 순서 가산점. 질문이 대략적이라 비슷한 후보끼리는 Jev 점수 차이가 작아서(예: 마라탕 vs 마라탕면)
// LLM 이 떠올린 순서를 기본으로 하고, Jev 는 답과 크게 어긋나는 후보를 뒤로 미는 역할을 한다.
import { searchLimit } from './settings.mjs';
import { askJev, jevReady, tableQuestion } from './jev.mjs';
import { suggestCandidates, askQuestion, llmReady } from './llm.mjs';
import { signPayload, verifyPayload } from './sign.mjs';
import { loadTopic, topicData } from './topics.mjs';
import { ANSWERS, newGame, answer, posterior } from '../public/game.js';

const ASK_COUNT = 2; // 창고 가기 전 루소의 질문 수 (답을 보고 하나씩 만든다)
const PROBE_GAP = 4; // 1위와 2위 점수 차이가 이보다 작으면 줄자로 재기 (가르는 질문 1~3개 더). LLM 순서 가산점만으로도 1·2위가 1.4 벌어져서 넉넉히 잡음
// 줄자로 다시 줄 세울 때: 가르려고 만든 질문이라 답을 더 무겁게, LLM 순서는 가볍게
// (박명수 시험: 순서 가산점이 커서 9순위 정답이 줄자 답으로도 못 올라왔음)
const PROBE_WEIGHT = 2;
const PROBE_RANK_WEIGHT = 0.5;
const RANK_WEIGHT = 2; // LLM 순서 가산점 세기: -2 × ln(순위)
const TABLE_RANK = 4; // 판단 표 후보는 LLM 4순위쯤으로 친다 (이미 두 번 틀린 뒤라서)
const WEIGHT = Object.fromEntries(ANSWERS.map((a) => [a.key, a.weight]));
const LABEL = Object.fromEntries(ANSWERS.map((a) => [a.key, a.label]));
const clamp = (p) => Math.min(0.97, Math.max(0.03, p));
const norm = (s) => String(s).replace(/[\s·.\-_()]/g, '').toLowerCase();

// 창고에서 찾은 후보 id: x_ + 영어 이름 (목록의 id 와 겹치지 않게)
const foundId = (c) => {
  const slug = String(c.english || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (slug) return `x_${slug}`;
  const hash = [...String(c.name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return `x_${hash.toString(36)}`;
};

const POLICY = {
  type: 'noul',
  instructions:
    'Is `secret_answer` a politician who is currently active or was active within the last 20 years (in any country), or a criminal, or a person mainly known for crimes, scandals, abuse or hateful acts? Long-dead historical rulers and leaders count as "no".',
};

// 창고 가기 전 루소의 질문(LLM 이 만든 질문)과 답. 질문은 서버가 서명해서 화면에 맡겼다가 돌려받는다 (화면이 문장을 바꿀 수 없게)
// extra: [{ token, a }] → [{ text, a }]
async function verifyExtra(topicId, extra) {
  const out = [];
  for (const x of extra.slice(0, ASK_COUNT)) {
    const payload = await verifyPayload(x?.token);
    if (payload?.type === 'ask' && payload.topic === topicId && x.a in WEIGHT) out.push({ text: String(payload.text), a: x.a });
  }
  return out;
}

// 판단 표 질문의 답 + 루소의 질문의 답 → LLM 에 보여 줄 [{ question, answer }]
function qaList(topic, answers, extra) {
  const questionText = Object.fromEntries(topic.questions.map((q) => [q.id, q.text]));
  const valid = answers.filter((x) => questionText[x.q] && x.a in WEIGHT).slice(0, 40);
  const qa = [...valid.map((x) => ({ question: questionText[x.q], answer: LABEL[x.a] })), ...extra.map((x) => ({ question: x.text, answer: LABEL[x.a] }))];
  return { questionText, valid, qa };
}

// 창고 가기 전 루소의 질문 하나 (판단 표로 두 번 틀린 뒤 ASK_COUNT 개까지). 실패하면 question: null → 화면은 바로 창고 뒤지기로
export async function storageAsk({ topicId, answers, wrong, extra }, deps) {
  const data = topicData(topicId);
  const topic = loadTopic(topicId, deps.tables()[topicId]);
  if (!data || !topic) return { question: null, reason: 'topic' };
  if (!llmReady()) return { question: null, reason: 'no-key' };
  if (!deps.settings.storageSearch) return { question: null, reason: 'off' };
  const asked = await verifyExtra(topicId, extra);
  if (asked.length >= ASK_COUNT) return { question: null, reason: 'done' };
  // LLM 을 부르는 일이라 창고 뒤지기와 같은 하루 상한을 쓴다
  if (!(await deps.store.takeSearchQuota(searchLimit(deps.settings)))) return { question: null, reason: 'limit' };
  const { qa } = qaList(topic, answers, asked);
  try {
    const t0 = Date.now();
    const question = await askQuestion({ topicName: data.name, isPerson: topicId === 'person', qa, wrong, tableQuestions: topic.questions.map((q) => q.text) });
    if (!question) return { question: null, reason: 'error' };
    console.log(`[ask] ${data.name} ${asked.length + 1}번째 ${((Date.now() - t0) / 1000).toFixed(1)}초: ${question}`);
    return { question, token: await signPayload({ type: 'ask', topic: topicId, text: question }) };
  } catch (e) {
    console.error('[ask] LLM 실패:', e.message);
    return { question: null, reason: 'error' };
  }
}

// answers: [{ q: 질문 id, a: 답 key }], excluded: 틀린 목록 후보 id, wrong: 틀린 이름 전부 (창고 후보 포함), extra: 루소의 질문 [{ token, a }]
export async function storageSearch({ topicId, answers, excluded, wrong, extra = [] }, deps) {
  const data = topicData(topicId);
  const topic = loadTopic(topicId, deps.tables()[topicId]);
  if (!data || !topic) return { candidates: [], reason: 'topic' };
  if (!llmReady() || !jevReady()) return { candidates: [], reason: 'no-key' };
  if (!deps.settings.storageSearch) return { candidates: [], reason: 'off' }; // 관리 페이지에서 끔
  if (!(await deps.store.takeSearchQuota(searchLimit(deps.settings)))) return { candidates: [], reason: 'limit' };

  const asked = await verifyExtra(topicId, extra);
  const { questionText, valid, qa } = qaList(topic, answers, asked);
  const isPerson = topicId === 'person';
  const wrongNames = new Set(wrong.map(norm));

  // 1) LLM 후보
  let suggested = [];
  let probeQuestions = [];
  const t0 = Date.now();
  try {
    ({ candidates: suggested, questions: probeQuestions } = await suggestCandidates({ topicName: data.name, isPerson, qa, wrong, tableQuestions: topic.questions.map((q) => q.text) }));
    console.log(`[search] LLM ${((Date.now() - t0) / 1000).toFixed(1)}초: ${suggested.map((c) => c.name).join(', ')} | 줄자 질문: ${probeQuestions.join(' / ')}`);
  } catch (e) {
    console.error('[search] LLM 실패:', e.message);
  }

  // 2) 판단 표에서 아직 남은 상위 후보
  const game = newGame(topic);
  game.excluded = excluded.filter((id) => topic.table[id]);
  for (const x of valid) answer(game, x.q, x.a);
  const fromTable = posterior(game).slice(0, 5).map(({ candidate }) => data.candidates.find((c) => c.id === candidate.id));

  // 후보 모으기: 이름이 같으면 목록 쪽을 쓴다 (목록 후보는 이미 검토된 설명이 있음)
  const byName = new Map();
  suggested.forEach((s, i) => {
    const listed = data.candidates.find((c) => norm(c.name) === norm(s.name));
    const key = norm(listed?.name || s.name);
    if (byName.has(key)) return;
    if (listed) byName.set(key, { listed: true, id: listed.id, name: listed.name, english: listed.en, rank: i + 1, check: false });
    else byName.set(key, { listed: false, id: foundId(s), name: s.name, english: s.english, gender: s.gender, rank: i + 1, check: isPerson });
  });
  for (const c of fromTable) if (!byName.has(norm(c.name))) byName.set(norm(c.name), { listed: true, id: c.id, name: c.name, english: c.en, rank: TABLE_RANK, check: false });
  const pool = [...byName.values()].filter((c) => !wrongNames.has(norm(c.name)) && !excluded.includes(c.id));

  // 3) Jev 검증: 질문마다 '예'일 확률 → 사용자 답과 얼마나 맞는지 (게임과 같은 계산)
  // 루소의 질문도 같은 방식으로 판단한다 (키: ask0, ask1)
  const judged = [...valid.map((x) => ({ key: x.q, text: questionText[x.q], a: x.a })), ...asked.map((x, i) => ({ key: `ask${i}`, text: x.text, a: x.a }))];
  const questions = Object.fromEntries(judged.map((x) => [x.key, tableQuestion(data.name, x.text)]));
  const scored = await Promise.all(
    pool.map(async (c) => {
      try {
        const res = await askJev({ secret_answer: { name: c.name, english: c.english } }, { ...questions, ...(c.check ? { policy: POLICY } : {}) }, { timeoutMs: 30000 });
        if (c.check && (res.answers?.policy?.noul ?? 0) >= 0.5) return null; // 정치인·범죄자 등 제외
        let jev = 0;
        for (const x of judged) {
          const p = clamp(res.answers?.[x.key]?.noul ?? 0.5);
          const w = WEIGHT[x.a];
          jev += Math.log(w * p + (1 - w) * (1 - p));
        }
        return { ...c, jev, score: jev - RANK_WEIGHT * Math.log(c.rank) };
      } catch (e) {
        console.error('[search] Jev 실패:', c.name, e.message);
        return null;
      }
    }),
  );

  // 4) 상위 5개. 1위와 2위가 비슷하면 줄자 질문을 함께 보낸다 (후보 목록은 서명해서 화면에 맡김)
  const ranked = scored.filter(Boolean).sort((a, b) => b.score - a.score);
  console.log(`[search] Jev ${((Date.now() - t0) / 1000).toFixed(1)}초까지: ${ranked.map((c) => `${c.name} ${c.score.toFixed(1)}(Jev ${c.jev.toFixed(1)}, ${c.rank}순위)`).join(' / ')}`);
  const candidates = await finalize(topicId, ranked);
  const close = ranked.length >= 2 && ranked[0].score - ranked[1].score < PROBE_GAP;
  const probe =
    close && probeQuestions.length
      ? { questions: probeQuestions, token: await signPayload({ type: 'probe', topic: topicId, questions: probeQuestions, pool: ranked.slice(0, 12).map(({ listed, id, name, english, gender, jev, rank }) => ({ listed, id, name, english, gender, jev, rank })) }) }
      : null;
  console.log(`[search] ${data.name}: LLM ${suggested.length}개 + 목록 ${fromTable.length}개 → ${candidates.map((c) => c.name).join(', ')}${probe ? ' (줄자로 재기)' : ''}`);
  return { candidates, probe };
}

// 상위 5개를 화면에 보낼 형태로. 창고 후보는 서명한 토큰을 붙인다 (맞혔을 때 서버가 확인하고 저장)
async function finalize(topicId, ranked) {
  return Promise.all(
    ranked.slice(0, 5).map(async (c) => {
      if (c.listed) return { id: c.id, name: c.name };
      const payload = { topic: topicId, id: c.id, name: c.name, en: c.english, gender: c.gender === 'none' ? undefined : c.gender };
      return { id: c.id, name: c.name, token: await signPayload(payload) };
    }),
  );
}

// 줄자로 재기: 가르는 질문에 대한 사용자 답으로 Jev 가 후보 점수를 다시 매긴다. answers: 질문 순서대로 답 key
export async function storageProbe({ topicId, token, answers }) {
  const payload = await verifyPayload(token);
  const data = topicData(topicId);
  if (payload?.type !== 'probe' || payload.topic !== topicId || !data) return { candidates: [] };
  const asked = payload.questions.map((text, i) => ({ text, a: answers[i] })).filter((x) => x.a in WEIGHT && x.a !== 'unknown');
  const questions = Object.fromEntries(asked.map((x, i) => [`p${i}`, tableQuestion(data.name, x.text)]));
  const base = (c, extra) => c.jev + PROBE_WEIGHT * extra - PROBE_RANK_WEIGHT * Math.log(c.rank);
  const rescored = await Promise.all(
    payload.pool.map(async (c) => {
      if (!asked.length) return { ...c, score: base(c, 0) };
      try {
        const res = await askJev({ secret_answer: { name: c.name, english: c.english } }, questions, { timeoutMs: 30000 });
        let extra = 0;
        asked.forEach((x, i) => {
          const p = clamp(res.answers?.[`p${i}`]?.noul ?? 0.5);
          const w = WEIGHT[x.a];
          extra += Math.log(w * p + (1 - w) * (1 - p));
        });
        return { ...c, extra, score: base(c, extra) };
      } catch (e) {
        console.error('[probe] Jev 실패:', c.name, e.message);
        return { ...c, score: base(c, 0) };
      }
    }),
  );
  const ranked = rescored.sort((a, b) => b.score - a.score);
  console.log(`[probe] ${asked.map((x) => `${x.text} → ${LABEL[x.a]}`).join(' / ')} ⇒ ${ranked.map((c) => `${c.name} ${c.score.toFixed(1)}(줄자 ${(c.extra ?? 0).toFixed(1)})`).join(' / ')}`);
  return { candidates: await finalize(topicId, ranked) };
}
