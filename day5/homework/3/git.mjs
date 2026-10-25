// Unity 프로젝트의 git 저장소 읽기. 저장소는 Bitbucket이어도 상관없이 이 노트북의 로컬 저장소를 읽는다(fetch 안 함).
// - 커밋 목록·상태와 에이전트의 조회는 server-git MCP(mcp-server-git)로 한다. 읽기 도구만 허용한다.
// - 커밋별 파일 통계와 커밋 안 한 파일 목록은 가벼운 git 명령으로 읽는다(MCP의 git_show는 diff 전체를 줘서 무겁다).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { projectPath } from "./unity.mjs";

// 에이전트와 대시보드가 부를 수 있는 server-git 도구. git_commit, git_add, git_reset, git_checkout, git_create_branch는 절대 부르지 않는다.
export const READ_TOOLS = ["git_status", "git_log", "git_show", "git_diff", "git_diff_unstaged", "git_diff_staged", "git_branch"];
const RECENT_COMMITS = 10;
const BIG_FILE_BYTES = 50 * 1024 * 1024;
const MAX_CHANGED_LIST = 50;

let client = null;
let clientRoot = null;

// UNITY_PROJECT가 들어 있는 저장소의 최상위 폴더. git 저장소가 아니면 null.
export function repoRoot() {
  try {
    return execFileSync("git", ["-C", projectPath(), "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

async function connect(root) {
  if (client && clientRoot === root) return client;
  await disconnect();
  const [command, ...args] = (process.env.GIT_MCP_COMMAND ?? "uvx mcp-server-git==2026.10.19").split(" ");
  const next = new Client({ name: "unity-dashboard-git", version: "1.0.0" });
  // --repository로 이 저장소 밖은 못 읽게 묶는다.
  await next.connect(new StdioClientTransport({ command, args: [...args, "--repository", root], stderr: "ignore" }));
  next.onclose = () => (client = null);
  client = next;
  clientRoot = root;
  return client;
}

export async function disconnect() {
  await client?.close();
  client = null;
}

// 읽기 도구만 부른다. repo_path는 서버가 채운다(에이전트가 다른 경로를 고를 수 없다).
export async function callGit(name, args = {}) {
  if (!READ_TOOLS.includes(name)) throw new Error(`허용하지 않은 git 도구예요: ${name}`);
  const root = repoRoot();
  if (!root) throw new Error("프로젝트가 git 저장소가 아니에요.");
  const c = await connect(root);
  const result = await c.callTool({ name, arguments: { ...args, repo_path: root } }, undefined, { timeout: 60_000 });
  const text = result.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") ?? "";
  if (result.isError) throw new Error(text.slice(0, 300));
  return text;
}

// ---------- 대시보드 ----------

export async function readGit() {
  const root = repoRoot();
  if (!root) return null;
  const [logText, statusText] = await Promise.all([callGit("git_log", { max_count: RECENT_COMMITS }), callGit("git_status")]);
  const commits = parseLog(logText);
  const files = commitFiles(root, commits.map((c) => c.hash));
  const changes = workingChanges(root);
  return {
    root,
    unityFolder: path.relative(root, projectPath()) || ".",
    remote: remoteHost(root),
    ...parseStatus(statusText),
    commits: commits.map((c) => ({ ...c, ...summarizeFiles(files.get(c.hash) ?? []) })),
    changes: { count: changes.length, files: changes.slice(0, MAX_CHANGED_LIST), kinds: countKinds(changes.map((f) => f.path)) },
    checks: unityChecks(root, changes),
  };
}

// git_log 텍스트: "Commit: <hash>\nAuthor: ..\nDate: ..\nMessage: .." 묶음
function parseLog(text) {
  return text
    .split(/\n(?=Commit: )/)
    .map((block) => {
      const get = (key) => block.match(new RegExp(`^${key}: (.*)$`, "m"))?.[1]?.trim() ?? "";
      const hash = get("Commit");
      if (!hash) return null;
      const message = block.split(/^Message: /m)[1]?.trim() ?? "";
      return { hash: hash.slice(0, 7), fullHash: hash, author: get("Author"), date: get("Date").slice(0, 16).replace("T", " "), message: message.split("\n")[0] };
    })
    .filter(Boolean);
}

// git_status 텍스트에서 브랜치와 원격과의 차이를 읽는다.
function parseStatus(text) {
  const branch = text.match(/^On branch (.+)$/m)?.[1] ?? null;
  const upstream = text.match(/'([^']+)'/)?.[1] ?? null;
  const ahead = Number(text.match(/ahead of '[^']+' by (\d+)/)?.[1] ?? text.match(/have (\d+) and \d+ different commits/)?.[1] ?? 0);
  const behind = Number(text.match(/behind '[^']+' by (\d+)/)?.[1] ?? text.match(/have \d+ and (\d+) different commits/)?.[1] ?? 0);
  return { branch, upstream, ahead: upstream ? ahead : null, behind: upstream ? behind : null };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}

// 커밋별 바뀐 파일 경로 (git show --name-only 한 번에)
function commitFiles(root, hashes) {
  const map = new Map();
  if (!hashes.length) return map;
  const out = git(root, ["show", "--no-renames", "--name-only", "--format=%x1e%h", ...hashes]);
  for (const chunk of out.split("\x1e").filter((c) => c.trim())) {
    const [hash, ...files] = chunk.split("\n");
    map.set(hash.trim(), files.filter(Boolean));
  }
  return map;
}

// 커밋 안 한 파일 (새 폴더 안의 파일까지 하나씩)
function workingChanges(root) {
  const STATE = { M: "수정", A: "추가", D: "삭제", R: "이름 변경", "?": "새 파일" };
  return git(root, ["status", "--porcelain=v1", "-uall", "--no-renames"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2).trim()[0] ?? "M";
      return { state: STATE[code] ?? "수정", path: line.slice(3).replace(/^"|"$/g, "") };
    });
}

function remoteHost(root) {
  try {
    const url = git(root, ["remote", "get-url", "origin"]).trim();
    return url.replace(/^[a-z]+:\/\/[^@/]*@/, "https://").replace(/^git@([^:]+):/, "https://$1/").match(/\/\/([^/]+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---------- 파일 종류 ----------

const KINDS = [
  ["meta", /\.meta$/i],
  ["씬", /\.unity$/i],
  ["프리팹", /\.prefab$/i],
  ["스크립트", /\.(cs|asmdef|asmref)$/i],
  ["셰이더", /\.(shader|cginc|hlsl|shadergraph|compute)$/i],
  ["텍스처", /\.(png|jpe?g|tga|psd|exr|hdr|tiff?|bmp|gif)$/i],
  ["모델", /\.(fbx|obj|blend|dae)$/i],
  ["오디오", /\.(wav|mp3|ogg|aiff?|flac)$/i],
  ["머티리얼", /\.mat$/i],
  ["애니메이션", /\.(anim|controller|overrideController)$/i],
  ["설정", /(^|\/)(ProjectSettings\/|Packages\/(manifest|packages-lock)\.json$)/],
  ["문서", /\.(md|txt|pdf|docx?|xlsx?|pptx?)$/i],
  ["에셋", /\.asset$/i],
];

function kindOf(file) {
  return KINDS.find(([, re]) => re.test(file))?.[0] ?? "기타";
}

function countKinds(files) {
  const counts = {};
  for (const f of files) counts[kindOf(f)] = (counts[kindOf(f)] ?? 0) + 1;
  return Object.entries(counts)
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => (a.kind === "meta") - (b.kind === "meta") || b.count - a.count);
}

function summarizeFiles(files) {
  return { fileCount: files.length, kinds: countKinds(files) };
}

// ---------- Unity 규칙 점검 (커밋 안 한 변경) ----------

function unityChecks(root, changes) {
  const unity = path.relative(root, projectPath());
  const prefix = unity ? `${unity}/` : "";
  const inAssets = (p) => p.startsWith(`${prefix}Assets/`);
  const changed = new Set(changes.map((c) => c.path));
  const checks = [];

  // 새로 생기거나 지운 에셋은 .meta도 같이 생기거나 지워져야 한다.
  const metaMissing = changes
    .filter((c) => inAssets(c.path) && !c.path.endsWith(".meta") && ["새 파일", "추가", "삭제"].includes(c.state))
    .filter((c) => !changed.has(`${c.path}.meta`))
    .map((c) => c.path);
  const orphanMeta = changes
    .filter((c) => inAssets(c.path) && c.path.endsWith(".meta") && ["새 파일", "추가", "삭제"].includes(c.state))
    .filter((c) => !changed.has(c.path.slice(0, -5)) && !isFolderMeta(root, c))
    .map((c) => c.path);
  checks.push(
    metaMissing.length || orphanMeta.length
      ? { level: "warn", title: ".meta 짝이 안 맞아요", detail: [...metaMissing.map((p) => `${p} (meta 없음)`), ...orphanMeta.map((p) => `${p} (원본 없음)`)].slice(0, 10) }
      : { level: "ok", title: ".meta 짝 맞음", detail: [] },
  );

  const settings = changes.filter((c) => kindOf(c.path) === "설정").map((c) => c.path);
  if (settings.length) checks.push({ level: "warn", title: `프로젝트 설정 파일이 바뀌었어요 (${settings.length}개)`, detail: settings.slice(0, 10) });

  const big = changes
    .filter((c) => c.state !== "삭제")
    .map((c) => ({ path: c.path, size: fileSize(path.join(root, c.path)) }))
    .filter((f) => f.size >= BIG_FILE_BYTES);
  if (big.length) checks.push({ level: "warn", title: `50MB 넘는 파일이 있어요 (${big.length}개)`, detail: big.map((f) => `${f.path} (${Math.round(f.size / 1024 / 1024)}MB)`).slice(0, 10) });

  const scenes = changes.filter((c) => kindOf(c.path) === "씬").map((c) => c.path);
  if (scenes.length) checks.push({ level: "info", title: `씬이 바뀌었어요 (${scenes.length}개)`, detail: scenes.slice(0, 10) });
  return checks;
}

// 폴더의 .meta는 원본이 폴더라서 파일 목록에 따로 안 나온다.
function isFolderMeta(root, change) {
  const target = path.join(root, change.path.slice(0, -5));
  return change.state === "삭제" ? !fs.existsSync(target) && !/\.[^/]+$/.test(change.path.slice(0, -5)) : fs.existsSync(target) && fs.statSync(target).isDirectory();
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

// ---------- 에이전트용: diff를 Claude에게 넘기기 좋게 줄이기 ----------

const MAX_FILE_CHARS = 3000;
const MAX_TOTAL_CHARS = 60000;
const YAML_KINDS = new Set(["씬", "프리팹", "에셋", "머티리얼", "애니메이션", "설정"]);

// .meta는 빼고, 씬·프리팹 같은 Unity YAML은 바뀐 줄 수와 앞부분만, 나머지도 파일당 길이를 자른다.
export function compactDiff(text) {
  // git_diff_*는 "diff --git" 줄로, git_show는 "--- a/…" / "--- /dev/null" 줄로 파일이 나뉜다.
  const splitter = /\ndiff --git /.test(text) ? /\n(?=diff --git )/ : /\n(?=--- (?:a\/|\/dev\/null)[^\n]*\n\+\+\+ )/;
  const [head, ...chunks] = text.split(splitter);
  const kept = [head.trim()];
  let total = kept[0].length;
  let metaCount = 0;
  const skipped = [];
  for (const chunk of chunks) {
    const file = chunk.match(/^\+\+\+ b\/(.+)$/m)?.[1] ?? chunk.match(/^--- a\/(.+)$/m)?.[1] ?? "";
    if (file.endsWith(".meta")) {
      metaCount++;
      continue;
    }
    const lines = chunk.split("\n");
    const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
    const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
    let body;
    if (/^Binary files /m.test(chunk)) body = `${file}: 바이너리 파일 변경`;
    else if (YAML_KINDS.has(kindOf(file))) {
      const hunk = lines.findIndex((l) => l.startsWith("@@"));
      body = `${file}: Unity YAML +${added} -${removed}줄\n${lines.slice(Math.max(hunk, 0), hunk + 15).join("\n")}`;
    }
    else body = chunk.length > MAX_FILE_CHARS ? `${chunk.slice(0, MAX_FILE_CHARS)}\n… (${file} +${added} -${removed}줄 중 앞부분만)` : chunk;
    if (total + body.length > MAX_TOTAL_CHARS) {
      skipped.push(`${file} (+${added} -${removed})`);
      continue;
    }
    kept.push(body);
    total += body.length;
  }
  if (metaCount) kept.push(`(.meta 파일 ${metaCount}개 변경은 뺐어요)`);
  if (skipped.length) {
    // 많으면 폴더별 개수로 묶는다.
    const byFolder = new Map();
    for (const s of skipped) {
      const folder = path.dirname(s.split(" (")[0]);
      byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
    }
    const folders = [...byFolder].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([f, n]) => `${f}/ ${n}개`);
    kept.push(`(길이 제한으로 내용을 못 넣은 파일 ${skipped.length}개, 폴더별: ${folders.join(", ")}${byFolder.size > 40 ? ` 외 ${byFolder.size - 40}개 폴더` : ""})`);
  }
  return kept.join("\n\n");
}

// 에이전트가 넘긴 커밋·브랜치 이름 검사 (옵션 주입 막기)
export function safeRevision(value) {
  const rev = String(value ?? "").trim();
  if (!rev || rev.startsWith("-") || !/^[\w.\-/~^@:]+$/.test(rev)) throw new Error(`쓸 수 없는 리비전이에요: ${rev}`);
  return rev;
}
