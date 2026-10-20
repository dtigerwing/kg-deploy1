// 에이전트들이 반환하는 구조화 출력(Structured Outputs) 스키마.
// 서버는 이 스키마로 Claude 응답을 검증하고, 클라이언트는 타입만 가져다 씁니다.
import { z } from "zod";

/** 1) 분해 에이전트: 사용자 업무 → 세부 업무 목록 */
export const DecompositionSchema = z.object({
  goal: z.string().describe("사용자 업무를 한 문장으로 다시 정리한 최종 목표"),
  finalDeliverable: z
    .string()
    .describe("최종적으로 사용자에게 제공될 목업 결과물이 무엇인지 (예: 랜딩 페이지 목업, 업무 대시보드)"),
  subtasks: z.array(
    z.object({
      id: z.string().describe("짧은 영문 kebab-case 식별자, 예: market-research"),
      title: z.string(),
      objective: z.string().describe("이 세부 업무가 달성해야 하는 것"),
      expectedOutput: z.string().describe("이 세부 업무가 만들어낼 산출물의 형태"),
      dependsOn: z
        .array(z.string())
        .describe("이 업무를 실행하려면 결과물이 꼭 필요한 다른 세부 업무의 id 목록. 필요 없으면 빈 배열"),
    }),
  ),
});
export type Decomposition = z.infer<typeof DecompositionSchema>;
export type Subtask = Decomposition["subtasks"][number];

/** 2) 계획 에이전트: 세부 업무 하나에 대한 실행 계획 */
export const PlanSchema = z.object({
  approach: z.string().describe("이 업무를 어떤 관점과 방식으로 풀지 2~3문장 요약"),
  steps: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
    }),
  ),
  outputFormat: z.string().describe("실행 결과물의 구체적인 형태와 구성"),
  acceptanceCriteria: z.array(z.string()).describe("결과물이 잘 됐는지 판단할 기준"),
  assumptions: z.array(z.string()).describe("정보가 부족해 임의로 가정한 내용"),
});
export type Plan = z.infer<typeof PlanSchema>;

/** 4) 평가 에이전트: 모든 실행 결과를 취합해 평가 */
export const EvaluationSchema = z.object({
  overallScore: z.number().describe("0~100 사이 정수. 결과물 전체가 사용자 목표를 얼마나 달성했는지"),
  summary: z.string().describe("전체 결과에 대한 평가 요약"),
  perSubtask: z.array(
    z.object({
      subtaskId: z.string(),
      score: z.number().describe("0~100 사이 정수"),
      strengths: z.array(z.string()),
      issues: z.array(z.string()),
    }),
  ),
  conflicts: z.array(z.string()).describe("세부 결과물들 사이의 충돌·중복·누락"),
  previewDirection: z
    .string()
    .describe("하나의 목업 프리뷰로 합칠 때의 구성 방향: 화면 구조, 핵심 인터랙션, 우선 반영할 개선점"),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;
