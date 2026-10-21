import { randomUUID } from "node:crypto";
import { runAggregator } from "./agents/aggregator.js";
import { runSummarizer } from "./agents/summarizer.js";
import { EFFORT, MODEL, SUMMARY_CONCURRENCY } from "./config.js";
import { loadChunks, previewOf, statsOf } from "./transcripts.js";
import type { AgentUsage, ChunkPreview, ChunkSummary, ProjectInfo, ReportRun, WorkflowEvent } from "./types.js";

// Claude Code 기록 → [추출: 코드] → 작업 묶음 → [요약 서브에이전트 × N, 병렬] → [취합 에이전트] → 리포트
export async function runWorkflow(
  project: ProjectInfo,
  period: { from: string; to: string },
  chunkIds: string[] | null,
  emit: (event: WorkflowEvent) => void,
): Promise<ReportRun> {
  emit({ type: "stage", stage: "extract", status: "start", message: "Claude Code 기록에서 작업을 뽑는 중" });
  const all = await loadChunks(project, period.from, period.to);
  const chunks = chunkIds ? all.filter((chunk) => chunkIds.includes(chunk.id)) : all;
  if (chunks.length === 0) throw new Error("선택한 기간에 작업 기록이 없습니다.");
  const stats = statsOf(chunks);
  emit({
    type: "stage",
    stage: "extract",
    status: "done",
    message: `작업 묶음 ${chunks.length}개 · 요청 ${stats.requests}개 · Unity MCP 호출 ${stats.unityCalls}회`,
  });

  emit({ type: "stage", stage: "summarize", status: "start", message: `서브에이전트 ${chunks.length}개가 작업 묶음을 요약하는 중` });
  const usage: AgentUsage[] = [];
  const summaries: (ChunkPreview & { summary: ChunkSummary })[] = new Array(chunks.length);
  let finished = 0;
  await mapWithLimit(chunks, SUMMARY_CONCURRENCY, async (chunk, index) => {
    const result = await runSummarizer(chunk);
    summaries[index] = { ...previewOf(chunk), summary: result.summary };
    usage.push(result.usage);
    finished += 1;
    emit({ type: "progress", stage: "summarize", message: `${finished}/${chunks.length} 완료 · ${chunk.date} ${result.summary.title}` });
  });
  emit({ type: "stage", stage: "summarize", status: "done", message: `작업 묶음 ${chunks.length}개 요약 완료` });

  emit({ type: "stage", stage: "aggregate", status: "start", message: "요약을 모아 기간 리포트를 만드는 중" });
  const aggregated = await runAggregator(project.name, period, stats, summaries, (chars) =>
    emit({ type: "progress", stage: "aggregate", message: `작성 중… ${chars.toLocaleString()}자` }),
  );
  usage.push(aggregated.usage);
  emit({ type: "stage", stage: "aggregate", status: "done", message: "리포트 완성" });

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    model: MODEL,
    effort: EFFORT,
    project: { id: project.id, name: project.name, path: project.path },
    period,
    stats,
    chunks: summaries,
    report: aggregated.report,
    usage,
  };
}

// 서브에이전트를 한 번에 limit개까지만 돌린다.
async function mapWithLimit<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}
