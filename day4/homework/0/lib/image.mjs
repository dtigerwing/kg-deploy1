// 정답 이미지 생성. 다른 서비스로 바꿀 때는 PROVIDERS 에 함수를 추가하고 IMAGE_PROVIDER 로 고른다.
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.mjs';
import { ROOT } from './paths.mjs';
import { ACTORS } from './actors.mjs';

const IMG = /\.(png|jpe?g|webp)$/i;
const typeOf = (file) => (/\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg');

// assets/characters/<배우>.png + assets/style/ 그림체 참고 2장까지
export function referenceFiles(actorId) {
  const list = (dir) => {
    try {
      return fs.readdirSync(path.join(ROOT, dir)).filter((f) => IMG.test(f)).map((f) => path.join(ROOT, dir, f));
    } catch {
      return [];
    }
  };
  const actor = list('assets/characters').filter((f) => path.parse(f).name.toLowerCase() === actorId);
  return [...actor.slice(0, 1), ...list('assets/style').slice(0, 2)];
}

// 목수 루소가 깎아 만든 목각인형: 배우 캐릭터가 정답을 흉내 내는 모습
export function buildPrompt(actorId, candidate, hasRefs) {
  return [
    'A cute hand-carved wooden figurine (a painted wooden toy doll) standing on a carpenter\'s workbench, like a product photo of a handmade toy.',
    `The figurine is a carving of ${ACTORS[actorId].look}.`,
    hasRefs ? 'Carve the character so its face, body shape and colors clearly match the attached reference image.' : '',
    `The carved character is dressed up as and acting out a ${candidate.en}: ${candidate.mimic}. The costume and props are carved from wood too, so it reads clearly as a cute kid in costume pretending to be a ${candidate.en}.`,
    'Made of light natural wood with visible wood grain and soft chisel marks, rounded chunky shapes, painted with simple matte colors that let the grain show through. Whole figurine visible, centered.',
    'Warm workshop lighting, softly blurred wooden workshop background with a few wood shavings on the bench. No text, letters, numbers, logos or watermarks anywhere.',
  ].filter(Boolean).join('\n');
}

// extra: 요청에 더할 값 (예: { background: 'transparent', quality: 'medium' })
export async function openaiImage(prompt, refs, extra = {}) {
  const key = env('OPENAI_API_KEY');
  const model = env('IMAGE_MODEL', 'gpt-image-2.5-sunburst');
  const fields = { model, prompt, quality: env('IMAGE_QUALITY', 'low'), size: '1024x1024', ...extra };
  const opts = { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(3 * 60 * 1000) };

  let res;
  if (refs.length) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
    for (const f of refs) form.append('image[]', new Blob([fs.readFileSync(f)], { type: typeOf(f) }), path.basename(f));
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
  return Buffer.from(b64, 'base64');
}

const PROVIDERS = { openai: { ready: () => Boolean(env('OPENAI_API_KEY')), generate: openaiImage } };
const provider = () => PROVIDERS[env('IMAGE_PROVIDER', 'openai')] || PROVIDERS.openai;

export const imageReady = () => provider().ready();

export async function generateImage(actorId, candidate) {
  const refs = referenceFiles(actorId);
  return provider().generate(buildPrompt(actorId, candidate, refs.length > 0), refs);
}
