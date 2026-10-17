// 루소 포즈 5장 만들기 (개발할 때 한 번): node scripts/make-russo.mjs [포즈...]
// assets/characters/russo.png 를 참고해서 assets/russo/<포즈>.png 로 저장. 포즈를 적으면 그것만 다시 만든다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/paths.mjs';
import { RUSSO_LOOK } from '../lib/actors.mjs';
import { openaiImage } from '../lib/image.mjs';

// 테이블 건너편에 마주 앉은 것처럼 가까이 (허리 위). 테이블은 화면(CSS)이 앞에 그린다.
const POSES = {
  basic: 'smiling warmly and talking, one hand raised in a friendly gesture',
  think: 'tilting his head with one hand on his chin, eyes looking up, thinking hard about a guess',
  happy: 'beaming with a big open-mouthed smile and giving a thumbs-up',
  sweat: 'flustered with an extra big sweat drop, scratching the back of his head with an awkward smile',
  making: 'looking down at his hands and happily carving, holding a wooden mallet raised in one hand and a chisel in the other, a few wood shavings flying',
};

const ref = path.join(ROOT, 'assets', 'characters', 'russo.png');
if (!fs.existsSync(ref)) {
  console.error('assets/characters/russo.png 가 없어요.');
  process.exit(1);
}
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(POSES);
fs.mkdirSync(path.join(ROOT, 'assets', 'russo'), { recursive: true });

const prompt = (pose) => [
  'A flat vector character illustration in the KIGLE (Cocobi) kids cartoon style: almost no shadows, simple rounded shapes, bright colors.',
  `Character: ${RUSSO_LOOK}. Match his face, colors and outfit exactly to the attached reference image.`,
  'Framing: a close-up from the waist up, at eye level, facing the viewer as if he is sitting right across a table and chatting with them. His body is cut off at the waist by the bottom edge of the image. Do not draw a table.',
  `Pose: ${POSES[pose]}.`,
  'Single character, centered, transparent background. No text, letters or logos.',
].join('\n');

await Promise.all(
  wanted.map(async (pose) => {
    if (!POSES[pose]) return console.error(`모르는 포즈: ${pose}`);
    const started = Date.now();
    const png = await openaiImage(prompt(pose), [ref], { background: 'transparent', quality: 'medium' });
    fs.writeFileSync(path.join(ROOT, 'assets', 'russo', `${pose}.png`), png);
    console.log(`${pose} ${Math.round((Date.now() - started) / 1000)}초`);
  }),
);
