// 로컬 저장소: .data/ 폴더. 배포용 worker/store-kv.mjs 와 같은 일을 한다 (lib/reveal.mjs, lib/api.mjs 가 부름).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.mjs';

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

// 예전 그림은 .png, 지금은 .webp
function findImageFile(topicId, candidateId) {
  for (const ext of ['webp', 'png']) {
    const f = file(path.join('images', topicId, `${candidateId}.${ext}`));
    if (fs.existsSync(f)) return { f, type: `image/${ext}` };
  }
  return null;
}

const locks = new Set();

export const fsStore = {
  async getActor(key) {
    return readJSON('assignments.json', {})[key] || null;
  },
  async setActor(key, record) {
    writeJSON('assignments.json', { ...readJSON('assignments.json', {}), [key]: record });
  },
  async imageVersion(topicId, candidateId) {
    const found = findImageFile(topicId, candidateId);
    return found ? Math.round(fs.statSync(found.f).mtimeMs).toString(36) : null;
  },
  async getImage(topicId, candidateId) {
    const found = findImageFile(topicId, candidateId);
    return found ? { body: fs.readFileSync(found.f), type: found.type } : null;
  },
  async saveImage(topicId, candidateId, { bytes, type }) {
    const old = findImageFile(topicId, candidateId);
    if (old) fs.rmSync(old.f);
    const f = file(path.join('images', topicId, `${candidateId}.${type.split('/')[1]}`));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, bytes);
    return Math.round(fs.statSync(f).mtimeMs).toString(36);
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
  async addLoss(record) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(file('losses.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...record }) + '\n');
  },
};
