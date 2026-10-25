// Unity 현황 대시보드 서버. API 키와 Unity 연결은 이 서버에만 있고 브라우저로는 나가지 않는다.
// Unity는 읽기만 한다. "새로 읽기" 버튼을 누를 때와 에이전트가 조회할 때만 Unity에 묻는다.
// 읽은 현황과 에이전트 보고서는 Firestore에 쌓아 배포된 웹(보기 전용)에서 볼 수 있게 한다(store.mjs).
//   GET  /api/status          키·모델·대상 프로젝트
//   POST /api/snapshot        Unity에서 현황을 새로 읽는다
//   POST /api/agent/release   출시 전 점검 에이전트 (한 줄에 JSON 하나씩 흘려보냄)
//   POST /api/agent/diet      용량 다이어트 에이전트 (같은 방식)
//   POST /api/agent/changes   변경 분석 에이전트 (같은 방식, git 읽기 도구만)
//   POST /api/plan            업무 쪼개기: 쪼개기 + 계획 (같은 방식)
//   POST /api/execute         업무 쪼개기: 승인한 것 실행 + 취합·평가 (같은 방식)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changeAnalysis, decompose, execute, plan, releaseCheck, review, sizeDiet } from "./agents.mjs";
import { EFFORT, MODEL, hasKey } from "./claude.mjs";
import { readGit } from "./git.mjs";
import { saveReport, saveSnapshot, storeEnabled } from "./store.mjs";
import { projectPath, snapshot } from "./unity.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "public");
try {
  process.loadEnvFile(path.join(here, ".env"));
} catch {
  // .env가 없으면 키 없음 안내를 화면에 띄운다
}
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const TOOL_LABELS = {
  read_player_settings: "플레이어 설정 읽는 중",
  list_large_assets: "큰 에셋 목록 읽는 중",
  read_import_settings: "임포트 설정 읽는 중",
  git_log: "커밋 목록 읽는 중",
  git_show: "커밋 내용 읽는 중",
  git_status: "작업 상태 읽는 중",
  git_diff_unstaged: "커밋 안 한 변경 읽는 중",
  git_diff_staged: "스테이징된 변경 읽는 중",
  git_diff: "비교 diff 읽는 중",
};

// 마지막으로 읽은 현황. 에이전트는 이것을 참고하고, 필요한 건 도구로 직접 더 읽는다.
let lastSnapshot = null;

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/api/status") {
        return json(res, { hasKey: hasKey(), model: MODEL, effort: EFFORT, project: path.basename(projectPath()), store: storeEnabled(), snapshot: lastSnapshot });
      }
      if (req.method === "POST" && req.url === "/api/snapshot") {
        try {
          lastSnapshot = await readAll();
        } catch (err) {
          return json(res, { error: err.message }, 502);
        }
        return json(res, { ...lastSnapshot, saved: await trySave(() => saveSnapshot(lastSnapshot)) });
      }
      if (req.method === "POST" && req.url === "/api/agent/release") return stream(req, res, runAgent("release", releaseCheck));
      if (req.method === "POST" && req.url === "/api/agent/diet") return stream(req, res, runAgent("diet", sizeDiet));
      if (req.method === "POST" && req.url === "/api/agent/changes") return stream(req, res, runChanges);
      if (req.method === "POST" && req.url === "/api/plan") return stream(req, res, runPlan);
      if (req.method === "POST" && req.url === "/api/execute") return stream(req, res, runExecute);
      if (req.method === "GET") return serveFile(req, res);
      res.writeHead(404).end();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, { error: err.message }, 500);
    }
  })
  .listen(PORT, () =>
    console.log(`http://localhost:${PORT}  (${MODEL}, effort ${EFFORT}, API 키 ${hasKey() ? "있음" : "없음 → .env 확인"}, Unity ${path.basename(projectPath())})`),
  );

// Unity 현황과 git을 함께 읽는다. git을 못 읽어도 Unity 현황은 보여준다.
async function readAll() {
  const [unity, git] = await Promise.all([snapshot(), readGit().catch((err) => ({ error: err.message }))]);
  return { ...unity, git };
}

// 아직 한 번도 읽지 않았으면 에이전트 전에 한 번 읽는다.
async function ensureSnapshot(send) {
  if (lastSnapshot) return lastSnapshot;
  send({ type: "progress", message: "Unity 현황 읽는 중" });
  lastSnapshot = await readAll();
  send({ type: "snapshot", data: { ...lastSnapshot, saved: await trySave(() => saveSnapshot(lastSnapshot)) } });
  return lastSnapshot;
}

// 업무 쪼개기는 Unity 현황 없이도 돌 수 있다. 못 읽으면 알리고 현황 없이 진행한다.
async function optionalSnapshot(send) {
  try {
    return await ensureSnapshot(send);
  } catch (err) {
    send({ type: "warning", message: `Unity 현황 없이 진행해요. ${err.message}` });
    return null;
  }
}

// 변경 분석은 git만 있으면 된다. Unity를 못 읽으면 git 정보만으로 진행한다.
async function runChanges(_body, send, signal) {
  const dashboard = (await optionalSnapshot(send)) ?? { git: await readGit() };
  if (!dashboard.git || dashboard.git.error) throw new Error(dashboard.git?.error ?? "프로젝트가 git 저장소가 아니라서 변경을 분석할 수 없어요.");
  const onTool = (name) => send({ type: "progress", message: TOOL_LABELS[name] ?? name });
  const data = await changeAnalysis(dashboard, onTool, signal);
  send({ type: "result", data });
  send({ type: "saved", saved: await trySave(() => saveReport("changes", data, lastSnapshot)) });
}

function runAgent(type, agent) {
  return async (_body, send, signal) => {
    const dashboard = await ensureSnapshot(send);
    const onTool = (name) => send({ type: "progress", message: TOOL_LABELS[name] ?? name });
    const data = await agent(dashboard, onTool, signal);
    send({ type: "result", data });
    send({ type: "saved", saved: await trySave(() => saveReport(type, data, dashboard)) });
  };
}

// Firestore 저장. 실패해도 화면 결과는 그대로 두고 저장 상태만 알린다.
async function trySave(save) {
  if (!storeEnabled()) return { ok: false, message: "serviceAccount.json이 없어서 기록을 저장하지 않았어요." };
  try {
    return { ok: true, id: await save() };
  } catch (err) {
    console.error("Firestore 저장 실패:", err.message);
    return { ok: false, message: `기록 저장 실패: ${err.message}` };
  }
}

async function runPlan({ task }, send, signal) {
  if (!task?.trim()) throw new Error("업무 내용을 입력해 주세요.");
  const dashboard = await optionalSnapshot(send);
  const { goal, subtasks } = await decompose(task, dashboard, signal);
  send({ type: "subtasks", goal, subtasks });
  // 세부 업무마다 계획 에이전트를 동시에 돌리고, 끝나는 대로 화면에 보낸다.
  await Promise.all(
    subtasks.map((s) =>
      plan(task, goal, subtasks, s, dashboard, signal).then(
        (p) => send({ type: "plan", id: s.id, plan: p }),
        (err) => send({ type: "error", id: s.id, message: err.message }),
      ),
    ),
  );
}

async function runExecute({ task, goal, items }, send, signal) {
  if (!items?.length) throw new Error("승인한 세부 업무가 없어요.");
  const dashboard = lastSnapshot; // 계획 때 쓴 현황 그대로 (없으면 없이)
  const done = await Promise.all(
    items.map((item) =>
      execute(task, goal, item, dashboard, signal).then(
        (result) => {
          send({ type: "result", id: item.id, result });
          return { ...item, result };
        },
        (err) => {
          send({ type: "error", id: item.id, message: err.message });
          return null;
        },
      ),
    ),
  );
  const finished = done.filter(Boolean);
  if (!finished.length) throw new Error("실행에 성공한 세부 업무가 없어서 취합할 수 없어요.");
  send({ type: "reviewing" });
  const result = await review(task, goal, finished, signal);
  send({ type: "review", ...result });
  const record = { task, goal, items: finished.map(({ id, title, description, plan, note, result }) => ({ id, title, description, plan, note, result })), review: result };
  send({ type: "saved", saved: await trySave(() => saveReport("workflow", record, dashboard)) });
}

// 응답을 한 줄에 JSON 하나씩(NDJSON) 흘려보낸다. 브라우저 연결이 끊기면 Claude 호출도 멈춘다.
async function stream(req, res, run) {
  const body = await readBody(req);
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
  const send = (event) => {
    if (!res.writableEnded) res.write(JSON.stringify(event) + "\n");
  };
  if (!hasKey()) {
    send({ type: "fatal", message: "ANTHROPIC_API_KEY가 없어요. 3/.env 파일에 키를 넣고 서버를 다시 켜 주세요." });
    return res.end();
  }
  try {
    await run(body, send, controller.signal);
    send({ type: "done" });
  } catch (err) {
    if (!controller.signal.aborted) {
      console.error(err);
      send({ type: "fatal", message: err.message });
    }
  }
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(data));
}

function serveFile(req, res) {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(publicDir, name === "/" ? "index.html" : name);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return res.writeHead(404).end();
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}
