// 정답 공개: 처음 나온 정답이면 배우 고르기(Jev) → 그림 생성 → 저장. 다음부터는 저장된 것을 쓴다.
// store(저장소)와 refsFor(참고 이미지)는 로컬(node/)과 배포(worker/)가 각자 넘긴다. 저장소가 할 일은 아래 make 참고.
import { cfg } from './config.mjs';
import { ACTORS } from './actors.mjs';
import { chooseActor } from './jev.mjs';
import { generateImage, imageReady } from './image.mjs';
import { topicData } from './topics.mjs';

const pending = new Map(); // 같은 서버 안에서 같은 정답을 동시에 두 번 만들지 않게
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const imageUrl = (topicId, candidateId, v) => `/images/${topicId}/${candidateId}?v=${v}`;

export async function reveal(topicId, candidateId, deps) {
  const data = topicData(topicId);
  const candidate = data?.candidates.find((c) => c.id === candidateId);
  if (!candidate) return null;

  const key = `${topicId}/${candidateId}`;
  if (pending.has(key)) return pending.get(key);
  const job = make(data, candidate, key, deps).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

async function make(data, candidate, key, { store, refsFor }) {
  let pick = await store.getActor(key);
  if (!pick || !ACTORS[pick.id]) {
    pick = await chooseActor(data.name, candidate);
    await store.setActor(key, { id: pick.id, by: pick.by });
  }
  const actor = { id: pick.id, name: ACTORS[pick.id].name, by: pick.by };
  const result = (image, reason) => ({ image, reason, actor });

  const saved = await store.imageVersion(data.id, candidate.id);
  if (saved) return result(imageUrl(data.id, candidate.id, saved));
  if (!imageReady()) return result(null, 'no-key');

  // 다른 서버가 같은 정답을 그리는 중이면 끝날 때까지 기다렸다가 그 그림을 쓴다 (최대 약 75초)
  if (!(await store.lock(key))) {
    for (let i = 0; i < 25; i++) {
      await sleep(3000);
      const v = await store.imageVersion(data.id, candidate.id);
      if (v) return result(imageUrl(data.id, candidate.id, v));
    }
    return result(null, 'error');
  }

  try {
    if (!(await store.takeImageQuota(Number(cfg('DAILY_IMAGE_LIMIT', '50')) || 0))) return result(null, 'limit');
    const started = Date.now();
    const v = await store.saveImage(data.id, candidate.id, await generateImage(actor.id, candidate, await refsFor(actor.id)));
    console.log(`[image] ${key} (${actor.name}) ${Math.round((Date.now() - started) / 1000)}초`);
    return result(imageUrl(data.id, candidate.id, v));
  } catch (e) {
    console.error(`[image] ${key} 실패:`, e.message);
    return result(null, 'error');
  } finally {
    await store.unlock(key);
  }
}
