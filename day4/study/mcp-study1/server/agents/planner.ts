import { PlanSchema, type Plan } from "../../shared/schemas";
import type { PlanRequest } from "../../shared/types";
import { runStructuredAgent, type AgentHooks } from "../claude";

const SYSTEM = `당신은 계획 서브에이전트입니다. 전체 업무 중 당신이 맡은 세부 업무 하나에 대한 실행 계획을 세웁니다.

사용자가 이 계획을 검토하고 승인해야만 실행 에이전트가 계획대로 작업을 시작합니다. 사용자가 빠르게 훑어보고 판단할 수 있도록 간결하고 구체적으로 쓰세요. 단계는 3~6개면 충분합니다. 다른 세부 업무가 맡은 범위는 침범하지 마세요.

실행 에이전트는 인터넷이나 외부 도구 없이 텍스트로만 결과물을 만듭니다. 그 안에서 실현 가능한 계획이어야 합니다.

사용자 피드백이 주어지면 이전 계획을 바탕으로 피드백을 반드시 반영해 고친 계획을 내세요.

사용자가 쓴 언어로 답하세요.`;

export function plan(req: PlanRequest, hooks: AgentHooks): Promise<Plan> {
  const others = req.allSubtasks
    .filter((s) => s.id !== req.subtask.id)
    .map((s) => `- ${s.title}: ${s.objective}`)
    .join("\n");
  const upstream = req.allSubtasks
    .filter((s) => req.subtask.dependsOn.includes(s.id))
    .map((s) => `- ${s.title}: ${s.expectedOutput}`)
    .join("\n");

  let prompt = `<user_task>\n${req.task}\n</user_task>

<overall_goal>\n${req.goal}\n</overall_goal>

<other_subtasks note="다른 서브에이전트가 맡은 범위">\n${others || "(없음)"}\n</other_subtasks>

<your_subtask>
제목: ${req.subtask.title}
목표: ${req.subtask.objective}
기대 산출물: ${req.subtask.expectedOutput}
</your_subtask>`;

  if (upstream) {
    prompt += `\n\n<upstream_subtasks note="실행할 때 이 업무들의 결과물을 입력으로 받습니다. 그 결과를 활용하는 계획을 세우세요">\n${upstream}\n</upstream_subtasks>`;
  }

  if (req.previousPlan && req.feedback) {
    prompt += `\n\n<previous_plan>\n${JSON.stringify(req.previousPlan, null, 2)}\n</previous_plan>

<user_feedback>\n${req.feedback}\n</user_feedback>`;
  }

  return runStructuredAgent(PlanSchema, { system: SYSTEM, prompt, hooks });
}
