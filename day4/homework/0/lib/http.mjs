// 응답 도우미 (lib/api.mjs, lib/admin.mjs 가 같이 씀)
export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export async function readJson(request) {
  const text = await request.text();
  if (text.length > 64 * 1024) throw new Error('too large');
  return text ? JSON.parse(text) : {};
}
