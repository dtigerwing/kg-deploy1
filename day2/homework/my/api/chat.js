// POST /api/chat — 챗봇 질문 받기
// 순서: 대화 시작(이름·이메일·동의) 확인 → 제한 확인 → 감정 분류(Jev) → 규칙으로 거르기(크레딧 0)
//       → 자주 묻는 질문이면 저장된 답 → 그래도 남으면 AI(이름·감정·응대 기준 함께) → 경고·제한 → 채팅 내역 저장 → 첫 질문이면 메일
import { waitUntil } from '@vercel/functions';
import { HttpError, assertSameOrigin, clientInfo, fill, json, kstParts, readJson, route, sessionIdFrom } from './_lib/http.js';
import { store } from './_lib/store.js';
import { loadKb } from './_lib/kb.js';
import { loadSettings } from './_lib/settings.js';
import { isGibberish, isSmallTalk, looksLeaked, matchInjection, normalize, similarity } from './_lib/guard.js';
import { CANARY, askModel, buildInstructions } from './_lib/llm.js';
import { EMOTIONS, classify, contextBlock, emotionReady, openerFor, pickRules, textHash } from './_lib/emotion.js';
import { appendConv } from './_lib/conv.js';
import { mailReady, sendMail } from './_lib/mail.js';

const SESSION_TTL = 24 * 3600;
const COUNTER_TTL = 26 * 3600;
const STRIKE_OF = { off_topic: 'offTopic', injection: 'injection', wasteful: 'wasteful' };
const REFUSAL_OF = { offTopic: 'offTopic', injection: 'injection', wasteful: 'wasteful' };
// 감정 첫 문장을 앞에 붙여도 되는 규칙 응답
const OPENER_OK = new Set(['unknown', 'off_topic', 'busy', 'error']);

// 채팅 창은 글자 그대로 보여 주므로 마크다운 기호는 걷어 냄
const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*]\s+/gm, '· ');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const emoText = (e) => (e ? `${EMOTIONS[e.top].emoji} ${EMOTIONS[e.top].label} ${e.percent}%${e.intensity ? ` (세기 ${e.intensity}/5)` : ''}` : '-');

export const POST = route(async (request) => {
  assertSameOrigin(request);
  const body = await readJson(request, 4000);
  const sessionId = sessionIdFrom(body);

  const now = Date.now();
  const info = clientInfo(request);
  const kst = kstParts(now);
  const sessKey = `sess:${sessionId}`;
  const [settings, kb, sess] = await Promise.all([loadSettings(), loadKb(), store.get(sessKey)]);
  const { limits: L, strikes: S, messages: M } = settings;
  const days = settings.privacy.retentionDays;

  // 0. 이름·이메일·동의를 받은 대화만
  if (!sess?.profile) return json({ needProfile: true, reply: '대화를 시작하려면 이름과 이메일을 먼저 알려 주세요.' }, 403);
  const { name, email } = sess.profile;
  sess.emotions ||= [];
  const blocked = () => json({ reply: M.blocked, verdict: 'blocked', blocked: true });

  // 1. 이미 제한된 대화·접속 주소
  if (sess.blockedUntil > now) return blocked();
  if (await store.get(`block:ip:${info.ip}`)) return blocked();

  // 2. 질문 꺼내기 (주제 버튼으로 고른 자주 묻는 질문이면 faqId)
  const faq = body.faqId ? kb.items.find((i) => i.id === body.faqId && i.enabled) : null;
  if (body.faqId && !faq) throw new HttpError(404, '지금은 없는 질문이에요. 새로고침해 주세요.');
  const message = faq ? faq.question : String(body.message ?? '').trim();
  if (!message) throw new HttpError(400, '질문을 적어 주세요.');
  if (message.length > L.maxChars) return json({ reply: fill(M.tooLong, { max: L.maxChars }), verdict: 'too_long' });

  // 3. 속도·횟수 제한
  if (L.minIntervalSec && now - sess.lastAt < L.minIntervalSec * 1000) return json({ reply: M.tooFast, verdict: 'too_fast' });
  if (sess.count >= L.perSession) return json({ reply: M.sessionLimit, verdict: 'session_limit', ended: true });
  const [perMinute, perDay] = await Promise.all([
    store.incr(`rl:m:${info.ip}:${Math.floor(now / 60000)}`, 90),
    store.incr(`rl:d:${info.ip}:${kst.day}`, COUNTER_TTL),
  ]);
  if (perMinute > L.perMinute || perDay > L.perDay) return json({ reply: M.rateLimited, verdict: 'rate_limited' });

  const isFirst = sess.count === 0;
  sess.count += 1;
  sess.lastAt = now;

  // 4. 감정 분류 — 직접 쓴 질문만. 입력 중 분석한 문장과 같으면 그 결과를 그대로 씀
  let emotion = null;
  let peak = null;
  if (!faq && emotionReady && settings.emotion.enabled && !isGibberish(message)) {
    const typing = await store.get(`typing:${sessionId}`);
    peak = typing?.peak || null;
    if (typing?.h === textHash(message)) emotion = typing.r;
    else {
      const recent = sess.history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content);
      emotion = await classify(message, recent, 3500).catch((err) => {
        console.error('[chat] Jev 실패', err.message);
        return null;
      });
    }
    await store.del(`typing:${sessionId}`); // 다음 질문의 '작성 중' 기록은 새로 시작
    if (emotion) sess.emotions = [...sess.emotions, emotion.top].slice(-5);
  }
  const policy = settings.emotion;

  // 5. 답 정하기 — result: { verdict, source: faq|rule|ai, text?, strike? }
  let result;
  let usage = null;
  const norm = normalize(message);
  const prev = faq ? null : sess.recent.find((r) => r.n === norm || (norm.length >= 6 && similarity(r.n, norm) >= 0.85));

  if (faq) {
    result = { verdict: 'answer', source: 'faq', text: faq.answer };
  } else if (matchInjection(message, settings.injectionPatterns)) {
    result = { verdict: 'injection', source: 'rule', strike: 'injection' };
  } else if (isGibberish(message)) {
    result = { verdict: 'wasteful', source: 'rule', strike: 'wasteful', text: M.gibberish };
  } else if (prev) {
    // 같은(거의 같은) 질문: 한 번은 앞의 답을 다시 보여 주고, 그 뒤로는 낭비로 셈
    prev.times = (prev.times || 1) + 1;
    result = prev.times === 2 && prev.a
      ? { verdict: 'repeat', source: 'rule', text: `${M.repeat}\n\n${prev.a}` }
      : { verdict: 'wasteful', source: 'rule', strike: 'wasteful' };
  } else if (isSmallTalk(message)) {
    result = { verdict: 'smalltalk', source: 'rule', text: M.smalltalk };
  } else {
    const exact = kb.items.find((i) => i.enabled && normalize(i.question) === norm);
    if (exact) {
      result = { verdict: 'answer', source: 'faq', text: exact.answer };
    } else if ((await store.incr(`ai:d:${kst.day}`, COUNTER_TTL)) > L.aiPerDay) {
      result = { verdict: 'busy', source: 'rule' };
    } else {
      try {
        const out = await askModel({
          instructions: buildInstructions(kb, settings),
          history: sess.history.slice(-L.historyTurns * 2),
          context: contextBlock({ name, emotion, peak, trend: sess.emotions, policy }),
          message,
          maxAnswerChars: L.maxAnswerChars,
        });
        usage = out.usage;
        const answer = plain(String(out.answer || '').trim());
        if (looksLeaked(answer, CANARY)) result = { verdict: 'injection', source: 'ai', strike: 'injection' };
        else if ((out.verdict === 'answer' || out.verdict === 'smalltalk') && answer) result = { verdict: out.verdict, source: 'ai', text: clip(answer, L.maxAnswerChars) };
        else if (out.verdict === 'answer' || out.verdict === 'smalltalk' || out.verdict === 'unknown') result = { verdict: 'unknown', source: 'ai' };
        else result = { verdict: out.verdict, source: 'ai', strike: STRIKE_OF[out.verdict] };
      } catch (err) {
        console.error('[chat] AI 호출 실패', err.message);
        sess.count -= 1; // 우리 쪽 문제라 횟수에서 뺌
        result = { verdict: 'error', source: 'rule' };
      }
    }
  }

  // 6. 규칙 응답 문구 (+ 감정 첫 문장) · 경고 · 제한
  const vars = { name, max: L.maxChars };
  const canned = { unknown: M.unknown, busy: M.busy, error: M.error };
  let text = result.text ? fill(result.text, result.source === 'rule' ? vars : {}) : fill(canned[result.verdict] || M[REFUSAL_OF[result.strike]] || M.unknown, vars);
  if (result.source !== 'ai' || !result.text) {
    const opener = OPENER_OK.has(result.verdict) ? openerFor(emotion, policy, name) : '';
    if (opener) text = `${opener} ${text}`;
  }
  let warning = null;
  let nowBlocked = false;
  if (result.strike) {
    const k = result.strike;
    const n = (sess.strikes[k] = (sess.strikes[k] || 0) + 1);
    if (n >= S[k]) {
      nowBlocked = true;
      const minutes = k === 'injection' ? S.injectionBlockMinutes : S.blockMinutes;
      sess.blockedUntil = now + minutes * 60000;
      const sessionBlocks = await store.incr(`ipstrike:${info.ip}`, 24 * 3600);
      const ipBlocked = sessionBlocks >= S.ipBlockAfter;
      if (ipBlocked) await store.set(`block:ip:${info.ip}`, { at: now, reason: k }, S.ipBlockMinutes * 60);
      await store.push('log:blocks', {
        at: now, type: ipBlocked ? 'ip' : 'session', reason: k, ip: info.ip, sessionId, nickname: name,
        until: now + (ipBlocked ? S.ipBlockMinutes : minutes) * 60000, message: clip(message, 120),
      }, 100);
      text = `${text}\n\n${M.blocked}`;
    } else {
      warning = fill(M.warning, { n, limit: S[k] });
    }
  }

  // 7. 대화 기록 (캐내기 시도·오류는 AI 에게 다시 보내지 않음)
  if (!['injection', 'error', 'busy'].includes(result.verdict)) {
    sess.history.push({ role: 'user', content: message }, { role: 'assistant', content: text });
    sess.history = sess.history.slice(-20);
  }
  if (!faq && !prev) {
    sess.recent.unshift({ n: norm, a: result.verdict === 'answer' ? text : null, times: 1 });
    sess.recent = sess.recent.slice(0, 8);
  }
  await store.set(sessKey, sess, SESSION_TTL);

  const applied = pickRules(emotion, policy).map((r) => r.id);
  await appendConv(sessionId, [
    { role: 'user', at: now, text: message, source: faq ? 'faq' : 'typed', emotion, peak },
    { role: 'bot', at: Date.now(), text, verdict: result.verdict, source: result.source, warning, applied },
  ], { strikes: sess.strikes, blocked: nowBlocked || undefined }, days);

  console.log(JSON.stringify({ ev: 'chat', verdict: result.verdict, source: result.source, strike: result.strike || null, emotion: emotion ? `${emotion.top}:${emotion.percent}` : null, tokens: usage?.total_tokens || 0 }));

  // 8. 대화가 시작되면 관리자에게 메일 (응답은 기다리지 않음)
  if (isFirst && mailReady && (await store.incr(`mail:h:${kst.hour}`, 7200)) <= L.mailPerHour) {
    const place = [info.country, info.region, info.city].filter(Boolean).join(' ') || '알 수 없음';
    waitUntil(
      sendMail({
        subject: `[KIGLE 챗봇] 새 대화 · ${name} · ${clip(message, 30)}`,
        intro: `${name} 님이 챗봇 대화를 시작했어요.`,
        rows: [
          ['시작 시각', `${kst.text} (한국 시간)`],
          ['이름', name],
          ['이메일', email],
          ['대화 ID', sessionId],
          ['접속 주소(IP)', info.ip],
          ['지역', place],
          ['기기·브라우저', info.ua || '알 수 없음'],
          ['보고 있던 페이지', sess.page || '-'],
          ['들어온 경로', sess.referrer || '(직접 방문)'],
          ['첫 질문', faq ? `[자주 묻는 질문] ${message}` : message],
          ['감정 (Jev)', emoText(emotion)],
          ['챗봇 답변', text],
          ['판정', `${result.verdict} (${result.source})`],
        ],
      }).catch((err) => console.error('[chat] 메일 실패', err.message)),
    );
  }

  return json({
    reply: text,
    verdict: result.verdict,
    warning,
    blocked: nowBlocked,
    showTopics: result.verdict !== 'answer',
  });
});
