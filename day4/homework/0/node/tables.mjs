// 로컬 전용: data/tables/<주제>.json 읽기. 부를 때마다 새로 읽어서 판단 표를 다시 만들면 바로 반영된다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';
import { TOPICS } from '../lib/topics.mjs';

export const tablePath = (topicId) => path.join(ROOT, 'data', 'tables', `${topicId}.json`);

export function readTable(topicId) {
  try {
    return JSON.parse(fs.readFileSync(tablePath(topicId), 'utf8'));
  } catch {
    return null;
  }
}

export const readTables = () => Object.fromEntries(TOPICS.map((t) => [t.id, readTable(t.id)]));
