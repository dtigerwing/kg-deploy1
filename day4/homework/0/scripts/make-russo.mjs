// 루소 포즈 6장 만들기 (클로즈업 5장 + 창고 뒤지기 전신 1장) (개발할 때 한 번): node scripts/make-russo.mjs [포즈...]
// assets/characters/russo.png 를 참고해서 assets/russo/<포즈>.png 로 저장. 포즈를 적으면 그것만 다시 만든다.
import fs from 'node:fs';
import path from 'node:path';
import '../node/env.mjs'; // .env 를 설정값으로 연결
import { ROOT } from '../node/paths.mjs';
import { loadRefs } from '../node/refs.mjs';
import { RUSSO_LOOK } from '../lib/actors.mjs';
import { openaiImage } from '../lib/image.mjs';

// 테이블 건너편에 마주 앉은 것처럼 가까이 (허리 위). 테이블은 화면(CSS)이 앞에 그린다.
const POSES = {
  basic: 'smiling warmly and talking, one hand raised in a friendly gesture',
  think: 'tilting his head with one hand on his chin, eyes looking up, thinking hard about a guess',
  happy: 'beaming with a big open-mouthed smile and giving a thumbs-up',
  sweat: 'flustered with an extra big sweat drop, scratching the back of his head with an awkward smile',
  making: 'looking down at his hands and happily carving, holding a wooden mallet raised in one hand and a chisel in the other, a few wood shavings flying',
  // 창고 뒤지기: 배경 여기저기를 돌아다니는 전신 그림 (테이블 뒤가 아님)
  search: 'walking to the side while searching for something, holding a small flashlight forward in one hand, peering curiously, one leg lifted mid-step',
};
const FULL_BODY = new Set(['search']);

const refs = loadRefs('russo');
if (!refs.length) {
  console.error('assets/characters/russo.png 가 없어요.');
  process.exit(1);
}
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(POSES);
fs.mkdirSync(path.join(ROOT, 'assets', 'russo'), { recursive: true });

const prompt = (pose) => [
  'A flat vector character illustration in the KIGLE (Cocobi) kids cartoon style: almost no shadows, simple rounded shapes, bright colors.',
  `Character: ${RUSSO_LOOK}. Match his face, colors and outfit exactly to the attached reference image.`,
  FULL_BODY.has(pose)
    ? 'Framing: his whole body from head to boots (short legs, brown work boots), seen from the side at a three-quarter angle, facing right, small margin around him.'
    : 'Framing: a close-up from the waist up, at eye level, facing the viewer as if he is sitting right across a table and chatting with them. His body is cut off at the waist by the bottom edge of the image. Do not draw a table.',
  `Pose: ${POSES[pose]}.`,
  'Single character, centered, transparent background. No text, letters or logos.',
].join('\n');

await Promise.all(
  wanted.map(async (pose) => {
    if (!POSES[pose]) return console.error(`모르는 포즈: ${pose}`);
    const started = Date.now();
    const { bytes } = await openaiImage(prompt(pose), refs, { background: 'transparent', quality: 'medium' });
    fs.writeFileSync(path.join(ROOT, 'assets', 'russo', `${pose}.png`), bytes);
    console.log(`${pose} ${Math.round((Date.now() - started) / 1000)}초`);
  }),
);
