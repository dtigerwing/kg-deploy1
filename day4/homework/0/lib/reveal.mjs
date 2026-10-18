// 정답 공개: 정답마다 그림을 최대 IMAGES_PER_ANSWER 장(기본 2장)까지 그린다.
//   처음 맞히면 1장째, 두 번째로 맞히면 다른 배우로 2장째를 그리고, 그 뒤로는 저장된 그림 중 하나를 무작위로 쓴다.
// store(저장소)와 refsFor(참고 이미지)는 로컬(node/)과 배포(worker/)가 각자 넘긴다.
import { cfg } from './config.mjs';
import { ACTORS } from './actors.mjs';
import { chooseActor } from './jev.mjs';
import { generateImage, imageReady } from './image.mjs';
import { describeCandidate } from './llm.mjs';
import { imageLimit } from './settings.mjs';
import { topicData } from './topics.mjs';

const pending = new Map(); // 같은 서버 안에서 같은 정답을 동시에 두 번 만들지 않게
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const maxImages = () => Math.max(1, Number(cfg('IMAGES_PER_ANSWER', '2')) || 2);

// found: 창고 뒤지기에서 찾은 목록 밖 후보 (서명 확인을 거친 것만 들어옴)
export async function reveal(topicId, candidateId, deps, found = null) {
  const data = topicData(topicId);
  const candidate = data?.candidates.find((c) => c.id === candidateId) || (found?.id === candidateId ? found : null);
  if (!candidate) return null;

  const key = `${topicId}/${candidateId}`;
  if (pending.has(key)) return pending.get(key);
  const job = make(data, candidate, key, deps).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

async function make(data, candidate, key, { store, refsFor, settings }) {
  const url = (n, v) => `/images/${data.id}/${candidate.id}?v=${v}${n ? `&n=${n}` : ''}`;
  const show = (variants, n) => {
    const it = variants[n];
    const actor = ACTORS[it.actor.id];
    return { image: url(n, it.v), n, actor: actor ? { id: it.actor.id, name: actor.name, by: it.actor.by } : null };
  };
  const pickSaved = (variants) => show(variants, Math.floor(Math.random() * variants.length));
  const fail = (variants, reason) => (variants.length ? pickSaved(variants) : { image: null, reason, actor: null });

  let variants = await store.getVariants(data.id, candidate.id);
  if (variants.length >= maxImages()) return pickSaved(variants); // 정답당 최대 장수를 다 그렸으면 저장된 것 중 하나
  if (!imageReady()) return fail(variants, 'no-key');
  if (!settings.imageGen) return fail(variants, 'off'); // 관리 페이지에서 그림 생성을 끔

  // 다른 서버가 같은 정답을 그리는 중이면 끝날 때까지 기다렸다가 그 그림을 쓴다 (최대 약 75초)
  if (!(await store.lock(key))) {
    const before = variants.length;
    for (let i = 0; i < 25; i++) {
      await sleep(3000);
      variants = await store.getVariants(data.id, candidate.id);
      if (variants.length > before) return show(variants, variants.length - 1);
    }
    return fail(variants, 'error');
  }

  try {
    if (!(await store.takeImageQuota(imageLimit(settings)))) return fail(variants, 'limit');
    // 배우 고르기: 이 정답을 이미 맡은 배우는 빼고, 적게 나온 배우에게 가산점 (lib/jev.mjs)
    const pick = await chooseActor(data.name, candidate, await store.getActorCounts(), variants.map((x) => x.actor.id));
    const started = Date.now();
    // 창고에서 찾은 정답은 그림 설명이 아직 없다: 이때 한 번 쓰고 저장해 둔다
    if (!candidate.mimic) {
      Object.assign(candidate, await describeCandidate({ topicName: data.name, name: candidate.name, english: candidate.en }));
      await store.setFound(key, candidate);
    }
    const n = variants.length;
    const v = await store.saveVariant(data.id, candidate.id, n, await generateImage(pick.id, candidate, await refsFor(pick.id)), { id: pick.id, by: pick.by });
    console.log(`[image] ${key} ${n + 1}장째 (${ACTORS[pick.id].name}) ${Math.round((Date.now() - started) / 1000)}초`);
    variants = [...variants];
    variants[n] = { actor: { id: pick.id, by: pick.by }, v };
    return show(variants, n);
  } catch (e) {
    console.error(`[image] ${key} 실패:`, e.message);
    return fail(variants, 'error');
  } finally {
    await store.unlock(key);
  }
}
