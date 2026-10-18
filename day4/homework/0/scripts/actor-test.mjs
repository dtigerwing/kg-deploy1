// 배우 고르기 분포 시험 (개발용): 정답 여러 개에 배우를 차례로 골라 보고, 배우별로 몇 번 나왔는지 센다
//   node scripts/actor-test.mjs   (Jev 키 필요) → .data/actor-test.log
import '../node/env.mjs';
import { chooseActor } from '../lib/jev.mjs';
import { ACTORS } from '../lib/actors.mjs';
import { TOPICS } from '../lib/topics.mjs';

const picks = [];
const counts = {};
const sample = TOPICS.flatMap((t) => t.data.candidates.filter((_, i) => i % 6 === 0).map((c) => ({ t, c })));
for (const { t, c } of sample) {
  const p = await chooseActor(t.name, c, counts);
  counts[p.id] = (counts[p.id] || 0) + 1;
  picks.push(`${c.name}→${ACTORS[p.id].name}${p.by === 'jev' ? '' : '(규칙)'}`);
}
console.log(picks.join(', '));
console.log('\n배우별:', Object.entries(ACTORS).map(([id, a]) => `${a.name} ${counts[id] || 0}`).join(' / '), `(정답 ${sample.length}개)`);
