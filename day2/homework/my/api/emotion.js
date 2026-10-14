// POST /api/emotion — 입력하는 동안 감정 분석 (Jev). 결과는 이용자에게 보여 주지 않고 서버에만 쌓아 둠
// /api/chat 이 보낼 때 꺼내 씀: 최종 문장 결과(같은 문장이면 다시 부르지 않음) + 작성 중 가장 강했던 부정 감정
import { HttpError, assertSameOrigin, clientInfo, json, readJson, route, sessionIdFrom } from './_lib/http.js';
import { store } from './_lib/store.js';
import { loadSettings } from './_lib/settings.js';
import { EMOTIONS, classify, emotionReady, textHash } from './_lib/emotion.js';

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const body = await readJson(request, 4000);
  const sessionId = sessionIdFrom(body);
  const settings = await loadSettings();
  if (!emotionReady || !settings.emotion.enabled || !settings.emotion.typingAnalysis) return json({ ok: true, skipped: true });

  const sess = await store.get(`sess:${sessionId}`);
  if (!(sess?.started || sess?.profile)) throw new HttpError(403, '대화를 먼저 시작해 주세요.');
  if (sess.blockedUntil > Date.now()) return json({ ok: true, skipped: true });

  const text = String(body.text ?? '').trim();
  if (text.length < 2 || text.length > settings.limits.maxChars) return json({ ok: true, skipped: true });

  // 입력 분석은 질문보다 자주 오므로 따로 제한 (대화당 분당 30번, 접속 주소당 분당 60번)
  const minute = Math.floor(Date.now() / 60000);
  const { ip } = clientInfo(request);
  const [bySession, byIp] = await Promise.all([
    store.incr(`rl:e:${sessionId}:${minute}`, 90),
    store.incr(`rl:ei:${ip}:${minute}`, 90),
  ]);
  if (bySession > 30 || byIp > 60) return json({ ok: true, skipped: true });

  const tKey = `typing:${sessionId}`;
  const state = (await store.get(tKey)) || {};
  const h = textHash(text);
  if (state.h === h) return json({ ok: true });

  const recent = sess.history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content);
  const result = await classify(text, recent).catch((err) => {
    console.error('[emotion] Jev 실패', err.message);
    return null;
  });
  if (!result) return json({ ok: true, skipped: true });

  let peak = state.peak || null;
  if (EMOTIONS[result.top]?.negative && (!peak || result.percent > peak.percent)) peak = { top: result.top, percent: result.percent };
  await store.set(tKey, { h, r: result, peak, n: (state.n || 0) + 1 }, 3600);
  return json({ ok: true });
});
