import { parseSheet, projectKey } from './sheet.js';
import { hasClientId, parseLink, listTabs, readTab } from './google.js';

const UNITS = [['day', '일'], ['week', '주'], ['month', '월'], ['year', '년'], ['range', '기간 지정']];
const LINK_KEY = 'schedule-sheet-link';
// people가 비어 있으면 전체. range일 때는 anchor ~ end
const state = { unit: 'week', anchor: '', end: '', people: [] };
let model, periods, byPersonDate;
let source = null; // { kind: 'google', id, title, tabs, tab, at } | { kind: 'local', ... }

const $ = (id) => document.getElementById(id);

function init() {
  $('link').value = store.get(LINK_KEY) || '';
  if (!hasClientId()) {
    $('connect-btn').disabled = true;
    connectMsg('아직 구글 로그인 설정 전이에요. public/config.js에 OAuth 클라이언트 ID를 넣어 주세요 (README 참고).');
  }
  $('connect-form').onsubmit = (e) => {
    e.preventDefault();
    connect($('link').value.trim());
  };
  fetch('data/grid.json', { method: 'HEAD' }).then((r) => { $('local').hidden = !r.ok; }).catch(() => {});
  $('local').onclick = () => loadLocal().catch((err) => connectMsg(err.message));

  $('change-link').onclick = showConnect;
  $('reload').onclick = () => withError(source.kind === 'google' ? loadTab(source.tab) : loadLocal());
  $('tab').onchange = (e) => withError(loadTab(e.target.value));

  $('units').innerHTML = UNITS.map(([u, t]) => `<button role="tab" data-unit="${u}">${t}</button>`).join('');
  $('units').onclick = (e) => {
    const unit = e.target.dataset.unit;
    if (!unit || unit === state.unit) return;
    // 기간 지정으로 바꾸면 보던 기간(예: 이번 달)을 그대로 시작~끝으로
    if (unit === 'range') {
      const { days } = currentPeriod();
      go({ unit, anchor: days[0].date, end: days.at(-1).date });
    } else go({ unit });
  };
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('today').onclick = () => go({ anchor: todayInData() });
  $('start').onchange = $('end').onchange = () => {
    const [a, b] = [$('start').value, $('end').value].sort();
    if (a && b) go({ anchor: a, end: b });
  };
  $('people').onclick = (e) => {
    const name = e.target.closest('[data-person]')?.dataset.person;
    if (name !== undefined) togglePerson(name);
  };
  $('view').onclick = (e) => {
    const t = e.target.closest('[data-go]');
    if (t) go(JSON.parse(t.dataset.go));
  };
  window.onhashchange = () => {
    if (!model) return;
    readHash();
    render();
  };
}

// ── 시트 불러오기 ─────────────────────────────────
async function connect(link) {
  const parsed = parseLink(link);
  if (!parsed) return connectMsg('구글 시트 링크가 아니에요. 시트 주소창의 링크를 그대로 붙여넣으세요.');
  $('connect-btn').disabled = true;
  connectMsg('구글 로그인 후 시트를 읽는 중…');
  try {
    const { title, tabs } = await listTabs(parsed.id);
    store.set(LINK_KEY, link);
    source = { kind: 'google', id: parsed.id, title, tabs };
    // 링크가 가리키는 탭(gid)부터, 없으면 첫 탭
    await loadTab((tabs.find((t) => t.id === parsed.gid) || tabs[0]).title);
    connectMsg('');
  } catch (err) {
    connectMsg(err.message);
  } finally {
    $('connect-btn').disabled = false;
  }
}

async function loadTab(title) {
  const values = await readTab(source.id, title);
  source.tab = title;
  setModel(values, title);
}

async function loadLocal() {
  const res = await fetch('data/grid.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('data/grid.json이 없습니다. scripts/xlsx_to_grid.py로 먼저 변환하세요.');
  const { sheet, values } = await res.json();
  source = { kind: 'local', title: '엑셀 변환 파일', tabs: [{ title: sheet }], tab: sheet };
  setModel(values, sheet);
}

function setModel(values, tab) {
  try {
    model = parseSheet(values, tab);
  } catch {
    throw new Error(`"${tab}" 탭은 일정표 형식이 아니에요. 다른 탭을 골라 주세요.`);
  }
  source.at = new Date();
  byPersonDate = new Map();
  for (const e of model.entries) {
    const k = `${e.person}|${e.date}`;
    if (!byPersonDate.has(k)) byPersonDate.set(k, []);
    byPersonDate.get(k).push(e);
  }
  periods = buildPeriods(model.days);

  $('sheet-title').textContent = source.title;
  $('tab').innerHTML = source.tabs.map((t) => `<option ${t.title === tab ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
  $('tab').disabled = source.tabs.length < 2;
  $('start').min = $('end').min = model.days[0].date;
  $('start').max = $('end').max = model.days.at(-1).date;
  $('connect').hidden = true;
  $('app').hidden = false;
  $('sheet-info').hidden = false;
  $('error').hidden = true;

  readHash();
  render();
}

function showConnect() {
  $('connect').hidden = false;
  $('app').hidden = true;
  $('sheet-info').hidden = true;
  $('link').focus();
}

function withError(promise) {
  $('error').hidden = true;
  promise.catch((err) => {
    $('error').textContent = err.message;
    $('error').hidden = false;
  });
}

function connectMsg(text) {
  $('connect-msg').textContent = text;
}

// ── 상태 (주소 #단위/날짜[~끝]/이름,이름) ─────────
function readHash() {
  const [unit, dates = '', names = ''] = decodeURIComponent(location.hash.slice(1)).split('/');
  const [a, b] = dates.split('~');
  const inData = (d) => model.days.some((x) => x.date === d);
  state.unit = UNITS.some(([u]) => u === unit) ? unit : 'week';
  state.anchor = /^\d{4}-\d\d-\d\d$/.test(a) ? a : todayInData();
  state.end = /^\d{4}-\d\d-\d\d$/.test(b) ? b : state.anchor;
  if (state.unit !== 'range' && !inData(state.anchor)) state.anchor = todayInData();
  state.people = names.split(',').filter((n) => model.people.some((p) => p.name === n));
}

function go(patch) {
  Object.assign(state, patch);
  const dates = state.unit === 'range' ? `${state.anchor}~${state.end}` : state.anchor;
  location.hash = [state.unit, dates, state.people.join(',')].join('/');
}

function togglePerson(name) {
  if (!name) return go({ people: [] });
  const set = new Set(state.people);
  if (set.has(name)) set.delete(name);
  else set.add(name);
  const people = model.people.map((p) => p.name).filter((n) => set.has(n));
  go({ people: people.length === model.people.length ? [] : people });
}

function step(dir) {
  const list = periods[state.unit];
  const next = list[currentIndex() + dir];
  if (next) go({ anchor: next.days[0].date });
}

function currentIndex() {
  const i = periods[state.unit].findIndex((p) => p.days.some((d) => d.date === state.anchor));
  return i >= 0 ? i : 0;
}

function currentPeriod() {
  if (state.unit !== 'range') return periods[state.unit][currentIndex()];
  const days = model.days.filter((d) => d.date >= state.anchor && d.date <= state.end);
  return { label: `${longDate(state.anchor)} ~ ${longDate(state.end)}`, days };
}

function todayInData() {
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const past = model.days.filter((d) => d.date <= today);
  return (past.at(-1) || model.days[0]).date;
}

function buildPeriods(days) {
  const group = (keyOf, labelOf) => {
    const map = new Map();
    for (const d of days) {
      const k = keyOf(d);
      if (!map.has(k)) map.set(k, { label: labelOf(d), days: [] });
      map.get(k).days.push(d);
    }
    return [...map.values()];
  };
  const week = group((d) => d.weekKey, (d) => `${d.year}년 ${d.month}월 ${d.week}주`);
  for (const p of week) p.label += ` (${md(p.days[0].date)} ~ ${md(p.days.at(-1).date)})`;
  return {
    day: days.map((d) => ({ label: `${d.year}년 ${md(d.date)} (${d.dow})`, days: [d] })),
    week,
    month: group((d) => `${d.year}-${d.month}`, (d) => `${d.year}년 ${d.month}월`),
    year: group((d) => d.year, (d) => `${d.year}년`),
  };
}

// ── 그리기 ────────────────────────────────────────
function render() {
  const period = currentPeriod();
  const people = state.people.length ? model.people.filter((p) => state.people.includes(p.name)) : model.people;
  const isRange = state.unit === 'range';

  $('people').innerHTML = `<button data-person="" aria-pressed="${!state.people.length}">전체</button>`
    + model.people.map((p) => `<button data-person="${esc(p.name)}" aria-pressed="${state.people.includes(p.name)}">${esc(p.name)}</button>`).join('');
  for (const b of $('units').children) b.setAttribute('aria-selected', b.dataset.unit === state.unit);
  $('nav').hidden = isRange;
  $('range').hidden = !isRange;
  if (isRange) {
    $('start').value = state.anchor;
    $('end').value = state.end;
  } else {
    const idx = currentIndex();
    $('prev').disabled = idx === 0;
    $('next').disabled = idx === periods[state.unit].length - 1;
  }
  $('label').textContent = period.label;

  const all = people.flatMap((p) => entriesOf(p.name, period.days));
  const who = state.people.length ? state.people.join(', ') : '전체';
  $('sum').textContent = `${who} · ${isRange ? `일정표 날짜 ${period.days.length}일 · ` : ''}${hoursText(sumHours(all))}`;

  if (!period.days.length) {
    $('view').innerHTML = '<p class="empty">이 기간에는 이 탭의 날짜가 없어요. 시작일과 종료일을 확인하거나 다른 탭을 골라 주세요.</p>';
  } else {
    const views = { day: renderDay, week: renderWeek, month: renderMonth, year: renderYear, range: renderRange };
    $('view').innerHTML = views[state.unit](people, period);
  }
  renderSource();
}

// ── 일 ───────────────────────────────────────────
function renderDay(people, { days: [day] }) {
  return `<div class="cards">${people.map((p) => {
    const list = entriesOf(p.name, [day]);
    return `<section class="card">
      ${cardHeader(p, sumHours(list), statusChip(p.name, day.date))}
      ${list.length ? list.map(entryHtml).join('') : '<p class="empty">기록 없음</p>'}
    </section>`;
  }).join('')}</div>`;
}

// ── 주 ───────────────────────────────────────────
function renderWeek(people, { days }) {
  const weekKey = days[0].weekKey;
  const today = new Date().toLocaleDateString('sv-SE');
  const head = days.map((d) => `<th class="day ${d.date === today ? 'today' : ''}" data-go='${goAttr({ unit: 'day', anchor: d.date })}'>${d.dow} ${md(d.date)}</th>`).join('');
  const rows = people.map((p) => {
    const cells = days.map((d) => {
      const list = entriesOf(p.name, [d]);
      const h = sumHours(list);
      return `<td>${statusChip(p.name, d.date)}${list.map(entryHtml).join('')}${h ? `<div class="dayh">${hoursText(h)}</div>` : ''}</td>`;
    }).join('');
    const note = model.weekNotes[`${p.name}|${weekKey}`] || '';
    return `<tr><th class="who" data-go='${goAttr({ people: [p.name] })}'>${esc(p.name)}</th>${cells}<td class="notecell">${esc(note)}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table class="week">
    <thead><tr><th class="name">대상자</th>${head}<th class="note">작업 및 이슈</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ── 월 ───────────────────────────────────────────
function renderMonth(people, { days }) {
  return `<div class="cards">${people.map((p) => {
    const list = entriesOf(p.name, days);
    return `<section class="card">
      ${cardHeader(p, sumHours(list))}
      ${summaryHtml(p, days, list)}
    </section>`;
  }).join('')}</div>`;
}

// ── 년 ───────────────────────────────────────────
function renderYear(people, { days }) {
  const months = periods.month.filter((m) => days.includes(m.days[0]));
  return `<div class="cards">${people.map((p) => {
    const list = entriesOf(p.name, days);
    const projects = projectSummary(list);
    const perMonth = months.map((m) => projectSummary(entriesOf(p.name, m.days)));
    const cell = (s) => (!s ? '' : s.hours ? fmt(s.hours) : `<span class="dim">${s.dates.size}일</span>`);
    return `<section class="card">
      ${cardHeader(p, sumHours(list))}
      <div class="stats">${workStats(p.name, days)}</div>
      <h4>프로젝트 × 월 (시간, 시간 표기가 없으면 일수)</h4>
      <div class="scroll" style="border:0"><table class="year">
        <thead><tr><th>프로젝트</th>${months.map((m) => `<th>${m.days[0].month}월</th>`).join('')}<th>합계</th></tr></thead>
        <tbody>${projects.map((s) => `<tr><td>${esc(s.name)}</td>${perMonth.map((pm) => `<td>${cell(pm.find((x) => x.key === s.key))}</td>`).join('')}<td>${cell(s)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>합계</td>${months.map((m) => `<td>${fmt(sumHours(entriesOf(p.name, m.days)))}</td>`).join('')}<td>${fmt(sumHours(list))}</td></tr></tfoot>
      </table></div>
    </section>`;
  }).join('')}</div>`;
}

// ── 기간 지정: 요약 + 날짜별 목록 ──────────────────
function renderRange(people, { days }) {
  return `<div class="cards">${people.map((p) => {
    const list = entriesOf(p.name, days);
    const shown = days.filter((d) => byPersonDate.has(`${p.name}|${d.date}`) || model.dayInfo[`${p.name}|${d.date}`]?.status);
    return `<section class="card">
      ${cardHeader(p, sumHours(list))}
      ${summaryHtml(p, days, list)}
      <details class="notes" ${shown.length <= 31 ? 'open' : ''}><summary>날짜별 (${shown.length}일)</summary>
        ${shown.map((d) => {
          const dayList = entriesOf(p.name, [d]);
          const h = sumHours(dayList);
          return `<div class="dayrow">
            <div class="dayrow-h"><b>${md(d.date)} (${d.dow})</b>${statusChip(p.name, d.date)}${h ? `<span class="muted">${fmt(h)}시간</span>` : ''}</div>
            ${dayList.map(entryHtml).join('')}
          </div>`;
        }).join('') || '<p class="empty">기록 없음</p>'}
      </details>
    </section>`;
  }).join('')}</div>`;
}

// ── 공통 조각 ─────────────────────────────────────
// 근태·프로젝트별 시간·주간 "작업 및 이슈" (월, 기간 지정에서 사용)
function summaryHtml(p, days, list) {
  const projects = projectSummary(list);
  const max = Math.max(1, ...projects.map((s) => s.hours));
  const notes = periods.week
    .filter((w) => days.includes(w.days[0]))
    .map((w) => [w.label, model.weekNotes[`${p.name}|${w.days[0].weekKey}`]])
    .filter(([, n]) => n);
  return `<div class="stats">${workStats(p.name, days)}</div>
    <h4>프로젝트별</h4>
    ${projects.length ? `<div class="bars">${projects.map((s) => `
      <span class="label" title="${esc(s.name)}">${esc(s.name)}</span>
      <span class="v">${hoursText(s.hours)} · ${s.dates.size}일</span>
      <div class="track"><div class="fill" style="width:${(s.hours / max) * 100}%"></div></div>`).join('')}</div>` : '<p class="empty">기록 없음</p>'}
    ${notes.length ? `<details class="notes"><summary>주간 작업 및 이슈 (${notes.length})</summary><dl>
      ${notes.map(([label, n]) => `<dt>${esc(label)}</dt><dd>${esc(n)}</dd>`).join('')}
    </dl></details>` : ''}`;
}

function entriesOf(name, days) {
  return days.flatMap((d) => byPersonDate.get(`${name}|${d.date}`) || []);
}

function entryHtml(e) {
  const lines = e.text.split('\n').map((s) => s.trim()).filter(Boolean);
  const title = e.kind === 'etc' ? '기타일정' : lines.length > 1 ? lines.shift() : e.project;
  const body = e.kind === 'etc' || lines.length ? lines.join('\n') : '';
  return `<div class="entry ${e.kind}">
    <div class="proj"><span>${esc(title)}</span>${e.hours ? `<span class="h">${fmt(e.hours)}시간</span>` : ''}</div>
    ${body && body !== title ? `<div class="text">${esc(body)}</div>` : ''}
  </div>`;
}

function cardHeader(p, hours, extra = '') {
  return `<header>
    <h3 class="who" data-go='${goAttr({ people: [p.name] })}'>${esc(p.name)}</h3>
    ${p.title ? `<span class="muted">${esc(p.title)}</span>` : ''}${extra}
    <span class="total">${hoursText(hours)}</span>
  </header>`;
}

function statusChip(name, date) {
  const info = model.dayInfo[`${name}|${date}`];
  return info && info.status ? `<span class="chip">${esc(info.status)}</span> ` : '';
}

function workStats(name, days) {
  const counts = {};
  let recorded = 0;
  for (const d of days) {
    const info = model.dayInfo[`${name}|${d.date}`];
    if (info && info.status) counts[info.status] = (counts[info.status] || 0) + 1;
    if (byPersonDate.has(`${name}|${d.date}`)) recorded++;
  }
  return `<span>기록한 날 ${recorded}/${days.length}일</span>`
    + Object.entries(counts).map(([s, n]) => `<span class="chip">${esc(s)} ${n}</span>`).join('');
}

function projectSummary(list) {
  const map = new Map();
  for (const e of list) {
    const key = e.kind === 'etc' ? '#etc' : projectKey(e.project);
    if (!map.has(key)) map.set(key, { key, name: e.kind === 'etc' ? '기타일정' : e.project, hours: 0, dates: new Set() });
    const s = map.get(key);
    s.hours += e.hours;
    s.dates.add(e.date);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours || b.dates.size - a.dates.size);
}

function renderSource() {
  const w = model.warnings;
  const at = source.at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  $('source').innerHTML = `데이터: ${esc(source.title)} · ${esc(model.sheet)} 탭 · ${model.days[0].date} ~ ${model.days.at(-1).date} · ${at} 불러옴`
    + (w.length ? `<details><summary>원본 확인 필요 ${w.length}건</summary><ul>${w.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : '');
}

// 마지막으로 연 시트 링크만 이 브라우저에 기억 (토큰은 저장하지 않음)
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 안 됨 */ } },
};

const sumHours = (list) => list.reduce((n, e) => n + e.hours, 0);
const fmt = (n) => String(Math.round(n * 100) / 100);
const hoursText = (h) => `${fmt(h)}시간 (${fmt(h / 8)}MD)`;
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;
const longDate = (iso) => `${iso.slice(0, 4)}년 ${md(iso)}`;
const goAttr = (patch) => esc(JSON.stringify(patch));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

init();
