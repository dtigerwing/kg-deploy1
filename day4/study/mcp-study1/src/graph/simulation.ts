// 프리뷰 전용: API를 호출하지 않고 워크플로우 실행을 시간 단위로 흉내 냅니다.
// 실행 방식(파이프라인 / 일괄)을 바꿔 같은 업무가 얼마나 빨리 끝나는지 비교할 수 있습니다.
import { buildEdges } from "./edges";
import { formatSec } from "./metrics";
import type { Graph, GraphNode, NodeStatus } from "./types";

export type Mode = "pipeline" | "barrier";
export type Approval = "pending" | "approved" | "excluded";

export interface SimSubtask {
  id: string;
  title: string;
  objective: string;
  dependsOn: string[];
  planSec: number;
  execSec: number;
  /** 자동 승인 모드에서 계획이 나온 뒤 사용자가 승인하기까지 걸리는 시간 */
  approveAfterSec: number;
  failOnce: boolean;
  planSteps: string[];
  resultExcerpt: string;
}

interface Runtime {
  status: NodeStatus;
  startedAt: number | null;
  finishedAt: number | null;
  durSec: number;
  attempts: number;
  failAt: number | null;
  retryAt: number | null;
  failedSpans: [number, number][];
}

export interface SimState {
  mode: Mode;
  autoApprove: boolean;
  t: number;
  subtasks: SimSubtask[];
  rt: Record<string, Runtime>;
  approvals: Record<string, Approval>;
}

export const DURATION = { decompose: 4, reduce: 0.4, evaluate: 6, preview: 9 };
const TARGET_CHARS: Record<string, number> = { decompose: 1800, plan: 1400, exec: 5200, evaluate: 2400, preview: 18000 };

export const DEMO_TASK = "동네 빵집 신메뉴 출시 홍보 준비";

export const DEMO_SUBTASKS: SimSubtask[] = [
  {
    id: "menu-concept",
    title: "신메뉴 콘셉트 · 상세 소개",
    objective: "신메뉴 2~3종의 이름, 맛, 재료, 가격, 알레르기 정보 정리",
    dependsOn: [],
    planSec: 5,
    execSec: 9,
    approveAfterSec: 2,
    failOnce: false,
    planSteps: ["시즌 재료로 메뉴 3종 설정", "메뉴별 한 줄 소개와 상세 설명", "가격 · 알레르기 · 페어링 음료 표기"],
    resultExcerpt: "## 쑥 크림치즈 깜빠뉴 — 6,800원\n봄 쑥을 반죽에 넣고 크림치즈를 겹겹이…",
  },
  {
    id: "brand-copy",
    title: "출시 메시지 · 랜딩 카피",
    objective: "톤앤매너, 슬로건, 히어로 · 매장 소개 문구",
    dependsOn: ["menu-concept"],
    planSec: 6,
    execSec: 8,
    approveAfterSec: 6,
    failOnce: false,
    planSteps: ["메뉴 콘셉트에서 핵심 키워드 추출", "슬로건 후보 3개", "히어로 · 스토리 · 매장 정보 문구"],
    resultExcerpt: "### 슬로건\n1. 동네에 봄이 구워졌어요\n2. 오늘 아침, 새 빵 냄새…",
  },
  {
    id: "sns-content",
    title: "SNS 게시물 초안",
    objective: "D-7 ~ D+7 인스타그램 · 당근 게시물 캡션",
    dependsOn: ["menu-concept", "brand-copy"],
    planSec: 4.5,
    execSec: 10,
    approveAfterSec: 3,
    failOnce: false,
    planSteps: ["게시 일정표 작성", "플랫폼별 캡션 · 해시태그", "스토리용 짧은 문구"],
    resultExcerpt: "| 날짜 | 플랫폼 | 캡션 |\n| D-7 | 인스타 | 곧 동네에 봄이 구워집니다 🌱 …",
  },
  {
    id: "launch-event",
    title: "출시 기념 이벤트",
    objective: "첫 구매 · 재방문 이벤트 2~3개와 안내 문구, FAQ",
    dependsOn: [],
    planSec: 5.5,
    execSec: 7,
    approveAfterSec: 9,
    failOnce: true,
    planSteps: ["이벤트 3종 설계", "참여 방법 · 혜택 · 유의사항", "고객 FAQ 5개"],
    resultExcerpt: "### 첫 입 무료 시식 데이\n출시 첫 주말, 오전 10시~12시…",
  },
  {
    id: "in-store",
    title: "매장 POP · 전단 시안",
    objective: "A4 전단, 진열대 POP, 입간판, 계산대 멘트",
    dependsOn: ["brand-copy"],
    planSec: 7,
    execSec: 8,
    approveAfterSec: 4,
    failOnce: false,
    planSteps: ["매체별 레이아웃 구성", "슬로건을 매체 길이에 맞게 변형", "계산대 안내 멘트 스크립트"],
    resultExcerpt: "**입간판(칠판)**\n오늘의 새 빵 → 쑥 크림치즈 깜빠뉴 🌿…",
  },
];

const idle = (): Runtime => ({ status: "idle", startedAt: null, finishedAt: null, durSec: 0, attempts: 0, failAt: null, retryAt: null, failedSpans: [] });

export function createSim(subtasks: SimSubtask[], mode: Mode, autoApprove: boolean): SimState {
  const rt: Record<string, Runtime> = {};
  for (const id of ["input", "decompose", "reduce", "evaluate", "preview", "output"]) rt[id] = idle();
  for (const s of subtasks) for (const role of ["plan", "gate", "exec"]) rt[`${role}:${s.id}`] = idle();
  rt.input = { ...idle(), status: "done", startedAt: 0, finishedAt: 0 };
  return { mode, autoApprove, t: 0, subtasks, rt, approvals: Object.fromEntries(subtasks.map((s) => [s.id, "pending"])) };
}

const isSettled = (r: Runtime | undefined) => !r || r.status === "done" || r.status === "skipped";

/** 시뮬레이션 시간을 dt초 진행합니다. */
export function tick(prev: SimState, dt: number): SimState {
  const s: SimState = { ...prev, t: prev.t + dt, rt: { ...prev.rt }, approvals: { ...prev.approvals } };
  const t = s.t;
  const set = (id: string, patch: Partial<Runtime>) => (s.rt[id] = { ...s.rt[id], ...patch });
  const start = (id: string, durSec: number, failAt: number | null = null) =>
    set(id, { status: "running", startedAt: t, finishedAt: null, durSec, attempts: s.rt[id].attempts + 1, failAt, retryAt: null });

  // 진행 중인 노드 완료 / 실패 처리
  for (const [id, r] of Object.entries(s.rt)) {
    if (r.status !== "running" || r.startedAt == null) continue;
    if (r.failAt != null && t >= r.failAt) {
      set(id, { status: "error", finishedAt: r.failAt, retryAt: r.failAt + 1.5, failedSpans: [...r.failedSpans, [r.startedAt, r.failAt]] });
    } else if (t >= r.startedAt + r.durSec) {
      set(id, { status: "done", finishedAt: r.startedAt + r.durSec });
    }
  }

  // 상태 전이는 한 틱 안에서 연쇄적으로 일어날 수 있어 변화가 없을 때까지 반복합니다.
  for (let changed = true, guard = 0; changed && guard < 20; guard++) {
    changed = false;
    const before = JSON.stringify(s.rt);
    const allDecided = s.subtasks.every((x) => s.approvals[x.id] !== "pending");

    if (s.rt.decompose.status === "idle") start("decompose", DURATION.decompose);

    for (const sub of s.subtasks) {
      const plan = `plan:${sub.id}`;
      const gate = `gate:${sub.id}`;
      const exec = `exec:${sub.id}`;

      if (s.rt.decompose.status === "done" && s.rt[plan].status === "idle") start(plan, sub.planSec);

      if (s.rt[plan].status === "done" && s.rt[gate].status === "idle") {
        set(gate, { status: "waiting", startedAt: s.rt[plan].finishedAt });
      }
      if (s.rt[gate].status === "waiting" && s.autoApprove && t >= s.rt[gate].startedAt! + sub.approveAfterSec) {
        s.approvals[sub.id] = "approved";
      }
      if (s.rt[gate].status === "waiting" && s.approvals[sub.id] !== "pending") {
        const approved = s.approvals[sub.id] === "approved";
        const decidedAt = s.autoApprove ? Math.min(t, s.rt[gate].startedAt! + sub.approveAfterSec) : t;
        set(gate, { status: approved ? "done" : "skipped", finishedAt: decidedAt });
      }

      const execRt = s.rt[exec];
      if (s.approvals[sub.id] === "excluded" && execRt.status !== "skipped") set(exec, { status: "skipped" });
      if (s.approvals[sub.id] !== "approved") continue;

      const depsOk = sub.dependsOn.every((d) => isSettled(s.rt[`exec:${d}`]));
      const gateOk = s.mode === "pipeline" || allDecided;
      if ((execRt.status === "idle" || execRt.status === "blocked") && depsOk && gateOk) {
        const dur = sub.execSec;
        start(exec, dur, sub.failOnce && execRt.attempts === 0 ? t + dur * 0.55 : null);
      } else if (execRt.status === "idle") {
        set(exec, { status: "blocked" });
      }
      if (execRt.status === "error" && s.autoApprove && t >= (execRt.retryAt ?? Infinity)) start(exec, sub.execSec);
    }

    // 취합은 모든 결과가 필요하므로 여기서만 전체를 기다립니다 (진짜 barrier).
    const execs = s.subtasks.map((x) => s.rt[`exec:${x.id}`]);
    if (
      s.rt.reduce.status === "idle" &&
      allDecided &&
      execs.some((r) => r.status === "done") &&
      execs.every(isSettled)
    ) {
      start("reduce", DURATION.reduce);
    }
    if (s.rt.reduce.status === "done" && s.rt.evaluate.status === "idle") start("evaluate", DURATION.evaluate);
    if (s.rt.evaluate.status === "done" && s.rt.preview.status === "idle") start("preview", DURATION.preview);
    if (s.rt.preview.status === "done" && s.rt.output.status === "idle") {
      set("output", { status: "done", startedAt: s.rt.preview.finishedAt, finishedAt: s.rt.preview.finishedAt });
    }

    changed = JSON.stringify(s.rt) !== before;
  }
  return s;
}

export function decide(s: SimState, subtaskId: string, approval: Exclude<Approval, "pending">): SimState {
  if (s.rt[`gate:${subtaskId}`].status !== "waiting") return s;
  return tick({ ...s, approvals: { ...s.approvals, [subtaskId]: approval } }, 0);
}

export function retry(s: SimState, nodeId: string): SimState {
  const r = s.rt[nodeId];
  if (r?.status !== "error") return s;
  return tick({ ...s, rt: { ...s.rt, [nodeId]: { ...r, status: "blocked", retryAt: null } } }, 0);
}

export const isFinished = (s: SimState) => s.rt.output.status === "done";

// ---------------------------------------------------------------- 그래프로 변환

const fmt = (sec: number) => (sec < 60 ? `${sec.toFixed(sec < 10 ? 1 : 0)}초` : formatSec(sec));

export function simToGraph(s: SimState): Graph {
  const titleOf = (id: string) => s.subtasks.find((x) => x.id === id)?.title ?? id;
  const nodes: GraphNode[] = [];

  const node = (id: string, role: GraphNode["role"], kind: GraphNode["kind"], title: string, subtaskId: string | null = null) => {
    const r = s.rt[id];
    const elapsed = r.startedAt != null ? (r.finishedAt ?? s.t) - r.startedAt : 0;
    const target = TARGET_CHARS[role] ?? 0;
    const chars = r.status === "running" ? Math.round((elapsed / Math.max(0.1, r.durSec)) * target) : r.status === "done" ? target : 0;
    let detail = "대기";
    if (r.status === "running") detail = kind === "code" ? "처리 중" : `${fmt(elapsed)} · ${chars.toLocaleString()}자`;
    else if (r.status === "done") detail = role === "gate" ? "승인됨" : role === "input" ? DEMO_TASK : role === "output" ? "목업 HTML" : kind === "code" ? "즉시 처리" : `${fmt(elapsed)} 소요`;
    else if (r.status === "waiting") detail = s.autoApprove ? "사용자 검토 중" : "클릭해서 승인";
    else if (r.status === "skipped") detail = "제외됨";
    else if (r.status === "error") detail = s.autoApprove ? "실패 · 곧 이 노드만 재시도" : "실패 · 클릭해서 재시도";
    else if (r.status === "blocked") {
      const sub = s.subtasks.find((x) => x.id === subtaskId);
      const waitingDeps = sub?.dependsOn.filter((d) => !isSettled(s.rt[`exec:${d}`])) ?? [];
      detail = waitingDeps.length > 0 ? `'${titleOf(waitingDeps[0])}' 결과 대기` : "전체 승인 대기";
    }
    nodes.push({ id, role, kind, title, subtaskId, status: r.status, detail, startedAt: r.startedAt, finishedAt: r.finishedAt, attempts: r.attempts, failedSpans: r.failedSpans, chars, badge: null });
  };

  node("input", "input", "io", "업무 입력");
  node("decompose", "decompose", "agent", "분해 에이전트");
  for (const sub of s.subtasks) {
    node(`plan:${sub.id}`, "plan", "agent", sub.title, sub.id);
    node(`gate:${sub.id}`, "gate", "human", "승인", sub.id);
    node(`exec:${sub.id}`, "exec", "agent", sub.title, sub.id);
  }
  node("reduce", "reduce", "code", "결과 취합");
  node("evaluate", "evaluate", "agent", "평가 에이전트");
  node("preview", "preview", "agent", "프리뷰 빌더");
  node("output", "output", "io", "목업");

  const edges = buildEdges(s.subtasks, (id) => s.rt[id].status);

  return { nodes, edges };
}
