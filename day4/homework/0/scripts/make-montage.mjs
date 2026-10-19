// 목각인형 만드는 몽타주 그림 만들기 (개발할 때 한 번): node scripts/make-montage.mjs [이름...]
// assets/montage/<이름>.(jpg|webp) 로 저장. 이름을 적으면 그것만 다시 만든다.
// 화면(public/app.js 의 montage)이 영화처럼 클로즈업 컷을 이어 붙인다: 공구함 → 톱질 → 끌질 → 사포질 → 색칠 → 니스.
import fs from 'node:fs';
import path from 'node:path';
import '../node/env.mjs'; // .env 를 설정값으로 연결
import { ROOT } from '../node/paths.mjs';
import { loadRefs } from '../node/refs.mjs';
import { openaiImage } from '../lib/image.mjs';

const STYLE = 'A flat vector illustration in the KIGLE (Cocobi) kids cartoon style: almost no shadows, simple rounded shapes, bright warm colors, clean lines.';
const NO_TEXT = 'No text, letters, numbers, labels or logos anywhere.';
const SPRITE = 'Single object, centered with a small margin, transparent background.';
const PAW = "Russo's chubby beige dinosaur hand (match the skin color of the character in the attached reference image), with a short white shirt cuff at the wrist";

// 장면 그림 (불투명, 가로로 넓게)
const SCENE = { size: '1536x1024', output_format: 'jpeg', output_compression: 82 };
// 테이블 위 물건과 손 (배경 투명)
const OBJECT = { size: '1024x1024', background: 'transparent', output_format: 'webp', output_compression: 82 };

// figure: 같은 인형의 단계별 그림이라 blank 를 참고로 고쳐 그린다 (모양·자리를 맞추려고)
const ASSETS = {
  bench: {
    opts: SCENE,
    prompt: 'A cinematic close-up of a carpenter\'s wooden workbench top seen from a low angle, warm golden lamp light from above, the dark cozy workshop behind it softly blurred with round warm bokeh lights and blurry shelves of tools and paint jars. The center of the bench is empty (objects will be placed there).',
  },
  toolbox: {
    opts: SCENE,
    prompt: 'A cinematic close-up of an old wooden carpenter\'s tool chest with several small drawers pulled open, neatly filled with carving chisels, small saws, a wooden mallet, folded sandpaper, paint brushes and small glass paint jars. Warm lamp light, the background softly blurred and dark.',
  },
  block: { opts: OBJECT, prompt: `A single rectangular block of light natural wood standing upright, about one and a half times as tall as it is wide, visible wood grain on the front, front view. ${SPRITE}` },
  blank: {
    opts: OBJECT,
    prompt: `A cute hand-carved wooden figurine of a small round kid character with a big round head, short arms and short legs, smooth sanded light natural wood with visible grain, completely unpainted, standing, front view, its body about one and a half times as tall as it is wide. ${SPRITE}`,
  },
  rough: {
    opts: OBJECT,
    figure: true,
    prompt: `Redraw the attached wooden figurine at an earlier, unfinished stage: roughly carved out of a wooden block with big flat chisel facets and chunky blocky shapes, no face and no small details yet, unpainted light wood. Keep the same overall size, position and silhouette. ${SPRITE}`,
  },
  painted: {
    opts: OBJECT,
    figure: true,
    prompt: `Redraw the attached wooden figurine now painted with simple bright matte colors: a red shirt, blue pants, brown shoes, simple black dot eyes, rosy cheeks and a small smile, with the wood grain still showing through the paint. Keep exactly the same shape, size and position. ${SPRITE}`,
  },
  jars: { opts: OBJECT, prompt: `A neat row of five small round glass paint jars with wooden screw lids, each filled with a bright paint (red, yellow, blue, green, pink), front view, blank jars without labels. ${SPRITE}` },
  saw: { opts: OBJECT, paw: true, prompt: `${PAW}, entering from the right edge of the image and gripping the wooden handle of a small hand saw whose blade points to the left. ${SPRITE}` },
  chisel: { opts: OBJECT, paw: true, prompt: `${PAW}, entering from the left edge of the image and holding a wood carving chisel pointing down-right, the sharp tip at the lower right. ${SPRITE}` },
  mallet: { opts: OBJECT, paw: true, prompt: `${PAW}, entering from the right edge of the image and holding a round wooden carving mallet by its handle, the mallet head at the upper left. ${SPRITE}` },
  sandpaper: { opts: OBJECT, paw: true, prompt: `${PAW}, entering from the right edge of the image and pressing a folded piece of tan sandpaper with its fingertips. ${SPRITE}` },
  brush: { opts: OBJECT, paw: true, prompt: `${PAW}, entering from the right edge of the image and holding a small round paint brush whose tip, wet with red paint, points to the lower left. ${SPRITE}` },
};

const russo = loadRefs('russo').slice(0, 1);
const dir = path.join(ROOT, 'assets', 'montage');
fs.mkdirSync(dir, { recursive: true });
const file = (name) => path.join(dir, `${name}.${ASSETS[name].opts.output_format === 'jpeg' ? 'jpg' : 'webp'}`);

async function make(name) {
  const a = ASSETS[name];
  const refs = a.paw ? russo : a.figure ? [{ name: 'blank.webp', type: 'image/webp', bytes: fs.readFileSync(file('blank')) }] : [];
  const started = Date.now();
  const { bytes } = await openaiImage([STYLE, a.prompt, NO_TEXT].join('\n'), refs, { quality: 'medium', ...a.opts });
  fs.writeFileSync(file(name), bytes);
  console.log(`${name} ${Math.round(bytes.length / 1024)}KB ${Math.round((Date.now() - started) / 1000)}초`);
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ASSETS);
for (const name of wanted) if (!ASSETS[name]) console.error(`모르는 그림: ${name}`);
const first = wanted.filter((n) => ASSETS[n] && !ASSETS[n].figure);
const after = wanted.filter((n) => ASSETS[n]?.figure);
await Promise.all(first.map((n) => make(n).catch((e) => console.error(`${n} 실패:`, e.message))));
// rough·painted 는 blank 를 보고 그린다
await Promise.all(after.map((n) => make(n).catch((e) => console.error(`${n} 실패:`, e.message))));
