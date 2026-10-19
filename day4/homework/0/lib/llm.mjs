// Claude 글 모델: 창고 뒤지기에서 목록 밖 후보 이름을 떠올린다 (Jev 는 이름을 떠올리지 못해서).
// 구조화 출력(output_config.format)으로 JSON 형식을 고정한다. 키는 ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { cfg } from './config.mjs';

export const llmReady = () => Boolean(cfg('ANTHROPIC_API_KEY'));

async function ask({ instructions, input, schema, maxTokens }) {
  // 키는 .env(로컬)나 Workers Secrets(배포)에서 읽으므로 부를 때마다 만든다
  const client = new Anthropic({ apiKey: cfg('ANTHROPIC_API_KEY'), timeout: 40000, maxRetries: 1 });
  const res = await client.beta.messages.create({
    model: cfg('CLAUDE_MODEL', 'claude-sonnet-5-5'),
    max_tokens: maxTokens,
    system: instructions,
    messages: [{ role: 'user', content: input }],
    // 창고 뒤지기는 몇 초 안에 끝나야 해서 생각 깊이(effort)를 낮게 둔다
    output_config: { effort: cfg('CLAUDE_EFFORT', 'low'), format: { type: 'json_schema', schema } },
    // 안전 분류기가 거절하면 Anthropic 이 권하는 다른 모델로 같은 요청을 다시 돌린다
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  if (res.stop_reason === 'refusal') throw new Error(`Claude 가 거절했어요 (${res.stop_details?.category || '분류 없음'})`);
  if (res.stop_reason === 'max_tokens') throw new Error('Claude 응답이 max_tokens 에서 잘렸어요');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new Error(`Claude 응답이 비어 있어요 (${res.stop_reason})`);
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

  const out = await ask({ instructions, input, schema: CANDIDATES, maxTokens: 3000 });
  return { candidates: out.candidates.slice(0, 15), questions: out.questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 3) };
}

// 창고 가기 전 루소의 질문: 판단 표 질문으로 두 번 틀린 뒤, 지금까지의 답을 보고 새 예/아니요 질문을 하나 만든다.
// 정해진 질문 목록 밖에서 묻기 때문에 목록에 없는 정답까지 좁히는 데 쓴다. qa: 판단 표 질문 + 앞서 한 루소의 질문과 답
const ASK = { type: 'object', additionalProperties: false, required: ['question'], properties: { question: { type: 'string' } } };

export async function askQuestion({ topicName, isPerson, qa, wrong }) {
  const instructions = [
    'You are Russo, a friendly carpenter who plays a Korean twenty-questions game with the player.',
    `Topic: ${topicName}. Below are the yes/no questions already asked (in Korean) and the player's answers. Your guesses in the "already wrong" list were wrong, so the answer may be something less common.`,
    'Write ONE new short Korean yes/no question that best narrows down what the player is thinking of, given everything so far.',
    'Ask about something the earlier questions did not cover: be more specific and concrete than a generic category question (for example a well-known trait, place, era, scene, work, habit or feature), so that it helps even if the answer is not a typical choice.',
    'The question must be answerable with 예/아니요 by an ordinary Korean person, must not repeat or rephrase an earlier question, and must not ask whether it is one specific thing by name.',
    isPerson ? 'Do not ask about politics, crimes, scandals, religion, or private matters.' : '',
    'Write it in the same polite style as the game (e.g. "무한도전에 나왔나요?", "겨울에 더 자주 먹나요?"), at most 40 characters.',
  ].filter(Boolean).join('\n');
  const input = [
    '[질문과 답]',
    ...qa.map((x, i) => `${i + 1}. ${x.question} → ${x.answer}`),
    '',
    `[이미 틀린 답] ${wrong.length ? wrong.join(', ') : '없음'}`,
  ].join('\n');
  const out = await ask({ instructions, input, schema: ASK, maxTokens: 1000 });
  return String(out.question || '').trim().slice(0, 60);
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
    schema: DESCRIBE,
    maxTokens: 1500,
  });
}
