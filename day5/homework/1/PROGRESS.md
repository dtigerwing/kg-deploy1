# 진행 상황 (5일차 과제: 프로젝트 현황)

> 마지막 갱신: 2026-10-24
> 다른 노트북에서 이어서 할 때는 이 문서를 먼저 읽으세요. Claude Code에는 "PROGRESS.md 읽고 이어서 하자"라고 하면 돼요.

## 과제와 결정한 것

과제는 세 단계예요. 1) 업무 프로그램의 MCP를 Claude에 연결해 쓰기, 2) MCP로 데이터가 쌓이는 웹을 만들어 Firebase로 배포하기, 3) Claude API 키로 동작하는 기능 넣기.

- **2026-10-24 주제를 "프로젝트 현황"으로 바꿨어요.** 개발 일지 구조(날짜별 기록)는 그대로 두고, AOS·iOS 버전 정보(버전, versionCode/빌드 번호, 패키지/번들 ID, 플랫폼별 마지막 빌드), 커밋 상태(커밋 안 한 파일, 푸시 안 한 커밋, 마지막 커밋), 설정·성능 최적화 제안(설정 분석 에이전트)을 더했어요. 데이터가 쌓이는 웹이 과제 조건이라 날짜 목록은 유지해요.
- (처음 주제) **Unity "개발 일지" 웹.** 하루마다 커밋, 빌드 용량, 콘솔 경고, 씬 성능을 Unity MCP로 모으고, Claude 분석 에이전트가 분석과 요약을 써서 Firestore에 쌓아요. 웹은 날짜별로 보여줘요.
- 화면은 사용자가 고른 목업 그대로예요. 왼쪽에 날짜 목록, 오른쪽에 Claude 요약, 숫자 카드 3개, Claude 분석, 커진 에셋, 씬별 성능, 커밋이 있어요.
- 검토하고 고르지 않은 안: 에러 로그 보드(콘솔과 겹침), 수정 요청함, 해상도 리뷰 보드, 리소스 전달함.
- **나중에 하기로 한 것:** 게임 프로젝트에 Firebase SDK를 붙여 웹 → 게임 공지, 게임 → 웹 플레이 기록, 푸시 알림. 개발 일지를 먼저 마무리하기로 했어요.

## 지금 상태

### 끝난 것 (실제 Unity 프로젝트로 테스트함)
- 웹 화면 (`public/`). `firebase-config.js`가 비어 있으면 예시 데이터를 보여줘요. 휴대폰 화면도 확인했어요.
- `/record-today` 절차와 Unity C# 코드 (`.claude/commands/record-today.md`, `unity-snippets/`)
  - 빌드 리포트에서 에셋별 용량과 용량 큰 에셋 40개의 임포트 설정 읽기
  - 콘솔 경고 묶기, 씬별 Missing Script 세기
  - 씬마다 Play 모드로 프레임 시간과 드로우콜 재기
- 기록 스크립트 (`scripts/journal.mjs`): git 커밋 읽기, 이전 기록과 비교, Claude 분석, 요약 쓰기, Firestore 저장
- 분석 에이전트 3개 (`scripts/agents.mjs`): 빌드 분석, 설정 분석(2026-10-24 추가), 경고 분석. 동시에 돌고 결과를 JSON으로 돌려줘요. 요약은 이 결과를 반영해요.
- 비교 로직 (`scripts/compare.mjs`): 가짜 이전 기록으로 빌드 증감과 성능 하락 판정을 테스트했어요.
- 모델은 `claude-opus-5-5`, effort `low`이고, 거절 시 다른 모델로 넘기는 fallback을 켜 뒀어요. 기록 한 번에 Claude 호출 3번, 20초 안팎 걸려요.

### 아직 안 된 것
- **프로젝트 현황 변경(2026-10-24)은 Unity에서 아직 안 돌려 봤어요.** 이 노트북에는 ai-agent 프로젝트가 없어서 `unity-snippets/project-info.cs`는 작성만 했어요. 가짜 `project-info.json`과 이 저장소 git으로 `npm run record -- --dry-run`을 돌려 커밋 상태 읽기와 설정 분석 에이전트(약 19초)는 확인했어요. 화면은 `?sample`로 PC·휴대폰 모두 확인했고, 예전 기록(버전 정보 없음)도 깨지지 않아요.
- 폴더를 `1/`로 옮기면서 `.firebaserc`, `.env`, `.claude/`가 `day5/homework`에 남아 있어요. `npm run deploy`·`npm run record`를 `1/`에서 돌리려면 정리가 필요해요.
- **Firebase 설정과 배포가 끝났어요(2026-10-23).** 첫 기록 `days/2026-10-23`이 Firestore에 있고, https://kdh-agentic.web.app 에서 보여요. 규칙도 확인했어요(days 읽기 200, 쓰기 403, 다른 컬렉션 403).
- **씬 성능은 Unity 안 측정기로 재요(2026-10-23에 바꿈).** Claude에게 명령하는 동안 Unity가 비활성이 되면 Play 모드가 거의 멈춰서(프레임 100~200ms, 드로우콜 0), MCP로 1초마다 읽으면 값이 틀려요. 그래서 `unity-snippets/perf.cs`를 Play 모드에 들어간 뒤 걸어요. 이 측정기는 Unity가 활성일 때만 2초 준비하고 `sampleSeconds` 동안 매 프레임 잰 뒤, `journal-tmp/perf-<씬>.json`을 쓰고 Play 모드를 멈춰요. 2분 안에 못 재면 `error`를 써요. `record-today.md` 1·4단계도 이 방식으로 고쳤어요(MCP 인스턴스 확인, 이전 중간 파일 옮기기 포함).
  - FrameTimingManager가 가끔 터무니없는 값(34억 ms)을 돌려줘서, 1초를 넘거나 0 이하인 값은 그 프레임 간격으로 바꿔 넣어요. `medianMs`·`dropped`도 같이 써서 측정이 흔들렸는지 볼 수 있어요.
  - 2026-10-23 10:49 `/record-today`에서 `perf.cs`를 처음 끝까지 돌렸고, 잘 동작했어요(SampleScene 0.7ms, 드로우콜 19, 7,148프레임, 걸러낸 값 0). 2분 제한(`error`) 경로는 아직 실제로 겪어 보지 않았어요.
- 첫 Android 빌드(10:48)가 기록됐어요. 815.7MB인데 그중 에셋은 6.3MB예요. 경고 1건은 Debug Symbols 설정이에요(Diagnostics Data가 켜져 있으면 SymbolTable 이상이 필요).
- `scripts/journal.mjs`의 커밋 시각을 `format-local`로 고쳤어요. UTC로 찍힌 커밋(GitHub 웹에서 만든 Initial commit 등)이 01:17처럼 나오던 문제예요.
- 이전 기록과의 비교("+X MB", "하락")는 Firestore에 기록이 이틀 이상 쌓여야 실제 화면에서 확인할 수 있어요.

### Firebase 설정 체크리스트 (진행 중)
새 프로젝트를 만드는 대신, 비어 있던 기존 프로젝트 `kdh-agentic`을 쓰기로 했어요(2026-10-23). 계정은 `kimdohan2@gmail.com`이에요. 4일차 과제는 `kg-kdh-agentic`을 쓰니 헷갈리지 마세요.

- [x] **1단계: 프로젝트** — `kdh-agentic` (웹 주소 `kdh-agentic.web.app`)
- [x] **2단계: Firestore 데이터베이스 만들기** — 콘솔에서 만들었고 CLI로 확인했어요(2026-10-23, Standard, `(default)`, `asia-northeast3`).
  - 참고: 처음엔 Firestore API가 꺼져 있어서 CLI(`firestore:databases:create`)로는 403이 났어요. 콘솔에서 만들면 API도 같이 켜져요.
  - Standard 에디션, 데이터베이스 ID는 `(default)` 그대로
  - 위치는 `asia-northeast3 (서울)`. 나중에 못 바꿔요.
  - 보안 규칙은 프로덕션 모드. 배포할 때 `firestore.rules`(읽기만 허용)로 바뀌어요.
- [x] **3단계: 웹 앱 등록** — CLI로 웹 앱 `dev-journal`을 만들고 설정 값을 `public/firebase-config.js`에 넣었어요.
  - 이제 projectId가 있어서 웹은 예시 데이터 대신 Firestore를 읽어요. Firestore와 첫 기록이 생기기 전까지는 화면이 비어 있을 수 있어요.
- [x] **4단계: 서비스 계정 키** (프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성) — 이 노트북은 2026-10-23에 받아 둠
  - 받은 파일을 `day5/homework/serviceAccount.json`으로 저장. git에는 안 올라가요. 노트북마다 따로 받아야 해요.
- [x] **5단계: CLI 로그인과 프로젝트 연결** (`day5/homework`에서)
  - `npx firebase login` — 로그인 정보는 노트북마다 따로라서, 다른 노트북에서는 다시 해야 해요.
  - `.firebaserc`에 `kdh-agentic`을 연결해 뒀어요(git에 올라가요).
- [x] **6단계: 첫 기록 저장** — 2026-10-23, `ai-agent` 프로젝트. 빌드 없음(빌드 리포트 없음), 경고 0, SampleScene 1.0ms / 드로우콜 24.1
- [x] **7단계: 배포** — 2026-10-23 `npm run deploy`, `kdh-agentic.web.app`에서 첫 기록이 보이는 것 확인

## 테스트한 Unity 프로젝트에서 알게 된 것

### ai-agent (2026-10-23부터 기록 대상)
- 경로: `/Users/kimdohan/Desktop/Unity/Dev/ToyProject/ai-agent/ai-agent` (Unity 6000.3.18f1, git 있음). Build Settings 씬은 SampleScene 하나예요.
- Unity 에디터를 여러 개 열어 두면 MCP가 다른 프로젝트에 붙을 수 있어요. 이 노트북에서는 회사 프로젝트 `Cocobi_BabyCare2`(포트 6400)에 먼저 붙어 있었어요. 기록 전에 `set_active_instance`로 `ai-agent@1dc2f05d`를 고르고, `Application.productName`으로 확인하세요. 인스턴스 목록은 `~/.unity-mcp/unity-mcp-status-*.json`에서 볼 수 있어요.
- **회사 프로젝트에는 MCP로 접근하지 않기로 했어요(2026-10-23).** 읽기도 안 돼요. 그래서 `/record-today`는 Unity 도구를 부르기 전에 상태 파일에서 ai-agent 인스턴스를 먼저 찾아 고르고, 없으면 MCP 연결을 켜 달라고 요청하고 멈춰요(`CLAUDE.md`, `record-today.md` 1단계).
  - ai-agent 에디터가 켜져 있어도 MCP 브리지가 꺼져 있으면 상태 파일이 없고 `set_active_instance`가 실패해요. 그때는 ai-agent 에디터에서 Window > MCP for Unity로 연결을 켜야 해요.

### Project_B_RayFire (어젯밤 노트북에서 테스트)

- 프로젝트: `Project_B_RayFire` (Unity 6000.3.18f1, URP, 빌드 대상 macOS). Build Settings 씬은 StageSelect, Stage01~05예요.
- **git 저장소가 아니라서** 커밋이 기록되지 않아요. `git init`을 하면 다음 기록부터 커밋이 남아요.
- 테스트 빌드는 118.2MB였어요. 그중 에셋은 9.2MB뿐이고 나머지는 엔진·런타임이에요.
- **Stage01~05에 Missing Script가 2,568개 있어요.** 빌드 경고 2,568개와 같은 수예요. Assets 아래 C# 파일이 4개뿐이라 원래 게임 스크립트(RayFire 포함)가 프로젝트에 없는 것으로 보여요.
- 씬 성능은 에디터 기준 프레임 3.0~4.9ms, 드로우콜 6~8이에요. 씬이 단순해서(렌더러 38개 정도) 드로우콜이 적은 게 맞아요.

## 다른 노트북에서 이어서 하기

git에는 코드와 문서만 올라가요. 아래 파일은 노트북마다 따로 준비해야 해요.

| 파일 | 왜 따로 준비하나 | 준비 방법 |
|---|---|---|
| `.env` | API 키라 git에 안 올려요 | `.env.example`을 복사해 `ANTHROPIC_API_KEY` 입력 |
| `serviceAccount.json` | Firebase 비밀 키라 git에 안 올려요 | Firebase 콘솔 > 프로젝트 설정 > 서비스 계정에서 새로 받기 |
| `journal.config.json`의 `unityProject` | 노트북마다 Unity 프로젝트 경로가 달라요 | 그 노트북의 경로로 바꾸기 |
| `journal-tmp/` | 그날 수집한 중간 파일이라 git에 안 올려요 | `/record-today`를 다시 실행하면 생겨요 |
| `node_modules/` | 설치 파일 | `npm install` |

순서:
1. `git pull`
2. `cd day5/homework && npm install`
3. `.env` 만들기, `journal.config.json`의 `unityProject` 고치기
4. Unity에 MCP for Unity 패키지를 설치하고, Claude Code에 `unityMCP` 서버가 연결됐는지 확인하기
5. Unity 프로젝트를 열고 Claude Code에서 `/record-today` 실행. Firebase 설정 전이면 저장 단계에서 `--dry-run`을 붙이기
6. 로컬 화면 보기: `python3 -m http.server 5173 --directory public`

## 다음 할 일

0. ai-agent가 있는 노트북에서 `/record-today`로 `project-info.cs`를 실제로 돌려 보고 배포하기
1. 다음 날 `/record-today`로 한 번 더 기록해서 비교 화면("+X MB", "하락") 확인하기
2. (선택) Unity 프로젝트 `git init`, 성능 분석·코드 리뷰 에이전트 추가, 게임 Firebase 연동
