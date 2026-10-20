import type { StreamEvent } from "../../shared/types";

export type ProgressEvent = Exclude<StreamEvent<unknown>, { type: "done" } | { type: "error" }>;

/**
 * API 주소. 로컬에서는 Vite 프록시를 타도록 비워 두고,
 * 배포 빌드에서는 Cloud Function 주소를 직접 씁니다 (Hosting을 거치면 60초에 끊기기 때문).
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
export const apiUrl = (path: string) => `${API_BASE}${path}`;

const ACCESS_KEY = "agentic-workflow.access-code";

function readAccessCode(): string {
  try {
    return localStorage.getItem(ACCESS_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveAccessCode(code: string) {
  try {
    localStorage.setItem(ACCESS_KEY, code);
  } catch {
    // 저장소를 쓸 수 없으면 이번 탭에서만 다시 묻습니다.
  }
}

let sessionCode = readAccessCode();
// 서브에이전트 여러 개가 동시에 401을 받아도 코드는 한 번만 묻습니다.
let pendingPrompt: Promise<string | null> | null = null;

function askAccessCode(rejected: string): Promise<string | null> {
  if (sessionCode && sessionCode !== rejected) return Promise.resolve(sessionCode); // 다른 요청이 이미 새 코드를 받음
  pendingPrompt ??= Promise.resolve(window.prompt("접속 코드를 입력하세요")?.trim() || null).finally(() => {
    pendingPrompt = null;
  });
  return pendingPrompt;
}

/** 접속 코드를 붙여 요청하고, 401이면 코드를 물어본 뒤 한 번 더 시도합니다. */
async function fetchWithAccess(path: string, init: RequestInit): Promise<Response> {
  const send = (code: string) => fetch(apiUrl(path), { ...init, headers: { ...init.headers, "X-Access-Code": code } });
  const used = sessionCode;
  let res = await send(used);
  if (res.status === 401) {
    const entered = await askAccessCode(used);
    if (!entered) throw new Error("접속 코드가 필요합니다.");
    res = await send(entered);
    if (res.status === 401) throw new Error("접속 코드가 올바르지 않습니다.");
    sessionCode = entered;
    saveAccessCode(entered);
  }
  return res;
}

/**
 * 서버의 에이전트 엔드포인트를 호출하고 NDJSON 스트림을 읽습니다.
 * 진행 이벤트는 onEvent로 흘려보내고, 최종 결과를 반환하거나 오류를 던집니다.
 */
export async function callAgent<T>(
  endpoint: "decompose" | "plan" | "execute" | "evaluate" | "preview",
  body: unknown,
  opts: { signal?: AbortSignal; onEvent?: (event: ProgressEvent) => void } = {},
): Promise<T> {
  const res = await fetchWithAccess(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`서버 오류 (${res.status})`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as StreamEvent<T>;
      if (event.type === "done") return event.data;
      if (event.type === "error") throw new Error(event.message);
      opts.onEvent?.(event);
    }
  }
  throw new Error("서버 응답이 중간에 끊겼습니다. 다시 시도해 주세요.");
}
