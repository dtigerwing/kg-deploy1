// 관리자 로그인 — ADMIN_PASSWORD 로 로그인하면 12시간짜리 서명 쿠키 발급
import crypto from 'node:crypto';
import { HttpError } from './http.js';

const PASSWORD = process.env.ADMIN_PASSWORD || '';
const SECRET = process.env.ADMIN_SESSION_SECRET || crypto.createHash('sha256').update(`kigle-admin:${PASSWORD}`).digest('hex');
const COOKIE = 'kigle_admin';
const MAX_AGE = 12 * 3600;

export const adminReady = PASSWORD.length >= 8;

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

export function checkPassword(input) {
  return adminReady && same(input, PASSWORD);
}

export function loginCookie(request) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure}`;
}

export const logoutCookie = `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0`;

export function isAdmin(request) {
  if (!adminReady) return false;
  const raw = (request.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig || !same(sig, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

export function requireAdmin(request) {
  if (!adminReady) throw new HttpError(503, '서버에 ADMIN_PASSWORD(8자 이상)가 설정되지 않았어요.');
  if (!isAdmin(request)) throw new HttpError(401, '로그인이 필요해요.');
}
