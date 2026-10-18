// 창고에서 찾은 후보에 서버만 아는 서명을 붙인다. 화면은 이 토큰을 그대로 돌려줄 뿐이라,
// 화면에서 그림 설명을 마음대로 바꿔 보내 OpenAI 그림을 그리게 할 수 없다. (서명 키는 OpenAI 키에서 만든다)
import { cfg } from './config.mjs';

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const key = () =>
  crypto.subtle.importKey('raw', enc.encode(`russo-found:${cfg('OPENAI_API_KEY')}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function signPayload(payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await crypto.subtle.sign('HMAC', await key(), enc.encode(body)));
  return `${body}.${sig}`;
}

export async function verifyPayload(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), fromB64url(sig), enc.encode(body));
    return ok ? JSON.parse(new TextDecoder().decode(fromB64url(body))) : null;
  } catch {
    return null;
  }
}
