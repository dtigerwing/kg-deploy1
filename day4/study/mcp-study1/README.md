# Agentic Workflow Studio

사용자가 진행 중인 업무를 짧게 입력하면 여러 서브에이전트가 나눠서 처리하고, 그 결과를 사용자가 바로 써볼 수 있는 **목업 프리뷰(단일 HTML)** 로 만들어 주는 에이전틱 워크플로우입니다.

- 모델: `claude-opus-5-5` (effort `high`, adaptive thinking)
- 스택: TypeScript · React(Vite) · Express · `@anthropic-ai/sdk`

## 워크플로우 (그래프 실행)

작업 순서가 아니라 **데이터가 필요한 관계(의존 관계)** 대로 실행되는 그래프입니다.

```
업무 입력
  └─▶ ① 분해 에이전트 ─ 세부 업무 3~6개 + 업무 간 의존 관계(dependsOn) 설계
        └─▶ ② 계획 서브에이전트 × N (동시 실행)
              └─▶ 사용자 승인 (노드마다: 승인 / 수정 요청 / 제외)
                    └─▶ ③ 실행 서브에이전트 ─ 승인되는 즉시 실행 (파이프라인)
                          · 선행 업무가 있으면 그 결과가 나올 때까지만 기다리고, 결과를 입력으로 받음
                          · 실패하면 그 노드만 재시도, 제외된 선행 업무는 없이 진행
                          └─▶ ④ 결과 취합 (코드, 모델 호출 없음) ─ 유일한 전체 대기 지점
                                └─▶ ⑤ 평가 에이전트 → ⑥ 프리뷰 빌더 → 목업 HTML
```

화면 구성:

- **라이브 그래프**: 노드가 분해 에이전트에서 갈라져 나오고, 데이터가 흐르는 엣지에 점이 움직이며, 지금 일이 벌어지는 단계 머리글이 켜집니다. 노드를 누르면 인스펙터에서 계획 검토·승인, 결과 확인, 재시도를 할 수 있습니다.
- **단계 표시줄**: 파이프라인이라 여러 단계가 동시에 켜집니다.
- **타임라인**: 세부 업무마다 계획 → 승인 대기 → 실행을 한 줄로, 실패한 시도와 임계 경로까지 보여 줍니다.
- **그래프 데모** (`/graph-preview.html`): API 호출 없이 파이프라인과 일괄 실행을 비교하는 시뮬레이션.

## 코코비 유튜브 지표 탭

상단의 **코코비 유튜브 지표** 탭(`/#youtube`)은 [코코비 채널(@cocobi_ko)](https://www.youtube.com/@cocobi_ko)의 공개 지표를 보여 줍니다.

- 원본: `shared/data/cocobi-youtube.json` — playmcp(카카오) YouTubeData MCP로 수집한 스냅샷 (채널 11개, 영상 84개). API가 돌려준 값을 그대로 저장합니다.
- 가공: `shared/youtube.ts` — 쇼츠/롱폼 구분, 일평균 조회수, 업로드 시각, 제목 키워드 테마, 채널 네트워크 비교. 모델 호출 없는 순수 계산이라 서버·화면 어디서든 씁니다.
- 에이전트 입력: `buildAgentContext()`는 프롬프트에 붙일 Markdown 블록(`<youtube_channel_metrics>`), `buildAgentDigest()`는 같은 내용의 구조화 JSON을 돌려줍니다. 탭 맨 아래에서 미리 보고 복사·저장할 수 있습니다.
- 한계: 아동용 영상이라 좋아요 수는 0으로, 댓글은 비활성화로 돌아옵니다. 시청 시간·노출 클릭률 같은 Studio 지표는 공개 API로 가져올 수 없습니다.
- 갱신: MCP로 다시 수집해 JSON 파일을 같은 형식으로 덮어쓰면 화면과 에이전트 입력이 함께 바뀝니다.

## 시작하기

1. 의존성 설치

   ```bash
   npm install
   ```

2. 프로젝트 루트의 `.env` 파일에 Anthropic API 키를 입력합니다. (`.env`는 git에 커밋되지 않습니다. 없으면 `.env.example`을 복사하세요.)

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. 개발 서버 실행 후 http://localhost:5173 접속

   ```bash
   npm run dev
   ```

   API 서버(기본 8787)와 Vite 개발 서버(5173)가 함께 뜨고, `/api` 요청은 Vite가 API 서버로 넘깁니다. 키를 바꾸면 서버를 재시작하세요.

## 저장 방식 (1차)

| 버튼 | 저장되는 원본 |
|---|---|
| 프리뷰의 **저장** | 목업 HTML 파일 (`mockup-YYYYMMDD-HHmm.html`). 외부 의존성이 없어 더블클릭으로 바로 열립니다 |
| **전체 기록 저장 (.json)** | 입력, 분해 결과, 계획, 승인 상태, 실행 결과, 평가, 프리뷰가 모두 담긴 실행 기록 |
| 카드의 **결과 원본 저장 (.md)** | 세부 업무 하나의 실행 결과 Markdown |

Chrome·Edge에서는 저장 위치를 고르는 대화상자가 뜨고, 다른 브라우저에서는 일반 다운로드로 저장됩니다. 저장한 JSON은 첫 화면의 **저장한 기록 불러오기**로 다시 열 수 있습니다.

## 프로젝트 구조

```
server/
  index.ts              Express API, 에이전트 응답을 NDJSON 스트림으로 전달
  claude.ts             Anthropic 클라이언트, 모델/effort 설정, 공통 호출 함수
  agents/               분해 · 계획 · 실행 · 평가 · 프리뷰 에이전트
shared/
  schemas.ts            에이전트 구조화 출력 스키마 (Zod)
  types.ts              WorkflowRun 데이터 모델(노드별 실행 시각 포함), API 타입
src/
  App.tsx               화면 구성
  lib/useWorkflow.ts    파이프라인 스케줄러, 의존 관계 처리, 노드 시각 기록
  lib/api.ts            NDJSON 스트림 클라이언트
  lib/storage.ts        RunRepository 인터페이스 + 로컬 파일 저장 (v1 기록 자동 변환)
  graph/                그래프 뷰: 레이아웃, 렌더링, 타임라인, 지표, 시뮬레이션
  components/           인스펙터, 단계 표시줄, 지표, 평가 · 프리뷰 패널, 첫 화면 데모
```

## 구현 메모

- 모든 에이전트 호출은 스트리밍(`client.beta.messages.stream` + `finalMessage()`)으로 처리합니다. effort `high`에서는 호출 한 번이 수 분 걸릴 수 있어서, 진행 중에는 사고 과정 요약과 생성 분량이 카드에 표시됩니다.
- 분해, 계획, 평가는 Zod 스키마 기반 구조화 출력으로 받아 형식을 보장합니다.
- 안전 분류기가 요청을 거절하면 서버에서 권장 대체 모델로 자동 재시도합니다 (`fallbacks: "default"`, 베타 `server-side-fallback-2026-07-01`). 끄려면 `server/claude.ts`의 `betas`와 `fallbacks`를 지우면 됩니다.
- 브라우저 탭을 닫거나 "새 업무 시작"을 누르면 진행 중인 Anthropic 요청도 함께 취소됩니다.
- 생성된 목업은 앱과 분리된 샌드박스 iframe에서 미리보기됩니다.

## Firebase / Firestore로 옮길 때

- `WorkflowRun`(`shared/types.ts`)은 Firestore 문서에 그대로 넣을 수 있게 설계했습니다. `undefined` 대신 `null`을 쓰고, 날짜는 ISO 문자열이며, 배열 안에 배열을 두지 않습니다(노드별 실패 기록도 객체 배열). `runs/{run.id}` 문서 하나로 저장하면 됩니다.
- `src/lib/storage.ts`의 `RunRepository` 인터페이스를 구현하는 `firestoreRepository`를 추가하고, `App.tsx`에서 `localFileRepository` 대신 사용하면 됩니다.
- 프리뷰 HTML이 커지면 Firestore 문서 한도(1 MiB)를 넘을 수 있습니다. 그때는 `previewHtml`을 Cloud Storage에 올리고 문서에는 경로만 저장하세요.
- API 서버(`server/`)는 상태가 없는 Express 앱이라 Cloud Functions(2nd gen)나 Cloud Run으로 옮기기 쉽습니다. API 키는 `.env` 대신 Secret Manager에 넣으세요. 함수 타임아웃은 넉넉하게(예: 15분 이상) 잡아야 합니다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | API 서버 + 프론트엔드 개발 서버 |
| `npm run build` | 프론트엔드 프로덕션 빌드 (`dist/`) |
| `npm start` | 빌드된 프론트엔드와 API를 하나의 서버(8787)로 실행 |
| `npm run typecheck` | 타입 검사 |
