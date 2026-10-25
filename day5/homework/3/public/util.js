export const $ = (id) => document.getElementById(id);

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function formatBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

// Firestore 기록 저장 결과 (배포된 웹에서 보이는지)
export function saveText(saved) {
  if (!saved) return "";
  return saved.ok ? "기록 저장됨 · 배포된 웹에서 볼 수 있어요" : saved.message;
}

export function showNotice(text) {
  $("notice").hidden = !text;
  $("notice").textContent = text;
}

// 서버가 한 줄에 JSON 하나씩 보내 주는 것을 받는 대로 onEvent로 넘긴다. fatal 이벤트는 예외로 바꾼다.
export async function streamEvents(url, body, onEvent) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  if (!res.ok || !res.body) throw new Error(`서버 오류 (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "fatal") throw new Error(event.message);
      onEvent(event);
    }
  }
}
