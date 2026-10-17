// 주제 데이터 + 판단 표. Jev 가 만든 data/tables/<주제>.json 이 있으면 그것을, 없으면 임시 값(draft)을 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';
import animal from '../data/topics/animal.mjs';

export const TOPICS = [
  { id: 'animal', name: '동물', data: animal },
  { id: 'food', name: '음식', data: null },
  { id: 'person', name: '인물·캐릭터', data: null },
];

const DRAFT = { Y: 0.95, y: 0.75, '?': 0.5, n: 0.25, N: 0.05 };

export const questionId = (i) => `q${String(i + 1).padStart(2, '0')}`;
export const tablePath = (topicId) => path.join(ROOT, 'data', 'tables', `${topicId}.json`);
export const topicData = (topicId) => TOPICS.find((t) => t.id === topicId)?.data || null;

function draftRow(c, count) {
  const codes = c.draft.replace(/\s/g, '');
  if (codes.length !== count || [...codes].some((ch) => !(ch in DRAFT))) {
    throw new Error(`${c.id} 의 draft 가 질문 수(${count})와 맞지 않아요: ${codes.length}글자`);
  }
  return [...codes].map((ch) => DRAFT[ch]);
}

// 화면에 보낼 형태: 질문, 후보(이름만), 판단 표 { 후보 id: [질문 순서대로 확률] }
export function loadTopic(topicId) {
  const data = topicData(topicId);
  if (!data) return null;
  const qids = data.questions.map((_, i) => questionId(i));

  let jev = null;
  try {
    jev = JSON.parse(fs.readFileSync(tablePath(topicId), 'utf8'));
  } catch {}

  let fromJev = 0;
  const table = {};
  for (const c of data.candidates) {
    const row = jev?.table?.[c.id];
    if (row && qids.every((q) => typeof row[q] === 'number')) {
      table[c.id] = qids.map((q) => row[q]);
      fromJev++;
    } else {
      table[c.id] = draftRow(c, qids.length);
    }
  }

  return {
    id: data.id,
    name: data.name,
    questions: data.questions.map((text, i) => ({ id: qids[i], text })),
    candidates: data.candidates.map(({ id, name }) => ({ id, name })),
    table,
    tableSource: fromJev === 0 ? 'draft' : fromJev === data.candidates.length ? 'jev' : 'mixed',
    tableModel: jev?.model || null,
  };
}
