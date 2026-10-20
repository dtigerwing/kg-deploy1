import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { edgePath, layoutGraph, type Box } from "./layout";
import type { Graph, GraphNode } from "./types";

const KIND_LABEL: Record<GraphNode["kind"], string> = { agent: "AGENT", code: "CODE", human: "HUMAN", io: "" };

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 새로 생기는 노드가 어디에서 '갈라져 나오는지' (분해 → 계획 → 승인 → 실행) */
function parentOf(n: GraphNode): string | null {
  if (!n.subtaskId) return null;
  if (n.role === "plan") return "decompose";
  if (n.role === "gate") return `plan:${n.subtaskId}`;
  if (n.role === "exec") return `gate:${n.subtaskId}`;
  return null;
}

function spawnDelay(n: GraphNode, rowOf: Map<string, number>): number {
  const row = n.subtaskId ? (rowOf.get(n.subtaskId) ?? 0) : 0;
  const stage = n.role === "plan" ? 0 : n.role === "gate" ? 1 : n.role === "exec" ? 2 : 0;
  return row * 70 + stage * 160;
}

export function WorkflowGraph({
  graph,
  subtasks,
  selectedId = null,
  critical = new Set<string>(),
  onSelect,
  compact = false,
}: {
  graph: Graph;
  subtasks: { id: string; dependsOn: string[] }[];
  selectedId?: string | null;
  critical?: Set<string>;
  onSelect?: (id: string) => void;
  /** 작은 장식용 그래프 (범례·도구 막대·카메라 이동 없음) */
  compact?: boolean;
}) {
  const layout = useMemo(() => layoutGraph(graph, subtasks, compact), [graph, subtasks, compact]);
  const rowOf = useMemo(() => new Map(subtasks.map((s, i) => [s.id, i])), [subtasks]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const userScrolledAt = useRef(0);
  const programmatic = useRef(false);
  const [viewportW, setViewportW] = useState(0);
  const [fit, setFit] = useState(true);
  const [follow, setFollow] = useState(true);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const focusId = hoverId ?? selectedId;
  const motion = !prefersReducedMotion();

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewportW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = fit && viewportW > 0 ? Math.max(compact ? 0.3 : 0.55, Math.min(1, viewportW / layout.width)) : 1;

  // 지금 일이 벌어지는 열(실행 중이거나 사람을 기다리는 노드가 있는 열)
  const activeCols = useMemo(
    () => new Set(graph.nodes.filter((n) => n.status === "running" || n.status === "waiting").map((n) => layout.nodeCol[n.id])),
    [graph, layout],
  );

  // 카메라: 그래프가 화면보다 넓으면, 지금 일이 벌어지는 곳으로 부드럽게 따라갑니다.
  useEffect(() => {
    const el = viewportRef.current;
    if (compact || !follow || !el || layout.width * scale <= el.clientWidth + 4) return;
    if (Date.now() - userScrolledAt.current < 4000) return;
    const frontier = graph.nodes
      .filter((n) => n.status === "running" || n.status === "waiting" || n.status === "error")
      .map((n) => layout.boxes[n.id])
      .sort((a, b) => a.x - b.x)[0];
    if (!frontier) return;
    const left = frontier.x * scale;
    const right = (frontier.x + frontier.w) * scale;
    if (left >= el.scrollLeft + 16 && right <= el.scrollLeft + el.clientWidth - 16) return;
    programmatic.current = true;
    el.scrollTo({ left: Math.max(0, left - el.clientWidth * 0.15), behavior: motion ? "smooth" : "auto" });
    setTimeout(() => (programmatic.current = false), 600);
  }, [graph, layout, scale, follow, compact, motion]);

  const nodeStyle = (n: GraphNode, b: Box): CSSProperties => {
    const parent = parentOf(n);
    const pb = parent ? layout.boxes[parent] : null;
    return {
      left: b.x,
      top: b.y,
      width: b.w,
      height: b.h,
      ["--fx" as string]: pb ? `${pb.x + pb.w / 2 - (b.x + b.w / 2)}px` : "0px",
      ["--fy" as string]: pb ? `${pb.y + pb.h / 2 - (b.y + b.h / 2)}px` : "0px",
      animationDelay: `${spawnDelay(n, rowOf)}ms`,
    };
  };

  const isNeighbor = (id: string) =>
    focusId === id || graph.edges.some((e) => (e.from === focusId && e.to === id) || (e.to === focusId && e.from === id));

  return (
    <div className={`g-wrap ${compact ? "compact" : ""}`}>
      {!compact && (
        <div className="g-toolbar">
          <div className="g-legend" aria-label="범례">
            <span><i className="lg agent" /> Claude 에이전트</span>
            <span><i className="lg code" /> 코드 (모델 호출 없음)</span>
            <span><i className="lg human" /> 사용자 승인</span>
            <span><i className="lg dep" /> 업무 간 의존</span>
            {critical.size > 0 && <span><i className="lg critical" /> 임계 경로</span>}
          </div>
          <div className="row">
            {layout.width * scale > viewportW + 4 && (
              <label className="g-follow">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> 진행 따라가기
              </label>
            )}
            <button className="btn ghost small" onClick={() => setFit((f) => !f)}>
              {fit ? "실제 크기" : "화면에 맞추기"}
            </button>
          </div>
        </div>
      )}

      <div
        className="g-viewport"
        ref={viewportRef}
        onScroll={() => {
          if (!programmatic.current) userScrolledAt.current = Date.now();
        }}
      >
        <div className="g-sizer" style={{ width: layout.width * scale, height: layout.height * scale }}>
          <div className="g-canvas" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
            {layout.columns.map((c) =>
              c.label ? (
                <div
                  key={c.index}
                  className={`g-col ${activeCols.has(c.index) ? "active" : ""}`}
                  style={{ left: c.x, width: c.w }}
                >
                  {c.label}
                </div>
              ) : null,
            )}

            <svg className="g-edges" width={layout.width} height={layout.height} aria-hidden>
              {graph.edges.map((e) => {
                const target = graph.nodes.find((n) => n.id === e.to)!;
                const { d } = edgePath(layout.boxes[e.from], layout.boxes[e.to]);
                const related = focusId != null && (e.from === focusId || e.to === focusId);
                const onCritical = critical.has(e.from) && critical.has(e.to);
                const cls = ["g-edge", e.state, e.dependency ? "dep" : "", onCritical ? "critical" : "", focusId && !related ? "dim" : ""].join(" ");
                return (
                  <g key={e.id} className="g-edge-g" style={{ animationDelay: `${spawnDelay(target, rowOf) + 120}ms` }}>
                    <path d={d} className={cls} />
                    {e.state === "flowing" && motion && (
                      <circle r={4} className={`g-packet ${e.dependency ? "dep" : ""}`}>
                        <animateMotion dur="1.1s" repeatCount="indefinite" path={d} />
                      </circle>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* 포커스된 노드에 연결된 엣지에만 데이터 계약 이름을 보여 줍니다 */}
            {!compact &&
              focusId &&
              graph.edges
                .filter((e) => e.from === focusId || e.to === focusId)
                .map((e) => {
                  const { mid } = edgePath(layout.boxes[e.from], layout.boxes[e.to]);
                  return (
                    <span key={e.id} className={`g-contract ${e.dependency ? "dep" : ""}`} style={{ left: mid.x, top: mid.y }}>
                      {e.contract}
                    </span>
                  );
                })}

            {graph.nodes.map((n) => {
              const b = layout.boxes[n.id];
              return (
                <div key={n.id} className="g-node-pos" style={nodeStyle(n, b)}>
                  <button
                    className={[
                      "g-node",
                      n.kind,
                      n.status,
                      n.id === selectedId ? "selected" : "",
                      critical.has(n.id) ? "critical" : "",
                      focusId && !isNeighbor(n.id) ? "dim" : "",
                    ].join(" ")}
                    onClick={() => onSelect?.(n.id)}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(n.id)}
                    onBlur={() => setHoverId(null)}
                    tabIndex={compact ? -1 : 0}
                    aria-label={`${n.title}: ${n.detail}`}
                  >
                    {/* 상태가 바뀔 때마다 다시 마운트되어 한 번 번쩍입니다 */}
                    <span key={n.status} className={`g-flash ${n.status}`} aria-hidden />
                    {!compact && KIND_LABEL[n.kind] && (
                      <span className="g-kind">
                        {KIND_LABEL[n.kind]}
                        {n.attempts > 1 && <em> · 재시도 {n.attempts - 1}</em>}
                      </span>
                    )}
                    <span className="g-title">{n.title}</span>
                    <span className="g-detail">
                      <i key={n.status} className="g-dot" aria-hidden />
                      {!compact && n.detail}
                    </span>
                    {n.badge && <span className="g-badge">{n.badge}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
