// 배포 저장소: Workers KV 하나에 모두 넣는다 (그림, 배우 배정, 하루 생성 수, 못 맞힌 기록).
// 로컬용 node/store-fs.mjs 와 같은 일을 한다. 키 이름:
//   actor:<주제>/<후보>   배우 배정 { id, by, image: { type, v } }
//   img:<주제>/<후보>     목각인형 그림 (metadata.type)
//   usage:<YYYY-MM-DD>    그날(한국 시간) 그림 생성 수
//   lock:<주제>/<후보>    지금 그리는 중 표시 (3분 뒤 자동 삭제)
//   loss:<시각>:<임의값>  못 맞힌 기록
// KV 무료 한도: 쓰기 하루 1,000번. 새 그림 1장에 쓰기 약 6번이라 하루 상한 50장이면 충분하다.
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export function kvStore(kv) {
  const getActor = (key) => kv.get(`actor:${key}`, 'json');
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
    async addLoss(record) {
      const at = new Date().toISOString();
      await kv.put(`loss:${at}:${Math.random().toString(36).slice(2, 8)}`, JSON.stringify({ at, ...record }));
    },
  };
}
