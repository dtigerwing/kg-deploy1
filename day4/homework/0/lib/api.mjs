// /api 와 /images 요청 처리. 표준 Request → Response 라서 로컬 Node 서버(server.mjs)와 배포 Workers(worker/index.mjs)가 같이 쓴다.
// deps: { store, tables: () => ({ 주제 id: 판단 표 }), refsFor: (배우 id) => 참고 이미지 }
import { TOPICS, loadTopic, topicData } from './topics.mjs';
import { reveal } from './reveal.mjs';
import { jevReady } from './jev.mjs';
import { imageReady } from './image.mjs';
import { sharePage } from './share.mjs';
import { storageSearch, storageAsk, storageProbe } from './search.mjs';
import { verifyPayload } from './sign.mjs';
import { loadSettings, imageLimit } from './settings.mjs';
import { handleAdmin } from './admin.mjs';
import { json, readJson } from './http.mjs';


// 맞힌 횟수 { '주제/후보': 횟수 } → 많은 순 [{ topic, topicName, id, name, count }]
// 창고에서 찾은 정답은 저장소에서 이름을 찾는다
async function topWins(wins, n, store) {
  const ranked = Object.entries(wins || {}).sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [key, count] of ranked) {
    if (out.length >= n) break;
    const [topic, id] = key.split('/');
    const data = topicData(topic);
    const c = data?.candidates.find((x) => x.id === id) || (data && (await store.getFound(key)));
    if (c) out.push({ topic, topicName: data.name, id, name: c.name, count });
  }
  return out;
}

// 처리할 주소가 아니면 null (정적 파일로 넘김)
export async function handleApi(request, deps) {
  const { pathname } = new URL(request.url);
  const { method } = request;

  // 관리 페이지 API (lib/admin.mjs, 기획서 9-1절)
  if (pathname.startsWith('/api/admin/')) return handleAdmin(request, deps);

  // 관리 페이지 설정이 필요한 요청만 저장소에서 읽는다 (그림 요청마다 읽지 않게)
  if (['/api/status', '/api/reveal', '/api/search', '/api/ask'].includes(pathname) || pathname.startsWith('/api/topic/')) {
    deps = { ...deps, settings: await loadSettings(deps.store) };
  }

  if (method === 'GET' && pathname === '/api/status') {
    const { settings } = deps;
    const tables = deps.tables();
    const topics = TOPICS.map((t) => ({ id: t.id, name: t.name, table: loadTopic(t.id, tables[t.id])?.tableSource || null }));
    return json(200, {
      topics: topics.map((t) => ({ ...t, ready: Boolean(t.table) && settings.topics[t.id] !== false })),
      table: topics.every((t) => !t.table || t.table === 'jev') ? 'jev' : 'mixed',
      jev: jevReady(),
      image: imageReady() && settings.imageGen,
      imagesToday: await deps.store.imagesToday(),
      imageLimit: imageLimit(settings),
      showTop5: settings.showTop5,
      top: settings.showTop5 ? await topWins(await deps.store.getWins(), 5, deps.store) : [],
    });
  }

  const topicMatch = pathname.match(/^\/api\/topic\/([a-z]+)$/);
  if (method === 'GET' && topicMatch) {
    const topic = deps.settings.topics[topicMatch[1]] === false ? null : loadTopic(topicMatch[1], deps.tables()[topicMatch[1]]);
    return topic ? json(200, topic) : json(404, { error: '준비 중인 주제예요.' });
  }

  if (method === 'POST' && pathname === '/api/reveal') {
    const { topic, candidate, token } = await readJson(request);
    // 창고에서 찾은 목록 밖 후보: 서버가 붙인 서명을 확인하고, 맞혔으니 저장해 둔다 (공유·TOP 5·나중에 정식 후보로)
    let found = null;
    if (token) {
      const payload = await verifyPayload(token);
      if (payload?.topic === String(topic) && payload.id === String(candidate)) {
        found = payload;
        await deps.store.setFound(`${topic}/${candidate}`, payload);
      }
    } else if (!topicData(String(topic))?.candidates.some((c) => c.id === String(candidate))) {
      found = await deps.store.getFound(`${topic}/${candidate}`); // 전에 창고에서 찾아 저장된 후보
    }
    const result = await reveal(String(topic), String(candidate), deps, found);
    if (!result) return json(404, { error: '없는 정답이에요.' });
    await deps.store.addWin(`${topic}/${candidate}`); // 정답 공개 = 루소가 맞힘
    return json(200, result);
  }

  // 창고 뒤지기: 판단 표로 못 맞혔을 때 LLM + Jev 로 목록 밖 정답까지 찾기 (lib/search.mjs)
  const list = (v) => (Array.isArray(v) ? v.slice(0, 40) : []);
  if (method === 'POST' && pathname === '/api/search') {
    const { topic, answers, excluded, wrong, extra } = await readJson(request);
    return json(200, await storageSearch({ topicId: String(topic), answers: list(answers), excluded: list(excluded).map(String), wrong: list(wrong).map(String), extra: list(extra) }, deps));
  }

  // 창고 가기 전 루소의 질문: LLM 이 지금까지의 답을 보고 새 질문을 하나 만든다
  if (method === 'POST' && pathname === '/api/ask') {
    const { topic, answers, wrong, extra } = await readJson(request);
    return json(200, await storageAsk({ topicId: String(topic), answers: list(answers), wrong: list(wrong).map(String), extra: list(extra) }, deps));
  }

  // 줄자로 재기: 가르는 질문의 답으로 창고 후보 순서를 다시 매기기
  if (method === 'POST' && pathname === '/api/probe') {
    const { topic, token, answers } = await readJson(request);
    return json(200, await storageProbe({ topicId: String(topic), token: String(token || ''), answers: Array.isArray(answers) ? answers.slice(0, 3).map(String) : [] }));
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
    const n = Math.max(0, Math.min(9, Number(new URL(request.url).searchParams.get('n')) || 0)); // 정답의 몇 번째 그림
    const img = await deps.store.getImage(imageMatch[1], imageMatch[2], n);
    if (!img) return json(404, { error: 'not found' });
    // 주소에 ?v=버전 이 붙어 있어서 오래 저장해도 된다 (다시 그리면 버전이 바뀜)
    return new Response(img.body, { headers: { 'content-type': img.type, 'cache-control': 'public, max-age=31536000, immutable' } });
  }

  // 공유용 결과 페이지 (lib/share.mjs)
  const shareMatch = pathname.match(/^\/share\/([a-z]+)\/([a-z0-9_]+)$/);
  if (method === 'GET' && shareMatch) return sharePage(request, shareMatch[1], shareMatch[2], deps.store);

  if (pathname.startsWith('/api/')) return json(404, { error: 'not found' });
  return null;
}
