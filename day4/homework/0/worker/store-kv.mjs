// 배포 저장소: Workers KV 하나에 모두 넣는다 (그림, 배우 배정, 하루 생성 수, 못 맞힌 기록).
// 로컬용 node/store-fs.mjs 와 같은 일을 한다. 키 이름:
//   actor:<주제>/<후보>   배우 배정 { id, by, image: { type, v } }
//   img:<주제>/<후보>     목각인형 그림 (metadata.type)
//   usage:<YYYY-MM-DD>    그날(한국 시간) 그림 생성 수
//   lock:<주제>/<후보>    지금 그리는 중 표시 (3분 뒤 자동 삭제)
//   loss:<시각>:<임의값>  못 맞힌 기록
//   found:<주제>/<id>     창고 뒤지기에서 찾아 맞힌 목록 밖 후보 { name, en, gender, as, mimic }
//   search:<YYYY-MM-DD>   그날 창고 뒤지기 횟수
//   settings              관리 페이지 설정 (lib/settings.mjs)
//   stats:wins            맞힌 횟수 { '주제/후보': 횟수 } (키 하나에 모아서 읽기 1번으로 TOP 5 를 만든다.
//                         동시에 맞히면 가끔 1번이 빠질 수 있지만 순위 표시용이라 괜찮다)
// KV 무료 한도: 쓰기 하루 1,000번. 새 그림 1장에 쓰기 약 6번(상한 50장이면 약 300번), 맞힐 때마다 1번.
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export function kvStore(kv) {
  const getActor = (key) => kv.get(`actor:${key}`, 'json');
  // 접두어로 키 이름 모으기 (관리 페이지의 개수 세기·지우기에만 씀. 무료 한도: 목록 조회 하루 1,000번)
  const listKeys = async (prefix) => {
    const names = [];
    let cursor;
    do {
      const page = await kv.list({ prefix, cursor });
      names.push(...page.keys.map((k) => k.name));
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    return names;
  };
  return {
    getActor,
    async setActor(key, record) {
      await kv.put(`actor:${key}`, JSON.stringify(record));
    },
    async imageVersion(topicId, candidateId) {
      return (await getActor(`${topicId}/${candidateId}`))?.image?.v || null;
    },
    async getImage(topicId, candidateId) {
      const { value, metadata } = await kv.getWithMetadata(`img:${topicId}/${candidateId}`, 'stream');
      return value ? { body: value, type: metadata?.type || 'image/webp' } : null;
    },
    async saveImage(topicId, candidateId, { bytes, type }) {
      const key = `${topicId}/${candidateId}`;
      const v = Date.now().toString(36);
      await kv.put(`img:${key}`, bytes, { metadata: { type } });
      await kv.put(`actor:${key}`, JSON.stringify({ ...((await getActor(key)) || {}), image: { type, v } }));
      return v;
    },
    async lock(key) {
      if (await kv.get(`lock:${key}`)) return false;
      await kv.put(`lock:${key}`, '1', { expirationTtl: 180 });
      return true;
    },
    async unlock(key) {
      await kv.delete(`lock:${key}`);
    },
    async imagesToday() {
      return Number(await kv.get(`usage:${kstToday()}`)) || 0;
    },
    async takeImageQuota(limit) {
      const used = await this.imagesToday();
      if (used >= limit) return false;
      await kv.put(`usage:${kstToday()}`, String(used + 1), { expirationTtl: 3 * 86400 });
      return true;
    },
    async getWins() {
      return (await kv.get('stats:wins', 'json')) || {};
    },
    async addWin(key) {
      const wins = (await kv.get('stats:wins', 'json')) || {};
      wins[key] = (wins[key] || 0) + 1;
      await kv.put('stats:wins', JSON.stringify(wins));
    },
    async getFound(key) {
      return kv.get(`found:${key}`, 'json');
    },
    async setFound(key, record) {
      await kv.put(`found:${key}`, JSON.stringify({ ...record, at: new Date().toISOString() }));
    },
    async takeSearchQuota(limit) {
      const used = Number(await kv.get(`search:${kstToday()}`)) || 0;
      if (used >= limit) return false;
      await kv.put(`search:${kstToday()}`, String(used + 1), { expirationTtl: 3 * 86400 });
      return true;
    },
    // 관리 페이지 (기획서 9-1절)
    async getSettings() {
      return kv.get('settings', 'json');
    },
    async setSettings(settings) {
      await kv.put('settings', JSON.stringify(settings));
    },
    async searchesToday() {
      return Number(await kv.get(`search:${kstToday()}`)) || 0;
    },
    async countLosses() {
      return (await listKeys('loss:')).length;
    },
    async countFound() {
      return (await listKeys('found:')).length;
    },
    async resetWins() {
      await kv.delete('stats:wins');
    },
    async resetLosses() {
      for (const name of await listKeys('loss:')) await kv.delete(name);
    },
    async resetUsageToday() {
      await kv.delete(`usage:${kstToday()}`);
      await kv.delete(`search:${kstToday()}`);
    },
    async addLoss(record) {
      const at = new Date().toISOString();
      await kv.put(`loss:${at}:${Math.random().toString(36).slice(2, 8)}`, JSON.stringify({ at, ...record }));
    },
  };
}
