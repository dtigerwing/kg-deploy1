// 로컬 전용: 그림 참고 이미지 읽기. assets/characters/<배우>.png + assets/style/ 그림체 참고 2장까지
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';

const IMG = /\.(png|jpe?g|webp)$/i;
const typeOf = (file) => (/\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg');

function list(dir) {
  try {
    return fs.readdirSync(path.join(ROOT, dir)).filter((f) => IMG.test(f)).map((f) => path.join(ROOT, dir, f));
  } catch {
    return [];
  }
}

// name 이 'russo' 같은 배우 id. [{ name, type, bytes }]
export function loadRefs(name) {
  const actor = list('assets/characters').filter((f) => path.parse(f).name.toLowerCase() === name);
  return [...actor.slice(0, 1), ...list('assets/style').slice(0, 2)].map((f) => ({ name: path.basename(f), type: typeOf(f), bytes: fs.readFileSync(f) }));
}
