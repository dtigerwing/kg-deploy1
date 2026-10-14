// API 공통 도우미 — 응답, 요청 읽기, 접속자 정보
// (api/_lib 은 밑줄로 시작해서 Vercel 이 별도 함수로 만들지 않습니다)

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

// 핸들러를 감싸서 HttpError 는 그 상태 코드로, 나머지는 500 으로 돌려줌
export function route(handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: '서버에서 문제가 생겼어요.' }, 500);
    }
  };
}

export async function readJson(request, limit = 8000) {
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, '요청이 너무 커요.');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, '요청 형식이 올바르지 않아요.');
  }
}

// 다른 사이트에서 브라우저로 보내는 요청 차단 (Origin 이 있으면 우리 주소와 같아야 함)
export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  try {
    if (new URL(origin).host === new URL(request.url).host) return;
  } catch {}
  throw new HttpError(403, '허용되지 않은 요청이에요.');
}

const decode = (v) => {
  try {
    return v ? decodeURIComponent(v) : '';
  } catch {
    return v || '';
  }
};

// Vercel 이 붙여 주는 헤더에서 접속자 정보 추출 (로컬 개발 서버도 x-real-ip 를 붙임)
export function clientInfo(request) {
  const h = request.headers;
  const ip = (h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim() || 'unknown';
  return {
    ip,
    country: h.get('x-vercel-ip-country') || '',
    region: decode(h.get('x-vercel-ip-country-region')),
    city: decode(h.get('x-vercel-ip-city')),
    ua: (h.get('user-agent') || '').slice(0, 300),
  };
}

// 한국 시간 기준 날짜·시각 키 (카운터 만료 단위)
export function kstParts(now = Date.now()) {
  const d = new Date(now + 9 * 3600 * 1000).toISOString(); // 2026-10-13T09:12:...
  return { day: d.slice(0, 10).replaceAll('-', ''), hour: d.slice(0, 13).replace(/[-T]/g, ''), text: `${d.slice(0, 10)} ${d.slice(11, 19)}` };
}

export function sessionIdFrom(body) {
  const id = String(body.sessionId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new HttpError(400, '대화 정보가 올바르지 않아요. 새로고침해 주세요.');
  return id;
}

// 제어 문자·꺾쇠 제거 후 길이 자르기
export const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);

// {name} 이 비어 있으면 '{name} 님, ' 같은 호칭을 통째로 지움 (이름을 받지 않으므로)
export function fill(tpl, vars) {
  let s = String(tpl || '');
  if ('name' in vars && !vars.name) s = s.replace(/\{name\}\s*님\s*[,，]?\s*/g, '');
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
