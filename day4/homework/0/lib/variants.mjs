// 정답 하나의 그림 목록 (최대 IMAGES_PER_ANSWER 장, 기본 2장). 저장소마다 이 형식으로 돌려준다.
//   지금 형식: { variants: [{ actor: { id, by }, type, v }] }   (0번째 그림, 1번째 그림 …)
//   예전 형식: { id, by, image: { type, v } }  → 그림 1장짜리로 읽는다. image 가 없으면 아직 그림 없음
export function normalizeVariants(record) {
  if (!record) return [];
  if (Array.isArray(record.variants)) return record.variants;
  return record.image ? [{ actor: { id: record.id, by: record.by }, type: record.image.type, v: record.image.v }] : [];
}

// 배우별로 맡은 그림 수 (배우를 골고루 고르기 위해)
export function countActors(records) {
  const counts = {};
  for (const r of records) for (const v of normalizeVariants(r)) if (v?.actor) counts[v.actor.id] = (counts[v.actor.id] || 0) + 1;
  return counts;
}
