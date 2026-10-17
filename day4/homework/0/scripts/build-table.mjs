// Jev 로 판단 표 채우기 (개발할 때 한 번)
//   node scripts/build-table.mjs animal            전체 (후보 50 × 질문 50)
//   node scripts/build-table.mjs animal --limit 3  앞의 후보 3개만 시험
// 결과: data/tables/<주제>.json. 이미 있는 후보 줄은 유지하고 새로 만든 줄만 덮어쓴다.
import fs from 'node:fs';
import { askJev, jevReady, tableQuestion } from '../lib/jev.mjs';
import { env } from '../lib/env.mjs';
import { questionId, tablePath, topicData } from '../lib/topics.mjs';

const [topicId, ...rest] = process.argv.slice(2);
const limitAt = rest.indexOf('--limit');
const limit = limitAt >= 0 ? Number(rest[limitAt + 1]) : Infinity;
const PRICE_PER_M_INPUT = 0.042; // Jev 입력 100만 토큰당 달러 (출력 무료). 기획서 10절

const data = topicData(topicId);
if (!data) {
  console.error('사용법: node scripts/build-table.mjs animal [--limit 3]');
  process.exit(1);
}
if (!jevReady()) {
  console.error('.env 의 TYPESAFE_API_KEY= 뒤에 Jev 키를 넣어 주세요.');
  process.exit(1);
}

const questions = Object.fromEntries(data.questions.map((text, i) => [questionId(i), tableQuestion(data.name, text)]));
const candidates = data.candidates.slice(0, limit);
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

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(tablePath(topicId), 'utf8'));
} catch {}

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
