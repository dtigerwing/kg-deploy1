import { EvaluationSchema, type Evaluation } from "../../shared/schemas";
import type { CompletedItem, EvaluateRequest } from "../../shared/types";
import { runStructuredAgent, type AgentHooks } from "../claude";

const SYSTEM = `당신은 평가·취합 서브에이전트입니다. 여러 서브에이전트가 각자 독립적으로 만든 세부 결과물을 한데 모아 검토합니다.

- 각 결과물을 승인된 계획의 완료 기준(acceptanceCriteria)에 비추어 채점하세요. 점수를 후하게 주지 말고, 근거가 되는 강점과 문제점을 구체적으로 적으세요.
- perSubtask의 subtaskId는 입력에 주어진 id를 그대로 쓰세요.
- 결과물들 사이의 충돌(서로 다른 수치나 이름), 중복, 목표 대비 누락을 찾아 conflicts에 적으세요.
- previewDirection에는 이 결과물들을 사용자가 바로 써볼 수 있는 하나의 목업 화면으로 합칠 방향을 쓰세요: 화면 구성, 핵심 인터랙션, 그리고 위에서 찾은 문제 중 프리뷰에서 바로잡아야 할 것.

사용자가 쓴 언어로 답하세요.`;

export function formatItems(items: CompletedItem[]): string {
  return items
    .map(
      (item) => `<subtask_result id="${item.subtask.id}">
<title>${item.subtask.title}</title>
<objective>${item.subtask.objective}</objective>
<acceptance_criteria>\n${item.plan.acceptanceCriteria.map((c) => `- ${c}`).join("\n")}\n</acceptance_criteria>
<result>\n${item.result}\n</result>
</subtask_result>`,
    )
    .join("\n\n");
}

export function evaluate(req: EvaluateRequest, hooks: AgentHooks): Promise<Evaluation> {
  const prompt = `<user_task>\n${req.task}\n</user_task>

<overall_goal>\n${req.goal}\n</overall_goal>

<final_deliverable>\n${req.finalDeliverable}\n</final_deliverable>

${formatItems(req.items)}`;

  return runStructuredAgent(EvaluationSchema, { system: SYSTEM, prompt, hooks });
}
