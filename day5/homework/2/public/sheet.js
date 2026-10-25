// 일정표 탭의 격자(행 × 열 문자열 배열)를 일정 데이터로 바꾼다.
// 격자는 Sheets API values.get 결과와 같은 모양이라 엑셀 변환본과 실제 시트에 똑같이 쓴다.

const DOW = ['월', '화', '수', '목', '금'];
const HOURS_RE = /(\d+(?:\.\d+)?)\s*시[간긴]/g; // '시긴' 오타도 받음

export function parseSheet(values, sheetName) {
  const at = (r, c) => ((values[r] || [])[c] || '').trim();
  const rowIndex = (test) => values.findIndex((row, r) => r < 12 && row.some((v) => test(v.trim())));
  const warnings = [];

  const year = Number((sheetName.match(/\d{4}/) || [])[0]);
  const monthRow = rowIndex((v) => /^\d+월$/.test(v));
  const weekRow = rowIndex((v) => /^\d주$/.test(v));
  const dowRow = rowIndex((v) => v === '월');
  const dateRow = dowRow + 1;
  const nameCol = values[dateRow].findIndex((v) => v.trim() === '이름');
  const slotCol = values[dateRow].findIndex((v) => v.trim() === '프로젝트');
  if ([monthRow, weekRow, dowRow, nameCol, slotCol].some((i) => i < 0)) {
    throw new Error('일정표 머리글(월/주/요일/이름/프로젝트)을 찾지 못했습니다.');
  }

  // 왼쪽으로 가장 가까운 머리글 값
  const labelLeftOf = (row, c, test) => {
    for (let i = c; i >= 0; i--) if (test(at(row, i))) return { col: i, text: at(row, i) };
    return null;
  };

  // 날짜 열: 머리글 숫자에 오타가 있어서(예: 154, 0) 요일 순서로 날짜를 이어 붙이고 숫자는 확인용으로만 쓴다
  const days = [];
  let prev = null;
  values[dowRow].forEach((v, col) => {
    const dow = DOW.indexOf(v.trim());
    if (dow < 0) return;
    const month = Number(labelLeftOf(monthRow, col, (t) => /^\d+월$/.test(t)).text.replace('월', ''));
    const week = Number(labelLeftOf(weekRow, col, (t) => /^\d주$/.test(t)).text.replace('주', ''));
    const headerDay = Number(at(dateRow, col));
    let date;
    if (!prev) {
      date = utc(year, headerDay > 20 && week === 1 ? month - 2 : month - 1, headerDay);
    } else {
      date = addDays(prev, 1);
      while (weekday(date) !== dow) date = addDays(date, 1);
      for (let n = 0; n < 2 && headerDay >= 1 && headerDay <= 31 && date.getUTCDate() !== headerDay; n++) {
        const next = addDays(date, 7);
        if (next.getUTCDate() === headerDay) date = next;
      }
    }
    if (date.getUTCDate() !== headerDay) {
      warnings.push(`${month}월 ${week}주 ${v.trim()}요일 날짜 칸 "${at(dateRow, col)}" → ${iso(date)}로 계산`);
    }
    prev = date;
    days.push({ date: iso(date), dow: v.trim(), year, month, week, weekKey: `${year}-${month}-${week}`, col });
  });

  // 주별 "작업 및 이슈" 열
  const summaryCols = {};
  values[weekRow].forEach((v, col) => {
    if (v.trim() !== '작업 및 이슈') return;
    const label = labelLeftOf(weekRow, col, (t) => /^\d주$/.test(t));
    const day = days.find((d) => d.col >= label.col);
    if (day) summaryCols[day.weekKey] = col;
  });

  // 사람 블록: 이름 칸과 '프로젝트' 칸이 같은 행에 있으면 새 사람
  const people = [];
  for (let r = dateRow + 1; r < values.length; r++) {
    const slot = at(r, slotCol);
    if (slot !== '프로젝트' && slot !== '기타일정') continue;
    const name = at(r, nameCol);
    if (name && slot === '프로젝트' && !/^\d+$/.test(name)) {
      const title = at(r - 1, nameCol);
      people.push({ name, title: /^\d+$/.test(title) ? '' : title, statusRow: r - 2, workRow: r - 1, slots: [] });
    }
    const person = people[people.length - 1];
    if (person) person.slots.push({ row: r, kind: slot === '프로젝트' ? 'project' : 'etc' });
  }

  const entries = [];
  const dayInfo = {};
  const weekNotes = {};
  for (const p of people) {
    for (const d of days) {
      const status = at(p.statusRow, d.col + 1);
      const work = at(p.workRow, d.col);
      dayInfo[`${p.name}|${d.date}`] = { status: status === '-' ? '' : status, work: work === '' ? null : Number(work) };
      p.slots.forEach((s, i) => {
        const text = at(s.row, d.col);
        if (text) entries.push({ person: p.name, date: d.date, kind: s.kind, slot: i, text, ...parseCell(text, s.kind) });
      });
    }
    for (const [weekKey, col] of Object.entries(summaryCols)) {
      const text = p.slots.map((s) => at(s.row, col)).filter(Boolean).join('\n');
      if (text) weekNotes[`${p.name}|${weekKey}`] = text;
    }
  }

  return {
    sheet: sheetName,
    people: people.map(({ name, title }) => ({ name, title })),
    days,
    entries,
    dayInfo,
    weekNotes,
    warnings,
  };
}

// 칸 하나: 첫 줄이 프로젝트 이름, '시간'이 붙은 숫자를 모두 더해 작업 시간으로 본다
export function parseCell(text, kind) {
  let hours = 0;
  for (const m of text.matchAll(HOURS_RE)) hours += Number(m[1]);
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  let project = '기타일정';
  if (kind === 'project') {
    // "할로윈 기획전달회의 1시간", "안전히어로 업데이트(1시간)" → 숫자·괄호 앞까지만
    const first = lines[0] || '';
    project = first.split(/\s+[\d(+]|\(/)[0].replace(/[\s,]+$/, '');
    if (!project || first.startsWith('-')) project = '(미분류)';
  }
  return { project, hours };
}

export const projectKey = (name) => name.replace(/\s+/g, '');

function utc(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}
function addDays(date, n) {
  return new Date(date.getTime() + n * 86400000);
}
function weekday(date) {
  return (date.getUTCDay() + 6) % 7; // 월=0
}
function iso(date) {
  return date.toISOString().slice(0, 10);
}
