// 로컬 저장소: .data/ 폴더. 배포할 때 이 파일만 D1(기록)·R2(이미지)로 바꾼다.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.mjs';

const file = (name) => path.join(DATA_DIR, name);

export function readJSON(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJSON(name, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
}

export function appendLog(name, record) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(file(name), JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
}

export const imageFile = (topicId, candidateId) => path.join(DATA_DIR, 'images', topicId, `${candidateId}.png`);
export const imageUrl = (topicId, candidateId) => `/images/${topicId}/${candidateId}.png`;
export const hasImage = (topicId, candidateId) => fs.existsSync(imageFile(topicId, candidateId));

export function saveImage(topicId, candidateId, buffer) {
  const f = imageFile(topicId, candidateId);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buffer);
}

// 하루 생성 상한. 시도할 때 센다 (실패해도 비용이 들 수 있어서)
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬 시간)

export function imagesToday() {
  const u = readJSON('usage.json', {});
  return u.date === today() ? u.images || 0 : 0;
}

export function takeImageQuota(limit) {
  const used = imagesToday();
  if (used >= limit) return false;
  writeJSON('usage.json', { date: today(), images: used + 1 });
  return true;
}
