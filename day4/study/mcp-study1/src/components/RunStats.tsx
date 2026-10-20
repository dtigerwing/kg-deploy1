import { computeStats, formatSec } from "../graph/metrics";
import type { Graph } from "../graph/types";

export function RunStats({ graph, clock, finished }: { graph: Graph; clock: number; finished: boolean }) {
  const stats = computeStats(graph, clock);
  const speedup = stats.busy > 0 ? stats.sequential / stats.busy : 0;
  return (
    <section className="stats run-stats">
      <div className="stat">
        <span className="label">경과 시간</span>
        <strong>{formatSec(stats.elapsed)}</strong>
        <small>{finished ? "완료" : "사용자 검토 시간 포함"}</small>
      </div>
      <div className="stat">
        <span className="label">한 줄로 했다면</span>
        <strong>{formatSec(stats.sequential)}</strong>
        <small>에이전트 작업 시간 합계</small>
      </div>
      <div className="stat">
        <span className="label">병렬 효과</span>
        <strong>{speedup >= 1 ? `${speedup.toFixed(1)}×` : "—"}</strong>
        <small>에이전트 작업 겹침 · 최대 {stats.maxConcurrency}개 동시</small>
      </div>
      <div className="stat">
        <span className="label">Claude 호출</span>
        <strong>{stats.modelCalls}회</strong>
        <small>{stats.retries > 0 ? `실패 노드만 ${stats.retries}회 재시도` : "재시도 없음"}</small>
      </div>
    </section>
  );
}
