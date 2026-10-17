// 못 맞힌 정답 모아 보기: node scripts/losses.mjs
// 자주 나온 정답을 후보에 추가할 때 참고한다 (기획서 4절 "못 맞힌 정답 반영").
// 추가 방법: data/topics/<주제>.mjs 에 후보를 넣고 → node scripts/build-table.mjs <주제> (새 후보 줄만 Jev 가 채움)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../node/paths.mjs';
import { TOPICS } from '../lib/topics.mjs';

const file = path.join(DATA_DIR, 'losses.jsonl');
const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
if (!lines.length) {
  console.log('아직 못 맞힌 기록이 없어요.');
  process.exit(0);
}

const norm = (s) => s.replace(/\s/g, '').toLowerCase();
const groups = new Map();
for (const line of lines) {
  const r = JSON.parse(line);
  const key = `${r.topic}/${norm(r.answer)}`;
  const g = groups.get(key) || { topic: r.topic, answer: r.answer, count: 0, last: r.at };
  g.count++;
  g.last = r.at;
  groups.set(key, g);
}

for (const t of TOPICS) {
  const rows = [...groups.values()].filter((g) => g.topic === t.id).sort((a, b) => b.count - a.count);
  if (!rows.length) continue;
  const names = new Set((t.data?.candidates || []).map((c) => norm(c.name)));
  console.log(`\n[${t.name}]`);
  for (const g of rows) {
    const mark = names.has(norm(g.answer)) ? ' (이미 후보에 있음)' : '';
    console.log(`  ${String(g.count).padStart(3)}번  ${g.answer}${mark}  · 마지막 ${g.last.slice(0, 10)}`);
  }
}
