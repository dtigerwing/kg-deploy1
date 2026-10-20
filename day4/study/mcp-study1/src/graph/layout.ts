import type { Graph, GraphNode } from "./types";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  boxes: Record<string, Box>;
  width: number;
  height: number;
  /** 열(단계) 머리글 위치 */
  columns: { index: number; x: number; w: number; label: string }[];
  /** 노드가 놓인 열 번호 */
  nodeCol: Record<string, number>;
}

const PAD = 24;
const HEADER = 34;

type Sizes = Record<GraphNode["kind"], { w: number; h: number }>;

const REGULAR = {
  rowH: 92,
  gapX: 40,
  size: {
    io: { w: 100, h: 48 },
    agent: { w: 168, h: 64 },
    code: { w: 128, h: 56 },
    human: { w: 100, h: 52 },
  } satisfies Sizes,
};

/** 장식용 작은 그래프: 제목만 보이는 작은 노드 */
const COMPACT = {
  rowH: 50,
  gapX: 26,
  size: {
    io: { w: 76, h: 32 },
    agent: { w: 124, h: 38 },
    code: { w: 92, h: 34 },
    human: { w: 64, h: 32 },
  } satisfies Sizes,
};

const COLUMN_LABEL: Record<GraphNode["role"], string> = {
  input: "입력",
  decompose: "분해",
  plan: "계획 (병렬)",
  gate: "승인",
  exec: "실행 (병렬)",
  reduce: "취합",
  evaluate: "평가",
  preview: "프리뷰",
  output: "결과",
};

/** 실행 노드의 의존 깊이: 선행 업무가 없으면 0, 있으면 선행 업무 깊이 + 1 */
export function dependencyDepths(subtasks: { id: string; dependsOn: string[] }[]): Record<string, number> {
  const byId = new Map(subtasks.map((s) => [s.id, s]));
  const depth: Record<string, number> = {};
  const visit = (id: string, trail: Set<string>): number => {
    if (depth[id] != null) return depth[id];
    const s = byId.get(id);
    if (!s || trail.has(id)) return 0; // 없는 id나 순환은 무시
    trail.add(id);
    const d = Math.max(-1, ...s.dependsOn.filter((p) => byId.has(p)).map((p) => visit(p, trail))) + 1;
    trail.delete(id);
    return (depth[id] = d);
  };
  subtasks.forEach((s) => visit(s.id, new Set()));
  return depth;
}

/**
 * 왼쪽→오른쪽 층(layer) 배치.
 * 세부 업무는 행(row)을 하나씩 갖고, 계획→승인→실행이 같은 행을 따라 흐릅니다.
 * 의존 관계가 있는 실행 노드는 선행 노드보다 오른쪽 열에 놓입니다.
 */
export function layoutGraph(graph: Graph, subtasks: { id: string; dependsOn: string[] }[], compact = false): Layout {
  const { rowH: ROW_H, gapX: GAP_X, size: SIZE } = compact ? COMPACT : REGULAR;
  const rows = Math.max(1, subtasks.length);
  const rowOf = new Map(subtasks.map((s, i) => [s.id, i]));
  const depths = dependencyDepths(subtasks);
  const maxDepth = Math.max(0, ...Object.values(depths));

  // 노드별 열 번호
  const execBase = 4;
  const colOf = (n: GraphNode): number => {
    switch (n.role) {
      case "input": return 0;
      case "decompose": return 1;
      case "plan": return 2;
      case "gate": return 3;
      case "exec": return execBase + (depths[n.subtaskId!] ?? 0);
      case "reduce": return execBase + maxDepth + 1;
      case "evaluate": return execBase + maxDepth + 2;
      case "preview": return execBase + maxDepth + 3;
      case "output": return execBase + maxDepth + 4;
    }
  };

  const colCount = execBase + maxDepth + 5;
  const colWidth = new Array(colCount).fill(0);
  const colRole: (GraphNode["role"] | null)[] = new Array(colCount).fill(null);
  for (const n of graph.nodes) {
    const c = colOf(n);
    colWidth[c] = Math.max(colWidth[c], SIZE[n.kind].w);
    colRole[c] ??= n.role;
  }

  const colX: number[] = [];
  let x = PAD;
  for (let c = 0; c < colCount; c++) {
    colX.push(x);
    x += (colWidth[c] || 0) + (colWidth[c] ? GAP_X : 0);
  }
  const width = x - GAP_X + PAD;
  const height = PAD * 2 + HEADER + rows * ROW_H;
  const centerY = (row: number) => PAD + HEADER + row * ROW_H + ROW_H / 2;
  const midY = PAD + HEADER + (rows * ROW_H) / 2;

  const boxes: Record<string, Box> = {};
  const nodeCol: Record<string, number> = {};
  for (const n of graph.nodes) {
    const c = colOf(n);
    nodeCol[n.id] = c;
    const { w, h } = SIZE[n.kind];
    const cy = n.subtaskId != null ? centerY(rowOf.get(n.subtaskId) ?? 0) : midY;
    boxes[n.id] = { x: colX[c] + (colWidth[c] - w) / 2, y: cy - h / 2, w, h };
  }

  const columns = colX
    .map((cx, c) => ({ index: c, x: cx, w: colWidth[c], role: colRole[c] }))
    .filter((col) => col.w > 0 && col.role)
    .map((col, i, all) => ({
      index: col.index,
      x: col.x,
      w: col.w,
      // 의존 깊이 때문에 실행 열이 여러 개면 첫 열에만 이름을 붙입니다.
      label: i > 0 && all[i - 1].role === col.role ? "" : COLUMN_LABEL[col.role!],
    }));

  return { boxes, width, height, columns, nodeCol };
}

/** 두 상자를 잇는 부드러운 곡선 경로 (왼쪽→오른쪽) */
export function edgePath(a: Box, b: Box): { d: string; mid: { x: number; y: number } } {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const dx = Math.max(32, (x2 - x1) * 0.5);
  return {
    d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
  };
}
