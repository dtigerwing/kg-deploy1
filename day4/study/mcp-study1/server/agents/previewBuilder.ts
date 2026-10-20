import type { PreviewRequest } from "../../shared/types";
import { AgentError, runTextAgent, type AgentHooks } from "../claude";
import { formatItems } from "./evaluator";

const SYSTEM = `당신은 프리뷰 빌더 서브에이전트입니다. 세부 결과물과 평가 내용을 받아, 사용자가 브라우저에서 바로 열어 실제로 써볼 수 있는 목업을 단일 HTML 파일로 만듭니다.

출력 규칙:
- <!doctype html>로 시작해 </html>로 끝나는 완전한 HTML 문서 하나만 출력하세요. 코드 펜스나 설명 문장은 붙이지 마세요.
- CSS와 JavaScript는 모두 파일 안에 인라인으로 넣으세요. 외부 스크립트, 폰트, 이미지 URL은 쓰지 마세요. 그림이 필요하면 CSS나 인라인 SVG로 그리세요. 이 파일 하나만 내려받아 오프라인에서 열어도 동작해야 합니다.
- 파일은 한 번에 끝까지 완성해야 합니다. 같은 구조를 반복하는 마크업은 데이터 객체와 렌더링 함수로 만들고, 장황한 주석이나 쓰지 않는 스타일은 넣지 말아 전체 분량을 대략 1,500줄 이내로 유지하세요.
- 이 파일은 샌드박스 iframe 안에서도 미리보기됩니다. localStorage 같은 저장소 접근은 try/catch로 감싸고, 실패해도 화면이 정상 동작하게 하세요.

내용 규칙:
- 세부 결과물의 실제 내용을 빠짐없이 반영하세요. 평가에서 지적된 문제와 충돌은 프리뷰에서 바로잡으세요.
- 읽기만 하는 문서가 아니라 써볼 수 있는 목업이어야 합니다. 탭이나 내비게이션 전환, 필터와 검색, 폼 입력과 검증, 체크리스트, 복사 버튼처럼 업무에 맞는 인터랙션이 실제로 동작하게 만드세요.
- 화면에 들어가는 데이터는 스크립트 상단의 JavaScript 객체로 모아 두고 그것을 렌더링하세요. 사용자가 이 파일을 원본 삼아 내용을 고쳐 쓰기 쉬워집니다.
- 모바일과 데스크톱 모두에서 깔끔하게 보이는 반응형 레이아웃으로, 일관된 색과 타이포그래피를 갖춘 완성도 있는 디자인으로 만드세요.

사용자가 쓴 언어로 작성하세요.`;

function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const html = (fenced ? fenced[1] : text).trim();
  const start = html.search(/<!doctype html|<html/i);
  if (start === -1) throw new AgentError("프리뷰 HTML을 생성하지 못했습니다. 다시 시도해 주세요.");
  return html.slice(start);
}

export async function buildPreview(req: PreviewRequest, hooks: AgentHooks): Promise<string> {
  const prompt = `<user_task>\n${req.task}\n</user_task>

<overall_goal>\n${req.goal}\n</overall_goal>

<final_deliverable>\n${req.finalDeliverable}\n</final_deliverable>

${formatItems(req.items)}

<evaluation>\n${JSON.stringify(req.evaluation, null, 2)}\n</evaluation>`;

  return extractHtml(await runTextAgent({ system: SYSTEM, prompt, hooks, maxTokens: 128000 }));
}
