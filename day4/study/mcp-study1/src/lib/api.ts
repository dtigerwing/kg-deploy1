import type { StreamEvent } from "../../shared/types";
import { currentIdToken } from "./firebase";

export type ProgressEvent = Exclude<StreamEvent<unknown>, { type: "done" } | { type: "error" }>;

/**
 * API 주소. 로컬에서는 Vite 프록시를 타도록 비워 두고,
 * 배포 빌드에서는 Cloud Function 주소를 직접 씁니다 (Hosting을 거치면 60초에 끊기기 때문).
 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
export const apiUrl = (path: string) => `${API_BASE}${path}`;

/** 로그인 토큰을 붙여 API를 호출합니다. 로컬 개발처럼 로그인을 쓰지 않으면 토큰 없이 보냅니다. */
export async function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await currentIdToken();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 401 || res.status === 403) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "로그인이 필요합니다.");
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
  const res = await fetchApi(`/api/${endpoint}`, {
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
