// 채팅 내역 — 관리자 페이지에서 보는 대화 기록 (이름·이메일·메시지·감정)
// conv:{대화ID} 에 대화 전체, convs(정렬 목록)에 최근 순서. 보관 기간이 지나면 자동 삭제
import { store } from './store.js';
import { EMOTIONS } from './emotion.js';

const INDEX = 'convs';
const key = (id) => `conv:${id}`;
const ttlFor = (conv, days) => Math.max(60, Math.round((conv.startedAt + days * 86400000 - Date.now()) / 1000));

export async function startConv(id, data, days) {
  const existing = await store.get(key(id));
  const conv = existing ? { ...existing, ...data } : { id, ...data, messages: [] };
  conv.lastAt = Date.now();
  await store.set(key(id), conv, ttlFor(conv, days));
  await store.zadd(INDEX, conv.lastAt, id);
  return conv;
}

export async function appendConv(id, entries, patch, days) {
  const conv = await store.get(key(id));
  if (!conv) return;
  conv.messages.push(...entries);
  Object.assign(conv, patch, { lastAt: Date.now() });
  await store.set(key(id), conv, ttlFor(conv, days));
  await store.zadd(INDEX, conv.lastAt, id);
}

export const getConv = (id) => store.get(key(id));

export async function deleteConv(id) {
  await store.del(key(id));
  await store.zrem(INDEX, id);
}

// 목록용 요약: 마지막 감정, 가장 강했던 부정 감정
function summary(c) {
  const users = c.messages.filter((m) => m.role === 'user');
  const last = [...users].reverse().find((m) => m.emotion)?.emotion || null;
  let peak = null;
  for (const m of users) {
    const e = m.emotion;
    if (e && EMOTIONS[e.top]?.negative && (!peak || e.percent > peak.percent)) peak = { top: e.top, percent: e.percent };
  }
  return {
    id: c.id, name: c.name, email: c.email, startedAt: c.startedAt, lastAt: c.lastAt,
    count: users.length, lastText: users.at(-1)?.text || '', last, peak,
    strikes: Object.values(c.strikes || {}).reduce((a, b) => a + b, 0), blocked: Boolean(c.blocked),
  };
}

export async function listConvs({ q = '', limit = 50, maxDays = 3650 } = {}) {
  await store.zremBelow(INDEX, Date.now() - maxDays * 86400000);
  const ids = await store.zrevrange(INDEX, 0, 299);
  const convs = await store.mget(ids.map(key));
  const out = [];
  const needle = q.trim().toLowerCase();
  for (let i = 0; i < ids.length; i++) {
    const c = convs[i];
    if (!c) {
      await store.zrem(INDEX, ids[i]); // 보관 기간이 지나 사라진 대화
      continue;
    }
    if (needle && !`${c.name}\n${c.email}`.toLowerCase().includes(needle)) continue;
    out.push(summary(c));
    if (out.length >= limit) break;
  }
  return out;
}
