import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/12.0.0";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let days = [];
let weeks = [];
let usingSample = false;

async function loadData() {
  // 주소 끝에 ?sample 을 붙이면 Firebase가 설정돼 있어도 예시 데이터를 보여준다.
  if (!firebaseConfig.projectId || new URLSearchParams(location.search).has("sample")) {
    const sample = await import("./sample-data.js");
    usingSample = true;
    return { days: sample.days, weeks: sample.weeks };
  }
  const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
  const { getFirestore, collection, query, orderBy, limit, getDocs } = await import(`${FIREBASE_SDK}/firebase-firestore.js`);
  const db = getFirestore(initializeApp(firebaseConfig));
  const read = async (name, field, count) => {
    const snap = await getDocs(query(collection(db, name), orderBy(field, "desc"), limit(count)));
    return snap.docs.map((d) => d.data());
  };
  const [dayDocs, weekDocs] = await Promise.all([read("days", "date", 60), read("weeks", "start", 12)]);
  return { days: dayDocs, weeks: weekDocs };
}

function parseDate(text) {
  const [y, m, d] = text.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(text) {
  const date = parseDate(text);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

function shortDate(text) {
  const date = parseDate(text);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatKB(kb) {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

function currentRoute() {
  const [kind, id] = location.hash.replace(/^#/, "").split("/");
  if (kind === "week" && weeks.some((w) => w.start === id)) return { kind, id };
  if (kind === "day" && days.some((d) => d.date === id)) return { kind, id };
  return days.length ? { kind: "day", id: days[0].date } : null;
}

function renderSide(route) {
  const isOn = (kind, id) => (route && route.kind === kind && route.id === id ? "on" : "");
  $("dayList").innerHTML = days
    .map((d) => `<a href="#day/${d.date}" class="${isOn("day", d.date)}">${dayLabel(d.date)}</a>`)
    .join("");
  $("weekList").innerHTML = weeks
    .map((w) => `<a href="#week/${w.start}" class="${isOn("week", w.start)}">주간 보고 ${shortDate(w.start)}~${shortDate(w.end)}</a>`)
    .join("");
}

function buildTile(build) {
  if (!build) return tile("빌드 용량", "—", "오늘 빌드 기록 없음");
  if (build.deltaMB == null) return tile("빌드 용량", `${build.totalMB} MB`, "첫 빌드 기록");
  const sign = build.deltaMB > 0 ? "+" : "";
  return tile("빌드 용량", `${build.totalMB} MB`, `${sign}${build.deltaMB} MB · 지난 빌드 대비`, build.deltaMB > 0);
}

function perfTile(perf) {
  if (!perf || !perf.scenes.length) return tile("씬 프레임", "—", "오늘 측정 기록 없음");
  const dropped = perf.scenes.filter((s) => s.status === "하락").sort((a, b) => b.changePct - a.changePct);
  const slowest = [...perf.scenes].sort((a, b) => b.frameMs - a.frameMs)[0];
  const scene = dropped[0] ?? slowest;
  const label = `${scene.name} 씬 프레임`;
  const value = `${scene.frameMs.toFixed(1)} ms`;
  if (scene.status === "기준 없음") return tile(label, value, "비교할 기록 없음");
  if (scene.status === "하락") return tile(label, value, `${scene.changePct}% 느림 · 7일 평균 대비`, true);
  return tile(label, value, scene.changePct < 0 ? `${-scene.changePct}% 빠름 · 7일 평균 대비` : "7일 평균과 비슷");
}

function commitTile(day) {
  const repo = day.repo;
  if (!repo) return tile("오늘 커밋", `${day.commits.length}개`, `프리팹 ${day.changedPrefabs}개 · 씬 ${day.changedScenes}개 수정`);
  const unpushed = repo.unpushed == null ? "푸시 확인 불가" : `푸시 안 함 ${repo.unpushed}개`;
  return tile(
    "커밋 안 한 파일",
    `${repo.changedCount}개`,
    `${unpushed} · 오늘 커밋 ${day.commits.length}개`,
    repo.changedCount > 0 || repo.unpushed > 0,
  );
}

const PLATFORMS = [
  { key: "android", name: "AOS", build: "Android", code: "versionCode", id: "패키지" },
  { key: "ios", name: "iOS", build: "iOS", code: "빌드 번호", id: "번들 ID" },
];

// 버전은 그날 기록한 값, 빌드 용량은 그날까지 그 플랫폼으로 마지막에 빌드한 기록에서 가져온다.
function versionCard(day) {
  if (!day.project) return "";
  const columns = PLATFORMS.map((p) => {
    const setting = day.project[p.key];
    const last = days.find((d) => d.date <= day.date && d.build?.platform === p.build);
    const lastBuild = last
      ? `${last.build.totalMB} MB · ${shortDate(last.date)}${last.build.version ? ` (${last.build.version.name} / ${last.build.version.code})` : ""}`
      : "빌드 기록 없음";
    const rows = [
      ["버전", day.project.version],
      [p.code, setting.code],
      [p.id, setting.id],
      ["마지막 빌드", lastBuild],
    ];
    const note = setting.installed ? "" : `<span class="badge none">모듈 없음</span>`;
    return `<div class="platform"><p class="platform-name">${p.name} ${note}</p>${rows
      .map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span title="${esc(v)}">${esc(v)}</span></div>`)
      .join("")}</div>`;
  }).join("");
  return card(`버전 정보 · Unity ${day.project.unityVersion}`, `<div class="platforms">${columns}</div>`);
}

function tile(label, value, sub, bad = false) {
  return `<div class="tile"><p class="label">${esc(label)}</p><p class="value">${esc(value)}</p><p class="sub ${bad ? "bad" : ""}">${esc(sub)}</p></div>`;
}

function card(label, body) {
  return `<section class="card"><p class="label">${esc(label)}</p>${body}</section>`;
}

const BADGE = { 하락: "bad", 정상: "good", "기준 없음": "none" };

function renderDay(day) {
  const parts = [card("현황 요약 (Claude 작성)", `<p class="summary">${esc(day.summary)}</p>`)];
  parts.push(versionCard(day));
  parts.push(`<div class="tiles">${buildTile(day.build)}${perfTile(day.perf)}${commitTile(day)}</div>`);

  const analysis = renderAnalysis(day.analysis);
  if (analysis) parts.push(card("Claude 최적화 분석·제안", analysis));

  if (day.build?.grown?.length) {
    const rows = day.build.grown
      .map((a) => `<div class="row"><span class="name" title="${esc(a.path)}">${esc(a.path)}${a.isNew ? " (새 파일)" : ""}</span><span class="val bad">+${formatKB(a.deltaKB)}</span></div>`)
      .join("");
    parts.push(card("지난 빌드보다 커진 에셋", rows));
  }

  if (day.perf?.scenes?.length) {
    const rows = day.perf.scenes
      .map((s) => `<div class="row perf"><span class="name">${esc(s.name)}</span><span class="val">${s.frameMs.toFixed(1)} ms · 드로우콜 ${s.drawCalls}</span><span class="badge ${BADGE[s.status]}">${esc(s.status)}</span></div>`)
      .join("");
    parts.push(card("씬별 성능 (최근 7일 평균 대비)", rows));
  }

  if (day.repo) parts.push(card(`커밋 상태 · ${day.repo.branch} 브랜치`, repoBody(day.repo)));

  const commits = day.commits.length
    ? day.commits.map((c) => `<div class="row"><span class="name" title="${esc(c.msg)}">${esc(c.msg)}</span><span class="val">${esc(c.time)}</span></div>`).join("")
    : `<p class="empty">오늘 커밋이 없어요</p>`;
  parts.push(card("오늘 커밋", commits));
  return parts.join("");
}

function repoBody(repo) {
  const row = (name, val, bad = false) =>
    `<div class="row"><span class="name" title="${esc(name)}">${esc(name)}</span><span class="val ${bad ? "bad" : ""}">${esc(val)}</span></div>`;
  const rows = [];
  if (repo.lastCommit) rows.push(row(`마지막 커밋: ${repo.lastCommit.msg}`, repo.lastCommit.time));
  rows.push(row("푸시 안 한 커밋", repo.unpushed == null ? "원격 브랜치 없음" : `${repo.unpushed}개`, repo.unpushed > 0));
  rows.push(row("커밋 안 한 파일", `${repo.changedCount}개`, repo.changedCount > 0));
  rows.push(...repo.changed.map((f) => row(f, "")));
  if (repo.changedCount > repo.changed.length) rows.push(`<p class="empty">외 ${repo.changedCount - repo.changed.length}개</p>`);
  return rows.join("");
}

function renderAnalysis(analysis) {
  const sections = [];
  const build = analysis?.build;
  if (build) {
    const items = build.suggestions.map((s) =>
      advice(s.path, s.savingKB > 0 ? `약 -${formatKB(s.savingKB)}` : "", s.issue, s.fix),
    );
    sections.push(section("빌드 용량 줄이기", build.headline, items));
  }
  const setup = analysis?.setup;
  if (setup) {
    const items = setup.items.map((s) => advice(s.title, `중요도 ${s.priority}`, s.issue, s.fix, s.priority === "높음" ? "bad" : "muted"));
    sections.push(section("설정·성능", setup.headline, items));
  }
  const warnings = analysis?.warnings;
  if (warnings) {
    const items = warnings.items.map((w) => advice(w.title, `${w.count}건`, w.cause, w.fix, "bad"));
    sections.push(section(`콘솔 경고 ${warnings.warnings} · 에러 ${warnings.errors}`, warnings.headline, items));
  }
  return sections.join("");
}

function section(title, headline, items) {
  return `<div class="section"><p class="section-title">${esc(title)}</p><p class="headline">${esc(headline)}</p>${items.join("")}</div>`;
}

function advice(name, value, issue, fix, tone = "good") {
  return `<div class="advice"><div class="advice-head"><span class="name" title="${esc(name)}">${esc(name)}</span><span class="val ${tone}">${esc(value)}</span></div><p class="advice-text">${esc(issue)}</p><p class="advice-fix">${esc(fix)}</p></div>`;
}

function renderWeek(week) {
  return card(`${dayLabel(week.start)} ~ ${dayLabel(week.end)} 주간 보고 (Claude 작성)`, `<p class="summary">${esc(week.text)}</p>`);
}

function render() {
  const route = currentRoute();
  renderSide(route);
  const notice = usingSample ? `<p class="notice">예시 데이터예요. public/firebase-config.js를 채우면 실제 기록을 보여줘요.</p>` : "";
  if (!route) {
    $("main").innerHTML = `${notice}${card("아직 기록이 없어요", `<p class="empty">Claude Code에서 /record-today 를 실행하면 오늘 기록이 생겨요.</p>`)}`;
    return;
  }
  const body = route.kind === "week" ? renderWeek(weeks.find((w) => w.start === route.id)) : renderDay(days.find((d) => d.date === route.id));
  $("main").innerHTML = notice + body;
}

try {
  ({ days, weeks } = await loadData());
  render();
  window.addEventListener("hashchange", render);
} catch (err) {
  console.error(err);
  $("main").innerHTML = card("기록을 불러오지 못했어요", `<p class="empty">${esc(err.message)}</p>`);
}
