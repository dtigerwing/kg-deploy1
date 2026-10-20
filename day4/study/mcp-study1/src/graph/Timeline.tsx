import type { Graph, GraphNode } from "./types";

interface Bar {
  nodeId: string;
  start: number;
  end: number;
  tone: "agent" | "code" | "human" | "failed";
  running: boolean;
  label: string;
}

const ROLE_SHORT: Partial<Record<GraphNode["role"], string>> = {
  decompose: "분해",
  plan: "계획",
  gate: "승인 대기",
  exec: "실행",
  reduce: "취합",
  evaluate: "평가",
  preview: "프리뷰",
};

function barsOf(n: GraphNode, now: number): Bar[] {
  const bars: Bar[] = n.failedSpans.map(([a, b]) => ({ nodeId: n.id, start: a, end: b, tone: "failed", running: false, label: "실패" }));
  const active = n.status === "running" || n.status === "waiting" || n.status === "done";
  if (n.startedAt != null && active && n.kind !== "io") {
    bars.push({
      nodeId: n.id,
      start: n.startedAt,
      end: n.finishedAt ?? now,
      tone: n.kind as Bar["tone"],
      running: n.finishedAt == null,
      label: ROLE_SHORT[n.role] ?? n.title,
    });
  }
  return bars;
}

/**
 * 세부 업무 하나를 한 줄(lane)에 놓은 간트 차트.
 * 줄마다 계획 → 승인 대기 → 실행이 이어지므로, 앞선 업무가 실행되는 동안
 * 다른 업무가 아직 계획 단계인 파이프라인 모양이 한눈에 보입니다.
 */
export function Timeline({
  graph,
  now,
  subtasks,
  critical,
  selectedId,
  onSelect,
}: {
  graph: Graph;
  now: number;
  subtasks: { id: string; title: string }[];
  critical: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const byRole = (roles: GraphNode["role"][]) => graph.nodes.filter((n) => roles.includes(n.role));
  const lanes: { key: string; label: string; bars: Bar[] }[] = [
    { key: "decompose", label: "분해", bars: byRole(["decompose"]).flatMap((n) => barsOf(n, now)) },
    ...subtasks.map((s) => ({
      key: s.id,
      label: s.title,
      bars: graph.nodes.filter((n) => n.subtaskId === s.id).flatMap((n) => barsOf(n, now)),
    })),
    { key: "final", label: "취합 · 평가 · 프리뷰", bars: byRole(["reduce", "evaluate", "preview"]).flatMap((n) => barsOf(n, now)) },
  ];

  const total = Math.max(10, now);
  const step = total > 120 ? 30 : total > 60 ? 15 : total > 30 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const pct = (sec: number) => `${(sec / total) * 100}%`;

  return (
    <div className="tl">
      <div className="tl-row tl-axis">
        <span className="tl-label" />
        <div className="tl-track">
          {ticks.map((t) => (
            <span key={t} className="tl-tick" style={{ left: pct(t) }}>
              {t}s
            </span>
          ))}
        </div>
      </div>
      {lanes.map((lane) => (
        <div key={lane.key} className="tl-row">
          <span className="tl-label" title={lane.label}>
            {lane.label}
          </span>
          <div className="tl-track">
            {ticks.map((t) => (
              <i key={t} className="tl-grid" style={{ left: pct(t) }} />
            ))}
            {lane.bars.map((bar, i) => (
              <button
                key={i}
                className={[
                  "tl-bar",
                  bar.tone,
                  bar.running ? "running" : "",
                  critical.has(bar.nodeId) && bar.tone !== "failed" ? "critical" : "",
                  bar.nodeId === selectedId ? "selected" : "",
                ].join(" ")}
                style={{ left: pct(bar.start), width: `max(3px, ${pct(bar.end - bar.start)})` }}
                title={`${bar.label} · ${(bar.end - bar.start).toFixed(1)}초`}
                onClick={() => onSelect(bar.nodeId)}
              >
                <span>{bar.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
