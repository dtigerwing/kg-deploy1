import { useEffect, useMemo, useState } from "react";
import { WorkflowGraph } from "../graph/WorkflowGraph";
import { DEMO_SUBTASKS, createSim, isFinished, simToGraph, tick } from "../graph/simulation";

/** 첫 화면에서 워크플로우가 어떻게 흘러가는지 반복해서 보여 주는 작은 데모 그래프 */
export function HeroDemo() {
  const [sim, setSim] = useState(() => createSim(DEMO_SUBTASKS, "pipeline", true));
  const [round, setRound] = useState(0);
  const graph = useMemo(() => simToGraph(sim), [sim]);
  const finished = isFinished(sim);

  useEffect(() => {
    if (finished) {
      const t = setTimeout(() => {
        setSim(createSim(DEMO_SUBTASKS, "pipeline", true));
        setRound((r) => r + 1);
      }, 2500);
      return () => clearTimeout(t);
    }
    const timer = setInterval(() => setSim((s) => tick(s, 0.25)), 100);
    return () => clearInterval(timer);
  }, [finished]);

  return (
    <div className="hero-demo" aria-hidden>
      <div className="hero-demo-head">
        <span className="label">이렇게 진행돼요</span>
        <span className="muted small">데모 · 실제 호출 없음</span>
      </div>
      {/* round가 바뀌면 다시 마운트되어 노드가 갈라져 나오는 장면부터 다시 재생됩니다 */}
      <WorkflowGraph key={round} graph={graph} subtasks={DEMO_SUBTASKS} compact />
    </div>
  );
}
