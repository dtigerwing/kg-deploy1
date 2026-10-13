// 저장소 — 운영(Vercel)에서는 Upstash Redis, 로컬 개발에서는 .data/dev-store.json 파일
// Vercel 대시보드 > Storage > Upstash for Redis 를 연결하면 KV_REST_API_URL / KV_REST_API_TOKEN 이 자동으로 들어옵니다.
import fs from 'node:fs';

const REST_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const ON_VERCEL = Boolean(process.env.VERCEL);

function redisStore() {
  async function call(body, path = '') {
    const res = await fetch(REST_URL + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${REST_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Redis 요청 실패 (${res.status})`);
    return res.json();
  }
  const cmd = async (...args) => {
    const data = await call(args.map(String));
    if (data.error) throw new Error(data.error);
    return data.result;
  };
  const parse = (v) => (v == null ? null : JSON.parse(v));

  return {
    kind: 'redis',
    persistent: true,
    async get(key) {
      return parse(await cmd('GET', key));
    },
    async set(key, value, ttlSec) {
      await (ttlSec ? cmd('SET', key, JSON.stringify(value), 'EX', ttlSec) : cmd('SET', key, JSON.stringify(value)));
    },
    async del(key) {
      await cmd('DEL', key);
    },
    async incr(key, ttlSec) {
      const n = await cmd('INCR', key);
      if (n === 1) await cmd('EXPIRE', key, ttlSec);
      return n;
    },
    async ttl(key) {
      return cmd('TTL', key);
    },
    async push(key, value, max) {
      await call([['LPUSH', key, JSON.stringify(value)], ['LTRIM', key, '0', String(max - 1)]], '/pipeline');
    },
    async list(key, n) {
      return ((await cmd('LRANGE', key, 0, n - 1)) || []).map(parse);
    },
    async mget(keys) {
      return keys.length ? ((await cmd('MGET', ...keys)) || []).map(parse) : [];
    },
    // 정렬 목록 (점수 = 시각) — 채팅 내역 목록용
    async zadd(key, score, member) {
      await cmd('ZADD', key, score, member);
    },
    async zrevrange(key, start, stop) {
      return (await cmd('ZREVRANGE', key, start, stop)) || [];
    },
    async zrem(key, member) {
      await cmd('ZREM', key, member);
    },
    async zremBelow(key, score) {
      await cmd('ZREMRANGEBYSCORE', key, '-inf', score);
    },
  };
}

// 로컬: 메모리 + 파일. Vercel 인데 Redis 가 없으면 메모리만 (재시작하면 사라짐 → 관리자 저장 막음)
function memoryStore(file) {
  const data = new Map();
  if (file) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) data.set(k, v);
    } catch {}
  }
  const save = () => {
    if (!file) return;
    fs.mkdirSync(new URL('.', file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(data), null, 1));
  };
  const live = (key) => {
    const e = data.get(key);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) {
      data.delete(key);
      return null;
    }
    return e;
  };
  const put = (key, v, ttlSec) => data.set(key, { v, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });

  return {
    kind: file ? 'local-file' : 'memory',
    persistent: Boolean(file),
    async get(key) {
      return structuredClone(live(key)?.v ?? null);
    },
    async set(key, value, ttlSec) {
      put(key, structuredClone(value), ttlSec);
      save();
    },
    async del(key) {
      data.delete(key);
      save();
    },
    async incr(key, ttlSec) {
      const e = live(key);
      if (e) e.v += 1;
      else put(key, 1, ttlSec);
      save();
      return live(key).v;
    },
    async ttl(key) {
      const e = live(key);
      if (!e) return -2;
      return e.exp ? Math.ceil((e.exp - Date.now()) / 1000) : -1;
    },
    async push(key, value, max) {
      const list = live(key)?.v || [];
      put(key, [value, ...list].slice(0, max));
      save();
    },
    async list(key, n) {
      return structuredClone((live(key)?.v || []).slice(0, n));
    },
    async mget(keys) {
      return keys.map((k) => structuredClone(live(k)?.v ?? null));
    },
    async zadd(key, score, member) {
      const z = live(key)?.v || {};
      z[member] = score;
      put(key, z);
      save();
    },
    async zrevrange(key, start, stop) {
      const z = live(key)?.v || {};
      return Object.keys(z).sort((a, b) => z[b] - z[a]).slice(start, stop + 1);
    },
    async zrem(key, member) {
      const z = live(key)?.v;
      if (z) delete z[member];
      save();
    },
    async zremBelow(key, score) {
      const z = live(key)?.v;
      if (z) for (const m of Object.keys(z)) if (z[m] <= score) delete z[m];
      save();
    },
  };
}

export const store = REST_URL && REST_TOKEN
  ? redisStore()
  : memoryStore(ON_VERCEL ? null : process.env.DEV_STORE_FILE ? new URL(`file://${process.env.DEV_STORE_FILE}`) : new URL('../../.data/dev-store.json', import.meta.url));
