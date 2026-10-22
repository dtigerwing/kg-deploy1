// 개발 일지 기록 스크립트
//   npm run record -- [--project <Unity 프로젝트 경로>] [--build build.json] [--imports imports.json]
//                      [--perf perf.json] [--warnings warnings.json] [--date YYYY-MM-DD] [--dry-run]
//   npm run weekly -- [--date YYYY-MM-DD] [--dry-run]
//
// build.json, imports.json: unity-snippets/build-report.cs 가 만든다.
// warnings.json: unity-snippets/warnings.cs 가 만든다.
// perf.json:  { "scenes": [{ "name": "Battle", "frameMs": 18.2, "drawCalls": 310 }] }

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { compareBuild, judgePerf, PERF_HISTORY_DAYS } from "./compare.mjs";
import { analyzeBuild, analyzeWarnings } from "./agents.mjs";
import { ask } from "./claude.mjs";

const { positionals, values: opts } = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string" },
    build: { type: "string" },
    imports: { type: "string" },
    perf: { type: "string" },
    warnings: { type: "string" },
    date: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const command = positionals[0];
const date = opts.date ?? today();
const dryRun = opts["dry-run"];
const db = dryRun ? null : openFirestore();

if (command === "record") await record();
else if (command === "weekly") await weekly();
else fail("명령은 record 또는 weekly 중 하나예요.");

async function record() {
  const project = opts.project || readJson("journal.config.json").unityProject;
  if (!project) fail("journal.config.json 의 unityProject 나 --project 로 Unity 프로젝트 경로를 알려 주세요.");
  const commits = readCommits(project, date);
  const files = commits.flatMap((c) => c.files);
  const previous = await previousDays(date, 30);

  const buildReport = opts.build ? readJson(opts.build) : null;
  const build = buildReport ? compareBuild(buildReport, previous.find((d) => d.build)) : null;
  const perf = opts.perf ? judgePerf(readJson(opts.perf), previous.slice(0, PERF_HISTORY_DAYS)) : null;
  const imports = opts.imports ? readJson(opts.imports) : null;
  const warnings = opts.warnings ? readJson(opts.warnings) : null;

  // 분석 에이전트는 서로 독립이라 동시에 돌린다.
  const [buildAnalysis, warningAnalysis] = await Promise.all([
    build && imports ? analyzeBuild(build, buildReport, imports) : null,
    warnings ? analyzeWarnings(warnings, countScripts(project)) : null,
  ]);

  const day = {
    date,
    commits,
    changedPrefabs: new Set(files.filter((f) => f.endsWith(".prefab"))).size,
    changedScenes: new Set(files.filter((f) => f.endsWith(".unity"))).size,
    build,
    perf,
    analysis: {
      build: buildAnalysis,
      warnings: warningAnalysis && { ...warningAnalysis, errors: warnings.errors, warnings: warnings.warnings },
    },
  };
  day.summary = await summarizeDay(day);
  await save("days", date, day);
}

async function weekly() {
  const start = mondayOf(date);
  const end = addDays(start, 6);
  const weekDays = (await previousDays(addDays(end, 1), 7)).filter((d) => d.date >= start);
  if (!weekDays.length) fail(`${start} ~ ${end} 사이에 기록이 없어요.`);
  const text = await ask(
    "Unity 클라이언트 개발자의 하루 기록 여러 개를 받아 주간 보고를 써. " +
      "첫 줄은 '이번 주 주요 작업', 그 아래 '- '로 시작하는 항목 3~6개, 빈 줄, 빌드 용량과 성능 추이를 1~2문장으로. " +
      "해요체를 쓰고, 기록에 없는 내용은 지어내지 마.",
    weekDays.map(forPrompt).reverse(),
  );
  await save("weeks", start, { start, end, text });
}

function readCommits(project, day) {
  let out;
  try {
    out = execFileSync(
      "git",
      ["-C", project, "log", "--reverse", `--since=${day} 00:00`, `--until=${addDays(day, 1)} 00:00`,
        "--date=format:%H:%M", "--pretty=format:%x1e%h%x1f%ad%x1f%s", "--name-only"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    console.warn(`${project} 에서 git log를 읽지 못해 커밋 없이 기록해요. git 저장소인지 확인해 주세요.`);
    return [];
  }
  return out
    .split("\x1e")
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const [head, ...files] = chunk.split("\n");
      const [hash, time, msg] = head.split("\x1f");
      return { hash, time, msg, files: files.filter(Boolean) };
    });
}

function countScripts(project) {
  const assets = path.join(project, "Assets");
  if (!fs.existsSync(assets)) return 0;
  return fs.readdirSync(assets, { recursive: true }).filter((f) => String(f).endsWith(".cs")).length;
}

async function summarizeDay(day) {
  return ask(
    "Unity 클라이언트 개발자의 하루 기록(JSON)을 받아 '오늘 요약'을 3문장 이내로 써. " +
      "커밋으로 오늘 한 일을 먼저 말하고, 빌드 용량이 늘었으면 원인으로 보이는 에셋을, " +
      "성능이 '하락'인 씬이 있으면 의심되는 커밋을 짚어 줘. analysis에는 빌드·경고 분석 결과가 있으니 가장 중요한 한 가지를 언급해. " +
      "변화가 없는 항목은 짧게 넘어가. " +
      "해요체를 쓰고, 기록에 없는 내용은 지어내지 마. 마크다운은 쓰지 마.",
    forPrompt(day),
  );
}

// 프롬프트에는 비교용으로만 저장하는 에셋 목록(top)을 빼고 보낸다.
function forPrompt(day) {
  if (!day.build) return day;
  const { top, ...build } = day.build;
  return { ...day, build };
}

function openFirestore() {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT ?? "serviceAccount.json";
  if (!fs.existsSync(keyPath)) {
    fail(`${keyPath} 가 없어요. Firebase 콘솔 > 프로젝트 설정 > 서비스 계정에서 비공개 키를 받아 이 이름으로 저장해 주세요.`);
  }
  initializeApp({ credential: cert(readJson(keyPath)) });
  return getFirestore();
}

async function previousDays(beforeDate, count) {
  if (!db) return [];
  const snap = await db.collection("days").where("date", "<", beforeDate).orderBy("date", "desc").limit(count).get();
  return snap.docs.map((d) => d.data());
}

async function save(collection, id, data) {
  if (dryRun) {
    console.log(JSON.stringify(forPrompt(data), null, 2));
    return;
  }
  await db.collection(collection).doc(id).set({ ...data, updatedAt: FieldValue.serverTimestamp() });
  console.log(`${collection}/${id} 저장 완료`);
  console.log(data.summary ?? data.text);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function today() {
  const now = new Date();
  return formatDate(now);
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(text, n) {
  const [y, m, d] = text.split("-").map(Number);
  return formatDate(new Date(y, m - 1, d + n));
}

function mondayOf(text) {
  const [y, m, d] = text.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  return addDays(text, weekday === 0 ? -6 : 1 - weekday);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
