// 로컬 개발 서버 — 정적 파일 + /api 함수를 Vercel 과 같은 방식으로 띄웁니다.
// 사용: npm run dev  (또는 node scripts/dev-server.mjs [포트], 기본 5181)
// · .env 를 읽어서 API 에 넘겨 줌 (OpenAI 키, Gmail 등)
// · 내 컴퓨터(localhost)에서만 접속되고, 숨김 파일·scripts/·api 소스·node_modules 는 내주지 않음
// · 캐시를 끄므로(no-store) 화면 파일은 새로고침만 하면 반영. api/ 코드를 고치면 서버를 다시 켜야 함
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 5181;
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PRIVATE_DIRS = new Set(['scripts', 'tmp', 'api', 'node_modules', 'output', 'dist']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// .env → process.env (이미 있는 값은 그대로)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}

const apiCache = new Map();
async function loadApi(name) {
  if (!apiCache.has(name)) apiCache.set(name, import(pathToFileURL(path.join(ROOT, 'api', `${name}.js`)).href));
  return apiCache.get(name);
}

async function handleApi(req, res, name) {
  const file = path.join(ROOT, 'api', `${name}.js`);
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) return send(res, 404, 'Not found');
  const mod = await loadApi(name);
  const handler = mod[req.method];
  if (!handler) return send(res, 405, 'Method not allowed');

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  headers.set('x-real-ip', req.socket.remoteAddress || '127.0.0.1');
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await handler(request);
  const out = {};
  response.headers.forEach((v, k) => (out[k] = v));
  const setCookie = response.headers.getSetCookie?.();
  if (setCookie?.length) out['set-cookie'] = setCookie;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function serveStatic(req, res, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.')) || (parts[0] && PRIVATE_DIRS.has(parts[0]))) return send(res, 404, 'Not found');
  let file = path.join(ROOT, ...parts);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 404, 'Not found');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return send(res, 404, 'Not found');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function send(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  if (!LOCAL.has(req.socket.remoteAddress)) return send(res, 403, 'Forbidden');
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const api = pathname.match(/^\/api\/([^/]+)\/?$/);
    if (api) return await handleApi(req, res, api[1]);
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});

server.listen({ port: PORT, host: '::', ipv6Only: false }, () => {
  console.log(`http://localhost:${PORT}  (정식)  ·  /test/ (테스트 빌드)  ·  /admin/ (관리자)  — Ctrl+C 로 종료`);
});
