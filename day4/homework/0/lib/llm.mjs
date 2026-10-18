// OpenAI 글 모델: 창고 뒤지기에서 목록 밖 후보 이름을 떠올린다 (Jev 는 이름을 떠올리지 못해서).
// Responses API + JSON 형식 고정. 이미지와 같은 OPENAI_API_KEY 를 쓴다.
import { cfg } from './config.mjs';

export const llmReady = () => Boolean(cfg('OPENAI_API_KEY'));

async function ask({ instructions, input, name, schema, maxTokens }) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg('OPENAI_API_KEY')}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(40000),
    body: JSON.stringify({
      model: cfg('TEXT_MODEL', 'gpt-5.6-terra'),
      instructions,
      input: [{ role: 'user', content: input }],
      // 추론을 끄면(none) 3~4초, low 는 10~20초 걸렸고 떠올리는 후보 품질은 비슷했다
      reasoning: { effort: cfg('TEXT_REASONING', 'none') },
      max_output_tokens: maxTokens,
      store: false,
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data.error?.message || '응답 오류'}`);
  const text = (data.output || [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('');
  if (!text) throw new Error(`OpenAI 응답이 비어 있어요 (${data.status}, ${data.incomplete_details?.reason || ''})`);
  return JSON.parse(text);
}

// 창고 뒤지기는 빨리 끝나야 해서 이름만 받는다 (그림 설명은 맞혔을 때 describeCandidate 로)
// 줄자로 재기용으로, 상위 후보들을 가르는 질문도 같은 호출에서 함께 받는다 (따로 부르면 몇 초 더 걸려서)
const CANDIDATES = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'questions'],
  properties: {
    questions: { type: 'array', items: { type: 'string' } },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'english', 'gender'],
        properties: {
          name: { type: 'string' },
          english: { type: 'string' },
          gender: { type: 'string', enum: ['male', 'female', 'none'] },
        },
      },
    },
  },
};

// qa: [{ question, answer }] (한국어), wrong: 이미 틀린 이름들 → { candidates: 이름 15개, questions: 가르는 질문 최대 3개 }
export async function suggestCandidates({ topicName, isPerson, qa, wrong }) {
  const instructions = [
    'You help a Korean twenty-questions game guess what the player is secretly thinking of.',
    `Topic: ${topicName}. Below are the yes/no questions the game asked (in Korean) and the player's answers.`,
    'Suggest the 15 most likely things the player could be thinking of, most likely first. Use common sense about how typical Korean office workers would answer each question; answers like "아마도요" or "모르겠어요" are uncertain.',
    'Only suggest things that are widely known in Korea and clearly fit the topic. Never suggest anything in the "already wrong" list.',
    isPerson
      ? 'Never suggest politicians who are currently active or were active in the last 20 years (of any country), criminals, or people mainly known for crimes, scandals, abuse or hateful acts. Historical figures from long ago are fine.'
      : '',
    'For each suggestion write only: name (the common Korean name), english (English name with a short disambiguation), gender (male/female/none; none for non-people).',
    'Also write up to 3 short Korean yes/no questions (questions) that would best tell apart your top 3-5 suggestions, in the same polite style as the game (e.g. "무한도전에 나왔나요?", "국물보다 볶음에 가깝나요?"). Each question must be answerable by someone thinking of any of them, must not repeat a question already asked, and must not simply ask whether it is one specific suggestion by name.',
  ].filter(Boolean).join('\n');

  const input = [
    '[질문과 답]',
    ...qa.map((x, i) => `${i + 1}. ${x.question} → ${x.answer}`),
    '',
    `[이미 틀린 답] ${wrong.length ? wrong.join(', ') : '없음'}`,
  ].join('\n');

  const out = await ask({ instructions, input, name: 'russo_storage_candidates', schema: CANDIDATES, maxTokens: 3000 });
  return { candidates: out.candidates.slice(0, 15), questions: out.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 3) };
}

// 창고에서 찾아 맞힌 정답의 그림 설명 (목각인형을 처음 만들 때 한 번만)
const DESCRIBE = {
  type: 'object',
  additionalProperties: false,
  required: ['as', 'mimic'],
  properties: { as: { type: 'string' }, mimic: { type: 'string' } },
};

export async function describeCandidate({ topicName, name, english }) {
  return ask({
    instructions: [
      `A kids' game shows "${name}" (${english}), an answer in the topic "${topicName}", as a carved wooden figurine of a cute kid dinosaur character dressed up as it.`,
      'Write in English: as = a generic description of who or what it is WITHOUT using the name (e.g. "a famous tech billionaire who builds rockets"); mimic = how the kid dinosaur dresses up as and acts it out (costume, props and pose only, one sentence, no names, no text or letters).',
    ].join('\n'),
    input: name,
    name: 'russo_describe',
    schema: DESCRIBE,
    maxTokens: 1500,
  });
}
