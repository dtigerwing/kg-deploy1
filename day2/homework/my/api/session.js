// POST /api/session — 대화 시작: 이름·이메일·개인정보 동의를 받아 대화를 만듦 (채팅 내역에 저장)
import crypto from 'node:crypto';
import { HttpError, assertSameOrigin, clean, clientInfo, fill, json, readJson, route, sessionIdFrom } from './_lib/http.js';
import { store } from './_lib/store.js';
import { loadSettings } from './_lib/settings.js';
import { matchInjection } from './_lib/guard.js';
import { startConv } from './_lib/conv.js';

const SESSION_TTL = 24 * 3600;
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/;

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const body = await readJson(request, 4000);
  const sessionId = sessionIdFrom(body);
  const settings = await loadSettings();
  const info = clientInfo(request);
  const now = Date.now();

  const name = clean(body.name, 30).replace(/\s+/g, ' ');
  const email = clean(body.email, 120).toLowerCase();
  if (!name || name.length > 20 || !/^[\p{L}\p{N} ._·-]+$/u.test(name)) throw new HttpError(400, '이름은 한글·영문·숫자로 20자 이내로 적어 주세요.');
  if (matchInjection(name, settings.injectionPatterns)) throw new HttpError(400, '이름으로 쓸 수 없는 말이 들어 있어요.');
  if (email.length > 100 || !EMAIL_RE.test(email)) throw new HttpError(400, '이메일 주소를 다시 확인해 주세요.');
  if (body.consent !== true) throw new HttpError(400, '개인정보 수집·이용에 동의해야 대화를 시작할 수 있어요.');

  if (await store.get(`block:ip:${info.ip}`)) throw new HttpError(403, settings.messages.blocked);
  if ((await store.incr(`rl:s:${info.ip}:${Math.floor(now / 3600000)}`, 4000)) > 10) {
    throw new HttpError(429, '새 대화를 너무 많이 시작했어요. 잠시 후에 다시 시도해 주세요.');
  }

  // 어떤 동의 문구에 동의했는지 남김 (문구가 바뀌면 값이 달라짐)
  const consent = {
    at: now,
    retentionDays: settings.privacy.retentionDays,
    version: crypto.createHash('sha1').update(settings.privacy.consent).digest('hex').slice(0, 10),
  };

  const sessKey = `sess:${sessionId}`;
  const sess = (await store.get(sessKey)) || { startedAt: now, count: 0, lastAt: 0, strikes: {}, history: [], recent: [], emotions: [], blockedUntil: 0 };
  if (sess.blockedUntil > now) throw new HttpError(403, settings.messages.blocked);
  sess.profile = { name, email };
  sess.consent = consent;
  sess.page = clean(body.page, 200);
  sess.referrer = clean(body.referrer, 200);
  await store.set(sessKey, sess, SESSION_TTL);

  const place = [info.country, info.region, info.city].filter(Boolean).join(' ');
  await startConv(sessionId, { name, email, consent, startedAt: sess.startedAt, ip: info.ip, place, ua: info.ua, page: sess.page, referrer: sess.referrer }, settings.privacy.retentionDays);

  return json({ ok: true, name, greeting: fill(settings.messages.welcome, { name }) });
});
