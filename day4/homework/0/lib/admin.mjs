// 관리 페이지 API (기획서 9-1절): /api/admin/*
// 비밀번호(ADMIN_PASSWORD)로 로그인하면 12시간짜리 서명 쿠키를 준다. 비밀번호를 바꾸면 기존 로그인은 풀린다.
import { cfg } from './config.mjs';
import { json, readJson } from './http.mjs';
import { TOPICS } from './topics.mjs';
import { loadSettings, mergeSettings, envImageLimit, envSearchLimit } from './settings.mjs';

const COOKIE = 'russo_admin';
const SESSION_SEC = 12 * 3600;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hmac = async (text) => {
  const key = await crypto.subtle.importKey('raw', enc.encode(`russo-admin:${cfg('ADMIN_PASSWORD')}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
};

// 쿠키 값: <만료 시각>.<서명>
async function makeSession() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SEC;
  return `${exp}.${await hmac(`session:${exp}`)}`;
}

async function isAuthed(request) {
  if (!cfg('ADMIN_PASSWORD')) return false;
  const cookie = (request.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  const [exp, sig] = (cookie?.slice(COOKIE.length + 1) || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return sig === (await hmac(`session:${exp}`));
}

const cookieHeader = (request, value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;

export async function handleAdmin(request, deps) {
  const { pathname } = new URL(request.url);
  const { method } = request;
  const { store } = deps;

  if (method === 'POST' && pathname === '/api/admin/login') {
    if (!cfg('ADMIN_PASSWORD')) return json(503, { error: '관리자 비밀번호가 아직 설정되지 않았어요. (ADMIN_PASSWORD)' });
    const { password } = await readJson(request);
    // 같은 길이의 서명끼리 비교해서 글자 수로 비밀번호를 짐작하지 못하게 한다
    const ok = (await hmac(`pw:${String(password || '')}`)) === (await hmac(`pw:${cfg('ADMIN_PASSWORD')}`));
    if (!ok) {
      await sleep(700); // 비밀번호 마구 넣어 보기를 늦춘다
      return json(401, { error: '비밀번호가 맞지 않아요.' });
    }
    return json(200, { ok: true }, { 'set-cookie': cookieHeader(request, await makeSession(), SESSION_SEC) });
  }

  if (method === 'POST' && pathname === '/api/admin/logout') {
    return json(200, { ok: true }, { 'set-cookie': cookieHeader(request, '', 0) });
  }

  if (!(await isAuthed(request))) return json(401, { error: '로그인이 필요해요.', configured: Boolean(cfg('ADMIN_PASSWORD')) });

  if (method === 'GET' && pathname === '/api/admin/state') {
    const wins = (await store.getWins()) || {};
    return json(200, {
      settings: await loadSettings(store),
      envLimits: { image: envImageLimit(), search: envSearchLimit() },
      usage: { images: await store.imagesToday(), searches: await store.searchesToday() },
      totals: {
        wins: Object.values(wins).reduce((a, b) => a + b, 0),
        winners: Object.keys(wins).length,
        losses: await store.countLosses(),
        found: await store.countFound(),
      },
      topics: TOPICS.map((t) => ({ id: t.id, name: t.name })),
    });
  }

  if (method === 'POST' && pathname === '/api/admin/settings') {
    const next = mergeSettings(await loadSettings(store), await readJson(request));
    await store.setSettings(next);
    return json(200, { settings: next });
  }

  if (method === 'POST' && pathname === '/api/admin/reset') {
    const { what } = await readJson(request);
    const actions = { wins: () => store.resetWins(), losses: () => store.resetLosses(), usage: () => store.resetUsageToday() };
    if (!actions[what]) return json(400, { error: '알 수 없는 초기화예요.' });
    await actions[what]();
    console.log(`[admin] 초기화: ${what}`);
    return json(200, { ok: true });
  }

  return json(404, { error: 'not found' });
}
