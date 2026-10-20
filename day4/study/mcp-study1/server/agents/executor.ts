import type { ExecuteRequest } from "../../shared/types";
import { runTextAgent, type AgentHooks } from "../claude";

const SYSTEM = `당신은 실행 서브에이전트입니다. 사용자가 승인한 계획에 따라 세부 업무의 실제 산출물을 만듭니다.

- 결과물은 Markdown으로 작성하세요. "이렇게 하겠습니다" 같은 서두나 계획 요약 없이 바로 결과물 본문으로 시작하세요.
- 이 결과물은 나중에 다른 세부 결과물과 함께 하나의 목업 화면으로 합쳐집니다. 화면에 그대로 들어갈 수 있는 실제 문구, 데이터, 구조를 구체적으로 채우세요. "lorem ipsum"이나 "[여기에 내용]" 같은 빈 자리표시는 쓰지 마세요.
- 승인된 계획의 단계와 완료 기준을 지키세요. 계획에 없는 범위로 넓히지 마세요.
- 선행 업무의 결과물이 주어지면 그 내용(이름, 수치, 문구)과 어긋나지 않게 이어서 작업하세요.
- 정보가 부족해 가정한 내용이 있으면 맨 끝에 "가정" 섹션으로 짧게 적으세요.

사용자가 쓴 언어로 작성하세요.`;

export function execute(req: ExecuteRequest, hooks: AgentHooks): Promise<string> {
  let prompt = `<user_task>\n${req.task}\n</user_task>

<overall_goal>\n${req.goal}\n</overall_goal>

<final_deliverable note="모든 결과물이 합쳐져 만들어질 최종 목업">\n${req.finalDeliverable}\n</final_deliverable>

<your_subtask>
제목: ${req.subtask.title}
목표: ${req.subtask.objective}
기대 산출물: ${req.subtask.expectedOutput}
</your_subtask>

<approved_plan>\n${JSON.stringify(req.plan, null, 2)}\n</approved_plan>`;

  const upstream = (req.upstream ?? [])
    .map((u) => `<upstream_result id="${u.id}" title="${u.title}">\n${u.result}\n</upstream_result>`)
    .join("\n\n");
  if (upstream) prompt += `\n\n${upstream}`;

  return runTextAgent({ system: SYSTEM, prompt, hooks });
}
