import { useEffect, useState } from "react";
import type { Live } from "../lib/useWorkflow";

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 서브에이전트가 일하는 동안 경과 시간, 사고 과정 요약, 생성 분량을 보여줍니다. */
export function LiveTicker({ live, label }: { live: Live | undefined; label: string }) {
  const now = useNow();
  if (!live) return null;
  const seconds = Math.max(0, Math.round((now - live.startedAt) / 1000));
  const thought = live.thinking.trim().split("\n").filter(Boolean).slice(-2).join(" ");
  return (
    <div className="ticker" role="status" aria-live="polite">
      <div className="ticker-head">
        <span className="spinner" aria-hidden />
        <span>{label}</span>
        <span className="ticker-meta">
          {seconds}초{live.chars > 0 ? ` · ${live.chars.toLocaleString()}자 생성` : ""}
        </span>
      </div>
      {thought && <p className="ticker-thought">{thought}</p>}
    </div>
  );
}
