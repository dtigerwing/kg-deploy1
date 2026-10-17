// 로컬에서 이미 그린 목각인형과 배우 배정을 배포 KV 로 옮기기 (같은 그림을 배포에서 다시 그리지 않게)
//   node scripts/seed-kv.mjs   → .data/kv-seed.json 을 만들고 wrangler kv bulk put --remote 로 올림
// 키 이름은 worker/store-kv.mjs 와 같다. 이미 KV 에 있는 같은 키는 덮어쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DATA_DIR } from '../node/paths.mjs';

const assignments = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'assignments.json'), 'utf8'));
const pairs = [];
let images = 0;

for (const [key, pick] of Object.entries(assignments)) {
  const [topicId, candidateId] = key.split('/');
  const record = { id: pick.id, by: pick.by };
  for (const ext of ['webp', 'png']) {
    const f = path.join(DATA_DIR, 'images', topicId, `${candidateId}.${ext}`);
    if (!fs.existsSync(f)) continue;
    const type = `image/${ext}`;
    pairs.push({ key: `img:${key}`, value: fs.readFileSync(f).toString('base64'), base64: true, metadata: { type } });
    record.image = { type, v: Math.round(fs.statSync(f).mtimeMs).toString(36) };
    images++;
    break;
  }
  pairs.push({ key: `actor:${key}`, value: JSON.stringify(record) });
}

const out = path.join(DATA_DIR, 'kv-seed.json');
fs.writeFileSync(out, JSON.stringify(pairs));
console.log(`배우 배정 ${Object.keys(assignments).length}개, 그림 ${images}장 → KV 에 올리는 중`);
execFileSync('npx', ['wrangler', 'kv', 'bulk', 'put', out, '--binding', 'KV', '--remote'], { stdio: 'inherit' });
fs.rmSync(out);
