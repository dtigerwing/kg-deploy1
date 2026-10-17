// 정답 공개: 처음 나온 정답이면 캐릭터 고르기(Jev) → 이미지 생성 → 저장. 다음부터는 저장된 것을 쓴다.
import { env } from './env.mjs';
import { ACTORS } from './actors.mjs';
import { chooseActor } from './jev.mjs';
import { generateImage, imageReady } from './image.mjs';
import { topicData } from './topics.mjs';
import * as store from './store.mjs';

const pending = new Map(); // 같은 정답을 동시에 두 번 만들지 않게

export async function reveal(topicId, candidateId) {
  const data = topicData(topicId);
  const candidate = data?.candidates.find((c) => c.id === candidateId);
  if (!candidate) return null;

  const key = `${topicId}/${candidateId}`;
  if (pending.has(key)) return pending.get(key);
  const job = make(data, candidate, key).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

async function make(data, candidate, key) {
  const assignments = store.readJSON('assignments.json', {});
  let pick = assignments[key];
  if (!pick || !ACTORS[pick.id]) {
    pick = await chooseActor(data.name, candidate);
    store.writeJSON('assignments.json', { ...store.readJSON('assignments.json', {}), [key]: pick });
  }
  const actor = { id: pick.id, name: ACTORS[pick.id].name, by: pick.by };
  const result = (image, reason) => ({ image, reason, actor });

  if (store.hasImage(data.id, candidate.id)) return result(store.imageUrl(data.id, candidate.id));
  if (!imageReady()) return result(null, 'no-key');
  if (!store.takeImageQuota(Number(env('DAILY_IMAGE_LIMIT', '50')) || 0)) return result(null, 'limit');

  try {
    const started = Date.now();
    store.saveImage(data.id, candidate.id, await generateImage(actor.id, candidate));
    console.log(`[image] ${key} (${actor.name}) ${Math.round((Date.now() - started) / 1000)}초`);
    return result(store.imageUrl(data.id, candidate.id));
  } catch (e) {
    console.error(`[image] ${key} 실패:`, e.message);
    return result(null, 'error');
  }
}
