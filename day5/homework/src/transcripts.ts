import { existsSync } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CLAUDE_PROJECTS_DIR } from "./config.js";
import type { ChunkPreview, ProjectInfo, ToolCall, Turn, WorkChunk, WorkStats } from "./types.js";

// Claude Code 대화 기록(*.jsonl)을 읽어 "요청 하나 = Turn 하나"로 정리한다.
// 기록 형식은 공개 문서가 없는 내부 형식이라, 쓰는 필드만 느슨하게 읽는다.

type Block = { type?: string; text?: string; id?: string; name?: string; input?: any; tool_use_id?: string; content?: unknown; is_error?: boolean };
type Line = {
  type?: string;
  timestamp?: string;
  cwd?: string;
  isMeta?: boolean;
  message?: { content?: string | Block[] };
};

const UNITY_PREFIX = /^mcp__unity[^_]*__/;
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function textOfResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b: Block) => (b.type === "text" ? (b.text ?? "") : "")).join(" ");
  return "";
}

function requestText(line: Line): string | null {
  if (line.type !== "user" || line.isMeta) return null;
  const content = line.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content) && !content.some((b) => b.type === "tool_result")
        ? content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n")
        : "";
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<system-reminder>") || trimmed.startsWith("Base directory for this skill")) return null;
  return trimmed;
}

function summarizeInput(tool: string, input: any): string {
  if (input && typeof input.code === "string") return `code: ${clip(oneLine(input.code), 220)}`;
  return clip(JSON.stringify(input ?? {}), 200);
}

function newTurn(sessionId: string, agent: string | null, time: string, request: string): Turn {
  return {
    sessionId, agent, start: time, end: time, request: clip(request, 1500),
    unityCalls: [], toolCounts: {}, filesEdited: [], plan: [], recap: "", finalText: "",
  };
}

// 기록 파일 하나를 Turn 목록으로 바꾼다. 서브에이전트 기록이면 첫 메시지(지시문)부터 하나의 Turn으로 본다.
async function parseFile(file: string, sessionId: string, agent: string | null, cwd: string): Promise<Turn[]> {
  const lines = (await readFile(file, "utf8")).split("\n");
  const results = new Map<string, Block>();
  const parsed: Line[] = [];
  for (const raw of lines) {
    if (!raw) continue;
    let line: Line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (line.type !== "user" && line.type !== "assistant") continue;
    parsed.push(line);
    const content = line.message?.content;
    if (line.type === "user" && Array.isArray(content)) {
      for (const block of content) if (block.type === "tool_result" && block.tool_use_id) results.set(block.tool_use_id, block);
    }
  }

  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const line of parsed) {
    const time = line.timestamp ?? "";
    const request = requestText(line);
    if (request !== null && (agent === null || current === null)) {
      current = newTurn(sessionId, agent, time, request);
      turns.push(current);
      continue;
    }
    if (!current || line.type !== "assistant" || !Array.isArray(line.message?.content)) continue;
    current.end = time || current.end;

    for (const block of line.message.content) {
      if (block.type === "text" && block.text?.trim()) current.finalText = clip(block.text.trim(), 1500);
      if (block.type !== "tool_use" || !block.name) continue;
      const name = block.name;
      current.toolCounts[name] = (current.toolCounts[name] ?? 0) + 1;

      if (UNITY_PREFIX.test(name)) {
        const result = results.get(block.id ?? "");
        const text = textOfResult(result?.content);
        const failed = Boolean(result?.is_error) || /"success"\s*:\s*false/.test(text.slice(0, 400));
        const call: ToolCall = {
          time,
          tool: name.replace(UNITY_PREFIX, ""),
          input: summarizeInput(name, block.input),
          ok: !failed,
          result: clip(oneLine(text), failed ? 400 : 160),
        };
        current.unityCalls.push(call);
      } else if (EDIT_TOOLS.has(name)) {
        const filePath = block.input?.file_path ?? block.input?.notebook_path;
        if (typeof filePath === "string") {
          const rel = path.relative(cwd, filePath) || filePath;
          if (!current.filesEdited.includes(rel)) current.filesEdited.push(rel);
        }
      } else if (name === "mcp__ccd_turn__update_plan" && Array.isArray(block.input?.items)) {
        current.plan = block.input.items.map((item: { content?: string }) => item.content ?? "").filter(Boolean);
      } else if (name === "TodoWrite" && Array.isArray(block.input?.todos)) {
        current.plan = block.input.todos.map((todo: { content?: string }) => todo.content ?? "").filter(Boolean);
      } else if (name === "mcp__ccd_turn__wrap_up" && typeof block.input?.recap === "string") {
        current.recap = block.input.recap;
      }
    }
  }
  return turns;
}

// ── 프로젝트 목록 ──

// 세션 도중 작업 폴더를 옮기는 경우가 있어, 기록 끝부분에 남은 마지막 작업 폴더를 쓴다.
async function readTail(file: string, bytes = 262144): Promise<string> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(bytes, size);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, size - length);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

// 기록 끝부분에서 나온 작업 폴더들 (뒤에 나온 것이 먼저)
async function recentCwds(file: string): Promise<string[]> {
  const cwds: string[] = [];
  for (const raw of (await readTail(file)).split("\n").reverse()) {
    try {
      const line = JSON.parse(raw) as Line;
      if (line.cwd && !cwds.includes(line.cwd)) cwds.push(line.cwd);
    } catch {
      // 잘린 첫 줄은 건너뛴다
    }
  }
  return cwds;
}

// 작업 도중 Assets/ 같은 하위 폴더로 들어가기도 해서, 위로 올라가며
// ProjectSettings/ProjectVersion.txt가 있는 Unity 프로젝트 루트를 찾는다.
function unityRootOf(dir: string): string | null {
  for (let current = dir; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, "ProjectSettings", "ProjectVersion.txt"))) return current;
    if (path.dirname(current) === current) return null;
  }
}

async function sessionFiles(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  return names.filter((name) => name.endsWith(".jsonl")).map((name) => path.join(dir, name));
}

export async function listUnityProjects(): Promise<ProjectInfo[]> {
  const dirs = await readdir(CLAUDE_PROJECTS_DIR).catch(() => [] as string[]);
  const projects: ProjectInfo[] = [];
  for (const id of dirs) {
    const files = await sessionFiles(path.join(CLAUDE_PROJECTS_DIR, id));
    if (files.length === 0) continue;
    const withTimes = await Promise.all(files.map(async (file) => ({ file, mtimeMs: (await stat(file)).mtimeMs })));
    withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs);

    let root: string | null = null;
    for (const { file } of withTimes) {
      for (const cwd of await recentCwds(file)) {
        root = unityRootOf(cwd);
        if (root) break;
      }
      if (root) break;
    }
    if (!root) continue;
    projects.push({
      id,
      name: path.basename(root),
      path: root,
      sessionCount: files.length,
      lastActivity: new Date(withTimes[0].mtimeMs).toISOString(),
    });
  }
  return projects.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

// ── 작업 묶음 (세션 × 날짜) ──

const cache = new Map<string, { mtimeMs: number; turns: Turn[] }>();

async function cachedParse(file: string, sessionId: string, agent: string | null, cwd: string): Promise<Turn[]> {
  const { mtimeMs } = await stat(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.turns;
  const turns = await parseFile(file, sessionId, agent, cwd);
  cache.set(file, { mtimeMs, turns });
  return turns;
}

async function sessionTitle(dir: string, sessionId: string, turns: Turn[]): Promise<string> {
  try {
    const raw = JSON.parse(await readFile(path.join(dir, sessionId, "custom-title.json"), "utf8"));
    const title = raw.title ?? raw.customTitle ?? raw.name;
    if (typeof title === "string" && title.trim()) return title.trim();
  } catch {
    // 제목 파일이 없으면 첫 요청으로 대신한다
  }
  return clip(oneLine(turns[0]?.request ?? sessionId), 40);
}

async function subagentTurns(dir: string, sessionId: string, cwd: string): Promise<Turn[]> {
  const subDir = path.join(dir, sessionId, "subagents");
  const files = (await readdir(subDir).catch(() => [] as string[])).filter((name) => name.endsWith(".jsonl"));
  const turns: Turn[] = [];
  for (const name of files) {
    let label = "서브에이전트";
    try {
      const meta = JSON.parse(await readFile(path.join(subDir, name.replace(/\.jsonl$/, ".meta.json")), "utf8"));
      label = `서브에이전트 ${meta.agentType ?? ""}: ${meta.description ?? ""}`.trim();
    } catch {
      // meta 파일이 없어도 기록은 읽는다
    }
    turns.push(...(await cachedParse(path.join(subDir, name), sessionId, label, cwd)));
  }
  return turns;
}

export async function loadChunks(project: ProjectInfo, from: string, to: string): Promise<WorkChunk[]> {
  const dir = path.join(CLAUDE_PROJECTS_DIR, project.id);
  const chunks = new Map<string, WorkChunk>();
  for (const file of await sessionFiles(dir)) {
    const sessionId = path.basename(file, ".jsonl");
    const main = await cachedParse(file, sessionId, null, project.path);
    const title = await sessionTitle(dir, sessionId, main);
    const all = [...main, ...(await subagentTurns(dir, sessionId, project.path))];
    for (const turn of all) {
      if (!turn.start) continue;
      const date = localDate(turn.start);
      if (date < from || date > to) continue;
      const id = `${sessionId}:${date}`;
      let chunk = chunks.get(id);
      if (!chunk) {
        chunk = { id, sessionId, sessionTitle: title, date, start: turn.start, end: turn.end, turns: [] };
        chunks.set(id, chunk);
      }
      chunk.turns.push(turn);
      if (turn.start < chunk.start) chunk.start = turn.start;
      if (turn.end > chunk.end) chunk.end = turn.end;
    }
  }
  for (const chunk of chunks.values()) chunk.turns.sort((a, b) => a.start.localeCompare(b.start));
  return [...chunks.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export function previewOf(chunk: WorkChunk): ChunkPreview {
  const calls = chunk.turns.flatMap((turn) => turn.unityCalls);
  return {
    id: chunk.id,
    sessionTitle: chunk.sessionTitle,
    date: chunk.date,
    start: chunk.start,
    end: chunk.end,
    requests: chunk.turns.filter((turn) => !turn.agent).length,
    unityCalls: calls.length,
    unityFailures: calls.filter((call) => !call.ok).length,
    filesEdited: new Set(chunk.turns.flatMap((turn) => turn.filesEdited)).size,
    firstRequest: clip(oneLine(chunk.turns.find((turn) => !turn.agent)?.request ?? chunk.turns[0]?.request ?? ""), 120),
  };
}

export function statsOf(chunks: WorkChunk[]): WorkStats {
  const turns = chunks.flatMap((chunk) => chunk.turns);
  const calls = turns.flatMap((turn) => turn.unityCalls);
  const toolCounts = new Map<string, number>();
  for (const call of calls) toolCounts.set(call.tool, (toolCounts.get(call.tool) ?? 0) + 1);
  return {
    chunks: chunks.length,
    sessions: new Set(chunks.map((chunk) => chunk.sessionId)).size,
    activeDays: new Set(chunks.map((chunk) => chunk.date)).size,
    requests: turns.filter((turn) => !turn.agent).length,
    unityCalls: calls.length,
    unityFailures: calls.filter((call) => !call.ok).length,
    filesEdited: new Set(turns.flatMap((turn) => turn.filesEdited)).size,
    unityToolCounts: [...toolCounts].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
  };
}

// ── 요약 서브에이전트에게 줄 텍스트 ──

const MAX_CALLS_PER_TURN = 40;

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function digestOf(chunk: WorkChunk): string {
  const parts = [`# ${chunk.sessionTitle} · ${chunk.date}`];
  chunk.turns.forEach((turn, index) => {
    const failed = turn.unityCalls.filter((call) => !call.ok);
    // 실패한 호출은 모두 넣고, 나머지는 앞에서부터 채운다
    const shown = [...failed, ...turn.unityCalls.filter((call) => call.ok)]
      .slice(0, MAX_CALLS_PER_TURN)
      .sort((a, b) => a.time.localeCompare(b.time));
    const otherTools = Object.entries(turn.toolCounts)
      .filter(([name]) => !UNITY_PREFIX.test(name) && !name.startsWith("mcp__ccd_"))
      .map(([name, count]) => `${name} ${count}`)
      .join(", ");

    parts.push(`\n## ${turn.agent ? turn.agent : `요청 ${index + 1}`} (${hhmm(turn.start)}~${hhmm(turn.end)})`);
    parts.push(`[요청]\n${turn.request}`);
    if (turn.plan.length) parts.push(`[할 일 목록]\n${turn.plan.map((item) => `- ${item}`).join("\n")}`);
    if (turn.unityCalls.length) {
      parts.push(`[Unity MCP 호출 ${turn.unityCalls.length}회 · 실패 ${failed.length}회]`);
      for (const call of shown) parts.push(`- ${hhmm(call.time)} ${call.tool} ${call.ok ? "성공" : "실패"} | ${call.input} → ${call.result}`);
      if (turn.unityCalls.length > shown.length) parts.push(`- … 외 성공 ${turn.unityCalls.length - shown.length}회`);
    }
    if (turn.filesEdited.length) parts.push(`[수정한 파일]\n${turn.filesEdited.join(", ")}`);
    if (otherTools) parts.push(`[기타 도구] ${otherTools}`);
    if (turn.recap) parts.push(`[마무리 요약]\n${turn.recap}`);
    if (turn.finalText) parts.push(`[마지막 답변]\n${turn.finalText}`);
  });
  return parts.join("\n");
}
