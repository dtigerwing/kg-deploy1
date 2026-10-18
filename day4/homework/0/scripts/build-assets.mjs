// 배포용 정적 자산 모으기 → dist/ (wrangler 가 배포 전에 자동으로 실행)
// 화면(public/), 루소 포즈(assets/russo/), 목공소 배경(assets/bg/), 배우 참고 그림(assets/characters/*.png)만 넣는다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../node/paths.mjs';

const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), dist, { recursive: true });
fs.cpSync(path.join(ROOT, 'assets', 'russo'), path.join(dist, 'assets', 'russo'), { recursive: true, filter: (f) => !f.endsWith('.DS_Store') });
fs.cpSync(path.join(ROOT, 'assets', 'bg'), path.join(dist, 'assets', 'bg'), { recursive: true, filter: (f) => !f.endsWith('.DS_Store') });
fs.mkdirSync(path.join(dist, 'assets', 'characters'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'characters')).filter((f) => f.endsWith('.png'))) {
  fs.copyFileSync(path.join(ROOT, 'assets', 'characters', f), path.join(dist, 'assets', 'characters', f));
}
console.log('dist/ 준비 완료:', fs.readdirSync(dist, { recursive: true }).filter((f) => f.includes('.')).length, '개 파일');
