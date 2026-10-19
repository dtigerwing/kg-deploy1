// 로컬 저장소: .data/ 폴더. 배포용 worker/store-kv.mjs 와 같은 일을 한다 (lib/reveal.mjs, lib/api.mjs 가 부름).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.mjs';
import { normalizeVariants, countActors } from '../lib/variants.mjs';

const file = (name) => path.join(DATA_DIR, name);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 하루 상한은 한국 시간 기준

function readJSON(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(name, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
}

// 그림 파일: 0번째는 <후보>.jpeg, 그다음은 <후보>~1.jpeg … (예전 그림은 .webp / .png)
const imageName = (candidateId, n) => (n ? `${candidateId}~${n}` : candidateId);
function findImageFile(topicId, candidateId, n = 0) {
  for (const ext of ['jpeg', 'webp', 'png']) {
    const f = file(path.join('images', topicId, `${imageName(candidateId, n)}.${ext}`));
    if (fs.existsSync(f)) return { f, type: `image/${ext}` };
  }
  return null;
}

// 저장된 그림 목록. 아주 예전 로컬 기록은 { id, by } 만 있고 그림 정보가 없다: 그림 파일이 있으면 0번째 그림으로 친다
function readVariants(record, topicId, candidateId) {
  const variants = normalizeVariants(record);
  const old = !variants.length && record?.id && findImageFile(topicId, candidateId, 0);
  return old ? [{ actor: { id: record.id, by: record.by }, type: old.type, v: Math.round(fs.statSync(old.f).mtimeMs).toString(36) }] : variants;
}

const locks = new Set();

export const fsStore = {
  // 정답의 그림 목록 [{ actor, type, v }] (lib/variants.mjs). 그림 파일이 지워졌으면 목록에서 뺀다
  async getVariants(topicId, candidateId) {
    const variants = readVariants(readJSON('assignments.json', {})[`${topicId}/${candidateId}`], topicId, candidateId);
    return variants.filter((_, n) => findImageFile(topicId, candidateId, n));
  },
  async getImage(topicId, candidateId, n = 0) {
    const found = findImageFile(topicId, candidateId, n);
    return found ? { body: fs.readFileSync(found.f), type: found.type } : null;
  },
  async saveVariant(topicId, candidateId, n, { bytes, type }, actor) {
    const old = findImageFile(topicId, candidateId, n);
    if (old) fs.rmSync(old.f);
    const f = file(path.join('images', topicId, `${imageName(candidateId, n)}.${type.split('/')[1]}`));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, bytes);
    const v = Math.round(fs.statSync(f).mtimeMs).toString(36);
    const all = readJSON('assignments.json', {});
    const key = `${topicId}/${candidateId}`;
    const variants = readVariants(all[key], topicId, candidateId); // 예전 기록의 0번째 그림을 잃지 않게 (빈 칸이 생기면 배우 세기가 멈춤)
    variants[n] = { actor, type, v };
    writeJSON('assignments.json', { ...all, [key]: { variants } });
    return v;
  },
  async getActorCounts() {
    return countActors(Object.values(readJSON('assignments.json', {})));
  },
  async lock(key) {
    if (locks.has(key)) return false;
    locks.add(key);
    return true;
  },
  async unlock(key) {
    locks.delete(key);
  },
  async imagesToday() {
    const u = readJSON('usage.json', {});
    return u.date === kstToday() ? u.images || 0 : 0;
  },
  // 시도할 때 센다 (실패해도 비용이 들 수 있어서)
  async takeImageQuota(limit) {
    const used = await this.imagesToday();
    if (used >= limit) return false;
    writeJSON('usage.json', { date: kstToday(), images: used + 1 });
    return true;
  },
  // 맞힌 횟수 { '주제/후보': 횟수 }
  async getWins() {
    return readJSON('wins.json', {});
  },
  async addWin(key) {
    const wins = readJSON('wins.json', {});
    wins[key] = (wins[key] || 0) + 1;
    writeJSON('wins.json', wins);
  },
  // 창고 뒤지기에서 찾아 맞힌 목록 밖 후보 { 'topic/id': { name, en, gender, as, mimic } }
  async getFound(key) {
    return readJSON('found.json', {})[key] || null;
  },
  async setFound(key, record) {
    writeJSON('found.json', { ...readJSON('found.json', {}), [key]: { ...record, at: new Date().toISOString() } });
  },
  async takeSearchQuota(limit) {
    const u = readJSON('search-usage.json', {});
    const used = u.date === kstToday() ? u.count || 0 : 0;
    if (used >= limit) return false;
    writeJSON('search-usage.json', { date: kstToday(), count: used + 1 });
    return true;
  },
  // 관리 페이지 (기획서 9-1절)
  async getSettings() {
    return readJSON('settings.json', null);
  },
  async setSettings(settings) {
    writeJSON('settings.json', settings);
  },
  async searchesToday() {
    const u = readJSON('search-usage.json', {});
    return u.date === kstToday() ? u.count || 0 : 0;
  },
  async countLosses() {
    try {
      return fs.readFileSync(file('losses.jsonl'), 'utf8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  },
  async countFound() {
    return Object.keys(readJSON('found.json', {})).length;
  },
  async resetWins() {
    fs.rmSync(file('wins.json'), { force: true });
  },
  async resetLosses() {
    fs.rmSync(file('losses.jsonl'), { force: true });
  },
  async resetUsageToday() {
    fs.rmSync(file('usage.json'), { force: true });
    fs.rmSync(file('search-usage.json'), { force: true });
  },
  async addLoss(record) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(file('losses.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
  },
};
