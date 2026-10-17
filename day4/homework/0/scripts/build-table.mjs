// Jev 로 판단 표 채우기
//   node scripts/build-table.mjs person            아직 줄이 없는 후보만 채움 (후보를 새로 추가했을 때)
//   node scripts/build-table.mjs person --all      전체를 다시 채움 (질문 문구를 고쳤을 때)
//   node scripts/build-table.mjs person --all --limit 3  앞의 후보 3개만 시험
// 결과: data/tables/<주제>.json. 이번에 채운 후보 줄만 덮어쓰고 나머지는 유지한다.
import fs from 'node:fs';
import '../node/env.mjs'; // .env 를 설정값으로 연결
import { askJev, jevReady, tableQuestion } from '../lib/jev.mjs';
import { env } from '../node/env.mjs';
import { questionId, topicData } from '../lib/topics.mjs';
import { tablePath } from '../node/tables.mjs';

const [topicId, ...rest] = process.argv.slice(2);
const limitAt = rest.indexOf('--limit');
const limit = limitAt >= 0 ? Number(rest[limitAt + 1]) : Infinity;
const all = rest.includes('--all');
const PRICE_PER_M_INPUT = 0.042; // Jev 입력 100만 토큰당 달러 (출력 무료). 기획서 10절

const data = topicData(topicId);
if (!data) {
  console.error('사용법: node scripts/build-table.mjs <animal|food|person> [--all] [--limit 3]');
  process.exit(1);
}
if (!jevReady()) {
  console.error('.env 의 TYPESAFE_API_KEY= 뒤에 Jev 키를 넣어 주세요.');
  process.exit(1);
}

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(tablePath(topicId), 'utf8'));
} catch {}

const questions = Object.fromEntries(data.questions.map((text, i) => [questionId(i), tableQuestion(data.name, text)]));
const hasRow = (c) => Object.keys(questions).every((q) => typeof existing.table?.[c.id]?.[q] === 'number');
const candidates = data.candidates.filter((c) => all || !hasRow(c)).slice(0, limit);
if (!candidates.length) {
  console.log('채울 후보가 없어요. 질문을 고쳤다면 --all 로 다시 채우세요.');
  process.exit(0);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function judge(c) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await askJev({ secret_answer: { name: c.name, english: c.en } }, questions, { timeoutMs: 60000 });
      const row = {};
      for (const q of Object.keys(questions)) {
        const p = res.answers?.[q]?.noul;
        if (typeof p !== 'number') throw new Error(`${q} 답이 비어 있어요`);
        row[q] = Math.round(p * 1000) / 1000;
      }
      return { row, tokens: res.usage?.input_tokens || 0, model: res.model };
    } catch (e) {
      const retry = attempt < 4 && (!e.status || e.status === 429 || e.status >= 500);
      if (!retry) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

const table = { ...(existing.table || {}) };
let tokens = 0;
let model = existing.model || env('TYPESAFE_MODEL', 'jev-latest');
let done = 0;
const started = Date.now();
const queue = [...candidates];

// 동시에 4개씩
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let c; (c = queue.shift()); ) {
      const r = await judge(c);
      table[c.id] = r.row;
      tokens += r.tokens;
      model = r.model || model;
      console.log(`${String(++done).padStart(2)}/${candidates.length} ${c.name}`);
    }
  }),
);

fs.writeFileSync(
  tablePath(topicId),
  JSON.stringify({ topic: topicId, model, createdAt: new Date().toISOString(), table }, null, 1),
);

const secs = Math.round((Date.now() - started) / 1000);
console.log(`\n완료: 후보 ${candidates.length}개 × 질문 ${data.questions.length}개, ${secs}초`);
console.log(`입력 토큰 ${tokens.toLocaleString()}개 → 약 $${((tokens / 1e6) * PRICE_PER_M_INPUT).toFixed(4)}`);
console.log(`저장: ${tablePath(topicId)}`);
