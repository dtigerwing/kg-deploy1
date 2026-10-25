// 대시보드와 에이전트 보고서를 그리는 코드. 노트북 화면(app.js)과 배포된 보기 전용 웹(viewer.js)이 같이 쓴다.
// 그리는 곳의 HTML에 같은 id(metrics, platforms, commits, changes, scenes, assets, console, packages …)가 있어야 한다.
import { $, esc, formatBytes } from "./util.js";

const LAPTOP = "노트북에서 읽을 때만 보여요";
const KIND_COLORS = ["#534AB7", "#1D9E75", "#D85A30", "#378ADD", "#BA7517", "#D4537E", "#888780", "#5F5E5A"];

export function renderDashboard(s) {
  const p = s.project;
  $("projectName").textContent = p.productName;
  const fromRepo = s.source === "bitbucket"; // 노트북 없이 Bitbucket만 읽은 기록 (Unity에서만 알 수 있는 값은 비어 있다)
  $("projectMeta").textContent = `Unity ${p.unityVersion} · ${p.renderPipeline.replace("UniversalRenderPipelineAsset", "URP")} · 빌드 타깃 ${p.activeTarget ?? "알 수 없음"} · 버전 ${p.version}`;
  $("readAt").textContent =
    `읽은 시각 ${new Date(s.readAt).toLocaleString("ko-KR")}` +
    (fromRepo ? " · Bitbucket 기준 (푸시된 내용만, 콘솔·빌드·Missing Script는 노트북에서 읽을 때만)" : p.isPlaying ? " · 읽을 때 Play 모드였어요" : "");

  const missing = s.scenes.some((sc) => sc.missingScripts == null) ? null : s.scenes.reduce((sum, sc) => sum + sc.missingScripts, 0);
  $("metrics").innerHTML = [
    s.console ? metric("콘솔 에러 · 경고", `${s.console.errors} · ${s.console.warnings}`, s.console.errors ? "bad" : "") : metric("콘솔 에러 · 경고", "—", "", LAPTOP),
    missing == null ? metric("Missing Script", "—", "", LAPTOP) : metric("Missing Script", missing.toLocaleString(), missing ? "bad" : "", `빌드 씬 ${s.scenes.length}개 기준`),
    s.lastBuild
      ? metric("마지막 빌드", formatBytes(s.lastBuild.totalBytes), s.lastBuild.result === "Succeeded" ? "" : "bad", `${s.lastBuild.platform} · ${s.lastBuild.endedAt}`)
      : metric("마지막 빌드", fromRepo ? "—" : "없음", "", fromRepo ? LAPTOP : "빌드 리포트가 없어요"),
    gitMetric(s.git),
  ].join("");

  $("platforms").innerHTML = [platformCard(s, "AOS", "Android", s.android, [["versionCode", s.android.code], ["백엔드", `${s.android.backend} · ${s.android.architectures}`]]),
    platformCard(s, "iOS", "iOS", s.ios, [["빌드 번호", s.ios.code], ["최소 iOS", s.ios.minOS]])].join("");

  renderGit(s.git);
  $("scenes").innerHTML = scenesBody(s.scenes);
  $("assets").innerHTML = assetsBody(s.assets);
  $("console").innerHTML = !s.console
    ? `<p class="empty">${LAPTOP}</p>`
    : s.console.top.length
    ? s.console.top
        .map((m) => `<div class="row"><span class="badge ${m.level === "error" ? "bad" : "busy"}">${m.level === "error" ? "에러" : "경고"}</span><span class="name" title="${esc(m.message)}">${esc(m.message)}</span><span class="val">${m.count}건</span></div>`)
        .join("")
    : `<p class="empty">에러와 경고가 없어요</p>`;
  $("packages").innerHTML = `<div class="chips">${s.packages
    .map((pk) => `<span class="chip" title="${esc(pk.name)}">${esc(pk.displayName)} <span class="muted">${esc(pk.version)}</span></span>`)
    .join("")}</div>`;
}

function metric(label, value, tone = "", sub = "") {
  return `<div class="metric"><p class="label">${esc(label)}</p><p class="value ${tone}">${esc(value)}</p>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}</div>`;
}

function gitMetric(git) {
  if (!git) return metric("커밋 상태", "git 없음", "warn", "프로젝트가 git 저장소가 아니에요");
  if (git.error) return metric("커밋 상태", "읽기 실패", "bad", git.error);
  const pushed = git.ahead == null ? "원격 없음" : `푸시 안 함 ${git.ahead}개`;
  if (!git.changes) return metric("최근 커밋", git.commits[0]?.date.slice(5) ?? "—", "", `${git.branch} · Bitbucket에 푸시된 것 기준`);
  return metric("커밋 안 한 파일", `${git.changes.count}개`, git.changes.count ? "warn" : "", `${git.branch} · ${pushed}`);
}

// ---------- git ----------

function renderGit(git) {
  if (!git || git.error) {
    const text = git?.error ? `git을 읽지 못했어요. ${git.error}` : "프로젝트가 git 저장소가 아니에요.";
    $("commitsLabel").textContent = "최근 커밋";
    $("changesLabel").textContent = "커밋 안 한 변경";
    $("commits").innerHTML = $("changes").innerHTML = `<p class="empty">${esc(text)}</p>`;
    return;
  }
  const sync = git.ahead == null ? "원격 없음" : git.ahead || git.behind ? `푸시 안 함 ${git.ahead} · 받을 것 ${git.behind}` : "원격과 같음";
  $("commitsLabel").textContent = `최근 커밋 · ${git.branch}${git.remote ? ` · ${git.remote}` : ""}`;
  $("changesLabel").textContent = `커밋 안 한 변경 · ${sync}`;
  $("commits").innerHTML = git.commits.length
    ? git.commits
        .map(
          (c) =>
            `<div class="commit"><div class="commit-head"><span class="hash">${esc(c.hash)}</span><span class="name" title="${esc(c.message)}">${esc(c.message)}</span><span class="val muted">${esc(c.date.slice(5))}</span></div>` +
            `<div class="chips">${kindChips(c.kinds)}${c.fileCount >= 100 ? `<span class="chip warn">파일 ${c.fileCount}개</span>` : ""}</div></div>`,
        )
        .join("")
    : `<p class="empty">커밋이 없어요</p>`;

  const STATE_TONE = { 수정: "accent", "새 파일": "good", 추가: "good", 삭제: "bad", "이름 변경": "none" };
  if (!git.changes) {
    $("changesLabel").textContent = "커밋 안 한 변경";
    $("changes").innerHTML = `<p class="empty">커밋 안 한 변경은 노트북에서 읽을 때만 보여요</p>`;
    return;
  }
  const files = git.changes.files
    .map((f) => `<div class="row"><span class="badge ${STATE_TONE[f.state] ?? "none"}">${esc(f.state)}</span><span class="name" title="${esc(f.path)}">${esc(shortPath(f.path, git.unityFolder))}</span><span></span></div>`)
    .join("");
  const more = git.changes.count > git.changes.files.length ? `<p class="sub">외 ${git.changes.count - git.changes.files.length}개</p>` : "";
  const CHECK_TONE = { ok: "good", warn: "busy", info: "none" };
  const checks = git.checks
    .map(
      (c) =>
        `<div class="check-row ${CHECK_TONE[c.level]}"><span>${c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "·"} ${esc(c.title)}</span>` +
        (c.detail.length ? `<span class="sub">${c.detail.map(esc).join("<br />")}</span>` : "") +
        `</div>`,
    )
    .join("");
  $("changes").innerHTML = (git.changes.count ? files + more : `<p class="empty">커밋 안 한 변경이 없어요</p>`) + `<div class="checks">${checks}</div>`;
}

function kindChips(kinds) {
  return kinds.map((k) => `<span class="chip ${k.kind === "meta" ? "faint" : ""}">${esc(k.kind === "meta" ? ".meta" : k.kind)} ${k.count}</span>`).join("");
}

// Unity 폴더 안 경로는 앞의 폴더 이름을 떼어 짧게 보여준다.
function shortPath(file, unityFolder) {
  return unityFolder && unityFolder !== "." && file.startsWith(`${unityFolder}/`) ? file.slice(unityFolder.length + 1) : file;
}

function platformCard(s, name, target, info, rows) {
  const active = s.project.activeTarget === target;
  const badges = (active ? `<span class="badge accent">지금 빌드 타깃</span>` : "") + (info.installed === false ? `<span class="badge none">모듈 없음</span>` : "");
  const all = [["버전", s.project.version], ...rows, ["앱 ID", info.id]];
  return `<div class="card platform ${active ? "active" : ""}"><p class="platform-name">${name} ${badges}</p>${all
    .map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span title="${esc(v)}">${esc(v)}</span></div>`)
    .join("")}</div>`;
}

function scenesBody(scenes) {
  if (!scenes.length) return `<p class="empty">Build Settings에 씬이 없어요</p>`;
  const max = Math.max(1, ...scenes.map((sc) => sc.missingScripts ?? 0));
  return scenes
    .map((sc) => {
      const name = sc.path.split("/").pop().replace(/\.unity$/, "");
      const width = Math.round(((sc.missingScripts ?? 0) / max) * 100);
      return (
        `<div class="bar-row ${sc.enabled ? "" : "dim"}" title="${esc(sc.path)}">` +
        `<span class="name">${esc(name)}</span>` +
        `<div class="bar"><span style="width:${width}%"></span></div>` +
        `<span class="val ${sc.missingScripts ? "bad" : ""}">${sc.missingScripts == null ? "—" : sc.missingScripts.toLocaleString()}</span>` +
        `<span class="val muted">${!sc.exists ? "파일 없음" : sc.gameObjects == null ? "" : `오브젝트 ${sc.gameObjects.toLocaleString()}`}</span>` +
        `</div>`
      );
    })
    .join("");
}

function assetsBody(assets) {
  const sorted = [...assets].sort((a, b) => b.bytes - a.bytes);
  const total = sorted.reduce((sum, a) => sum + a.bytes, 0) || 1;
  const stack = sorted
    .map((a, i) => `<span style="width:${(a.bytes / total) * 100}%;background:${KIND_COLORS[i % KIND_COLORS.length]}" title="${esc(a.kind)}"></span>`)
    .join("");
  const legend = sorted
    .map(
      (a, i) =>
        `<div class="legend-row"><span class="dot" style="background:${KIND_COLORS[i % KIND_COLORS.length]}"></span><span>${esc(a.kind)}</span>` +
        `<span class="val muted">${a.count.toLocaleString()}개</span><span class="val">${formatBytes(a.bytes)}</span></div>`,
    )
    .join("");
  return `<div class="stackbar">${stack}</div>${legend}<p class="sub">합계 ${formatBytes(total)}</p>`;
}

// ---------- 에이전트 보고서 ----------

const STATUS_TONE = { 통과: "good", 실패: "bad", "확인 필요": "busy" };
const VERDICT_TONE = { "출시 가능": "good", "보완 필요": "busy", "출시 어려움": "bad" };
const PRIORITY_TONE = { 높음: "bad", 보통: "busy", 낮음: "none" };

export function releaseBody(r) {
  const order = { 실패: 0, "확인 필요": 1, 통과: 2 };
  const items = [...r.items].sort((a, b) => order[a.status] - order[b.status]);
  const count = (st) => r.items.filter((i) => i.status === st).length;
  return (
    `<div class="verdict"><span class="badge ${VERDICT_TONE[r.verdict] ?? "none"} big-badge">${esc(r.verdict)}</span>` +
    `<span class="muted">${esc(r.target)} 기준 · 실패 ${count("실패")} · 확인 필요 ${count("확인 필요")} · 통과 ${count("통과")}</span></div>` +
    `<p>${esc(r.summary)}</p>` +
    items
      .map(
        (i) =>
          `<div class="advice"><div class="advice-head"><span class="badge ${STATUS_TONE[i.status] ?? "none"}">${esc(i.status)}</span><strong>${esc(i.title)}</strong></div>` +
          `<p class="advice-text">${esc(i.current)}</p>${i.fix ? `<p class="advice-fix">${esc(i.fix)}</p>` : ""}</div>`,
      )
      .join("")
  );
}

export function dietBody(r) {
  return (
    `<p><strong>${esc(r.headline)}</strong></p><p class="sub">${esc(r.basis)}</p>` +
    r.suggestions
      .map(
        (s) =>
          `<div class="advice"><div class="advice-head"><span class="badge ${PRIORITY_TONE[s.priority] ?? "none"}">${esc(s.priority)}</span>` +
          `<span class="name" title="${esc(s.path)}">${esc(s.path)}</span><span class="val good">${s.savingKB > 0 ? `약 -${formatBytes(s.savingKB * 1024)}` : ""}</span></div>` +
          `<p class="advice-text">${esc(s.issue)}</p><p class="advice-fix">${esc(s.fix)}</p></div>`,
      )
      .join("")
  );
}

export function changesBody(r) {
  const section = (title, html) => (html ? `<p class="section-title">${esc(title)}</p>${html}` : "");
  const done = r.done
    .map(
      (d) =>
        `<div class="advice"><div class="advice-head"><strong>${esc(d.title)}</strong><span class="hash">${d.commits.map(esc).join(" ")}</span></div>` +
        `<p class="advice-text">${esc(d.detail)}</p></div>`,
    )
    .join("");
  const cautions = r.cautions
    .map(
      (c) =>
        `<div class="advice"><div class="advice-head"><span class="badge ${PRIORITY_TONE[c.level] ?? "none"}">${esc(c.level)}</span><strong>${esc(c.title)}</strong></div>` +
        `<p class="advice-text">${esc(c.detail)}</p></div>`,
    )
    .join("");
  const before = r.beforeCommit.length ? `<ol class="todo">${r.beforeCommit.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : "";
  return `<p><strong>${esc(r.headline)}</strong></p>` + section("한 일", done) + section("주의할 점", cautions) + section("커밋 전에", before);
}
