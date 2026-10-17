// 배포용 Cloudflare Workers 진입점 (wrangler.jsonc). 로컬 개발은 server.mjs.
// 화면·그림 파일은 정적 자산(dist/)으로 바로 나가고, 나머지 요청만 여기로 온다.
import { setConfig } from '../lib/config.mjs';
import { handleApi } from '../lib/api.mjs';
import { kvStore } from './store-kv.mjs';
import animal from '../data/tables/animal.json';
import food from '../data/tables/food.json';
import person from '../data/tables/person.json';

const TABLES = { animal, food, person };

// 배우 원본 그림은 정적 자산(dist/assets/characters/)에서 꺼내 OpenAI 에 참고로 보낸다
async function refsFor(env, request, actorId) {
  const res = await env.ASSETS.fetch(new URL(`/assets/characters/${actorId}.png`, request.url));
  return res.ok ? [{ name: `${actorId}.png`, type: 'image/png', bytes: await res.arrayBuffer() }] : [];
}

export default {
  async fetch(request, env) {
    setConfig((name) => env[name]);
    try {
      const res = await handleApi(request, { store: kvStore(env.KV), tables: () => TABLES, refsFor: (actorId) => refsFor(env, request, actorId) });
      return res || env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: '서버에서 문제가 생겼어요.' }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
  },
};
