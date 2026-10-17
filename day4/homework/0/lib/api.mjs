// /api 와 /images 요청 처리. 표준 Request → Response 라서 로컬 Node 서버(server.mjs)와 배포 Workers(worker/index.mjs)가 같이 쓴다.
// deps: { store, tables: () => ({ 주제 id: 판단 표 }), refsFor: (배우 id) => 참고 이미지 }
import { cfg } from './config.mjs';
import { TOPICS, loadTopic } from './topics.mjs';
import { reveal } from './reveal.mjs';
import { jevReady } from './jev.mjs';
import { imageReady } from './image.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function readJson(request) {
  const text = await request.text();
  if (text.length > 64 * 1024) throw new Error('too large');
  return text ? JSON.parse(text) : {};
}

// 처리할 주소가 아니면 null (정적 파일로 넘김)
export async function handleApi(request, deps) {
  const { pathname } = new URL(request.url);
  const { method } = request;

  if (method === 'GET' && pathname === '/api/status') {
    const tables = deps.tables();
    const topics = TOPICS.map((t) => ({ id: t.id, name: t.name, table: loadTopic(t.id, tables[t.id])?.tableSource || null }));
    return json(200, {
      topics: topics.map((t) => ({ ...t, ready: Boolean(t.table) })),
      table: topics.every((t) => !t.table || t.table === 'jev') ? 'jev' : 'mixed',
      jev: jevReady(),
      image: imageReady(),
      imagesToday: await deps.store.imagesToday(),
      imageLimit: Number(cfg('DAILY_IMAGE_LIMIT', '50')) || 0,
    });
  }

  const topicMatch = pathname.match(/^\/api\/topic\/([a-z]+)$/);
  if (method === 'GET' && topicMatch) {
    const topic = loadTopic(topicMatch[1], deps.tables()[topicMatch[1]]);
    return topic ? json(200, topic) : json(404, { error: '준비 중인 주제예요.' });
  }

  if (method === 'POST' && pathname === '/api/reveal') {
    const { topic, candidate } = await readJson(request);
    const result = await reveal(String(topic), String(candidate), deps);
    return result ? json(200, result) : json(404, { error: '없는 정답이에요.' });
  }

  // 못 맞힘: 정답과 답변 기록만 남긴다 (기획서 4절 "못 맞힌 정답 반영")
  if (method === 'POST' && pathname === '/api/loss') {
    const { topic, answer, answers } = await readJson(request);
    const text = String(answer || '').trim().slice(0, 50);
    if (text) await deps.store.addLoss({ topic: String(topic), answer: text, answers: Array.isArray(answers) ? answers.slice(0, 40) : [] });
    return json(200, { ok: true });
  }

  const imageMatch = pathname.match(/^\/images\/([a-z]+)\/([a-z0-9_]+)$/);
  if (method === 'GET' && imageMatch) {
    const img = await deps.store.getImage(imageMatch[1], imageMatch[2]);
    if (!img) return json(404, { error: 'not found' });
    // 주소에 ?v=버전 이 붙어 있어서 오래 저장해도 된다 (다시 그리면 버전이 바뀜)
    return new Response(img.body, { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=31536000, immutable' } });
  }

  if (pathname.startsWith('/api/')) return json(404, { error: 'not found' });
  return null;
}
