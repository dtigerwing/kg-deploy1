// 관리 페이지에서 바꾸는 설정 (기획서 9-1절). 저장소에 키 하나로 두고, 다시 배포하지 않아도 바로 반영된다.
import { cfg } from './config.mjs';
import { TOPICS } from './topics.mjs';

export const DEFAULT_SETTINGS = {
  showTop5: true, // 시작 화면 "많이 만든 작품 TOP 5"
  storageSearch: true, // 창고 뒤지기 (끄면 판단 표로만 진행)
  imageGen: true, // 새 목각인형 그리기 (끄면 이미 그린 그림만 나옴)
  topics: Object.fromEntries(TOPICS.map((t) => [t.id, true])), // 주제별 열기·닫기
  dailyImageLimit: null, // null 이면 배포 설정값(DAILY_IMAGE_LIMIT)
  dailySearchLimit: null, // null 이면 배포 설정값(DAILY_SEARCH_LIMIT)
};

export async function loadSettings(store) {
  const saved = (await store.getSettings()) || {};
  return { ...DEFAULT_SETTINGS, ...saved, topics: { ...DEFAULT_SETTINGS.topics, ...(saved.topics || {}) } };
}

export const envImageLimit = () => Number(cfg('DAILY_IMAGE_LIMIT', '50')) || 0;
export const envSearchLimit = () => Number(cfg('DAILY_SEARCH_LIMIT', '300')) || 0;
export const imageLimit = (s) => s.dailyImageLimit ?? envImageLimit();
export const searchLimit = (s) => s.dailySearchLimit ?? envSearchLimit();

// 관리 페이지에서 온 값 중 알려진 항목만, 알맞은 형태로 받아들인다
export function mergeSettings(current, input) {
  const next = { ...current, topics: { ...current.topics } };
  for (const key of ['showTop5', 'storageSearch', 'imageGen']) if (typeof input[key] === 'boolean') next[key] = input[key];
  for (const [id, on] of Object.entries(input.topics || {})) if (id in next.topics && typeof on === 'boolean') next.topics[id] = on;
  for (const key of ['dailyImageLimit', 'dailySearchLimit']) {
    if (!(key in input)) continue;
    const v = input[key];
    next[key] = v === null || v === '' ? null : Math.max(0, Math.min(10000, Math.round(Number(v)) || 0));
  }
  return next;
}
