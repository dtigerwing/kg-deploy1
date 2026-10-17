// 루소 목공소 로컬 서버 (설치할 패키지 없음): npm run dev → http://localhost:3000
// 게임 계산은 화면(public/game.js)에서 하고, 서버는 키가 필요한 일(이미지·Jev)과 저장만 맡는다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DATA_DIR } from './lib/paths.mjs';
import { env } from './lib/env.mjs';
import { TOPICS, loadTopic } from './lib/topics.mjs';
import { reveal } from './lib/reveal.mjs';
import { jevReady } from './lib/jev.mjs';
import { imageReady } from './lib/image.mjs';
import * as store from './lib/store.mjs';

const STATIC = [
  ['/assets/', path.join(ROOT, 'assets')],
  ['/images/', path.join(DATA_DIR, 'images')],
  ['/', path.join(ROOT, 'public')],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function serveStatic(req, res, pathname) {
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
  send(res, 404, { error: 'not found' });
}

async function api(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/status') {
    const animal = loadTopic('animal');
    return send(res, 200, {
      topics: TOPICS.map((t) => ({ id: t.id, name: t.name, ready: Boolean(t.data) })),
      table: animal.tableSource,
      jev: jevReady(),
      image: imageReady(),
      imagesToday: store.imagesToday(),
      imageLimit: Number(env('DAILY_IMAGE_LIMIT', '50')) || 0,
    });
  }

  const topicMatch = pathname.match(/^\/api\/topic\/([a-z]+)$/);
  if (req.method === 'GET' && topicMatch) {
    const topic = loadTopic(topicMatch[1]);
    return topic ? send(res, 200, topic) : send(res, 404, { error: '준비 중인 주제예요.' });
  }

  if (req.method === 'POST' && pathname === '/api/reveal') {
    const { topic, candidate } = await readBody(req);
    const result = await reveal(String(topic), String(candidate));
    return result ? send(res, 200, result) : send(res, 404, { error: '없는 정답이에요.' });
  }

  // 졌어요: 정답과 답변 기록만 남긴다 (나중에 후보를 보강할 때 참고)
  if (req.method === 'POST' && pathname === '/api/loss') {
    const { topic, answer, answers } = await readBody(req);
    const text = String(answer || '').trim().slice(0, 50);
    if (text) store.appendLog('losses.jsonl', { topic: String(topic), answer: text, answers: Array.isArray(answers) ? answers.slice(0, 40) : [] });
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
}

loadTopic('animal'); // 데이터가 잘못됐으면 켜질 때 바로 알 수 있게

const port = Number(env('PORT', '3000'));
http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname.startsWith('/api/')) await api(req, res, pathname);
      else serveStatic(req, res, pathname);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: '서버에서 문제가 생겼어요.' });
    }
  })
  .listen(port, () => {
    console.log(`루소 목공소: http://localhost:${port}`);
    console.log(`  판단 표: ${loadTopic('animal').tableSource === 'jev' ? 'Jev' : '임시 값 (npm run table 로 Jev 표 만들기)'}`);
    console.log(`  이미지: ${imageReady() ? '켜짐' : '꺼짐 (.env 의 OPENAI_API_KEY 비어 있음)'} · Jev: ${jevReady() ? '켜짐' : '꺼짐'}`);
  });
