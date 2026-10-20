import type { Evaluation, SubtaskRecord } from "../../shared/types";

function scoreTone(score: number): string {
  if (score >= 80) return "good";
  if (score >= 60) return "ok";
  return "low";
}

export function EvaluationPanel({ evaluation, subtasks }: { evaluation: Evaluation; subtasks: SubtaskRecord[] }) {
  const titleOf = (id: string) => subtasks.find((s) => s.id === id)?.title ?? id;
  return (
    <section className="panel evaluation">
      <div className="eval-head">
        <div className={`score-ring ${scoreTone(evaluation.overallScore)}`}>
          <strong>{Math.round(evaluation.overallScore)}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <h2 className="panel-title">평가 · 취합 결과</h2>
          <p>{evaluation.summary}</p>
        </div>
      </div>

      <div className="eval-grid">
        {evaluation.perSubtask.map((item) => (
          <div key={item.subtaskId} className="eval-item">
            <div className="eval-item-head">
              <h4>{titleOf(item.subtaskId)}</h4>
              <span className={`badge score ${scoreTone(item.score)}`}>{Math.round(item.score)}점</span>
            </div>
            {item.strengths.length > 0 && (
              <ul className="pros">
                {item.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {item.issues.length > 0 && (
              <ul className="cons">
                {item.issues.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {evaluation.conflicts.length > 0 && (
        <div className="callout">
          <h4>결과물 간 충돌 · 누락</h4>
          <ul>
            {evaluation.conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <details>
        <summary>프리뷰 구성 방향</summary>
        <p>{evaluation.previewDirection}</p>
      </details>
    </section>
  );
}
