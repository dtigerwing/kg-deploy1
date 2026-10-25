// Unity MCP 연결. 이 서버는 Unity를 읽기만 한다.
// - Unity MCP 서버(mcp-for-unity)를 직접 띄워 MCP 클라이언트로 붙는다.
// - 부를 수 있는 MCP 도구는 execute_code(조회용 C#만), read_console(get)뿐이다. 실행하는 C#은 snippets/ 에 정해 둔 파일만 쓴다.
// - 연결할 때마다 프로젝트 경로가 .env의 UNITY_PROJECT와 같은지 확인하고, 다르면 아무것도 하지 않고 멈춘다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const snippetDir = path.join(here, "snippets");

let client = null;

export function projectPath() {
  return path.resolve(process.env.UNITY_PROJECT ?? "");
}

// ~/.unity-mcp/unity-mcp-status-<해시>.json 중 대상 프로젝트 것을 찾는다. 없으면 에디터가 꺼졌거나 MCP 연결이 꺼진 것이다.
function findInstance() {
  const dir = path.join(os.homedir(), ".unity-mcp");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^unity-mcp-status-.+\.json$/.test(f)) : [];
  for (const f of files) {
    const status = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (path.resolve(path.dirname(status.project_path)) === projectPath()) {
      return { name: `${status.project_name}@${f.slice("unity-mcp-status-".length, -".json".length)}`, status };
    }
  }
  return null;
}

async function connect() {
  if (client) return client;
  if (!process.env.UNITY_PROJECT) throw new Error(".env에 UNITY_PROJECT(Unity 프로젝트 경로)를 넣어 주세요.");
  const instance = findInstance();
  if (!instance) {
    throw new Error(`${path.basename(projectPath())} 에디터의 MCP 연결을 찾지 못했어요. Unity에서 프로젝트를 열고 Window > MCP for Unity에서 연결을 켜 주세요.`);
  }
  const [command, ...args] = (process.env.UNITY_MCP_COMMAND ?? "uvx --from mcpforunityserver==10.3.0 mcp-for-unity").split(" ");
  const next = new Client({ name: "unity-dashboard", version: "1.0.0" });
  await next.connect(new StdioClientTransport({ command, args, stderr: "ignore" }));
  try {
    await callRaw(next, "set_active_instance", { instance: instance.name });
    // 한 번 더 확인: 실제로 붙은 에디터의 프로젝트 경로
    const actual = await runCode(next, "return System.IO.Path.GetDirectoryName(UnityEngine.Application.dataPath);");
    if (path.resolve(actual) !== projectPath()) throw new Error(`연결된 프로젝트가 ${actual} 이라서 멈췄어요. 대상 프로젝트만 읽어요.`);
  } catch (err) {
    await next.close();
    throw err;
  }
  client = next;
  client.onclose = () => (client = null);
  return client;
}

export async function disconnect() {
  await client?.close();
  client = null;
}

async function callRaw(c, name, args) {
  const result = await c.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
  const text = result.content?.find((b) => b.type === "text")?.text ?? "";
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Unity MCP ${name} 응답을 읽지 못했어요: ${text.slice(0, 200)}`);
  }
  if (result.isError || body.success === false) throw new Error(`Unity MCP ${name} 실패: ${body.message ?? body.error ?? text.slice(0, 200)}`);
  return body;
}

async function runCode(c, code) {
  const body = await callRaw(c, "execute_code", { action: "execute", code, compiler: "codedom" });
  return body.data?.result;
}

// snippets/<name>.cs 를 읽어 {{키}} 자리에 값을 C# 문자열 리터럴로 넣고 실행한다.
async function runSnippet(name, params = {}) {
  let code = fs.readFileSync(path.join(snippetDir, `${name}.cs`), "utf8");
  for (const [key, value] of Object.entries(params)) code = code.replaceAll(`{{${key}}}`, csString(value));
  const c = await connect();
  try {
    return await runCode(c, code);
  } catch (err) {
    // 에디터가 재시작되면 연결이 끊긴다. 다음 요청 때 다시 붙도록 비운다.
    if (/closed|not connected|ECONN/i.test(err.message)) await disconnect();
    throw err;
  }
}

function csString(value) {
  return JSON.stringify(String(value)); // JSON 문자열 이스케이프는 C# 일반 문자열 리터럴과 호환된다
}

// ---------- 대시보드 ----------

export async function snapshot() {
  const data = await runSnippet("snapshot");
  data.console = await consoleSummary();
  return { ...data, readAt: new Date().toISOString() };
}

// 콘솔: 에러·경고 수와 많이 나온 메시지 순위
async function consoleSummary() {
  const c = await connect();
  const body = await callRaw(c, "read_console", { action: "get", types: ["error", "warning"], count: "500", format: "json" });
  const entries = Array.isArray(body.data) ? body.data : [];
  const groups = new Map();
  for (const e of entries) {
    const level = /warning/i.test(e.type) ? "warning" : "error";
    const message = String(e.message ?? "").split("\n")[0].slice(0, 300);
    const key = `${level}\u0000${message}`;
    const g = groups.get(key) ?? { level, message, count: 0, file: e.file ?? null };
    g.count++;
    groups.set(key, g);
  }
  const top = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  return {
    errors: entries.filter((e) => !/warning/i.test(e.type)).length,
    warnings: entries.filter((e) => /warning/i.test(e.type)).length,
    top,
  };
}

// ---------- 에이전트가 쓰는 조회 도구 (전부 읽기 전용) ----------

export function readPlayerSettings() {
  return runSnippet("player-settings");
}

export function listLargeAssets(limit) {
  return runSnippet("large-assets", { LIMIT: Math.max(1, Math.min(Number(limit) || 30, 60)) });
}

export function readImportSettings(paths) {
  const safe = (paths ?? []).filter((p) => typeof p === "string" && /^(Assets|Packages)\//.test(p) && !p.includes("..")).slice(0, 20);
  if (!safe.length) return Promise.resolve({ error: "Assets/ 또는 Packages/ 로 시작하는 경로를 넣어 주세요." });
  return runSnippet("import-settings", { PATHS: safe.join("\n") });
}
