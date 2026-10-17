// 정답 이미지(목각인형) 생성. 로컬과 배포가 같이 쓴다 (파일 읽기 없음: 참고 이미지는 부르는 쪽이 넘긴다).
// 다른 서비스로 바꿀 때는 PROVIDERS 에 함수를 추가하고 IMAGE_PROVIDER 로 고른다.
import { cfg as env } from './config.mjs';
import { ACTORS } from './actors.mjs';

// 목수 루소가 깎아 만든 목각인형: 배우 캐릭터가 정답을 흉내 내는 모습
// 실제 인물·캐릭터 이름은 보내지 않는다: candidate.as (설명)가 있으면 그것을 쓴다
export function buildPrompt(actorId, candidate, hasRefs) {
  const subject = candidate.as || `a ${candidate.en}`;
  return [
    'A cute hand-carved wooden figurine (a painted wooden toy doll) standing on a carpenter\'s workbench, like a product photo of a handmade toy.',
    `The figurine is a carving of ${ACTORS[actorId].look}.`,
    hasRefs ? 'Carve the character so its face, body shape and colors clearly match the attached reference image.' : '',
    `The carved character is dressed up as and acting out ${subject}: ${candidate.mimic}. The costume and props are carved from wood too, so it reads clearly as a cute kid in costume pretending to be ${subject}.`,
    'Made of light natural wood with visible wood grain and soft chisel marks, rounded chunky shapes, painted with simple matte colors that let the grain show through. Whole figurine visible, centered.',
    'Warm workshop lighting, softly blurred wooden workshop background with a few wood shavings on the bench. No text, letters, numbers, logos or watermarks anywhere.',
  ].filter(Boolean).join('\n');
}

// refs: [{ name, type, bytes }] 참고 이미지. extra: 요청에 더할 값 (예: { background: 'transparent', quality: 'medium' })
// 돌려주는 값: { bytes, type }
export async function openaiImage(prompt, refs, extra = {}) {
  const fields = { model: env('IMAGE_MODEL', 'gpt-image-2.5-sunburst'), prompt, quality: env('IMAGE_QUALITY', 'low'), size: '1024x1024', ...extra };
  const opts = { headers: { authorization: `Bearer ${env('OPENAI_API_KEY')}` }, signal: AbortSignal.timeout(3 * 60 * 1000) };

  let res;
  if (refs.length) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
    for (const r of refs) form.append('image[]', new Blob([r.bytes], { type: r.type }), r.name);
    res = await fetch('https://api.openai.com/v1/images/edits', { ...opts, method: 'POST', body: form });
  } else {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      ...opts,
      method: 'POST',
      headers: { ...opts.headers, 'content-type': 'application/json' },
      body: JSON.stringify({ ...fields, n: 1 }),
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('이미지 모델이 그림을 돌려주지 않았어요.');
  const format = fields.output_format || 'png';
  return { bytes: Buffer.from(b64, 'base64'), type: `image/${format}` };
}

const PROVIDERS = { openai: { ready: () => Boolean(env('OPENAI_API_KEY')), generate: openaiImage } };
const provider = () => PROVIDERS[env('IMAGE_PROVIDER', 'openai')] || PROVIDERS.openai;

export const imageReady = () => provider().ready();

// 정답 그림은 webp 로 받는다: PNG(약 1MB)보다 훨씬 작아서 화면이 빨리 뜨고,
// 무료 Workers 의 요청당 CPU 10ms 안에서 처리할 수 있다.
export async function generateImage(actorId, candidate, refs) {
  return provider().generate(buildPrompt(actorId, candidate, refs.length > 0), refs, { output_format: 'webp', output_compression: 80 });
}
