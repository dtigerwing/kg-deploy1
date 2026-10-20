import { useCallback, useRef, useState } from "react";
import type {
  CompletedItem,
  Decomposition,
  Evaluation,
  NodeTiming,
  Plan,
  Subtask,
  SubtaskRecord,
  WorkflowRun,
} from "../../shared/types";
import { callAgent, type ProgressEvent } from "./api";

export type Phase = "input" | "decomposing" | "working" | "evaluating" | "building" | "done";
export type FailedStage = "decompose" | "evaluate" | "preview";

export interface Live {
  thinking: string;
  chars: number;
  startedAt: number;
}

const MODEL = "claude-opus-5-5";

function newRun(task: string): WorkflowRun {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    model: MODEL,
    task,
    goal: null,
    finalDeliverable: null,
    subtasks: [],
    evaluation: null,
    previewHtml: null,
    timings: {},
  };
}

/** 알 수 없는 id, 자기 자신, 순환을 만드는 의존 관계를 걸러냅니다. */
export function sanitizeDependencies(subtasks: Subtask[]): Subtask[] {
  const ids = new Set(subtasks.map((s) => s.id));
  const deps = new Map(subtasks.map((s) => [s.id, [...new Set(s.dependsOn)].filter((d) => d !== s.id && ids.has(d))]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string) => {
    state.set(id, "visiting");
    deps.set(
      id,
      deps.get(id)!.filter((d) => {
        if (state.get(d) === "visiting") return false; // 순환을 만드는 엣지는 버립니다
        if (!state.has(d)) visit(d);
        return true;
      }),
    );
    state.set(id, "done");
  };
  subtasks.forEach((s) => state.has(s.id) || visit(s.id));
  return subtasks.map((s) => ({ ...s, dependsOn: deps.get(s.id)! }));
}

function toRecords(subtasks: Subtask[]): SubtaskRecord[] {
  // 모델이 같은 id를 두 번 쓰는 경우에 대비해 고유하게 만들고, 의존 관계도 새 id로 옮깁니다.
  const used = new Set<string>();
  const renamed = new Map<string, string>();
  const unique = subtasks.map((s, i) => {
    let id = s.id || `task-${i + 1}`;
    while (used.has(id)) id = `${id}-${i + 1}`;
    used.add(id);
    if (!renamed.has(s.id)) renamed.set(s.id, id);
    return { ...s, id };
  });
  const remapped = unique.map((s) => ({ ...s, dependsOn: (s.dependsOn ?? []).map((d) => renamed.get(d) ?? d) }));
  return sanitizeDependencies(remapped).map((s) => ({
    ...s,
    plan: null,
    planStatus: "idle",
    planError: null,
    feedback: null,
    approval: "pending",
    result: null,
    resultStatus: "idle",
    resultError: null,
  }));
}

type RunV1 = Omit<WorkflowRun, "schemaVersion" | "timings"> & { schemaVersion: 1 };

/** 이전 버전(v1)에서 저장한 기록을 현재 형식으로 바꿉니다. */
export function migrateRun(run: WorkflowRun | RunV1): WorkflowRun {
  if (run.schemaVersion === 2) return run;
  return {
    ...run,
    schemaVersion: 2,
    timings: {},
    subtasks: run.subtasks.map((s) => ({ ...s, dependsOn: s.dependsOn ?? [] })),
  };
}

const subtaskOf = (s: SubtaskRecord): Subtask => ({
  id: s.id,
  title: s.title,
  objective: s.objective,
  expectedOutput: s.expectedOutput,
  dependsOn: s.dependsOn,
});

function completedItems(run: WorkflowRun): CompletedItem[] {
  return run.subtasks
    .filter((s) => s.approval === "approved" && s.plan && s.result)
    .map((s) => ({ subtask: subtaskOf(s), plan: s.plan!, result: s.result! }));
}

/** 선행 업무가 끝났거나 제외되어, 더 기다릴 필요가 없는지 */
export function depsSettled(run: WorkflowRun, sub: SubtaskRecord): boolean {
  return sub.dependsOn.every((id) => {
    const dep = run.subtasks.find((s) => s.id === id);
    return !dep || dep.approval === "excluded" || (dep.approval === "approved" && dep.resultStatus === "done");
  });
}

/** 모든 결정이 끝나고 승인된 실행이 전부 끝났는지 (취합이 필요로 하는 유일한 전체 대기 지점) */
function readyToMerge(run: WorkflowRun): boolean {
  const approved = run.subtasks.filter((s) => s.approval === "approved");
  return (
    run.subtasks.length > 0 &&
    run.subtasks.every((s) => s.approval !== "pending") &&
    approved.length > 0 &&
    approved.every((s) => s.resultStatus === "done")
  );
}

export function derivePhase(run: WorkflowRun | null): Phase {
  if (!run) return "input";
  if (run.previewHtml) return "done";
  if (run.evaluation) return "building";
  if (run.subtasks.length === 0) return "decomposing";
  if (run.timings.evaluate?.startedAt || run.timings.evaluate?.failures.length) return "evaluating";
  return "working";
}

export function useWorkflow() {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [stageError, setStageError] = useState<{ stage: FailedStage; message: string } | null>(null);
  const [live, setLive] = useState<Record<string, Live>>({});

  // 병렬로 도는 서브에이전트들이 동시에 상태를 갱신해도 유실되지 않도록 최신 값을 ref에 둡니다.
  const runRef = useRef<WorkflowRun | null>(null);
  const abortRef = useRef<AbortController>(new AbortController());
  const mergingRef = useRef(false);

  const commit = useCallback((next: WorkflowRun | null) => {
    runRef.current = next;
    setRun(next);
  }, []);

  const update = useCallback(
    (fn: (r: WorkflowRun) => WorkflowRun) => {
      const current = runRef.current;
      if (!current) return;
      commit({ ...fn(current), updatedAt: new Date().toISOString() });
    },
    [commit],
  );

  const patchSubtask = useCallback(
    (id: string, patch: Partial<SubtaskRecord>) =>
      update((r) => ({ ...r, subtasks: r.subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    [update],
  );

  // ---------------------------------------------------------------- 노드 시각 기록
  const timing = useCallback(
    (nodeId: string, event: "start" | "open" | "finish" | "fail" | "reset") =>
      update((r) => {
        const now = new Date().toISOString();
        const cur: NodeTiming = r.timings[nodeId] ?? { startedAt: null, finishedAt: null, attempts: 0, failures: [] };
        let next: NodeTiming;
        switch (event) {
          case "start":
            next = { ...cur, startedAt: now, finishedAt: null, attempts: cur.attempts + 1 };
            break;
          case "open": // 사용자 검토 대기처럼 시도 횟수를 세지 않는 시작
            next = { ...cur, startedAt: now, finishedAt: null };
            break;
          case "finish":
            next = { ...cur, finishedAt: now };
            break;
          case "fail":
            next = {
              ...cur,
              startedAt: null,
              finishedAt: null,
              failures: cur.startedAt ? [...cur.failures, { startedAt: cur.startedAt, endedAt: now }] : cur.failures,
            };
            break;
          case "reset":
            next = { ...cur, startedAt: null, finishedAt: null };
            break;
        }
        return { ...r, timings: { ...r.timings, [nodeId]: next } };
      }),
    [update],
  );

  /** 진행 상황 표시와 시각 기록을 붙여 에이전트를 호출합니다. 실패하면 예외를 그대로 던집니다. */
  const call = useCallback(
    async <T,>(nodeId: string, endpoint: Parameters<typeof callAgent>[0], body: unknown): Promise<T> => {
      const signal = abortRef.current.signal;
      const runId = runRef.current?.id;
      setLive((l) => ({ ...l, [nodeId]: { thinking: "", chars: 0, startedAt: Date.now() } }));
      timing(nodeId, "start");
      const onEvent = (event: ProgressEvent) => {
        if (signal.aborted) return;
        setLive((l) => {
          const cur = l[nodeId];
          if (!cur) return l;
          if (event.type === "thinking") return { ...l, [nodeId]: { ...cur, thinking: (cur.thinking + event.text).slice(-600) } };
          return { ...l, [nodeId]: { ...cur, chars: event.chars } };
        });
      };
      try {
        const result = await callAgent<T>(endpoint, body, { signal, onEvent });
        if (runRef.current?.id === runId) timing(nodeId, "finish");
        return result;
      } catch (error) {
        if (runRef.current?.id === runId) timing(nodeId, "fail");
        throw error;
      } finally {
        setLive((l) => {
          const { [nodeId]: _, ...rest } = l;
          return rest;
        });
      }
    },
    [timing],
  );

  const isStale = (runId: string) => runRef.current?.id !== runId;

  // ---------------------------------------------------------------- 취합 → 평가 → 프리뷰
  const buildPreview = useCallback(async () => {
    const r = runRef.current;
    if (!r?.evaluation) return;
    setStageError(null);
    update((cur) => ({ ...cur, previewHtml: null }));
    try {
      const html = await call<string>("preview", "preview", {
        task: r.task,
        goal: r.goal,
        finalDeliverable: r.finalDeliverable,
        items: completedItems(r),
        evaluation: r.evaluation,
      });
      if (!isStale(r.id)) update((cur) => ({ ...cur, previewHtml: html }));
    } catch (error) {
      if (!isStale(r.id)) setStageError({ stage: "preview", message: (error as Error).message });
    }
  }, [call, update]);

  const evaluateResults = useCallback(async () => {
    const r = runRef.current;
    if (!r) return;
    setStageError(null);
    try {
      const evaluation = await call<Evaluation>("evaluate", "evaluate", {
        task: r.task,
        goal: r.goal,
        finalDeliverable: r.finalDeliverable,
        items: completedItems(r),
      });
      if (isStale(r.id)) return;
      update((cur) => ({ ...cur, evaluation, previewHtml: null }));
      await buildPreview();
    } catch (error) {
      if (!isStale(r.id)) setStageError({ stage: "evaluate", message: (error as Error).message });
    }
  }, [call, update, buildPreview]);

  /** 결과 취합은 코드로 처리합니다(모델 호출 없음). 모든 결과가 필요한 유일한 합류 지점입니다. */
  const merge = useCallback(async () => {
    const r = runRef.current;
    if (!r || mergingRef.current || r.evaluation || r.timings.reduce?.finishedAt) return;
    mergingRef.current = true;
    try {
      timing("reduce", "start");
      timing("reduce", "finish");
      await evaluateResults();
    } finally {
      mergingRef.current = false;
    }
  }, [timing, evaluateResults]);

  // ---------------------------------------------------------------- 실행 (파이프라인)
  const executeRef = useRef<(id: string) => Promise<void>>(async () => {});

  /**
   * 스케줄러: 승인됐고 선행 업무가 끝난 세부 업무를 바로 실행합니다.
   * 다른 업무의 승인이나 실행을 기다리지 않고, 데이터가 필요할 때만 기다립니다.
   */
  const pump = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    for (const sub of r.subtasks) {
      if (sub.approval === "approved" && sub.resultStatus === "idle" && sub.plan && depsSettled(r, sub)) {
        void executeRef.current(sub.id);
      }
    }
    if (readyToMerge(runRef.current!)) void merge();
  }, [merge]);

  const executeSubtask = useCallback(
    async (id: string) => {
      const r = runRef.current;
      const sub = r?.subtasks.find((s) => s.id === id);
      if (!r || !sub?.plan) return;
      patchSubtask(id, { resultStatus: "running", resultError: null });
      const upstream = sub.dependsOn
        .map((d) => r.subtasks.find((s) => s.id === d))
        .filter((d): d is SubtaskRecord => !!d && d.resultStatus === "done" && !!d.result)
        .map((d) => ({ id: d.id, title: d.title, result: d.result! }));
      try {
        const result = await call<string>(`exec:${id}`, "execute", {
          task: r.task,
          goal: r.goal,
          finalDeliverable: r.finalDeliverable,
          subtask: subtaskOf(sub),
          plan: sub.plan,
          upstream,
        });
        if (isStale(r.id)) return;
        patchSubtask(id, { result, resultStatus: "done" });
      } catch (error) {
        if (isStale(r.id)) return;
        patchSubtask(id, { resultStatus: "error", resultError: (error as Error).message });
      }
      pump();
    },
    [call, patchSubtask, pump],
  );
  executeRef.current = executeSubtask;

  // ---------------------------------------------------------------- 계획
  const planSubtask = useCallback(
    async (id: string, feedback: string | null = null) => {
      const r = runRef.current;
      const sub = r?.subtasks.find((s) => s.id === id);
      if (!r || !sub || sub.resultStatus !== "idle") return;
      patchSubtask(id, { planStatus: "running", planError: null, approval: "pending", feedback });
      timing(`gate:${id}`, "reset");
      try {
        const plan = await call<Plan>(`plan:${id}`, "plan", {
          task: r.task,
          goal: r.goal ?? r.task,
          allSubtasks: r.subtasks.map(subtaskOf),
          subtask: subtaskOf(sub),
          previousPlan: feedback ? sub.plan : null,
          feedback,
        });
        if (isStale(r.id)) return;
        patchSubtask(id, { plan, planStatus: "done" });
        timing(`gate:${id}`, "open"); // 사용자 검토 대기 시작
      } catch (error) {
        if (isStale(r.id)) return;
        patchSubtask(id, { planStatus: "error", planError: (error as Error).message });
      }
    },
    [call, patchSubtask, timing],
  );

  /** 승인하면 (선행 업무가 끝났다면) 바로 실행되고, 제외하면 그 업무를 기다리던 업무가 그것 없이 진행합니다. */
  const decide = useCallback(
    (id: string, approval: SubtaskRecord["approval"]) => {
      const sub = runRef.current?.subtasks.find((s) => s.id === id);
      if (!sub || sub.planStatus !== "done" || sub.resultStatus !== "idle") return;
      patchSubtask(id, { approval });
      timing(`gate:${id}`, approval === "pending" ? "open" : "finish");
      pump();
    },
    [patchSubtask, timing, pump],
  );

  // ---------------------------------------------------------------- 분해
  const decomposeTask = useCallback(async () => {
    const r = runRef.current;
    if (!r) return;
    setStageError(null);
    try {
      const result = await call<Decomposition>("decompose", "decompose", { task: r.task });
      if (isStale(r.id)) return;
      update((cur) => ({
        ...cur,
        goal: result.goal,
        finalDeliverable: result.finalDeliverable,
        subtasks: toRecords(result.subtasks),
      }));
      // 세부 업무마다 계획 서브에이전트를 동시에 실행합니다.
      for (const s of runRef.current!.subtasks) void planSubtask(s.id);
    } catch (error) {
      if (!isStale(r.id)) setStageError({ stage: "decompose", message: (error as Error).message });
    }
  }, [call, update, planSubtask]);

  const resetControllers = () => {
    abortRef.current.abort();
    abortRef.current = new AbortController();
    mergingRef.current = false;
    setLive({});
    setStageError(null);
  };

  const start = useCallback(
    (task: string) => {
      resetControllers();
      commit(newRun(task.trim()));
      void decomposeTask();
    },
    [commit, decomposeTask],
  );

  const reset = useCallback(() => {
    resetControllers();
    commit(null);
  }, [commit]);

  const load = useCallback(
    (loaded: WorkflowRun) => {
      resetControllers();
      // 저장 당시 진행 중이던 작업은 실패로 표시해 다시 시도할 수 있게 합니다.
      const interrupted = "작업 도중 저장된 기록입니다. 다시 시도해 주세요.";
      const subtasks = loaded.subtasks.map((s) => ({
        ...s,
        ...(s.planStatus === "running" ? { planStatus: "error" as const, planError: interrupted } : {}),
        ...(s.resultStatus === "running" ? { resultStatus: "error" as const, resultError: interrupted } : {}),
      }));
      commit({ ...loaded, subtasks });
    },
    [commit],
  );

  const retryStage = useCallback(() => {
    if (!stageError) return;
    if (stageError.stage === "decompose") void decomposeTask();
    else if (stageError.stage === "evaluate") void evaluateResults();
    else void buildPreview();
  }, [stageError, decomposeTask, evaluateResults, buildPreview]);

  /** 실패한 실행 노드만 다시 대기열에 넣습니다. 나머지 그래프는 그대로 둡니다. */
  const retryExecute = useCallback(
    (id: string) => {
      const sub = runRef.current?.subtasks.find((s) => s.id === id);
      if (sub?.resultStatus !== "error") return;
      patchSubtask(id, { resultStatus: "idle", resultError: null });
      pump();
    },
    [patchSubtask, pump],
  );

  const approveAllReady = useCallback(() => {
    for (const s of runRef.current?.subtasks ?? []) {
      if (s.planStatus === "done" && s.approval === "pending") decide(s.id, "approved");
    }
  }, [decide]);

  return {
    run,
    phase: derivePhase(run),
    stageError,
    live,
    start,
    reset,
    load,
    retryStage,
    planSubtask,
    decide,
    approveAllReady,
    retryExecute,
    buildPreview,
  };
}
