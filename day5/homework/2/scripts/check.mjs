// 변환 결과 점검: node scripts/check.mjs [grid.json 경로]
import { readFileSync } from 'node:fs';
import { parseSheet } from '../public/sheet.js';

const { sheet, values } = JSON.parse(readFileSync(process.argv[2] || 'public/data/grid.json', 'utf8'));
const m = parseSheet(values, sheet);

console.log(`${m.sheet}: ${m.people.length}명, ${m.days.length}일 (${m.days[0].date} ~ ${m.days.at(-1).date})`);
console.log('사람:', m.people.map((p) => p.name + (p.title ? `(${p.title})` : '')).join(', '));
console.log(`일정 칸 ${m.entries.length}개, 주간 메모 ${Object.keys(m.weekNotes).length}개`);

const noHours = m.entries.filter((e) => e.hours === 0);
console.log(`시간 표기가 없는 칸 ${noHours.length}개`);
for (const e of noHours.slice(0, 8)) console.log('  -', e.person, e.date, JSON.stringify(e.text.slice(0, 50)));

const statuses = {};
for (const v of Object.values(m.dayInfo)) if (v.status) statuses[v.status] = (statuses[v.status] || 0) + 1;
console.log('근태:', statuses);
console.log('경고:', m.warnings.length ? m.warnings : '없음');
