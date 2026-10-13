// /api/admin?op=... — 관리자 페이지용 (로그인, 질문·답변, 채팅 내역, 감정 분류, 규칙, 차단 기록, 연결 상태)
import { HttpError, assertSameOrigin, clientInfo, json, kstParts, readJson, route } from './_lib/http.js';
import { store } from './_lib/store.js';
import { adminReady, checkPassword, isAdmin, loginCookie, logoutCookie, requireAdmin } from './_lib/auth.js';
import { deleteCategory, deleteItem, loadKb, moveCategory, resetKb, saveCategory, saveItem } from './_lib/kb.js';
import { defaultSettings, loadSettings, resetSettings, saveSettings } from './_lib/settings.js';
import { MODEL } from './_lib/llm.js';
import { EMOTIONS, JEV_MODEL, classify, contextBlock, emotionReady, openerFor, pickRules } from './_lib/emotion.js';
import { deleteConv, getConv, listConvs } from './_lib/conv.js';
import { NOTIFY_TO, mailReady, sendMail } from './_lib/mail.js';

// 저장소가 임시 메모리면(Vercel 에 Redis 미연결) 저장해도 곧 사라지므로 막음
function requireWritable() {
  if (!store.persistent) throw new HttpError(503, '저장소(Upstash Redis)가 연결되지 않아 저장할 수 없어요. 연결 상태 탭을 확인해 주세요.');
}

const handle = route(async (request) => {
  const url = new URL(request.url);
  const op = url.searchParams.get('op') || '';
  const method = request.method;
  if (method !== 'GET') {
    assertSameOrigin(request);
    if (!(request.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'JSON 요청만 받아요.');
  }

  // ----- 로그인 -----
  if (op === 'me' && method === 'GET') return json({ authed: isAdmin(request), adminReady });
  if (op === 'login' && method === 'POST') {
    if (!adminReady) throw new HttpError(503, '서버에 ADMIN_PASSWORD(8자 이상)가 설정되지 않았어요.');
    const { ip } = clientInfo(request);
    const tries = await store.incr(`login:${ip}:${Math.floor(Date.now() / 900000)}`, 1000);
    if (tries > 5) throw new HttpError(429, '로그인 시도가 너무 많아요. 15분 뒤에 다시 해 주세요.');
    const { password } = await readJson(request, 500);
    if (!checkPassword(String(password || ''))) throw new HttpError(401, '비밀번호가 맞지 않아요.');
    return json({ ok: true }, 200, { 'set-cookie': loginCookie(request) });
  }
  if (op === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': logoutCookie });

  requireAdmin(request);
  const body = method === 'GET' ? {} : await readJson(request, 64000);
  const rev = body.rev ?? null;

  switch (`${method} ${op}`) {
    // ----- 연결 상태 -----
    case 'GET status':
      return json({
        model: MODEL,
        openai: Boolean(process.env.OPENAI_API_KEY),
        jev: emotionReady,
        jevModel: JEV_MODEL,
        storage: store.kind,
        persistent: store.persistent,
        mail: mailReady,
        notifyTo: mailReady ? NOTIFY_TO : null,
        aiToday: (await store.get(`ai:d:${kstParts().day}`)) || 0,
      });
    case 'POST testMail': {
      if (!mailReady) throw new HttpError(400, 'GMAIL_USER, GMAIL_APP_PASSWORD 가 설정되지 않았어요.');
      await sendMail({
        subject: '[KIGLE 챗봇] 테스트 메일',
        intro: '관리자 페이지에서 보낸 테스트 메일이에요. 이 메일이 보이면 대화 시작 알림도 이 주소로 와요.',
        rows: [['보낸 시각', `${kstParts().text} (한국 시간)`]],
      });
      return json({ ok: true, to: NOTIFY_TO });
    }

    // ----- 질문·답변 -----
    case 'GET kb':
      return json(await loadKb());
    case 'POST item':
      requireWritable();
      return json(await saveItem(body.item || {}, rev));
    case 'DELETE item':
      requireWritable();
      return json(await deleteItem(String(body.id || ''), rev));
    case 'POST category':
      requireWritable();
      return json(await saveCategory(body.category || {}, rev));
    case 'DELETE category':
      requireWritable();
      return json(await deleteCategory(String(body.id || ''), rev));
    case 'POST moveCategory':
      requireWritable();
      return json(await moveCategory(String(body.id || ''), body.dir, rev));
    case 'POST resetKb':
      requireWritable();
      return json(await resetKb());

    // ----- 채팅 내역 -----
    case 'GET conversations': {
      const settings = await loadSettings();
      return json({ items: await listConvs({ q: url.searchParams.get('q') || '', maxDays: settings.privacy.retentionDays }), emotions: EMOTIONS });
    }
    case 'GET conversation': {
      const conv = await getConv(url.searchParams.get('id') || '');
      if (!conv) throw new HttpError(404, '대화를 찾을 수 없어요. 보관 기간이 지나 삭제됐을 수 있어요.');
      return json({ conv, emotions: EMOTIONS });
    }
    case 'DELETE conversation':
      await deleteConv(String(body.id || ''));
      return json({ ok: true });

    // ----- 감정 분류 (바로 해 보기) -----
    case 'GET emotions':
      return json({ emotions: EMOTIONS, ready: emotionReady, model: JEV_MODEL });
    case 'POST emotion': {
      if (!emotionReady) throw new HttpError(400, 'TYPESAFE_API_KEY 가 설정되지 않았어요.');
      const text = String(body.text || '').trim().slice(0, 1000);
      if (!text) throw new HttpError(400, '문장을 적어 주세요.');
      const { ip } = clientInfo(request);
      if ((await store.incr(`rl:ae:${ip}:${Math.floor(Date.now() / 60000)}`, 90)) > 60) throw new HttpError(429, '잠시 후 다시 해 주세요.');
      const settings = await loadSettings();
      const policy = body.policy ? { ...settings.emotion, ...body.policy } : settings.emotion; // 저장 전 응대 기준으로 미리보기
      const name = '홍길동';
      const emotion = await classify(text, [], 8000);
      return json({
        emotion,
        applied: pickRules(emotion, policy).map((r) => r.id),
        opener: openerFor(emotion, policy, name),
        context: contextBlock({ name, emotion, peak: null, trend: [], policy }),
      });
    }

    // ----- 규칙 -----
    case 'GET settings':
      return json({ settings: await loadSettings(), defaults: defaultSettings });
    case 'PUT settings':
      requireWritable();
      return json({ settings: await saveSettings(body.settings, rev), defaults: defaultSettings });
    case 'POST resetSettings':
      requireWritable();
      return json({ settings: await resetSettings(), defaults: defaultSettings });

    // ----- 차단 기록 -----
    case 'GET blocks':
      return json({ blocks: await store.list('log:blocks', 100) });
    case 'POST unblock': {
      const { ip, sessionId } = body;
      if (ip) {
        await store.del(`block:ip:${ip}`);
        await store.del(`ipstrike:${ip}`);
      }
      if (sessionId) {
        const key = `sess:${sessionId}`;
        const sess = await store.get(key);
        if (sess) await store.set(key, { ...sess, blockedUntil: 0, strikes: {} }, 24 * 3600);
      }
      return json({ ok: true });
    }
  }
  throw new HttpError(404, '없는 요청이에요.');
});

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
