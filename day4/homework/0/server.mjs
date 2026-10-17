// 루소 목공소 로컬 서버: npm run dev → http://localhost:3000
// 배포는 Cloudflare Workers (worker/index.mjs). /api 처리는 둘이 같은 코드(lib/api.mjs)를 쓰고, 저장소만 다르다.
// 게임 계산은 화면(public/game.js)에서 하고, 서버는 키가 필요한 일(그림·Jev)과 저장만 맡는다.
import './node/env.mjs'; // .env 를 설정값으로 연결
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './node/paths.mjs';
import { env } from './node/env.mjs';
import { readTables } from './node/tables.mjs';
import { loadRefs } from './node/refs.mjs';
import { fsStore } from './node/store-fs.mjs';
import { TOPICS, loadTopic } from './lib/topics.mjs';
import { handleApi } from './lib/api.mjs';
import { jevReady } from './lib/jev.mjs';
import { imageReady } from './lib/image.mjs';

const STATIC = [
  ['/assets/', path.join(ROOT, 'assets')],
  ['/', path.join(ROOT, 'public')],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

const deps = { store: fsStore, tables: readTables, refsFor: async (actorId) => loadRefs(actorId) };

function serveStatic(res, pathname) {
  for (const [prefix, dir] of STATIC) {
    if (!pathname.startsWith(prefix)) continue;
    let file = path.join(dir, decodeURIComponent(pathname.slice(prefix.length)));
    if (!file.startsWith(dir)) break; // ../ 막기
    if (pathname.endsWith('/')) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// 데이터가 잘못됐으면 켜질 때 바로 알 수 있게
const tables = readTables();
TOPICS.forEach((t) => loadTopic(t.id, tables[t.id]));

const port = Number(env('PORT', '3000'));
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    try {
      const body = req.method === 'POST' ? await readRaw(req) : undefined;
      const response = await handleApi(new Request(url, { method: req.method, headers: req.headers, body }), deps);
      if (!response) return serveStatic(res, url.pathname);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '서버에서 문제가 생겼어요.' }));
    }
  })
  .listen(port, () => {
    const t = readTables();
    console.log(`루소 목공소: http://localhost:${port}`);
    console.log(`  판단 표: ${TOPICS.map((x) => `${x.name} ${loadTopic(x.id, t[x.id])?.tableSource || '없음'}`).join(' · ')}`);
    console.log(`  이미지: ${imageReady() ? '켜짐' : '꺼짐 (.env 의 OPENAI_API_KEY 비어 있음)'} · Jev: ${jevReady() ? '켜짐' : '꺼짐'}`);
  });
