# Unity 작업 리포트 (5일차 과제 2단계)

Claude Code + Unity MCP로 작업한 기록을 원할 때 모아서
**한 일 / 결과 / 진행 상황 / 막혔던 문제 / 남은 일**을 리포트로 정리합니다.
**저장** 버튼을 누르면 리포트 원본이 내 컴퓨터에 파일로 저장됩니다.

```
~/.claude/projects/*.jsonl ─▶ [추출: 코드] ─▶ 작업 묶음 N개 ─▶ [요약 서브에이전트 × N, 병렬] ─▶ [취합 에이전트] ─▶ 리포트 ─▶ [저장]
```

- 데이터: Claude Code가 남기는 대화 기록. 요청, Unity MCP 호출(성공/실패), 수정한 파일, 할 일 목록, 마무리 요약, 서브에이전트 기록을 읽습니다.
- 작업 묶음: 세션 하나의 하루치 작업. 묶음마다 요약 서브에이전트가 하나씩 붙습니다(동시에 최대 4개).
- 모델: `claude-opus-5-5`, effort `high` (`src/config.ts`). 거절 대비로 `fallbacks: "default"`가 켜져 있습니다.
- 비용 예시: 묶음 2개(요청 6개, MCP 호출 202회) 리포트 한 번에 약 4만 토큰, 약 $0.3, 1분 30초.

## 실행

1. `.env` 파일의 `ANTHROPIC_API_KEY=` 뒤에 API 키를 붙여 넣습니다.
2. 처음 한 번만 패키지를 설치합니다.

```bash
npm install
```

3. 서버를 켜고 http://localhost:3000 을 엽니다.

```bash
npm run dev
```

4. 프로젝트와 기간을 고르면 작업 묶음 목록이 나옵니다(여기까지는 API 비용 없음). **리포트 만들기**를 누릅니다.

## 알아 둘 점

- Claude Code로 한 작업만 잡힙니다. Unity 에디터에서 손으로 한 작업은 기록에 없습니다.
- Claude Code 기록 형식은 공개 문서가 없는 내부 형식이라, 업데이트 후 읽는 부분(`src/transcripts.ts`)을 고쳐야 할 수 있습니다.
- 리포트를 만들 때 작업 내용(스크립트 이름, 코드 일부, 에러 메시지)이 Anthropic API로 전송됩니다.
- 기록 폴더가 다른 곳에 있으면 `.env`에 `CLAUDE_PROJECTS_DIR=경로`를 넣습니다.

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `src/transcripts.ts` | 기록 읽기, Unity 프로젝트 찾기, 작업 묶음·통계 만들기 |
| `src/agents/summarizer.ts` | 요약 서브에이전트 (작업 묶음 → 요약 JSON) |
| `src/agents/aggregator.ts` | 취합 에이전트 (요약 모음 → 기간 리포트 JSON) |
| `src/workflow.ts` | 추출 → 병렬 요약 → 취합 순서로 실행 |
| `src/server.ts` | Express 서버, 진행 상황을 한 줄씩 스트리밍 |
| `client/report.ts` | 리포트 그리기 (화면과 저장 파일이 같은 코드 사용) |
| `client/app.ts` | 화면 로직 (`npm run dev` 때 `public/`으로 빌드) |

## 다음 단계: Firebase / Firestore

- 저장 버튼의 `saveFile()`(`client/app.ts`) 자리에서 Firestore `reports/{id}` 문서로 저장하면 됩니다.
  `ReportRun`(`src/types.ts`)은 처음부터 평범한 JSON이라 그대로 넣을 수 있고, 날짜별로 쌓으면 진행 추이를 볼 수 있습니다.
- 기록 파일은 내 컴퓨터에만 있으므로 "기록 읽기 + 에이전트 실행"은 로컬 서버에 두고, 결과만 Firestore에 올리는 구조가 자연스럽습니다.
