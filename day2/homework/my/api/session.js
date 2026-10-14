// POST /api/session — 대화 시작: 챗봇 창을 열면 화면이 자동으로 부름 (이름·이메일 없이 누구나)
// 채팅 내역에는 '방문자 ab12' 처럼 대화 ID 앞 네 글자로 보임
import { HttpError, assertSameOrigin, clean, clientInfo, json, readJson, route, sessionIdFrom } from './_lib/http.js';
import { store } from './_lib/store.js';
import { loadSettings } from './_lib/settings.js';
import { startConv } from './_lib/conv.js';

const SESSION_TTL = 24 * 3600;

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const body = await readJson(request, 4000);
  const sessionId = sessionIdFrom(body);
  const settings = await loadSettings();
  const info = clientInfo(request);
  const now = Date.now();

  if (await store.get(`block:ip:${info.ip}`)) throw new HttpError(403, settings.messages.blocked);

  const sessKey = `sess:${sessionId}`;
  let sess = await store.get(sessKey);
  if (!sess) {
    if ((await store.incr(`rl:s:${info.ip}:${Math.floor(now / 3600000)}`, 4000)) > 20) {
      throw new HttpError(429, '새 대화를 너무 많이 시작했어요. 잠시 후에 다시 시도해 주세요.');
    }
    sess = { startedAt: now, started: true, count: 0, lastAt: 0, strikes: {}, history: [], recent: [], emotions: [], blockedUntil: 0 };
    sess.page = clean(body.page, 200);
    sess.referrer = clean(body.referrer, 200);
    await store.set(sessKey, sess, SESSION_TTL);
    const place = [info.country, info.region, info.city].filter(Boolean).join(' ');
    await startConv(sessionId, {
      name: `방문자 ${sessionId.slice(0, 4)}`, email: '', startedAt: now, ip: info.ip, place, ua: info.ua, page: sess.page, referrer: sess.referrer,
    }, settings.privacy.retentionDays);
  }
  if (sess.blockedUntil > now) throw new HttpError(403, settings.messages.blocked);

  return json({ ok: true });
});
