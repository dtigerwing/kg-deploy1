// 테스트 빌드(test/) → 정식 빌드(루트)로 올리기
// 사용: npm run promote              미리보기 (무엇이 바뀌는지만 보여 줌)
//       npm run promote -- --apply   실제로 덮어쓰기 → 그다음 git commit + push 하면 정식 배포
//
// 하는 일
// · test/ 의 파일을 같은 경로로 루트에 복사 (test/index.html → index.html, test/js/main.js → js/main.js ...)
// · 주소의 /test/ 접두어를 / 로 바꿈 (예: /test/styles.css → /styles.css)
// · <!-- test-only:start --> ~ <!-- test-only:end --> 블록(noindex, 테스트 배지)을 지움 (.css/.js 는 /* test-only:start */ ~ /* test-only:end */)
// · test/ 안의 폴더(js/ 등)와 같은 루트 폴더에서, test/ 에 없는 파일은 지움 (그대로 맞춤)
// 되돌리기: git 으로 (git restore . 또는 배포 후라면 git revert)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST = path.join(ROOT, 'test');
const apply = process.argv.includes('--apply');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  if (d.name.startsWith('.')) return [];
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});

function transform(rel, buf) {
  const ext = path.extname(rel);
  if (!['.html', '.css', '.js', '.mjs', '.json'].includes(ext)) return buf;
  let s = buf.toString('utf8');
  s = s.replace(/[ \t]*<!-- test-only:start[\s\S]*?<!-- test-only:end -->[ \t]*\n?/g, '');
  s = s.replace(/[ \t]*\/\* test-only:start[\s\S]*?\/\* test-only:end \*\/[ \t]*\n?/g, '');
  s = s.replace(/(["'(`])\/test\//g, '$1/');
  return Buffer.from(s);
}

const files = walk(TEST).map((abs) => path.relative(TEST, abs));
const plan = [];
for (const rel of files) {
  const next = transform(rel, fs.readFileSync(path.join(TEST, rel)));
  const target = path.join(ROOT, rel);
  const cur = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (!cur) plan.push({ kind: '새 파일', rel, next });
  else if (!cur.equals(next)) plan.push({ kind: '바뀜', rel, next });
  if (/\/test\//.test(next.toString('utf8')) && ['.html', '.css', '.js'].includes(path.extname(rel))) {
    console.warn(`⚠️  ${rel} 에 아직 /test/ 주소가 남아 있어요. 확인해 주세요.`);
  }
}

// test/ 안 폴더와 같은 루트 폴더에서 test/ 에 없는 파일
const testDirs = new Set(files.filter((f) => f.includes(path.sep)).map((f) => f.split(path.sep)[0]));
for (const dir of testDirs) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of walk(abs)) {
    const rel = path.relative(ROOT, f);
    if (!files.includes(rel)) plan.push({ kind: '지움', rel });
  }
}

if (!plan.length) {
  console.log('정식 빌드가 이미 테스트 빌드와 같아요. 바꿀 것이 없어요.');
  process.exit(0);
}

console.log(`${apply ? '정식 빌드에 반영합니다' : '미리보기 — 정식 빌드에서 바뀔 파일'}:`);
for (const p of plan) console.log(`  ${p.kind.padEnd(4)}  ${p.rel}`);

if (!apply) {
  console.log('\n실제로 반영하려면: npm run promote -- --apply');
  process.exit(0);
}

for (const p of plan) {
  const target = path.join(ROOT, p.rel);
  if (p.kind === '지움') fs.rmSync(target);
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, p.next);
  }
}
console.log('\n완료. git diff 로 확인한 뒤 commit + push 하면 정식 배포돼요.');
