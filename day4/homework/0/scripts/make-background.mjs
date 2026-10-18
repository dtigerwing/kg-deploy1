// 목공소 배경 그림 만들기 (개발할 때 한 번): node scripts/make-background.mjs
// assets/bg/workshop.jpg 로 저장. 화면(.scene)이 배경으로 깔고, 아래쪽은 테이블이 가린다.
// 참고 사진은 보내지 않는다 (실제 사람이 나온 사진이라). 분위기만 글로 설명한다.
import '../node/env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../node/paths.mjs';
import { openaiImage } from '../lib/image.mjs';

const prompt = [
  'A flat vector background illustration for a cozy kids\' game, in the KIGLE (Cocobi) cartoon style: almost no shadows, simple rounded shapes, warm cheerful colors, clean lines.',
  'Scene: the inside of a small, charming woodworking studio seen straight from the front, eye level. A pale blue-gray wall filled with wide light-wood shelves packed with handmade wooden goods: round and paddle-shaped cutting boards, small boxes, trays, wooden spoons, little clocks, wooden toys, a carved wooden Christmas tree, framed wood-sample boards, jars, small potted plants.',
  'Two warm glowing pendant lamps hang from the ceiling (one brass with a ribbed glass shade, one slim amber tube). A small wooden pegboard with saws, hammers and chisels on one side.',
  'Keep the middle of the wall a little calmer and less busy (a character will stand in front of it). The bottom fifth can be a plain wooden wall base (it will be covered by a counter).',
  'No people, no characters, no animals. No readable text, letters, numbers or logos anywhere (signs are blank wooden plaques).',
].join('\n');

const started = Date.now();
const { bytes } = await openaiImage(prompt, [], { size: '1536x1024', quality: 'medium', output_format: 'jpeg', output_compression: 85 });
fs.mkdirSync(path.join(ROOT, 'assets', 'bg'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'assets', 'bg', 'workshop.jpg'), bytes);
console.log(`assets/bg/workshop.jpg ${Math.round(bytes.length / 1024)}KB, ${Math.round((Date.now() - started) / 1000)}초`);
