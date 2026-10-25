// 배포된 보기 전용 웹. 노트북 서버가 Firestore에 쌓은 현황과 에이전트 보고서를 보여준다.
// Unity를 읽거나 에이전트를 돌리지 않는다. 구글 로그인한 본인만 읽을 수 있다(firestore.rules).
import { changesBody, dietBody, releaseBody, renderDashboard } from "./dashboard.js";
import { firebaseConfig } from "./firebase-config.js";
import { $, esc, showNotice } from "./util.js";

const SDK = "https://www.gstatic.com/firebasejs/12.0.0";
const { initializeApp } = await import(`${SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } = await import(`${SDK}/firebase-auth.js`);
const { getFirestore, collection, query, orderBy, limit, getDocs } = await import(`${SDK}/firebase-firestore.js`);
const { getFunctions, httpsCallable } = await import(`${SDK}/firebase-functions.js`);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// 노트북 없이 Bitbucket 기준으로 새로 읽는 클라우드 함수 (functions/index.js)
const refreshFromBitbucket = httpsCallable(getFunctions(app, "asia-northeast3"), "refreshFromBitbucket");

const REPORT_NAMES = { release: "출시 전 점검", diet: "용량 다이어트", changes: "변경 분석", workflow: "업무 쪼개기" };
let snaps = [];
let reports = [];

// ---------- 로그인 ----------

$("signInBtn").addEventListener("click", () => signInWithPopup(auth, new GoogleAuthProvider()).catch((err) => showNotice(`로그인하지 못했어요. ${err.message}`)));
$("signOutBtn").addEventListener("click", () => signOut(auth));
$("refreshBtn").addEventListener("click", refresh);

async function refresh() {
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "읽는 중…";
  showNotice("");
  try {
    const { data } = await refreshFromBitbucket();
    await load();
    location.hash = `#snap/${data.id}`;
    render();
  } catch (err) {
    showNotice(`새로 읽지 못했어요. ${err.message}`);
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "새로 읽기";
  }
}

onAuthStateChanged(auth, async (user) => {
  showNotice("");
  $("signIn").hidden = Boolean(user);
  $("signOutBtn").hidden = !user;
  $("refreshBtn").hidden = !user;
  $("refreshInfo").hidden = !user;
  $("userEmail").textContent = user?.email ?? "";
  $("viewer").hidden = true;
  if (!user) return;
  try {
    await load();
    $("viewer").hidden = false;
    render();
  } catch (err) {
    showNotice(err.code === "permission-denied" ? `${user.email} 계정은 볼 권한이 없어요. 등록된 계정으로 다시 로그인해 주세요.` : `기록을 불러오지 못했어요. ${err.message}`);
  }
});

async function load() {
  const read = async (name, field, count) =>
    (await getDocs(query(collection(db, name), orderBy(field, "desc"), limit(count)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  [snaps, reports] = await Promise.all([read("unitySnapshots", "readAt", 30), read("unityReports", "createdAt", 50)]);
}

// ---------- 그리기 ----------

function currentRoute() {
  const [kind, id] = location.hash.replace(/^#/, "").split("/");
  if (kind === "report" && reports.some((r) => r.id === id)) return { kind, id };
  if (kind === "snap" && snaps.some((s) => s.id === id)) return { kind, id };
  if (snaps.length) return { kind: "snap", id: snaps[0].id };
  if (reports.length) return { kind: "report", id: reports[0].id };
  return null;
}

function render() {
  const route = currentRoute();
  const on = (kind, id) => (route?.kind === kind && route.id === id ? "on" : "");
  $("snapList").innerHTML =
    snaps
      .map(
        (s) =>
          `<a href="#snap/${esc(s.id)}" class="${on("snap", s.id)}">${esc(timeLabel(s.readAt))} <span class="muted">${esc(s.project?.productName ?? "")}${s.source === "bitbucket" ? " · Bitbucket" : " · 노트북"}</span></a>`,
      )
      .join("") ||
    `<p class="empty">없어요</p>`;
  $("reportList").innerHTML =
    reports
      .map((r) => `<a href="#report/${esc(r.id)}" class="${on("report", r.id)}">${esc(REPORT_NAMES[r.type] ?? r.type)} <span class="muted">${esc(timeLabel(created(r)))}</span></a>`)
      .join("") || `<p class="empty">없어요</p>`;

  $("emptyState").hidden = Boolean(route);
  $("dashboard").hidden = route?.kind !== "snap";
  $("report").hidden = route?.kind !== "report";
  $("previewCard").hidden = true;
  $("readAt").textContent = "";
  if (!route) return;

  if (route.kind === "snap") {
    const s = snaps.find((x) => x.id === route.id);
    renderDashboard(s);
    return;
  }
  const r = reports.find((x) => x.id === route.id);
  $("projectName").textContent = r.project ?? "Unity 현황 기록";
  $("projectMeta").textContent = `${REPORT_NAMES[r.type] ?? r.type} 보고서`;
  $("readAt").textContent = `만든 시각 ${timeLabel(created(r))}`;
  if (r.type === "workflow") return renderWorkflow(r.data);
  const body = { release: releaseBody, diet: dietBody, changes: changesBody }[r.type];
  $("report").innerHTML = `<p class="agent-title">${esc(REPORT_NAMES[r.type] ?? r.type)}</p>${body ? body(r.data) : `<pre>${esc(JSON.stringify(r.data, null, 2))}</pre>`}`;
}

function renderWorkflow(w) {
  const rv = w.review ?? {};
  const items = (w.items ?? [])
    .map((i) => {
      const score = rv.reviews?.find((x) => x.id === i.id);
      return (
        `<div class="advice"><div class="advice-head"><span class="tid">${esc(i.id)}</span><strong>${esc(i.title)}</strong>${score ? `<span class="score">${score.score}/10</span>` : ""}</div>` +
        `<p class="advice-text">${esc(i.description)}</p>` +
        (i.note ? `<p class="note">수정 요청: ${esc(i.note)}</p>` : "") +
        (score ? `<p class="sub">잘된 점: ${esc(score.good)}<br />고칠 점: ${esc(score.improve)}</p>` : "") +
        `<details class="result"><summary>결과물 보기</summary><pre>${esc(i.result)}</pre></details></div>`
      );
    })
    .join("");
  $("report").innerHTML =
    `<p class="agent-title">업무 쪼개기</p>` +
    `<p class="sub">업무: ${esc(w.task)}</p>` +
    `<div class="overall"><span class="big">${rv.score ?? "-"}<small>/10</small></span><div><strong>${esc(rv.title)}</strong><p>${esc(w.goal)}</p><p>${esc(rv.summary)}</p></div></div>` +
    `<p class="section-title">세부 업무</p>${items}`;
  if (rv.html) {
    $("previewCard").hidden = false;
    $("preview").srcdoc = rv.html;
  }
}

function created(r) {
  return r.createdAt?.toDate?.().toISOString() ?? null;
}

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

window.addEventListener("hashchange", render);
